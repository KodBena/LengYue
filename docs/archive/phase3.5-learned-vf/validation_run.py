"""Validation run — held-out cells from ~/sgf_validation/ to test
the LightGBM model's generalization across SGFs the model never
saw (and across historical eras with different playing styles).

Pipeline (single script, no intermediate files):
  1. Walk ~/sgf_validation/, parse decade from filename.
  2. Sample uniformly across decade buckets (~5 per bucket, total ~70-100).
  3. Filter out handicap games (HA ≥ 2).
  4. Normalize komi: quarter-integers (Chinese counting style)
     get doubled; missing komi falls back to 6.5; otherwise round
     to nearest half-integer.
  5. For each (model, sgf), run V=200 + V=1000 + V=5000 sweep
     (b10c128 / b18c384nbt / b28c512nbt; fdx6d deferred).
  6. Extract V=200 features.
  7. Run the trained r_full and r_int models, allocate via piecewise
     water-fill, compute efficiency against the actual oracle.
  8. Report mean efficiency per model with cluster-robust SE.

Output:
  - validation_cells.jsonl: cell-level raw oracle data.
  - validation_features.jsonl: per-turn features for inspection.
  - validation_summary.json: efficiency comparison vs. training.

License: Public Domain (Unlicense).
"""

from __future__ import annotations

import asyncio
import json
import math
import random
import re
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
from sgfmill import sgf as sgflib

sys.path.insert(0, str(Path(__file__).resolve().parent))
from benchmark_v2 import (  # noqa: E402
    SELECTOR_HOST,
    SelectorClient,
    _build_turn_views,
    _efficiency_piecewise,
    _oracle_metrics_pair,
    _sgf_to_katago_coord,
)
from extract_features import _per_turn_features, _range_summary  # noqa: E402
from evaluate_learned_vf import _allocate_piecewise_waterfill  # noqa: E402


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

VALIDATION_DIR = Path("/home/bork/sgf_validation")
OUT_CELLS = Path("/home/bork/benchmark_allocation/validation_cells.jsonl")
OUT_FEATURES = Path("/home/bork/benchmark_allocation/validation_features.jsonl")
OUT_SUMMARY = Path("/home/bork/benchmark_allocation/validation_summary.json")

MODEL_FULL_PATH = Path("/home/bork/benchmark_allocation/lightgbm_model_entropy_reduction.txt")
MODEL_INT_PATH = Path("/home/bork/benchmark_allocation/lightgbm_model_int_entropy_reduction.txt")

MODELS = ["b10c128", "b18c384nbt", "b28c512nbt"]  # fdx6d deferred
V_PRE = 200
V_INTERMEDIATE = 1000
V_ORACLE = 5000
T_PER_CELL = 12
TURN_RANGE_START_MIN = 30
TURN_RANGE_STRIDE = 12
PER_DECADE = 5
BUDGET = 2000
RNG_SEED = 4242


# ---------------------------------------------------------------------------
# SGF loading with komi normalization
# ---------------------------------------------------------------------------

_YEAR_RE = re.compile(r"^(\d{4})")


def _decade_from_filename(stem: str) -> int | None:
    m = _YEAR_RE.match(stem)
    if not m:
        return None
    y = int(m.group(1))
    return (y // 10) * 10


def _normalize_komi(raw: float | None) -> float:
    """Map an SGF KM value to a KataGo-acceptable komi (integer or
    half-integer, in absolute range < 150).

    Rules:
      - None → fallback 6.5 (standard modern komi).
      - Quarter-integer (multiple of 0.25 not 0.5) → double it
        (Chinese-counting style; KM 3.75 = real komi 7.5).
      - Already half-integer or integer → use as-is.
      - Anything else (rare, malformed SGF) → round to nearest 0.5.
    """
    if raw is None:
        return 6.5
    raw = float(raw)
    # Is it on the half-integer grid (within tolerance)?
    on_half = abs(raw * 2 - round(raw * 2)) < 1e-6
    if on_half:
        return round(raw * 2) / 2
    # Is `2 * raw` on the half-integer grid? (i.e., raw is quarter-integer)
    doubled = raw * 2
    on_half_doubled = abs(doubled * 2 - round(doubled * 2)) < 1e-6
    if on_half_doubled:
        return round(doubled * 2) / 2
    # Last resort: round.
    return round(raw * 2) / 2


def _load_validation_sgf(path: Path) -> tuple[list, int, float, int] | None:
    """Returns (moves, board_size, komi, handicap) or None if unreadable
    or a handicap game (HA ≥ 2)."""
    try:
        g = sgflib.Sgf_game.from_bytes(path.read_bytes())
    except Exception:
        return None
    root = g.get_root()
    try:
        handicap = int(root.get("HA")) if root.has_property("HA") else 0
    except Exception:
        handicap = 0
    if handicap >= 2:
        return None
    size = g.get_size()
    if size != 19:
        return None
    raw_km = None
    if root.has_property("KM"):
        try:
            raw_km = float(root.get("KM"))
        except Exception:
            raw_km = None
    komi = _normalize_komi(raw_km)
    moves: list[list[str]] = []
    for node in g.get_main_sequence():
        m = node.get_move()
        if m == (None, None):
            continue
        colour, point = m
        moves.append([colour.upper(), _sgf_to_katago_coord(point)])
    return moves, size, komi, handicap


# ---------------------------------------------------------------------------
# Sampling
# ---------------------------------------------------------------------------

def _sample_validation_cells(per_decade: int, rng_seed: int) -> list[dict]:
    """Sample SGFs uniformly across decades. Each SGF contributes ONE
    cell (turn range starting at TURN_RANGE_START_MIN if long enough).

    Returns list of dicts with sgf_path, turn_start, turn_count, etc.
    """
    rng = random.Random(rng_seed)
    by_decade: dict[int, list[Path]] = defaultdict(list)
    for p in sorted(VALIDATION_DIR.glob("*.sgf")):
        d = _decade_from_filename(p.stem)
        if d is None:
            continue
        by_decade[d].append(p)

    selected: list[Path] = []
    for d in sorted(by_decade):
        candidates = by_decade[d][:]
        rng.shuffle(candidates)
        for p in candidates[: per_decade]:
            selected.append(p)
    rng.shuffle(selected)

    cells = []
    for p in selected:
        loaded = _load_validation_sgf(p)
        if loaded is None:
            continue
        moves, size, komi, handicap = loaded
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
            "board_size": size,
            "komi": komi,
            "handicap": handicap,
            "decade": _decade_from_filename(p.stem),
            "moves": moves,
        })
    return cells


