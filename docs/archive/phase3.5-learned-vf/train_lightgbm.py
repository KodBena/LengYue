"""Phase 3.5 — train a LightGBM regressor on (features → r_full).

Input: training_features.jsonl produced by extract_features.py.
Target: visit_entropy_reduction r_full (the primary oracle).
Held-out: SGF-level cross-validation (no leakage between train/val
turns from the same game).

Outputs:
  - lightgbm_model.txt: the trained model (LightGBM native format).
  - cv_results.json: per-fold metrics + feature importance.

License: Public Domain (Unlicense).
"""

from __future__ import annotations

import json
import math
import random
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
from scipy.stats import spearmanr

FEATURES_PATH = Path("/home/bork/benchmark_allocation/training_features.jsonl")
# TARGET overridable by env var for the r_int companion model.
import os
TARGET = os.environ.get("LGB_TARGET", "target_visit_entropy_reduction")
_TAG = TARGET.replace("target_", "").replace("visit_", "")
MODEL_PATH = Path(f"/home/bork/benchmark_allocation/lightgbm_model_{_TAG}.txt")
CV_PATH = Path(f"/home/bork/benchmark_allocation/cv_results_{_TAG}.json")

N_FOLDS = 5
RNG_SEED = 42

LGB_PARAMS = {
    "objective": "regression",
    "metric": "rmse",
    "num_leaves": 31,
    "learning_rate": 0.05,
    "feature_fraction": 0.9,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "min_data_in_leaf": 10,
    "verbose": -1,
}


def _load_rows() -> list[dict]:
    rows = []
    with open(FEATURES_PATH) as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


def _split_by_sgf(rows: list[dict], n_folds: int, seed: int) -> list[tuple[list[int], list[int]]]:
    """Yields (train_idx, val_idx) splits where each SGF lives entirely
    on one side of any given fold. Stratifies by model so each fold sees
    all three NN tiers."""
    sgfs = sorted({r["sgf"] for r in rows})
    rng = random.Random(seed)
    rng.shuffle(sgfs)
    fold_sgfs = [sgfs[i::n_folds] for i in range(n_folds)]
    folds = []
    for k in range(n_folds):
        val_sgfs = set(fold_sgfs[k])
        train_idx = [i for i, r in enumerate(rows) if r["sgf"] not in val_sgfs]
        val_idx = [i for i, r in enumerate(rows) if r["sgf"] in val_sgfs]
        folds.append((train_idx, val_idx))
    return folds


def _feature_columns(rows: list[dict]) -> list[str]:
    return sorted({k for r in rows for k in r if k.startswith("f_")})


def _build_xy(rows: list[dict], feat_cols: list[str], target: str) -> tuple[np.ndarray, np.ndarray]:
    X = np.array(
        [[r.get(k, 0.0) for k in feat_cols] for r in rows],
        dtype=np.float64,
    )
    y = np.array([r.get(target, 0.0) for r in rows], dtype=np.float64)
    return X, y


