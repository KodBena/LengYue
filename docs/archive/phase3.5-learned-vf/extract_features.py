"""Feature extractor for Phase 3.5 supervised value function.

Re-queries V=200 pre-state for the 435 cells sampled by the v2
benchmark, extracts per-turn feature vectors, and joins with the
per-turn r_full targets recorded in cells_v2.jsonl.

Output: training_features.jsonl — one record per (model, sgf,
turn_start, turn) with feature vector + 4 oracle targets.

GPU cost: ~435 cells × 1-3s/cell ≈ 10-20 minutes total. Uses the
same opt-out (`capabilities: {}`), heartbeat task, and send-lock
that benchmark_v2.py uses.

License: Public Domain (Unlicense).
"""

from __future__ import annotations

import asyncio
import json
import math
import statistics
import sys
import time
from pathlib import Path
from typing import Any

import websockets

sys.path.insert(0, str(Path(__file__).resolve().parent))
from benchmark_v2 import (  # noqa: E402
    SELECTOR_HOST,
    SelectorClient,
    _load_moves,
)

CELLS_PATH = Path("/home/bork/benchmark_allocation/cells_v2.jsonl")
OUTPUT_PATH = Path("/home/bork/benchmark_allocation/training_features.jsonl")
SGFS_DIR = Path("/home/bork/benchmark_sgfs")
V_PRE = 200


# ---------------------------------------------------------------------------
# Feature extraction per-turn
# ---------------------------------------------------------------------------

def _safe_float(v: Any, default: float = 0.0) -> float:
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    return default


def _shannon_entropy(probs: list[float]) -> float:
    return -sum(p * math.log2(p) for p in probs if p > 0)


def _gini(values: list[float]) -> float:
    """Gini coefficient on the values (treating each as a weight)."""
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    total = sum(s)
    if total <= 0:
        return 0.0
    cum = 0.0
    for i, v in enumerate(s):
        cum += (i + 1) * v
    return (2 * cum) / (n * total) - (n + 1) / n


