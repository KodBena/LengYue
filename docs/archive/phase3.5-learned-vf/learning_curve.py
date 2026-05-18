"""Learning-curve extrapolation for the Phase 3.5 LightGBM VF.

Question: if we'd collected N× more SGFs, how much higher would the
validation efficiency go? Used to estimate the value of a cloud-GPU
rental investment before committing to it.

Method:
  1. Read training_features.jsonl.
  2. For each fraction f in {0.1, 0.2, ..., 1.0}: SGF-level random
     subsample, train both r_full + r_int LightGBM models, evaluate
     on the existing validation sets (historical + modern).
  3. Fit a saturating curve and extrapolate.

Output: learning_curve.json + console table.

Pure-Python, no GPU. ~minute per fraction.

License: Public Domain (Unlicense).
"""

from __future__ import annotations

import json
import math
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

import lightgbm as lgb
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from evaluate_learned_vf import _allocate_piecewise_waterfill  # noqa: E402
from benchmark_v2 import _efficiency_piecewise  # noqa: E402

FEATURES_PATH = Path("/home/bork/benchmark_allocation/training_features.jsonl")
HIST_FEATURES_PATH = Path("/home/bork/benchmark_allocation/validation_features.jsonl")
MODERN_FEATURES_PATH = Path("/home/bork/benchmark_allocation/modern_validation_features.jsonl")
OUT_PATH = Path("/home/bork/benchmark_allocation/learning_curve.json")

V_PRE = 200
V_INTERMEDIATE = 1000
V_ORACLE = 5000
BUDGET = 2000
V_INT_EXTRA = V_INTERMEDIATE - V_PRE
V_FULL_EXTRA = V_ORACLE - V_PRE

FRACTIONS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1.0]
N_REPEATS = 3
LGB_PARAMS = {
    "objective": "regression", "metric": "rmse",
    "num_leaves": 31, "learning_rate": 0.05,
    "feature_fraction": 0.9, "bagging_fraction": 0.8,
    "bagging_freq": 5, "min_data_in_leaf": 10, "verbose": -1,
}
RNG_BASE_SEED = 42


def _load_rows(path: Path) -> list[dict]:
    rows = []
    with open(path) as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


def _feature_columns(rows: list[dict]) -> list[str]:
    return sorted({k for r in rows for k in r if k.startswith("f_")})


def _build_xy(rows: list[dict], feat_cols: list[str], target: str) -> tuple[np.ndarray, np.ndarray]:
    X = np.array(
        [[r.get(k, 0.0) for k in feat_cols] for r in rows],
        dtype=np.float64,
    )
    y = np.array([r.get(target, 0.0) for r in rows], dtype=np.float64)
    return X, y


def _train_subset(
    rows: list[dict],
    feat_cols: list[str],
    target: str,
    n_rounds: int = 200,
) -> lgb.Booster:
    X, y = _build_xy(rows, feat_cols, target)
    train = lgb.Dataset(X, y, feature_name=feat_cols)
    return lgb.train(LGB_PARAMS, train, num_boost_round=n_rounds, callbacks=[lgb.log_evaluation(period=0)])


def _evaluate_on_validation(
    model_full: lgb.Booster,
    model_int: lgb.Booster,
    val_rows: list[dict],
    feat_cols: list[str],
) -> dict[str, float]:
    """Evaluate per-cell efficiency on a validation set. Returns
    per-model mean efficiency."""
    by_cell: dict[tuple[str, str, int], list[dict]] = defaultdict(list)
    for r in val_rows:
        by_cell[(r["model"], r["sgf"], int(r["turn_start"]))].append(r)

    eff_per_model: dict[str, list[float]] = defaultdict(list)
    for (m, sgf, turn_start), rows in by_cell.items():
        rows.sort(key=lambda r: int(r["turn"]))
        cell_turns = [int(r["turn"]) for r in rows]
        X = np.array(
            [[r.get(f, 0.0) for f in feat_cols] for r in rows],
            dtype=np.float64,
        )
        pred_full = model_full.predict(X)
        pred_int = model_int.predict(X)
        predicted_r_full = {t: float(p) for t, p in zip(cell_turns, pred_full)}
        predicted_r_int = {t: float(p) for t, p in zip(cell_turns, pred_int)}
        r_full = {int(t): r["target_visit_entropy_reduction"] for t, r in zip(cell_turns, rows)}
        r_int_map = {int(t): r["target_int_visit_entropy_reduction"] for t, r in zip(cell_turns, rows)}
        allocation = _allocate_piecewise_waterfill(
            predicted_r_int, predicted_r_full,
            BUDGET, V_INT_EXTRA, V_FULL_EXTRA,
        )
        eff = _efficiency_piecewise(
            allocation, r_int_map, r_full, BUDGET, V_INT_EXTRA, V_FULL_EXTRA,
        )
        if not math.isnan(eff):
            eff_per_model[m].append(eff)
    return {m: statistics.mean(vs) for m, vs in eff_per_model.items() if vs}


