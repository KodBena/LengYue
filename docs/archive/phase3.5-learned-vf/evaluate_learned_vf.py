"""Evaluate the LightGBM-learned value function on the existing benchmark cells.

Uses predicted r_full per turn as the value function in an analytic
sqrt-water-filling allocator (matches `greedy_eig + monte_carlo_sqrt`
in the limit, and is what the v1.0.25 substrate computes for sqrt
scaling). For each cell:

  1. Predict per-turn r_full from features.
  2. Compute alloc[t] = budget × predicted_r[t]² / Σ predicted_r[s]²
     (clamping negative predictions to 0; falling back to uniform if
     all predictions are non-positive).
  3. Compute efficiency under piecewise scaling using the
     ACTUAL r_full (and r_int) from cells_v2.jsonl.

Compares against the headline hand-crafted policies at budget=2000.

License: Public Domain (Unlicense).
"""

from __future__ import annotations

import csv
import json
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from benchmark_v2 import (  # noqa: E402
    _efficiency_linear,
    _efficiency_log,
    _efficiency_piecewise,
    _efficiency_sqrt,
)

FEATURES_PATH = Path("/home/bork/benchmark_allocation/training_features.jsonl")
MODEL_FULL_PATH = Path("/home/bork/benchmark_allocation/lightgbm_model_entropy_reduction.txt")
MODEL_INT_PATH = Path("/home/bork/benchmark_allocation/lightgbm_model_int_entropy_reduction.txt")
CELLS_PATH = Path("/home/bork/benchmark_allocation/cells_v2.jsonl")
PLAN_PATH = Path("/home/bork/benchmark_allocation/plan_v2.json")
RESULTS_PATH = Path("/home/bork/benchmark_allocation/results_v2.csv")
OUTPUT_PATH = Path("/home/bork/benchmark_allocation/learned_vf_efficiency.json")

BUDGET = 2000
ORACLE = "visit_entropy_reduction"


def _load_features() -> dict[tuple[str, str, int, int], dict[str, float]]:
    """(model, sgf, turn_start, turn) → feature row."""
    out: dict[tuple[str, str, int, int], dict[str, float]] = {}
    with open(FEATURES_PATH) as f:
        for line in f:
            r = json.loads(line)
            key = (r["model"], r["sgf"], int(r["turn_start"]), int(r["turn"]))
            out[key] = r
    return out


def _load_cells() -> dict[tuple[str, str, int], dict]:
    out = {}
    with open(CELLS_PATH) as f:
        for line in f:
            r = json.loads(line)
            key = (r["model"], r["sgf"], int(r["turn_start"]))
            out[key] = r
    return out


def _allocate_piecewise_waterfill(
    predicted_r_int: dict[int, float],
    predicted_r_full: dict[int, float],
    budget: int,
    v_int_extra: int,
    v_full_extra: int,
) -> dict[int, int]:
    """Piecewise-segment water-filling using PREDICTED r_int + r_full.

    For each turn t, two linear segments anchored at the model's
    predictions:
      seg1: slope = max(0, r_int_pred[t]) / v_int_extra, cap = v_int_extra
      seg2: slope = max(0, r_full_pred[t] - r_int_pred[t]) / (v_full_extra - v_int_extra),
            cap = v_full_extra - v_int_extra

    Sort all (turn, segment) pieces by slope desc; greedy-fill until
    budget exhausted. This matches the optimal allocation under the
    empirical (3-point-anchored) info-gain curve, IF the predictions
    are accurate.
    """
    turns = sorted(set(predicted_r_int) | set(predicted_r_full))
    if not turns or budget <= 0:
        return {}
    segments: list[tuple[float, float, int, int]] = []  # (slope, capacity, turn, seg_id)
    for t in turns:
        ri = max(0.0, predicted_r_int.get(t, 0.0))
        rf = max(0.0, predicted_r_full.get(t, 0.0))
        s1 = ri / v_int_extra
        if s1 > 0:
            segments.append((s1, float(v_int_extra), t, 1))
        s2 = max(0.0, (rf - ri)) / max(1, v_full_extra - v_int_extra)
        if s2 > 0:
            segments.append((s2, float(v_full_extra - v_int_extra), t, 2))
    if not segments:
        # All predictions zero / negative; fall back to uniform.
        n = len(turns)
        base = budget // n
        extra = budget - base * n
        alloc = {t: base for t in turns}
        for t in turns[:extra]:
            alloc[t] += 1
        return {t: v for t, v in alloc.items() if v > 0}
    segments.sort(key=lambda x: -x[0])
    alloc: dict[int, float] = defaultdict(float)
    remaining = float(budget)
    for slope, cap, t, _ in segments:
        if remaining <= 0:
            break
        spend = min(cap, remaining)
        alloc[t] += spend
        remaining -= spend
    # Discretize while preserving sum
    int_alloc = {t: int(v) for t, v in alloc.items()}
    remainder = budget - sum(int_alloc.values())
    frac = sorted(alloc.items(), key=lambda kv: -(kv[1] - int_alloc[kv[0]]))
    for t, _ in frac[:remainder]:
        int_alloc[t] += 1
    return {t: v for t, v in int_alloc.items() if v > 0}


