"""Modern held-out validation — sample SGFs from ~/benchmark_sgfs/
that were NOT used in the training set, evaluate the LightGBM
model's generalization on in-distribution-but-held-out data.

Purpose: isolate "model generalizes to new modern games" from the
era-confound that the historical-1700-1980 validation introduced.

Pipeline identical to validation_run.py, just a different sampler.

License: Public Domain (Unlicense).
"""

from __future__ import annotations

import asyncio
import json
import math
import random
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

import lightgbm as lgb
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from benchmark_v2 import (  # noqa: E402
    SelectorClient,
    _efficiency_piecewise,
    _load_moves,
    _oracle_metrics_pair,
)
from extract_features import _per_turn_features, _range_summary  # noqa: E402
from evaluate_learned_vf import _allocate_piecewise_waterfill  # noqa: E402
from validation_run import (  # noqa: E402
    MODEL_FULL_PATH,
    MODEL_INT_PATH,
    BUDGET,
    V_PRE,
    V_INTERMEDIATE,
    V_ORACLE,
    T_PER_CELL,
    TURN_RANGE_START_MIN,
    TURN_RANGE_STRIDE,
    _extract_features_for_cell,
    _sweep_one,
)

BENCHMARK_SGFS_DIR = Path("/home/bork/benchmark_sgfs")
TRAINING_CELLS_PATH = Path("/home/bork/benchmark_allocation/cells_v2.jsonl")
OUT_CELLS = Path("/home/bork/benchmark_allocation/modern_validation_cells.jsonl")
OUT_FEATURES = Path("/home/bork/benchmark_allocation/modern_validation_features.jsonl")
OUT_SUMMARY = Path("/home/bork/benchmark_allocation/modern_validation_summary.json")

MODELS = ["b10c128", "b18c384nbt", "b28c512nbt"]
SAMPLE_SIZE = 50  # number of SGFs to sample, each yields one cell
RNG_SEED = 8888


def _load_training_sgfs() -> set[str]:
    """The SGFs already used in the training set (cells_v2.jsonl)."""
    out: set[str] = set()
    if not TRAINING_CELLS_PATH.exists():
        return out
    with open(TRAINING_CELLS_PATH) as f:
        for line in f:
            try:
                out.add(json.loads(line)["sgf"])
            except Exception:
                pass
    return out


def _sample_modern_cells(n: int, rng_seed: int) -> list[dict]:
    """Sample n SGFs from ~/benchmark_sgfs/ excluding training SGFs.
    Each SGF contributes one cell at a random turn-range."""
    training_sgfs = _load_training_sgfs()
    rng = random.Random(rng_seed)
    all_sgfs = sorted(BENCHMARK_SGFS_DIR.glob("*.sgf"))
    candidates = [p for p in all_sgfs if p.stem not in training_sgfs]
    rng.shuffle(candidates)
    print(f"  pool: {len(all_sgfs)} total, {len(training_sgfs)} in training, "
          f"{len(candidates)} candidates for held-out", flush=True)

    cells = []
    for p in candidates:
        if len(cells) >= n:
            break
        try:
            moves, board_size, komi = _load_moves(p)
        except Exception:
            continue
        if board_size != 19:
            continue
        if len(moves) < TURN_RANGE_START_MIN + T_PER_CELL:
            continue
        max_start = len(moves) - T_PER_CELL
        eligible = list(range(TURN_RANGE_START_MIN, max_start + 1, TURN_RANGE_STRIDE))
        if not eligible:
            continue
        turn_start = rng.choice(eligible)
        cells.append({
            "sgf_stem": p.stem,
            "sgf_path": str(p),
            "turn_start": turn_start,
            "turn_count": T_PER_CELL,
            "n_moves": len(moves),
            "board_size": board_size,
            "komi": komi,
            "handicap": 0,
            "decade": None,
            "moves": moves,
        })
    return cells