def main() -> None:
    train_rows = _load_rows(FEATURES_PATH)
    feat_cols = _feature_columns(train_rows)
    print(f"loaded training: {len(train_rows)} rows, {len(feat_cols)} features", flush=True)

    # Group by SGF for SGF-level subsampling (no leakage between train turns
    # of the same game).
    all_sgfs = sorted({r["sgf"] for r in train_rows})
    print(f"unique SGFs in training: {len(all_sgfs)}", flush=True)
    by_sgf: dict[str, list[dict]] = defaultdict(list)
    for r in train_rows:
        by_sgf[r["sgf"]].append(r)

    hist_rows = _load_rows(HIST_FEATURES_PATH) if HIST_FEATURES_PATH.exists() else []
    modern_rows = _load_rows(MODERN_FEATURES_PATH) if MODERN_FEATURES_PATH.exists() else []
    print(f"validation: historical={len(hist_rows)} rows, modern={len(modern_rows)} rows", flush=True)

    curve: list[dict] = []
    for f in FRACTIONS:
        n_sgf = max(2, int(round(f * len(all_sgfs))))
        per_repeat = []
        for seed_offset in range(N_REPEATS):
            rng = random.Random(RNG_BASE_SEED + seed_offset)
            sampled_sgfs = rng.sample(all_sgfs, n_sgf)
            subset_rows = []
            for sgf in sampled_sgfs:
                subset_rows.extend(by_sgf[sgf])

            model_full = _train_subset(
                subset_rows, feat_cols, "target_visit_entropy_reduction",
            )
            model_int = _train_subset(
                subset_rows, feat_cols, "target_int_visit_entropy_reduction",
            )

            hist_eff = _evaluate_on_validation(model_full, model_int, hist_rows, feat_cols) if hist_rows else {}
            modern_eff = _evaluate_on_validation(model_full, model_int, modern_rows, feat_cols) if modern_rows else {}

            per_repeat.append({
                "seed_offset": seed_offset,
                "n_sgf": n_sgf,
                "n_rows": len(subset_rows),
                "hist": hist_eff,
                "modern": modern_eff,
            })

        # Aggregate across repeats
        agg: dict = {"fraction": f, "n_sgf": n_sgf, "n_rows": len(subset_rows)}
        for label, key in (("hist", "hist"), ("modern", "modern")):
            all_models = set()
            for rep in per_repeat:
                all_models.update(rep[key].keys())
            for m in sorted(all_models):
                vals = [rep[key].get(m, float("nan")) for rep in per_repeat]
                vals = [v for v in vals if not math.isnan(v)]
                if vals:
                    agg[f"{label}_{m}_mean"] = statistics.mean(vals)
                    agg[f"{label}_{m}_se"] = (
                        statistics.stdev(vals) / math.sqrt(len(vals))
                        if len(vals) > 1 else 0.0
                    )

        curve.append(agg)
        print(
            f"  f={f:.2f}  n_sgf={n_sgf:>3d}  hist_b10={agg.get('hist_b10c128_mean', float('nan')):.4f}  "
            f"hist_b18={agg.get('hist_b18c384nbt_mean', float('nan')):.4f}  "
            f"hist_b28={agg.get('hist_b28c512nbt_mean', float('nan')):.4f}  | "
            f"mod_b10={agg.get('modern_b10c128_mean', float('nan')):.4f}  "
            f"mod_b18={agg.get('modern_b18c384nbt_mean', float('nan')):.4f}  "
            f"mod_b28={agg.get('modern_b28c512nbt_mean', float('nan')):.4f}",
            flush=True,
        )

    # Power-law extrapolation: fit eff(n) = a - b * n^(-c). Use the
    # historical validation (the harder OOD task) as the headline since
    # it has more discriminatory power.
    n_arr = np.array([row["n_sgf"] for row in curve], dtype=np.float64)
    extrapolations: dict[str, dict] = {}

    from scipy.optimize import curve_fit

    def saturating(n, a, b, c):
        return a - b * np.power(n, -c)

    for source in ("hist", "modern"):
        for model in ("b10c128", "b18c384nbt", "b28c512nbt"):
            key = f"{source}_{model}_mean"
            ys = np.array([row.get(key, float("nan")) for row in curve], dtype=np.float64)
            mask = ~np.isnan(ys)
            if mask.sum() < 4:
                continue
            try:
                popt, _ = curve_fit(
                    saturating, n_arr[mask], ys[mask],
                    p0=[0.95, 0.5, 0.3], maxfev=10000,
                    bounds=([0.5, 0.0, 0.05], [1.5, 5.0, 2.0]),
                )
                a, b, c = popt
                extrap = {
                    "fit_a": float(a),
                    "fit_b": float(b),
                    "fit_c": float(c),
                    "at_n_580": float(saturating(580, *popt)),
                    "at_n_1450": float(saturating(1450, *popt)),
                    "at_n_5000": float(saturating(5000, *popt)),
                    "ceiling_a": float(a),
                }
                extrapolations[f"{source}_{model}"] = extrap
            except Exception as e:
                extrapolations[f"{source}_{model}"] = {"error": str(e)}

    OUT_PATH.write_text(json.dumps({
        "curve": curve,
        "extrapolations": extrapolations,
        "fit_form": "eff(n) = a - b * n^(-c)",
        "n_arr_described": "n_sgf used in training subset",
    }, indent=2))

    print()
    print("=== Extrapolations (eff = a - b * n^(-c)) ===")
    print(f"{'source':10s} {'model':14s} {'a (ceiling)':>11s} {'@n=580 (4×)':>13s} {'@n=1450 (10×)':>15s} {'@n=5000':>10s}")
    for k, ext in extrapolations.items():
        if "error" in ext:
            print(f"{k}: FIT ERROR {ext['error']}")
            continue
        src, mdl = k.split("_", 1)
        print(
            f"{src:10s} {mdl:14s} {ext['ceiling_a']:>11.4f} {ext['at_n_580']:>13.4f} "
            f"{ext['at_n_1450']:>15.4f} {ext['at_n_5000']:>10.4f}"
        )
    print(f"\nsaved {OUT_PATH}")


if __name__ == "__main__":
    main()