def _allocate_sqrt_waterfill(
    predicted_r: dict[int, float], budget: int,
) -> dict[int, int]:
    """Sqrt-water-filling: v_t* ∝ max(0, r_t)². Falls back to uniform
    if no positive predictions."""
    positive = {t: max(0.0, r) for t, r in predicted_r.items()}
    total_sq = sum(r * r for r in positive.values())
    if total_sq <= 0 or budget <= 0:
        # Uniform fallback
        n = len(predicted_r)
        if n == 0:
            return {}
        base = budget // n
        extra = budget - base * n
        alloc = {t: base for t in predicted_r}
        for t in list(predicted_r)[:extra]:
            alloc[t] += 1
        return {t: v for t, v in alloc.items() if v > 0}
    raw = {t: budget * r * r / total_sq for t, r in positive.items()}
    # Discretize while preserving sum
    int_alloc = {t: int(v) for t, v in raw.items()}
    remainder = budget - sum(int_alloc.values())
    # Distribute the rounding remainder to the largest fractional parts
    frac = sorted(raw.items(), key=lambda kv: -(raw[kv[0]] - int_alloc[kv[0]]))
    for t, _ in frac[:remainder]:
        int_alloc[t] += 1
    return {t: v for t, v in int_alloc.items() if v > 0}