def _per_turn_features(packet: dict[str, Any], to_play: str) -> dict[str, float]:
    """Extract per-turn feature vector from one V=200 analyze response.

    Features named after their source field; range-level summaries
    are added separately at cell granularity.
    """
    root = packet.get("rootInfo", {}) if isinstance(packet.get("rootInfo"), dict) else {}
    mi = packet.get("moveInfos", []) if isinstance(packet.get("moveInfos"), list) else []
    policy = packet.get("policy", []) if isinstance(packet.get("policy"), list) else []

    score_stdev = _safe_float(root.get("scoreStdev"))
    score_lead = _safe_float(root.get("scoreLead"))
    winrate = _safe_float(root.get("winrate"))
    raw_lead = _safe_float(root.get("rawLead"))
    raw_winrate = _safe_float(root.get("rawWinrate"))
    raw_score_selfplay = _safe_float(root.get("rawScoreSelfplay"))
    raw_var_time_left = _safe_float(root.get("rawVarTimeLeft"))
    raw_noresult = _safe_float(root.get("rawNoResultProb"))
    visits = _safe_float(root.get("visits"))
    weight = _safe_float(root.get("weight"))

    # moveInfos top-5 stats
    top5 = mi[:5] if mi else []
    top5_visits = [_safe_float(m.get("visits")) for m in top5 if isinstance(m, dict)]
    top5_prior = [_safe_float(m.get("prior")) for m in top5 if isinstance(m, dict)]
    top5_utilityLcb = [_safe_float(m.get("utilityLcb")) for m in top5 if isinstance(m, dict)]
    top5_winrate = [_safe_float(m.get("winrate")) for m in top5 if isinstance(m, dict)]
    top5_scoreMean = [_safe_float(m.get("scoreMean")) for m in top5 if isinstance(m, dict)]

    total_visits = sum(top5_visits) or 1.0
    visits_dist = [v / total_visits for v in top5_visits]
    top1_mass = visits_dist[0] if visits_dist else 0.0
    visits_entropy = _shannon_entropy(visits_dist)
    visits_gini = _gini(top5_visits)

    prior_entropy = _shannon_entropy(top5_prior)
    lcb_spread = (max(top5_utilityLcb) - min(top5_utilityLcb)) if len(top5_utilityLcb) >= 2 else 0.0
    winrate_gap = (top5_winrate[0] - top5_winrate[1]) if len(top5_winrate) >= 2 else 0.0
    score_gap = (top5_scoreMean[0] - top5_scoreMean[1]) if len(top5_scoreMean) >= 2 else 0.0

    # PV
    pv = (top5[0].get("pv", []) or []) if top5 else []
    pv_visits = (top5[0].get("pvVisits", []) or []) if top5 else []
    pv_len = len(pv)
    pv_decay = 0.0
    if isinstance(pv_visits, list) and len(pv_visits) >= 2:
        first = _safe_float(pv_visits[0])
        last = _safe_float(pv_visits[-1])
        if first > 0:
            pv_decay = last / first

    # Policy entropy (full 362-dim or however large)
    policy_entropy_val = _shannon_entropy(
        [_safe_float(p) for p in policy if isinstance(p, (int, float))]
    )

    return {
        "score_stdev": score_stdev,
        "score_lead": score_lead,
        "winrate": winrate,
        "raw_lead": raw_lead,
        "raw_winrate": raw_winrate,
        "raw_score_selfplay": raw_score_selfplay,
        "raw_var_time_left": raw_var_time_left,
        "raw_noresult": raw_noresult,
        "visits_at_v200": visits,
        "weight_at_v200": weight,
        # Derived deltas
        "winrate_minus_raw": winrate - raw_winrate,
        "score_lead_minus_raw": score_lead - raw_score_selfplay,
        # Visits distribution shape
        "top1_visits_mass": top1_mass,
        "visits_entropy": visits_entropy,
        "visits_gini": visits_gini,
        # Prior distribution shape
        "prior_entropy": prior_entropy,
        # Top-K gaps
        "lcb_spread": lcb_spread,
        "winrate_gap_top1_top2": winrate_gap,
        "score_gap_top1_top2": score_gap,
        # PV
        "pv_len": float(pv_len),
        "pv_visit_decay_ratio": pv_decay,
        # Policy
        "policy_entropy": policy_entropy_val,
        # Position
        "to_play_is_black": 1.0 if to_play == "black" else 0.0,
    }


def _range_summary(
    per_turn: list[dict[str, float]],
    feature_keys: list[str],
) -> dict[str, float]:
    """For each per-turn feature, add range-level mean / std / min / max."""
    out: dict[str, float] = {}
    for k in feature_keys:
        vals = [t[k] for t in per_turn if k in t]
        if not vals:
            continue
        out[f"range_{k}_mean"] = statistics.mean(vals)
        out[f"range_{k}_std"] = statistics.pstdev(vals) if len(vals) > 1 else 0.0
        out[f"range_{k}_min"] = min(vals)
        out[f"range_{k}_max"] = max(vals)
    return out


# ---------------------------------------------------------------------------
# Cell loader
# ---------------------------------------------------------------------------

def _load_cells_index() -> dict[tuple[str, str, int], dict]:
    """Load cells_v2.jsonl into a (model, sgf, turn_start) → record map."""
    out: dict[tuple[str, str, int], dict] = {}
    if not CELLS_PATH.exists():
        raise FileNotFoundError(f"missing {CELLS_PATH}")
    with open(CELLS_PATH) as f:
        for line in f:
            r = json.loads(line)
            key = (r["model"], r["sgf"], int(r["turn_start"]))
            out[key] = r
    return out


