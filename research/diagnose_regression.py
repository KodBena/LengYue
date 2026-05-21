"""
research/diagnose_regression.py

Focused diagnostic on one (target, family, param) regression triple.
Triggered when regression.py finds a non-trivial positive R² — we
want to understand WHAT the model is using to predict and whether
the signal is real position-structure or an artifactual feature.

Produces (text and plots, all to ~/plots/):
  - Per-fold R² breakdown (GroupKFold-aware): catches "one lucky
    fold" cases where median is high but variance is wild.
  - Feature importance (LGBM gain) ranked.
  - Predicted-vs-actual scatter on out-of-fold predictions.
  - Leave-one-feature-out (LOFO): re-train with each feature
    individually removed; report the R² delta to find single-
    feature dependencies that might be artifacts.

Usage:
  python diagnose_regression.py \
    --labels-csv /tmp/summary_averaged.csv \
    --target scoreLead_drift --family hyperbolic --param H

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import lightgbm as lgb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.model_selection import GroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent))
from regression import (  # noqa: E402
    load_corpus, _LightGBMWrap, _signed_log1p,
)


def diagnose(
    labels_csv: Path,
    target: str,
    family: str,
    param_name: str,
    plot_dir: Path,
    n_folds: int = 5,
) -> None:
    plot_dir.mkdir(parents=True, exist_ok=True)
    print(f"=== diagnosing {target}|{family}|{param_name} ===")

    corpus = load_corpus(labels_csv, expand_by_realization=True)
    X = corpus["X"]
    feature_names = corpus["feature_names"]
    per_label = corpus["per_label"]
    groups = corpus["groups"]
    if groups is None:
        sys.exit("expected expanded/per-realization corpus with groups; got None")

    key = (target, family, param_name)
    if key not in per_label:
        sys.exit(f"no labels found for {key!r}; available: "
                 f"{sorted(per_label.keys())[:5]}…")

    labels = per_label[key]
    vals = labels[:, 0]
    mask_clean = labels[:, 1] == 1.0
    X_m = X[mask_clean]
    y_raw = vals[mask_clean]
    g_m = groups[mask_clean]
    log_y = _signed_log1p(y_raw)

    print(f"  n_samples={len(X_m)}  n_features={X_m.shape[1]}  "
          f"n_groups={len(set(g_m))}")
    print(f"  log_y: mean={log_y.mean():+.4f}  std={log_y.std():.4f}")

    # ── Per-fold R² breakdown ───────────────────────────────────────────────
    print(f"\n=== per-fold R² (GroupKFold k={n_folds}) ===")
    kf = GroupKFold(n_splits=n_folds)
    preds_oof = np.zeros_like(log_y)
    fold_r2: list[float] = []
    for fold_i, (train_idx, test_idx) in enumerate(kf.split(X_m, log_y, groups=g_m)):
        m = _LightGBMWrap().fit(X_m[train_idx], log_y[train_idx])
        pred = m.predict(X_m[test_idx])
        preds_oof[test_idx] = pred
        ss_res = float(((log_y[test_idx] - pred) ** 2).sum())
        ss_tot = float(((log_y[test_idx] - log_y[test_idx].mean()) ** 2).sum())
        r2 = 1.0 - ss_res / max(ss_tot, 1e-12)
        fold_r2.append(r2)
        print(f"  fold {fold_i}: n_train={len(train_idx):5d} "
              f"n_test={len(test_idx):4d}  R²={r2:+.4f}")

    overall_r2 = 1.0 - float(((log_y - preds_oof) ** 2).sum()) / max(
        float(((log_y - log_y.mean()) ** 2).sum()), 1e-12
    )
    print(f"\n  per-fold R²: median={np.median(fold_r2):+.4f}  "
          f"mean={np.mean(fold_r2):+.4f}  "
          f"min={min(fold_r2):+.4f}  max={max(fold_r2):+.4f}")
    print(f"  overall (pooled OOF) R²: {overall_r2:+.4f}")

    # ── Feature importance ──────────────────────────────────────────────────
    print(f"\n=== feature importance (LightGBM gain, full-data fit) ===")
    final = _LightGBMWrap().fit(X_m, log_y)
    importances = final.booster.feature_importance(importance_type="gain")
    order = np.argsort(importances)[::-1]
    for rank, idx in enumerate(order):
        if importances[idx] <= 0:
            break
        print(f"  {rank+1:2d}. {feature_names[idx]:<32s} gain={importances[idx]:.1f}")

    # ── Predicted-vs-actual scatter ─────────────────────────────────────────
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.scatter(log_y, preds_oof, s=12, alpha=0.4, c=g_m, cmap="tab20")
    lim_lo = min(float(log_y.min()), float(preds_oof.min())) - 0.1
    lim_hi = max(float(log_y.max()), float(preds_oof.max())) + 0.1
    ax.plot([lim_lo, lim_hi], [lim_lo, lim_hi], "k--", lw=1, alpha=0.5)
    ax.axhline(log_y.mean(), color="red", lw=0.5, alpha=0.5, label="predict-the-mean")
    ax.set_xlim(lim_lo, lim_hi)
    ax.set_ylim(lim_lo, lim_hi)
    ax.set_xlabel("actual signed-log y")
    ax.set_ylabel("predicted (out-of-fold)")
    ax.set_title(f"{target} | {family} | {param_name}\n"
                 f"LGBM OOF: R²={overall_r2:+.3f}  n={len(X_m)}  "
                 f"groups={len(set(g_m))}")
    ax.legend(fontsize=8)
    ax.grid(alpha=0.3)
    out = plot_dir / f"diagnose_{target}_{family}_{param_name}_pva.png"
    fig.tight_layout()
    fig.savefig(out, dpi=110)
    plt.close(fig)
    print(f"\n  scatter plot: {out}")

    # ── Leave-one-feature-out ───────────────────────────────────────────────
    print(f"\n=== leave-one-feature-out R² (LGBM, full GroupKFold CV) ===")
    print(f"  baseline (all features): {overall_r2:+.4f}")
    lofo_deltas: list[tuple[str, float, float]] = []
    for fi, fname in enumerate(feature_names):
        keep = [i for i in range(X_m.shape[1]) if i != fi]
        X_red = X_m[:, keep]
        preds_oof_red = np.zeros_like(log_y)
        for train_idx, test_idx in kf.split(X_red, log_y, groups=g_m):
            m = _LightGBMWrap().fit(X_red[train_idx], log_y[train_idx])
            preds_oof_red[test_idx] = m.predict(X_red[test_idx])
        r2_red = 1.0 - float(((log_y - preds_oof_red) ** 2).sum()) / max(
            float(((log_y - log_y.mean()) ** 2).sum()), 1e-12
        )
        delta = r2_red - overall_r2
        lofo_deltas.append((fname, r2_red, delta))
    lofo_deltas.sort(key=lambda x: x[2])
    print(f"  {'feature':<32s} {'R²_w/o':>9s} {'Δ':>9s}  (more-negative Δ ⇒ feature is load-bearing)")
    for fname, r2_red, delta in lofo_deltas:
        mark = "  ← key" if delta < -0.01 else ""
        print(f"  {fname:<32s} {r2_red:+9.4f} {delta:+9.4f}{mark}")

    # ── Feature-importance bar plot ─────────────────────────────────────────
    fig, ax = plt.subplots(figsize=(7, max(4, 0.25 * len(feature_names))))
    sorted_idx = np.argsort(importances)
    ax.barh(range(len(feature_names)), importances[sorted_idx])
    ax.set_yticks(range(len(feature_names)))
    ax.set_yticklabels([feature_names[i] for i in sorted_idx], fontsize=8)
    ax.set_xlabel("LightGBM feature importance (gain)")
    ax.set_title(f"{target} | {family} | {param_name}: feature importance")
    ax.grid(alpha=0.3, axis="x")
    out = plot_dir / f"diagnose_{target}_{family}_{param_name}_fi.png"
    fig.tight_layout()
    fig.savefig(out, dpi=110)
    plt.close(fig)
    print(f"\n  feature importance plot: {out}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--labels-csv", default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--target", required=True)
    ap.add_argument("--family", required=True)
    ap.add_argument("--param", required=True)
    ap.add_argument("--plot-dir", default=Path.home() / "plots", type=Path)
    ap.add_argument("--n-folds", default=5, type=int)
    args = ap.parse_args()
    diagnose(
        labels_csv=args.labels_csv,
        target=args.target, family=args.family, param_name=args.param,
        plot_dir=args.plot_dir, n_folds=args.n_folds,
    )


if __name__ == "__main__":
    main()
