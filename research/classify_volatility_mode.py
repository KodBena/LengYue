"""
research/classify_volatility_mode.py

Test whether the 3 discovered volatility modes (fast-tactical /
reading-paradox / clean-monotone) are PREDICTABLE from V_pre features
alone — i.e., before any MCTS search happens.

Pipeline:
  1. Re-run K=3 clustering on shape-invariant trajectory features
     across 437 positions → assigns mode_id ∈ {0, 1, 2} per position.
  2. Build (X, y) where X is the cached phase35 corpus (per-realization)
     and y is the position's mode_id replicated across realizations.
  3. Train LGBM + Logistic multi-class classifiers with GroupKFold.
  4. Report: overall accuracy, per-mode precision/recall/F1,
     one-vs-rest AUC, per-fold breakdown, feature importance (LGBM).
  5. If predictable: mode_id can be a free V_pre-derived input feature
     for downstream regression. If not: mode is a search-time
     discovery and the allocator needs partial-MCTS state.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

import lightgbm as lgb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    classification_report, confusion_matrix, roc_auc_score,
)
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from regression import load_corpus  # noqa: E402


DRIFT_TARGETS = ["scoreLead_drift", "L2_joint_drift", "winrate_drift",
                 "logit_winrate_drift"]
MODE_NAMES = {
    0: "fast-tactical",
    1: "reading-paradox",
    2: "clean-monotone",
}


def _shape_features(d: dict) -> list[float]:
    yr = max(d['y_range'], 1e-9)
    se = d['slope_early']
    return [
        d['dip_depth'] / yr,
        d['log_kappa'],
        d['slope_terminal'] / (abs(se) + 1e-9) * np.sign(se),
        d['monotonicity_frac'],
        d['dlp_n_valid_pairs'] / 1225,
    ]


def _build_mode_assignments(
    features_csv: Path,
) -> dict[tuple[str, int], int]:
    """Reproduce the K=3 clustering on shape-invariant features.
    Returns dict mapping (stem, turn) → mode_id ∈ {0, 1, 2}."""
    per_pos: dict[tuple[str, int], dict[str, dict]] = defaultdict(dict)
    with features_csv.open() as f:
        for row in csv.DictReader(f):
            if row['status'] != 'clean':
                continue
            try:
                stem, turn, target = row['stem'], int(row['turn']), row['target']
                per_pos[(stem, turn)][target] = {
                    'y_range': float(row['y_range']),
                    'dip_depth': float(row['dip_depth']),
                    'log_kappa': float(row['log_kappa_dlp_median']),
                    'slope_terminal': float(row['slope_terminal']),
                    'slope_early': float(row['slope_early']),
                    'monotonicity_frac': float(row['monotonicity_frac']),
                    'dlp_n_valid_pairs': float(row['dlp_n_valid_pairs']),
                }
            except (ValueError, KeyError):
                pass

    keep = []
    X_shape = []
    for (stem, turn), per_t in sorted(per_pos.items()):
        if not all(t in per_t for t in DRIFT_TARGETS):
            continue
        row = []
        bad = False
        for t in DRIFT_TARGETS:
            feats = _shape_features(per_t[t])
            if any(not np.isfinite(v) for v in feats):
                bad = True
                break
            row.extend(feats)
        if not bad:
            keep.append((stem, turn))
            X_shape.append(row)
    X_shape = np.array(X_shape)
    X_std = StandardScaler().fit_transform(X_shape)
    km = KMeans(n_clusters=3, random_state=42, n_init=10).fit(X_std)
    return {keep[i]: int(km.labels_[i]) for i in range(len(keep))}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--features-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "trajectory_features_dlp.csv"), type=Path)
    ap.add_argument("--averaged-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" / "mode_discovery" /
                            "classify_mode_summary.txt", type=Path)
    ap.add_argument("--plot-dir",
                    default=Path.home() / "plots" / "mode_discovery",
                    type=Path)
    ap.add_argument("--n-folds", default=5, type=int)
    args = ap.parse_args()
    args.plot_dir.mkdir(parents=True, exist_ok=True)

    print(f"=== reproducing K=3 mode assignments ===", flush=True)
    mode_by_pos = _build_mode_assignments(args.features_csv)
    print(f"  {len(mode_by_pos)} positions with mode assignment", flush=True)
    mode_counts = {m: sum(1 for v in mode_by_pos.values() if v == m)
                    for m in range(3)}
    for m in sorted(mode_counts):
        print(f"    mode {m} ({MODE_NAMES[m]}): {mode_counts[m]}", flush=True)

    print(f"\n=== loading phase35 corpus from cache ===", flush=True)
    corpus = load_corpus(args.averaged_csv, expand_by_realization=True)
    X = corpus["X"]
    feature_names = corpus["feature_names"]
    groups = corpus["groups"]
    sample_ids = corpus["sample_ids"]
    print(f"  corpus: n={len(X)}  features={len(feature_names)}", flush=True)

    # Build per-sample mode_id from sample_ids
    y = np.full(len(X), -1, dtype=np.int64)
    for i, sid in enumerate(sample_ids):
        parts = sid.split(":")
        stem = parts[0]
        turn = int(parts[1].lstrip("t"))
        m = mode_by_pos.get((stem, turn))
        if m is not None:
            y[i] = m
    mask = y >= 0
    X_m, y_m, g_m = X[mask], y[mask], groups[mask]
    print(f"  matched samples: n={len(X_m)} (positions with both corpus "
          f"features and mode assignment)", flush=True)

    n_per_class = {m: int((y_m == m).sum()) for m in range(3)}
    print(f"  class distribution: {n_per_class}", flush=True)

    if min(n_per_class.values()) < 4 * args.n_folds:
        sys.exit(f"too few samples in one class for {args.n_folds}-fold CV")

    # ── Train LGBM and Logistic multi-class classifiers ─────────────────────
    print(f"\n=== running GroupKFold k={args.n_folds} multi-class CV ===",
          flush=True)
    kf = GroupKFold(n_splits=args.n_folds)
    lgbm_oof = np.zeros((len(X_m), 3))
    log_oof = np.zeros((len(X_m), 3))
    fold_acc_lgbm: list[float] = []
    fold_acc_log: list[float] = []
    for fold_i, (train_idx, test_idx) in enumerate(kf.split(X_m, y_m,
                                                              groups=g_m)):
        # LGBM
        lgbm_params = {
            "objective": "multiclass", "num_class": 3,
            "metric": "multi_logloss", "num_leaves": 15,
            "min_data_in_leaf": 5, "learning_rate": 0.05,
            "feature_fraction": 0.8, "bagging_fraction": 0.8,
            "bagging_freq": 5, "lambda_l2": 0.1, "verbose": -1,
        }
        ds = lgb.Dataset(X_m[train_idx], label=y_m[train_idx])
        booster = lgb.train(lgbm_params, ds, num_boost_round=300)
        lgbm_oof[test_idx] = booster.predict(X_m[test_idx])
        pred_lgbm = lgbm_oof[test_idx].argmax(axis=1)
        fold_acc_lgbm.append(float((pred_lgbm == y_m[test_idx]).mean()))

        # Logistic
        scaler = StandardScaler()
        X_tr_s = scaler.fit_transform(X_m[train_idx])
        X_te_s = scaler.transform(X_m[test_idx])
        clf = LogisticRegression(
            penalty="l2", C=1.0, class_weight="balanced",
            solver="lbfgs", max_iter=2000,
        )
        clf.fit(X_tr_s, y_m[train_idx])
        log_oof[test_idx] = clf.predict_proba(X_te_s)
        pred_log = log_oof[test_idx].argmax(axis=1)
        fold_acc_log.append(float((pred_log == y_m[test_idx]).mean()))
        print(f"  fold {fold_i}: n_test={len(test_idx):4d}  "
              f"LGBM acc={fold_acc_lgbm[-1]:.3f}  "
              f"Logistic acc={fold_acc_log[-1]:.3f}", flush=True)

    pred_lgbm_all = lgbm_oof.argmax(axis=1)
    pred_log_all = log_oof.argmax(axis=1)
    chance = max(n_per_class.values()) / len(y_m)
    print(f"\n  chance baseline (majority class): {chance:.3f}", flush=True)

    print(f"\n=== LGBM OOF results ===", flush=True)
    lgbm_acc = float((pred_lgbm_all == y_m).mean())
    print(f"  accuracy: {lgbm_acc:.4f}  vs chance {chance:.4f}  "
          f"(lift +{(lgbm_acc - chance):.4f})", flush=True)
    print("  classification report:", flush=True)
    print(classification_report(
        y_m, pred_lgbm_all, target_names=[MODE_NAMES[i] for i in range(3)],
        digits=3,
    ), flush=True)
    print("  confusion matrix (rows=true, cols=pred):", flush=True)
    cm_lgbm = confusion_matrix(y_m, pred_lgbm_all)
    for i, row in enumerate(cm_lgbm):
        print(f"    {MODE_NAMES[i]:<18}: {row}", flush=True)
    auc_lgbm = roc_auc_score(y_m, lgbm_oof, multi_class="ovr",
                              average="macro")
    print(f"  one-vs-rest macro AUC: {auc_lgbm:.4f}", flush=True)

    print(f"\n=== Logistic OOF results ===", flush=True)
    log_acc = float((pred_log_all == y_m).mean())
    print(f"  accuracy: {log_acc:.4f}", flush=True)
    print(classification_report(
        y_m, pred_log_all, target_names=[MODE_NAMES[i] for i in range(3)],
        digits=3,
    ), flush=True)
    auc_log = roc_auc_score(y_m, log_oof, multi_class="ovr", average="macro")
    print(f"  one-vs-rest macro AUC: {auc_log:.4f}", flush=True)

    # ── Feature importance (LGBM, full-data fit) ────────────────────────────
    print(f"\n=== feature importance (LGBM, full-data fit) ===", flush=True)
    ds_full = lgb.Dataset(X_m, label=y_m)
    booster_full = lgb.train(lgbm_params, ds_full, num_boost_round=300)
    importances = booster_full.feature_importance(importance_type="gain")
    order = np.argsort(importances)[::-1]
    top_lines = []
    for rank, idx in enumerate(order):
        if importances[idx] <= 0:
            break
        line = (f"  {rank+1:2d}. {feature_names[idx]:<32s} "
                f"gain={importances[idx]:.1f}")
        print(line, flush=True)
        top_lines.append(line)

    # Save text summary
    out_lines: list[str] = []
    out_lines.append(f"# mode-from-V_pre classification")
    out_lines.append(f"# {len(X_m)} samples, {len(set(g_m))} position "
                     f"groups, 3 classes")
    out_lines.append(f"# class distribution: {n_per_class}")
    out_lines.append(f"# chance baseline (majority): {chance:.4f}")
    out_lines.append("")
    out_lines.append(f"LGBM OOF acc: {lgbm_acc:.4f}  (lift +{(lgbm_acc-chance):.4f})  "
                     f"macro-AUC: {auc_lgbm:.4f}")
    out_lines.append(f"Logistic OOF acc: {log_acc:.4f}  (lift +{(log_acc-chance):.4f})  "
                     f"macro-AUC: {auc_log:.4f}")
    out_lines.append("")
    out_lines.append("LGBM confusion matrix:")
    for i, row in enumerate(cm_lgbm):
        out_lines.append(f"  {MODE_NAMES[i]:<18}: {row}")
    out_lines.append("")
    out_lines.append("Top features (LGBM gain):")
    out_lines.extend(top_lines)
    args.out_txt.write_text("\n".join(out_lines) + "\n")
    print(f"\nsummary: {args.out_txt}", flush=True)

    # Confusion matrix plot
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    for ax, (name, cm) in zip(axes, [
        ("LGBM", cm_lgbm),
        ("Logistic", confusion_matrix(y_m, pred_log_all)),
    ]):
        im = ax.imshow(cm / cm.sum(axis=1, keepdims=True), cmap="Blues",
                       vmin=0, vmax=1)
        ax.set_xticks([0, 1, 2])
        ax.set_yticks([0, 1, 2])
        ax.set_xticklabels([MODE_NAMES[i] for i in range(3)], rotation=15)
        ax.set_yticklabels([MODE_NAMES[i] for i in range(3)])
        for i in range(3):
            for j in range(3):
                color = "white" if cm[i, j] / cm.sum(axis=1)[i] > 0.5 else "black"
                ax.text(j, i, f"{cm[i,j]}\n({cm[i,j]/cm.sum(axis=1)[i]:.0%})",
                        ha="center", va="center", color=color, fontsize=9)
        ax.set_xlabel("Predicted")
        ax.set_ylabel("True")
        acc = float((cm.diagonal().sum()) / cm.sum())
        ax.set_title(f"{name} (acc={acc:.3f})")
        fig.colorbar(im, ax=ax, fraction=0.046)
    fig.suptitle(
        f"Mode classification from V_pre features  "
        f"(chance={chance:.3f}, n={len(X_m)}, groups={len(set(g_m))})",
        fontsize=12,
    )
    fig.tight_layout()
    out_plot = args.plot_dir / "classify_mode_confusion.png"
    fig.savefig(out_plot, dpi=110)
    plt.close(fig)
    print(f"plot: {out_plot}", flush=True)


if __name__ == "__main__":
    main()