def main() -> None:
    rows = _load_rows()
    print(f"loaded {len(rows)} training rows from {len(set((r['model'], r['sgf'], r['turn_start']) for r in rows))} unique cells")
    print(f"models: {sorted(set(r['model'] for r in rows))}")
    print(f"SGFs: {len(set(r['sgf'] for r in rows))}")

    feat_cols = _feature_columns(rows)
    print(f"feature columns: {len(feat_cols)}")
    print(f"target: {TARGET}")
    print()

    # SGF-level cross-validation
    folds = _split_by_sgf(rows, N_FOLDS, RNG_SEED)
    fold_results = []
    feature_importance_sum = np.zeros(len(feat_cols))

    for fold_i, (train_idx, val_idx) in enumerate(folds):
        train_rows = [rows[i] for i in train_idx]
        val_rows = [rows[i] for i in val_idx]
        X_tr, y_tr = _build_xy(train_rows, feat_cols, TARGET)
        X_va, y_va = _build_xy(val_rows, feat_cols, TARGET)

        train_set = lgb.Dataset(X_tr, y_tr, feature_name=feat_cols)
        val_set = lgb.Dataset(X_va, y_va, reference=train_set)

        model = lgb.train(
            LGB_PARAMS,
            train_set,
            num_boost_round=500,
            valid_sets=[val_set],
            callbacks=[
                lgb.early_stopping(stopping_rounds=30, verbose=False),
                lgb.log_evaluation(period=0),
            ],
        )

        pred = model.predict(X_va)
        rmse = float(np.sqrt(np.mean((pred - y_va) ** 2)))
        y_std = float(np.std(y_va))
        # R² coefficient: 1 - residual_var / total_var.
        r2 = 1.0 - (rmse ** 2) / (y_std ** 2) if y_std > 0 else float("nan")
        # Spearman of predictions vs ground truth (rank correlation,
        # what matters for allocation policy decisions).
        sp_corr, _ = spearmanr(pred, y_va)
        sp_corr = float(sp_corr) if not math.isnan(sp_corr) else float("nan")

        importance = model.feature_importance(importance_type="gain")
        feature_importance_sum += importance

        fold_results.append({
            "fold": fold_i,
            "n_train": len(train_idx),
            "n_val": len(val_idx),
            "rmse": rmse,
            "r2": r2,
            "spearman_pred_vs_truth": sp_corr,
            "best_iteration": model.best_iteration,
        })
        print(
            f"  fold {fold_i+1}/{N_FOLDS}: n_train={len(train_idx)} n_val={len(val_idx)} "
            f"RMSE={rmse:.4f} R²={r2:.3f} Spearman={sp_corr:.3f} "
            f"best_iter={model.best_iteration}"
        )

    # Final model: train on ALL data, save.
    X_all, y_all = _build_xy(rows, feat_cols, TARGET)
    final_train = lgb.Dataset(X_all, y_all, feature_name=feat_cols)
    avg_best_iter = int(statistics.mean(f["best_iteration"] for f in fold_results))
    final_model = lgb.train(
        LGB_PARAMS,
        final_train,
        num_boost_round=avg_best_iter,
        callbacks=[lgb.log_evaluation(period=0)],
    )
    final_model.save_model(str(MODEL_PATH))
    print(f"\nsaved final model to {MODEL_PATH} (trained for {avg_best_iter} iterations)")

    # Feature importance summary
    importance_avg = feature_importance_sum / N_FOLDS
    importance_ranked = sorted(
        zip(feat_cols, importance_avg),
        key=lambda kv: -kv[1],
    )

    print("\nTop-15 features by mean gain across folds:")
    for name, gain in importance_ranked[:15]:
        print(f"  {name:40s} {gain:>10.1f}")

    # Aggregate metrics
    mean_rmse = statistics.mean(f["rmse"] for f in fold_results)
    mean_r2 = statistics.mean(f["r2"] for f in fold_results)
    mean_sp = statistics.mean(f["spearman_pred_vs_truth"] for f in fold_results)
    print(f"\nCV mean: RMSE={mean_rmse:.4f}  R²={mean_r2:.3f}  Spearman(pred,truth)={mean_sp:.3f}")

    CV_PATH.write_text(json.dumps({
        "target": TARGET,
        "n_rows": len(rows),
        "n_cells": len(set((r["model"], r["sgf"], r["turn_start"]) for r in rows)),
        "n_sgfs": len(set(r["sgf"] for r in rows)),
        "n_features": len(feat_cols),
        "folds": fold_results,
        "mean_rmse": mean_rmse,
        "mean_r2": mean_r2,
        "mean_spearman": mean_sp,
        "feature_importance": [
            {"feature": n, "gain": float(g)} for n, g in importance_ranked
        ],
        "final_model_iterations": avg_best_iter,
        "lgb_params": LGB_PARAMS,
    }, indent=2))
    print(f"saved CV report to {CV_PATH}")


if __name__ == "__main__":
    main()