async def main() -> None:
    print(f"sampling {SAMPLE_SIZE} modern held-out SGFs from {BENCHMARK_SGFS_DIR}/", flush=True)
    cells = _sample_modern_cells(SAMPLE_SIZE, RNG_SEED)
    print(f"sampled {len(cells)} cells", flush=True)

    # Resume support
    already_done: set[tuple[str, str, int]] = set()
    if OUT_CELLS.exists():
        with open(OUT_CELLS) as f:
            for line in f:
                try:
                    r = json.loads(line)
                    already_done.add((r["model"], r["sgf"], int(r["turn_start"])))
                except Exception:
                    pass
    if already_done:
        print(f"resume: {len(already_done)} (model, sgf, turn_start) already done", flush=True)
    existing_features: list[dict] = []
    if OUT_FEATURES.exists():
        with open(OUT_FEATURES) as f:
            for line in f:
                try:
                    existing_features.append(json.loads(line))
                except Exception:
                    pass

    client = SelectorClient()
    await client.connect()
    feature_rows: list[dict] = list(existing_features)

    try:
        t_start = time.monotonic()
        total = len(cells) * len(MODELS)
        done = len(already_done)
        for cell in cells:
            for model in MODELS:
                key = (model, cell["sgf_stem"], int(cell["turn_start"]))
                if key in already_done:
                    continue
                record = await _sweep_one(client, model, cell)
                done += 1
                if record is None:
                    continue
                with open(OUT_CELLS, "a") as f:
                    record_lite = {k: v for k, v in record.items() if k != "pre_responses"}
                    f.write(json.dumps(record_lite) + "\n")
                rows = _extract_features_for_cell(record, cell["moves"], cell["n_moves"])
                feature_rows.extend(rows)
                with open(OUT_FEATURES, "a") as f:
                    for r in rows:
                        f.write(json.dumps(r) + "\n")
                if done % 10 == 0 or done == total:
                    elapsed = time.monotonic() - t_start
                    rate = (done - len(already_done)) / elapsed if elapsed > 0 else 0
                    eta = (total - done) / rate if rate > 0 else 0
                    print(
                        f"  [{time.strftime('%H:%M:%S')}] {done}/{total} "
                        f"({elapsed:.0f}s elapsed, ETA {eta:.0f}s)",
                        flush=True,
                    )
    finally:
        await client.close()

    if not feature_rows:
        print("no validation data; abort eval")
        return

    print(f"\nsweep complete. {len(feature_rows)} feature rows.", flush=True)
    print("\n=== Evaluating learned VF on MODERN held-out cells ===", flush=True)
    model_full = lgb.Booster(model_file=str(MODEL_FULL_PATH))
    model_int = lgb.Booster(model_file=str(MODEL_INT_PATH))
    feat_names = model_full.feature_name()
    v_int_extra = V_INTERMEDIATE - V_PRE
    v_full_extra = V_ORACLE - V_PRE

    by_cell: dict[tuple[str, str, int], list[dict]] = defaultdict(list)
    for r in feature_rows:
        by_cell[(r["model"], r["sgf"], int(r["turn_start"]))].append(r)

    eff_per_model: dict[str, list[float]] = defaultdict(list)
    for (m, sgf, turn_start), rows in by_cell.items():
        rows.sort(key=lambda r: int(r["turn"]))
        cell_turns = [int(r["turn"]) for r in rows]
        X = np.array(
            [[r.get(f, 0.0) for f in feat_names] for r in rows],
            dtype=np.float64,
        )
        pred_full = model_full.predict(X)
        pred_int = model_int.predict(X)
        predicted_r_full = {t: float(p) for t, p in zip(cell_turns, pred_full)}
        predicted_r_int = {t: float(p) for t, p in zip(cell_turns, pred_int)}
        r_full = {int(t): r["target_visit_entropy_reduction"] for t, r in zip(cell_turns, rows)}
        r_int = {int(t): r["target_int_visit_entropy_reduction"] for t, r in zip(cell_turns, rows)}
        allocation = _allocate_piecewise_waterfill(
            predicted_r_int, predicted_r_full,
            BUDGET, v_int_extra, v_full_extra,
        )
        eff = _efficiency_piecewise(
            allocation, r_int, r_full, BUDGET, v_int_extra, v_full_extra,
        )
        if not math.isnan(eff):
            eff_per_model[m].append(eff)

    print()
    print(f"{'model':14s} {'val_mean':>9s} {'val_SE':>7s} {'n':>4s} {'training':>10s} {'historical':>11s}")
    TRAIN_EFF = {"b10c128": 0.9338, "b18c384nbt": 0.9660, "b28c512nbt": 0.9643}
    HIST_EFF = {"b10c128": 0.8806, "b18c384nbt": 0.8106, "b28c512nbt": 0.8148}
    summary = {
        "modern_validation": {},
        "training_reference": TRAIN_EFF,
        "historical_validation_reference": HIST_EFF,
    }
    for m in MODELS:
        vals = eff_per_model.get(m, [])
        if not vals:
            print(f"{m:14s} {'—':>9s} {'—':>7s} 0")
            continue
        mean = statistics.mean(vals)
        se = statistics.stdev(vals) / math.sqrt(len(vals)) if len(vals) > 1 else 0.0
        print(
            f"{m:14s} {mean:>9.4f} {se:>7.4f} {len(vals):>4d} "
            f"{TRAIN_EFF.get(m, float('nan')):>10.4f} "
            f"{HIST_EFF.get(m, float('nan')):>11.4f}"
        )
        summary["modern_validation"][m] = {"mean": mean, "se": se, "n": len(vals)}

    OUT_SUMMARY.write_text(json.dumps(summary, indent=2))
    print(f"\nsaved {OUT_SUMMARY}")


if __name__ == "__main__":
    asyncio.run(main())