# ---------------------------------------------------------------------------
# Sweep
# ---------------------------------------------------------------------------

async def _sweep_one(
    client: SelectorClient,
    model: str,
    cell: dict,
) -> dict | None:
    """Run V=200 + V=1000 + V=5000 for one (model, cell). Return record
    or None on error."""
    turns = list(range(cell["turn_start"], cell["turn_start"] + cell["turn_count"]))
    try:
        pre = await client.analyze(
            model=model, moves=cell["moves"],
            board_size=cell["board_size"], komi=cell["komi"],
            analyze_turns=turns, max_visits=V_PRE, include_policy=True,
        )
        intermediate = await client.analyze(
            model=model, moves=cell["moves"],
            board_size=cell["board_size"], komi=cell["komi"],
            analyze_turns=turns, max_visits=V_INTERMEDIATE, include_policy=True,
        )
        oracle = await client.analyze(
            model=model, moves=cell["moves"],
            board_size=cell["board_size"], komi=cell["komi"],
            analyze_turns=turns, max_visits=V_ORACLE, include_policy=True,
        )
    except RuntimeError as e:
        print(f"    SKIP {cell['sgf_stem']} on {model}: {e}", flush=True)
        return None
    r_int_by_metric = _oracle_metrics_pair(pre, intermediate)
    r_full_by_metric = _oracle_metrics_pair(pre, oracle)
    return {
        "model": model,
        "sgf": cell["sgf_stem"],
        "turn_start": cell["turn_start"],
        "turn_count": cell["turn_count"],
        "decade": cell["decade"],
        "komi": cell["komi"],
        "v_pre": V_PRE, "v_intermediate": V_INTERMEDIATE, "v_oracle": V_ORACLE,
        "metrics": {
            m: {
                "r_int": {str(t): r_int_by_metric[m].get(t, 0.0) for t in turns},
                "r_full": {str(t): r_full_by_metric[m].get(t, 0.0) for t in turns},
            }
            for m in ("visit_entropy_reduction", "visit_kl_divergence", "top1_changed", "score_stdev_reduction")
        },
        "pre_responses": {str(t): pre[t] for t in turns if t in pre},
    }


