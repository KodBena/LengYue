"""
research/classify_volatility_mode_v2.py

Companion to classify_volatility_mode.py: tests whether the mode
classification accuracy jumps when we add PARTIAL-SEARCH trajectory
features (first_third index window) to the phase35 V_pre features.

If accuracy on V_pre alone is ~33% (chance) and on V_pre + first_third
features it's significantly higher, the user's two-mode structure IS
detectable from partial-MCTS — confirms the partial-search-then-decide
architecture.

Concretely: compare three feature sets:
  1. phase35 only (baseline; replicates classify_volatility_mode.py)
  2. phase35 + first_third trajectory features per drift target
  3. phase35 + first_two_thirds trajectory features per drift target

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import defaultdict
from pathlib import Path

import lightgbm as lgb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from classify_volatility_mode import _build_mode_assignments, MODE_NAMES  # noqa: E402
from extract_trajectory_features import extract_trajectory_features  # noqa: E402
from fit_averaged import averaged_trajectory_for_target  # noqa: E402
from fit_hyperbolic import VALUE_CANDIDATES  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_realizations, realization_as_flat_arrays,
)
from regression import load_corpus  # noqa: E402


DRIFT_TARGETS = ["scoreLead_drift", "L2_joint_drift", "winrate_drift",
                 "logit_winrate_drift"]
TRAJ_COLS = [
    "y_at_V_max", "y_min", "y_max", "y_range",
    "dip_depth", "rise_after_dip",
    "log_V_at_y_min", "log_V_at_y_max",
    "monotonicity_frac", "sign_changes",
    "slope_terminal", "slope_early", "slope_midrange",
]
WINDOWS = [("first_third", 1.0 / 3.0), ("first_two_thirds", 2.0 / 3.0)]


def _window_features(V: np.ndarray, y: np.ndarray, fraction: float):
    n = len(V)
    cutoff = max(4, int(round(n * fraction)))
    if cutoff < 4:
        return None
    feats = extract_trajectory_features(V[:cutoff], y[:cutoff])
    if feats.get("status") != "clean":
        return None
    return feats


def _build_window_cache(positions):
    """Per (stem, turn) → per-target → per-window → traj features dict."""
    conn = connect()
    cache: dict[tuple[str, int], dict] = {}
    t0 = time.monotonic()
    for i, (stem, turn) in enumerate(positions):
        real_idxs = list_realizations(conn, stem, turn)
        if not real_idxs:
            continue
        realizations = []
        for ri in real_idxs:
            arrs = realization_as_flat_arrays(conn, stem, turn, ri)
            if arrs is not None:
                realizations.append(arrs)
        if len(realizations) < 2:
            continue
        per_target = {}
        for tname, value_fn in VALUE_CANDIDATES.items():
            if tname not in DRIFT_TARGETS:
                continue
            avg = averaged_trajectory_for_target(realizations, value_fn)
            if avg is None:
                per_target[tname] = None
                continue
            V_g, y_g = avg
            V_g = V_g.astype(np.float64)
            y_g = y_g.astype(np.float64)
            entries = {}
            for name, frac in WINDOWS:
                entries[name] = _window_features(V_g, y_g, frac)
            per_target[tname] = entries
        cache[(stem, turn)] = per_target
        if (i + 1) % 25 == 0 or i + 1 == len(positions):
            dt = time.monotonic() - t0
            rate = (i + 1) / max(dt, 1e-9)
            eta = (len(positions) - (i + 1)) / max(rate, 1e-9)
            print(f"  [{i+1}/{len(positions)}] {rate:.1f} pos/s  "
                  f"elapsed {dt:.0f}s  eta {eta:.0f}s", flush=True)
    conn.close()
    return cache


def _build_X(corpus_X, sample_pos, cache, window_name, drift_targets):
    """Concat phase35 + window-traj features per drift target. Returns
    (X_aug, valid_mask) where valid_mask is True where all features
    are available."""
    n = len(corpus_X)
    n_extra = len(drift_targets) * len(TRAJ_COLS)
    X_aug = np.zeros((n, corpus_X.shape[1] + n_extra), dtype=np.float64)
    X_aug[:, :corpus_X.shape[1]] = corpus_X
    valid = np.ones(n, dtype=bool)
    for i, (stem, turn) in enumerate(sample_pos):
        entries = cache.get((stem, turn))
        if entries is None:
            valid[i] = False
            continue
        col_offset = corpus_X.shape[1]
        for t in drift_targets:
            tentries = entries.get(t)
            if tentries is None:
                valid[i] = False
                break
            feats = tentries.get(window_name)
            if feats is None:
                valid[i] = False
                break
            for col in TRAJ_COLS:
                v = feats.get(col)
                if v is None or not np.isfinite(v):
                    valid[i] = False
                    break
                X_aug[i, col_offset] = float(v)
                col_offset += 1
            if not valid[i]:
                break
    return X_aug, valid


def _run_classifier(X, y, groups, n_folds, label):
    kf = GroupKFold(n_splits=n_folds)
    lgbm_oof = np.zeros((len(X), 3))
    log_oof = np.zeros((len(X), 3))
    for fold_i, (train_idx, test_idx) in enumerate(kf.split(X, y,
                                                              groups=groups)):
        lgbm_params = {
            "objective": "multiclass", "num_class": 3,
            "metric": "multi_logloss", "num_leaves": 15,
            "min_data_in_leaf": 5, "learning_rate": 0.05,
            "feature_fraction": 0.8, "bagging_fraction": 0.8,
            "bagging_freq": 5, "lambda_l2": 0.1, "verbose": -1,
        }
        ds = lgb.Dataset(X[train_idx], label=y[train_idx])
        booster = lgb.train(lgbm_params, ds, num_boost_round=300)
        lgbm_oof[test_idx] = booster.predict(X[test_idx])

        scaler = StandardScaler()
        clf = LogisticRegression(penalty="l2", C=1.0,
                                  class_weight="balanced",
                                  solver="lbfgs", max_iter=2000)
        clf.fit(scaler.fit_transform(X[train_idx]), y[train_idx])
        log_oof[test_idx] = clf.predict_proba(scaler.transform(X[test_idx]))

    pred_lgbm = lgbm_oof.argmax(axis=1)
    pred_log = log_oof.argmax(axis=1)
    acc_lgbm = float((pred_lgbm == y).mean())
    acc_log = float((pred_log == y).mean())
    auc_lgbm = roc_auc_score(y, lgbm_oof, multi_class="ovr", average="macro")
    auc_log = roc_auc_score(y, log_oof, multi_class="ovr", average="macro")
    cm_lgbm = confusion_matrix(y, pred_lgbm)
    print(f"\n[{label}]  LGBM acc={acc_lgbm:.4f} AUC={auc_lgbm:.4f}  "
          f"Logistic acc={acc_log:.4f} AUC={auc_log:.4f}", flush=True)
    print(f"  LGBM confusion (rows=true, cols=pred):", flush=True)
    for i, row in enumerate(cm_lgbm):
        print(f"    {MODE_NAMES[i]:<20}: {row}", flush=True)
    return {
        "label": label, "n": len(X),
        "lgbm_acc": acc_lgbm, "lgbm_auc": auc_lgbm, "cm_lgbm": cm_lgbm,
        "log_acc": acc_log, "log_auc": auc_log,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--features-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "trajectory_features_dlp.csv"), type=Path)
    ap.add_argument("--averaged-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" / "mode_discovery" /
                            "classify_mode_v2_summary.txt", type=Path)
    ap.add_argument("--n-folds", default=5, type=int)
    args = ap.parse_args()

    print(f"=== building mode assignments (K=3) ===", flush=True)
    mode_by_pos = _build_mode_assignments(args.features_csv)
    print(f"  {len(mode_by_pos)} positions", flush=True)

    print(f"\n=== loading phase35 corpus ===", flush=True)
    corpus = load_corpus(args.averaged_csv, expand_by_realization=True)
    X = corpus["X"]
    feature_names = corpus["feature_names"]
    groups = corpus["groups"]
    sample_ids = corpus["sample_ids"]
    print(f"  corpus: n={len(X)}  features={len(feature_names)}", flush=True)

    sample_pos = []
    for sid in sample_ids:
        parts = sid.split(":")
        sample_pos.append((parts[0], int(parts[1].lstrip("t"))))

    y = np.full(len(X), -1, dtype=np.int64)
    for i, (stem, turn) in enumerate(sample_pos):
        m = mode_by_pos.get((stem, turn))
        if m is not None:
            y[i] = m
    base_mask = y >= 0
    print(f"  matched samples: n={base_mask.sum()}", flush=True)

    # Compute per-window cache (over unique positions)
    print(f"\n=== building window trajectory cache "
          f"(this re-reads Postgres for the corpus positions) ===",
          flush=True)
    unique_positions = sorted({sample_pos[i] for i in range(len(X))
                                 if base_mask[i]})
    cache = _build_window_cache(unique_positions)
    print(f"  cache: {len(cache)} positions", flush=True)

    # Run 3 classifiers: V_pre only, V_pre + 1/3, V_pre + 2/3
    print(f"\n=== classifier comparison ===", flush=True)

    # Baseline: V_pre only
    X_base = X[base_mask]
    y_base = y[base_mask]
    g_base = groups[base_mask]
    r_base = _run_classifier(X_base, y_base, g_base, args.n_folds,
                              "V_pre only (23 features)")

    results = [r_base]
    for window in ("first_third", "first_two_thirds"):
        X_aug, valid = _build_X(X, sample_pos, cache, window, DRIFT_TARGETS)
        combined = base_mask & valid
        X_a = X_aug[combined]
        y_a = y[combined]
        g_a = groups[combined]
        n_aug_feats = len(DRIFT_TARGETS) * len(TRAJ_COLS)
        r = _run_classifier(
            X_a, y_a, g_a, args.n_folds,
            f"V_pre + {window} ({23 + n_aug_feats} features, "
            f"n={int(combined.sum())})",
        )
        results.append(r)

    # Save summary
    lines: list[str] = []
    lines.append(f"# mode classification — V_pre alone vs V_pre + partial-search features")
    lines.append(f"# {len(corpus['X'])} corpus samples × 3 modes; "
                 f"GroupKFold k={args.n_folds}")
    lines.append(f"# chance baseline (majority): "
                 f"{max(np.bincount(y_base))/len(y_base):.4f}")
    lines.append("")
    lines.append(f"  {'feature set':<55} {'n':>5} "
                 f"{'LGBM_acc':>9} {'LGBM_AUC':>9} "
                 f"{'log_acc':>9} {'log_AUC':>9}")
    for r in results:
        lines.append(
            f"  {r['label']:<55} {r['n']:>5} "
            f"{r['lgbm_acc']:>+9.4f} {r['lgbm_auc']:>+9.4f} "
            f"{r['log_acc']:>+9.4f} {r['log_auc']:>+9.4f}"
        )
    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text("\n".join(lines) + "\n")
    print()
    print("\n".join(lines))
    print(f"\nsummary: {args.out_txt}", flush=True)


if __name__ == "__main__":
    main()