def main() -> None:
    plan = json.loads(PLAN_PATH.read_text())
    cfg = plan["config"]
    v_pre = cfg["V_pre"]
    v_int_extra = cfg["V_intermediate"] - v_pre
    v_full_extra = cfg["V_oracle"] - v_pre

    model_full = lgb.Booster(model_file=str(MODEL_FULL_PATH))
    model_int = lgb.Booster(model_file=str(MODEL_INT_PATH))
    feat_names = model_full.feature_name()
    assert feat_names == model_int.feature_name()
    print(f"loaded r_full model + r_int model with {len(feat_names)} features each")

    features = _load_features()
    cells = _load_cells()
    print(f"loaded {len(features)} (model, sgf, turn_start, turn) feature rows")
    print(f"loaded {len(cells)} cells")

    # For each cell, predict per-turn r and allocate.
    learned_eff: dict[str, list[float]] = defaultdict(list)  # model -> [efficiency per cell]
    # Also compute Spearman of predictions vs actual r_full per cell
    pred_actual_sp: dict[str, list[float]] = defaultdict(list)

    for cell_key, cell_record in cells.items():
        model_name, sgf, turn_start = cell_key
        turn_count = int(cell_record["turn_count"])
        turns = list(range(turn_start, turn_start + turn_count))

        # Collect feature rows for this cell.
        feature_rows = []
        cell_turns = []
        for t in turns:
            fkey = (model_name, sgf, turn_start, t)
            if fkey not in features:
                continue
            fr = features[fkey]
            feature_rows.append([fr.get(f, 0.0) for f in feat_names])
            cell_turns.append(t)
        if not feature_rows:
            continue
        X = np.array(feature_rows, dtype=np.float64)
        pred_full = model_full.predict(X)
        pred_int = model_int.predict(X)
        predicted_r_full_by_turn = {
            t: float(p) for t, p in zip(cell_turns, pred_full)
        }
        predicted_r_int_by_turn = {
            t: float(p) for t, p in zip(cell_turns, pred_int)
        }

        # Get actual r_full and r_int from cells_v2.jsonl
        r_full = {
            int(t): float(v)
            for t, v in cell_record["metrics"][ORACLE]["r_full"].items()
        }
        r_int = {
            int(t): float(v)
            for t, v in cell_record["metrics"][ORACLE]["r_int"].items()
        }

        # Piecewise water-filling on PREDICTED r_int + r_full.
        allocation = _allocate_piecewise_waterfill(
            predicted_r_int_by_turn, predicted_r_full_by_turn,
            BUDGET, v_int_extra, v_full_extra,
        )

        # Efficiency under all 4 scalings against ACTUAL r_full.
        effs = {
            "linear": _efficiency_linear(allocation, r_full, BUDGET, v_full_extra),
            "sqrt": _efficiency_sqrt(allocation, r_full, BUDGET, v_full_extra),
            "log": _efficiency_log(allocation, r_full, BUDGET, v_full_extra, v_pre),
            "piecewise": _efficiency_piecewise(
                allocation, r_int, r_full, BUDGET, v_int_extra, v_full_extra,
            ),
        }
        for scaling, eff in effs.items():
            if not math.isnan(eff):
                learned_eff.setdefault(
                    (model_name, scaling), []
                ).append(eff)

        # Per-cell Spearman of predictions vs actual r_full
        from scipy.stats import spearmanr
        pred_vec = [predicted_r_full_by_turn[t] for t in cell_turns]
        actual_vec = [r_full.get(t, 0.0) for t in cell_turns]
        if (
            len(set(pred_vec)) > 1 and len(set(actual_vec)) > 1
            and len(pred_vec) >= 3
        ):
            sp, _ = spearmanr(pred_vec, actual_vec)
            if not math.isnan(sp):
                pred_actual_sp.setdefault(model_name, []).append(float(sp))

    # Aggregate
    print()
    print("Learned VF efficiency under each scaling (cluster-robust: 1 cell = 1 obs):")
    print(f"{'model':14s} {'scaling':12s} {'mean':>8s} {'SE':>7s} {'n':>5s}")
    summary: dict[str, Any] = {"learned_vf": {}, "headline_hand_crafted": {}}
    for (m, s), vals in sorted(learned_eff.items()):
        mean = statistics.mean(vals)
        se = statistics.stdev(vals) / math.sqrt(len(vals)) if len(vals) > 1 else 0.0
        print(f"{m:14s} {s:12s} {mean:>8.4f} {se:>7.4f} {len(vals):>5d}")
        summary["learned_vf"].setdefault(m, {})[s] = {
            "mean": mean, "se": se, "n": len(vals),
        }

    print()
    print("Spearman(predicted r, actual r) per cell:")
    for m, vals in sorted(pred_actual_sp.items()):
        print(f"  {m:14s} mean={statistics.mean(vals):.3f} median={statistics.median(vals):.3f} n={len(vals)}")

    # Compare with headline hand-crafted policies
    print()
    print("=== Comparison vs headline hand-crafted policies (piecewise scaling, budget=2000) ===")
    # Read the headline efficiencies from results_v2.csv
    handcrafted: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    target_policies = [
        "greedy_eig+monte_carlo_sqrt+lcb_spread",
        "greedy_eig+diminishing_returns_log+lcb_spread",
        "greedy_eig+monte_carlo_sqrt+score_stdev",
        "baseline_v124_uniform",
    ]
    with open(RESULTS_PATH) as f:
        for r in csv.DictReader(f):
            if r["policy"] not in target_policies:
                continue
            if int(r.get("budget", "0") or 0) != BUDGET:
                continue
            eff_str = r.get("efficiency_visit_entropy_reduction_piecewise", "")
            if not eff_str:
                continue
            try:
                handcrafted[r["model"]][r["policy"]].append(float(eff_str))
            except ValueError:
                pass

    # Aggregate to cell means (cluster-robust). But CSV doesn't directly
    # give cell keys; we approximate via (sgf, turn_start) implicit in
    # the rows. For deterministic policies, 1 row per cell = 1 obs;
    # for Thompson 10 rows per cell. Since these 4 policies are
    # deterministic (or baseline), 1:1 holds. We just take all rows.

    print(f"{'model':14s} {'policy':50s} {'mean':>8s} {'SE':>7s}")
    for m in sorted(handcrafted):
        # Include learned VF row at the top
        if (m, "piecewise") in learned_eff:
            vals = learned_eff[(m, "piecewise")]
            mean = statistics.mean(vals)
            se = statistics.stdev(vals) / math.sqrt(len(vals)) if len(vals) > 1 else 0.0
            print(f"{m:14s} {'LEARNED (piecewise water-fill on r_int+r_full)':50s} {mean:>8.4f} {se:>7.4f}")
            summary["headline_hand_crafted"].setdefault(m, {})["LEARNED"] = {"mean": mean, "se": se, "n": len(vals)}
        for p in target_policies:
            vals = handcrafted[m].get(p, [])
            if not vals:
                continue
            mean = statistics.mean(vals)
            se = statistics.stdev(vals) / math.sqrt(len(vals)) if len(vals) > 1 else 0.0
            print(f"{m:14s} {p:50s} {mean:>8.4f} {se:>7.4f}")
            summary["headline_hand_crafted"].setdefault(m, {})[p] = {"mean": mean, "se": se, "n": len(vals)}
        print()

    OUTPUT_PATH.write_text(json.dumps(summary, indent=2))
    print(f"saved {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