def _extract_features_for_cell(cell_record: dict, cell_moves: list, n_moves: int) -> list[dict]:
    """Extract per-turn feature rows from a cell record's pre_responses."""
    pre = {int(t): r for t, r in cell_record["pre_responses"].items()}
    turn_start = int(cell_record["turn_start"])
    turn_count = int(cell_record["turn_count"])
    turns = list(range(turn_start, turn_start + turn_count))
    per_turn_feats = []
    for t in turns:
        if t not in pre:
            continue
        to_play = "black" if t % 2 == 0 else "white"
        feats = _per_turn_features(pre[t], to_play)
        per_turn_feats.append({"_turn": t, **feats})
    if not per_turn_feats:
        return []
    feature_keys = [k for k in per_turn_feats[0] if not k.startswith("_")]
    range_feats = _range_summary(per_turn_feats, feature_keys)
    range_feats["context_turn_start"] = float(turn_start)
    range_feats["context_turn_count"] = float(turn_count)
    range_feats["context_n_moves"] = float(n_moves)
    range_feats["context_phase_fraction"] = (
        turn_start / n_moves if n_moves > 0 else 0.0
    )
    range_feats["context_komi"] = float(cell_record["komi"])
    range_feats["context_board_size"] = 19.0

    rows = []
    for pt in per_turn_feats:
        t = pt["_turn"]
        row = {
            "model": cell_record["model"],
            "sgf": cell_record["sgf"],
            "turn_start": turn_start,
            "turn": t,
        }
        for k, v in pt.items():
            if k.startswith("_"):
                continue
            row[f"f_{k}"] = v
        for k, v in range_feats.items():
            row[f"f_{k}"] = v
        # Targets from this cell record
        for m, parts in cell_record["metrics"].items():
            row[f"target_{m}"] = float(parts["r_full"].get(str(t), 0.0))
            row[f"target_int_{m}"] = float(parts["r_int"].get(str(t), 0.0))
        rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    print(f"sampling validation cells from {VALIDATION_DIR}/", flush=True)
    cells = _sample_validation_cells(per_decade=PER_DECADE, rng_seed=RNG_SEED)
    by_decade = defaultdict(int)
    for c in cells:
        by_decade[c["decade"]] += 1
    print(f"sampled {len(cells)} cells across {len(by_decade)} decades", flush=True)
    print("  by decade:", dict(sorted(by_decade.items())), flush=True)

    # Resume support: read existing OUT_CELLS (if any) to identify
    # (model, sgf, turn_start) tuples already processed; skip those.
    # NOTE: deliberately NOT truncating the files on restart — earlier
    # runs' records are preserved.
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
        print(
            f"resume: {len(already_done)} (model, sgf, turn_start) tuples "
            f"already in {OUT_CELLS.name}; will skip those",
            flush=True,
        )
    # Replay existing features file rows into in-memory feature_rows so
    # the post-sweep evaluator can use them.
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

    cell_records: list[dict] = []
    feature_rows: list[dict] = list(existing_features)  # carry resumed rows

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
                # Write cell record
                with open(OUT_CELLS, "a") as f:
                    # Exclude verbose pre_responses from on-disk cells file;
                    # features file captures the relevant fields.
                    record_lite = {k: v for k, v in record.items() if k != "pre_responses"}
                    f.write(json.dumps(record_lite) + "\n")
                # Extract features and write
                rows = _extract_features_for_cell(record, cell["moves"], cell["n_moves"])
                feature_rows.extend(rows)
                with open(OUT_FEATURES, "a") as f:
                    for r in rows:
                        f.write(json.dumps(r) + "\n")
                cell_records.append(record)
                if done % 10 == 0 or done == total:
                    elapsed = time.monotonic() - t_start
                    rate = done / elapsed
                    eta = (total - done) / rate if rate > 0 else 0
                    print(
                        f"  [{time.strftime('%H:%M:%S')}] {done}/{total} "
                        f"({elapsed:.0f}s elapsed, ETA {eta:.0f}s) "
                        f"last: {cell['sgf_stem']}/{model}",
                        flush=True,
                    )
    finally:
        await client.close()

    if not feature_rows:
        print("no validation data — aborting eval")
        return

    print(f"\nsweep complete. {len(cell_records)} cells, {len(feature_rows)} feature rows.")
    print(f"\n=== Evaluating learned VF on validation cells ===")
    model_full = lgb.Booster(model_file=str(MODEL_FULL_PATH))
    model_int = lgb.Booster(model_file=str(MODEL_INT_PATH))
    feat_names = model_full.feature_name()
    v_int_extra = V_INTERMEDIATE - V_PRE
    v_full_extra = V_ORACLE - V_PRE

    # Group feature rows by (model, sgf, turn_start) for cell-level aggregation.
    by_cell: dict[tuple[str, str, int], list[dict]] = defaultdict(list)
    for r in feature_rows:
        by_cell[(r["model"], r["sgf"], int(r["turn_start"]))].append(r)

    eff_per_model: dict[str, list[float]] = defaultdict(list)
    for (m, sgf, turn_start), rows in by_cell.items():
        # Sort by turn
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
        r_full = {int(t): r[f"target_visit_entropy_reduction"] for t, r in zip(cell_turns, rows)}
        r_int = {int(t): r[f"target_int_visit_entropy_reduction"] for t, r in zip(cell_turns, rows)}

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
    print(f"{'model':14s} {'val_mean':>9s} {'val_SE':>7s} {'n':>4s} {'train_mean':>12s}")
    TRAIN_EFF = {"b10c128": 0.9338, "b18c384nbt": 0.9660, "b28c512nbt": 0.9643}
    summary = {"validation": {}, "training_reference": TRAIN_EFF}
    for m in MODELS:
        vals = eff_per_model.get(m, [])
        if not vals:
            print(f"{m:14s} {'—':>9s} {'—':>7s} 0")
            continue
        mean = statistics.mean(vals)
        se = statistics.stdev(vals) / math.sqrt(len(vals)) if len(vals) > 1 else 0.0
        train = TRAIN_EFF.get(m, float("nan"))
        diff = mean - train
        sig = " ←" if abs(diff) > 0.05 else ""
        print(f"{m:14s} {mean:>9.4f} {se:>7.4f} {len(vals):>4d} {train:>12.4f}  Δ={diff:+.4f}{sig}")
        summary["validation"][m] = {"mean": mean, "se": se, "n": len(vals)}

    OUT_SUMMARY.write_text(json.dumps(summary, indent=2))
    print(f"\nsaved {OUT_SUMMARY}")


if __name__ == "__main__":
    asyncio.run(main())