def _existing_features() -> set[tuple[str, str, int]]:
    """Resume support: which (model, sgf, turn_start) cells already
    have features extracted in OUTPUT_PATH?"""
    out: set[tuple[str, str, int]] = set()
    if not OUTPUT_PATH.exists():
        return out
    with open(OUTPUT_PATH) as f:
        for line in f:
            try:
                r = json.loads(line)
                out.add((r["model"], r["sgf"], int(r["turn_start"])))
            except Exception:
                pass
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    cells = _load_cells_index()
    done = _existing_features()
    todo_keys = [k for k in cells if k not in done]
    print(f"cells total: {len(cells)}, already extracted: {len(done)}, todo: {len(todo_keys)}", flush=True)
    if not todo_keys:
        print("nothing to do.")
        return

    client = SelectorClient()
    await client.connect()

    # Open in append mode for resume.
    out_fp = open(OUTPUT_PATH, "a")

    try:
        t_start = time.monotonic()
        for i, key in enumerate(todo_keys):
            model, sgf_stem, turn_start = key
            cell_record = cells[key]
            turn_count = int(cell_record["turn_count"])
            turns = list(range(turn_start, turn_start + turn_count))

            # Load moves from SGF
            sgf_path = SGFS_DIR / f"{sgf_stem}.sgf"
            try:
                moves, board_size, komi = _load_moves(sgf_path)
            except FileNotFoundError:
                # Some SGFs may have been renamed or moved; skip.
                print(f"  SKIP {sgf_stem}: SGF not found", flush=True)
                continue
            n_moves = len(moves)

            # Query V=200
            try:
                pre = await client.analyze(
                    model=model, moves=moves,
                    board_size=board_size, komi=komi,
                    analyze_turns=turns, max_visits=V_PRE,
                    include_policy=True,
                )
            except (RuntimeError, asyncio.TimeoutError) as e:
                print(f"  SKIP cell {i+1} (analyze failed): {e}", flush=True)
                continue

            # Per-turn features
            per_turn_feats: list[dict[str, float]] = []
            for t in turns:
                if t not in pre:
                    continue
                to_play = "black" if t % 2 == 0 else "white"
                feats = _per_turn_features(pre[t], to_play)
                per_turn_feats.append({"_turn": t, **feats})

            if not per_turn_feats:
                print(f"  SKIP cell {i+1} (no per-turn data)", flush=True)
                continue

            feature_keys = [k for k in per_turn_feats[0] if not k.startswith("_")]
            range_feats = _range_summary(per_turn_feats, feature_keys)
            # Context features the per-turn extractor doesn't have
            range_feats["context_turn_start"] = float(turn_start)
            range_feats["context_turn_count"] = float(turn_count)
            range_feats["context_n_moves"] = float(n_moves)
            range_feats["context_phase_fraction"] = (
                turn_start / n_moves if n_moves > 0 else 0.0
            )
            range_feats["context_komi"] = float(komi)
            range_feats["context_board_size"] = float(board_size)

            # Targets per-turn from cells_v2.jsonl
            targets_by_metric = {
                m: {int(t): _safe_float(v) for t, v in cell_record["metrics"][m]["r_full"].items()}
                for m in ("visit_entropy_reduction", "visit_kl_divergence", "top1_changed", "score_stdev_reduction")
            }

            # Emit one record per turn
            for pt in per_turn_feats:
                t = pt["_turn"]
                row = {
                    "model": model,
                    "sgf": sgf_stem,
                    "turn_start": turn_start,
                    "turn": t,
                    "n_moves": n_moves,
                }
                # Per-turn features (strip leading _)
                for k, v in pt.items():
                    if k.startswith("_"):
                        continue
                    row[f"f_{k}"] = v
                # Range features
                for k, v in range_feats.items():
                    row[f"f_{k}"] = v
                # Targets
                for m, by_turn in targets_by_metric.items():
                    row[f"target_{m}"] = by_turn.get(t, 0.0)
                out_fp.write(json.dumps(row) + "\n")
            out_fp.flush()

            if (i + 1) % 20 == 0 or i == len(todo_keys) - 1:
                elapsed = time.monotonic() - t_start
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                eta = (len(todo_keys) - i - 1) / rate if rate > 0 else 0
                print(
                    f"  [{time.strftime('%H:%M:%S')}] cell {i+1}/{len(todo_keys)} "
                    f"(elapsed {elapsed:.0f}s, ETA {eta:.0f}s)",
                    flush=True,
                )
    finally:
        out_fp.close()
        await client.close()
    print(f"DONE. wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
