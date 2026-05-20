"""
research/experiment_drop_lofo_hurting.py

LOFO diagnostic on scoreLead_drift|hyperbolic|H showed two features
HURT the regression (R² goes UP when they're removed):
  - winrate_minus_raw       Δ=+0.021
  - pv_visit_decay_ratio    Δ=+0.009

This script tests whether removing those features improves the
overall regression across all (target, family, param) triples
— or whether the LOFO effect was scoreLead_drift|H-specific
and removing them hurts other targets.

Returns a side-by-side comparison: with-all-features vs
without-2-features.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from regression import (  # noqa: E402
    load_corpus, _LightGBMWrap, _KNNWrap, _RidgeWrap,
    _cv_r2_grouped, _signed_log1p,
)

DROP_FEATURES = ["winrate_minus_raw", "pv_visit_decay_ratio"]


def regress_one(
    X: np.ndarray, vals: np.ndarray, mask_clean: np.ndarray,
    groups: np.ndarray, n_folds: int = 5,
) -> dict:
    if mask_clean.sum() < 4 * n_folds:
        return {"skip": f"too few clean ({int(mask_clean.sum())})"}
    X_m = X[mask_clean]
    y = vals[mask_clean]
    g_m = groups[mask_clean]
    log_y = _signed_log1p(y)
    r2_knn, _ = _cv_r2_grouped(X_m, log_y, g_m, _KNNWrap, n_folds)
    r2_ridge, _ = _cv_r2_grouped(X_m, log_y, g_m, _RidgeWrap, n_folds)
    r2_lgbm, _ = _cv_r2_grouped(X_m, log_y, g_m, _LightGBMWrap, n_folds)
    return {"n": int(mask_clean.sum()),
            "knn": r2_knn, "ridge": r2_ridge, "lgbm": r2_lgbm}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--labels-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" / "experiment_drop_lofo_hurting.txt",
                    type=Path)
    ap.add_argument("--n-folds", default=5, type=int)
    args = ap.parse_args()

    print(f"=== loading corpus ===", flush=True)
    corpus = load_corpus(args.labels_csv, expand_by_realization=True)
    X_all = corpus["X"]
    feature_names = corpus["feature_names"]
    per_label = corpus["per_label"]
    groups = corpus["groups"]
    print(f"  corpus: n={len(X_all)}  features={len(feature_names)}",
          flush=True)

    # Build reduced X with the 2 features dropped
    drop_idxs = [feature_names.index(f) for f in DROP_FEATURES
                 if f in feature_names]
    keep_idxs = [i for i in range(len(feature_names)) if i not in drop_idxs]
    X_red = X_all[:, keep_idxs]
    feat_red = [feature_names[i] for i in keep_idxs]
    print(f"  dropping {DROP_FEATURES} → kept {len(feat_red)} features",
          flush=True)

    # Loop over all (target, family, param) and compare
    lines: list[str] = []
    lines.append(f"# Drop-LOFO-hurting feature experiment")
    lines.append(f"# dropped: {DROP_FEATURES}")
    lines.append(f"# baseline n_features={len(feature_names)}, "
                 f"reduced n_features={len(feat_red)}")
    lines.append("")
    header = (f"  {'target':<28} {'family':<28} {'param':<14} "
              f"{'n':>4}  "
              f"{'knn':>10} {'knn_red':>10} {'Δknn':>8}  "
              f"{'ridge':>10} {'ridge_red':>10} {'Δridge':>8}  "
              f"{'lgbm':>10} {'lgbm_red':>10} {'Δlgbm':>8}")
    print(header, flush=True)
    lines.append(header)

    triples = sorted(per_label.keys())
    deltas_knn: list[float] = []
    deltas_ridge: list[float] = []
    deltas_lgbm: list[float] = []
    n_total = 0
    n_improved = {"knn": 0, "ridge": 0, "lgbm": 0}
    for (t, fam, pn) in triples:
        labels = per_label[(t, fam, pn)]
        vals = labels[:, 0]
        mask_clean = labels[:, 1] == 1.0
        full = regress_one(X_all, vals, mask_clean, groups, args.n_folds)
        red = regress_one(X_red, vals, mask_clean, groups, args.n_folds)
        if "skip" in full or "skip" in red:
            line = (f"  {t:<28} {fam:<28} {pn:<14} "
                    f"{'-':>4}  SKIPPED: {full.get('skip', red.get('skip'))}")
            print(line, flush=True)
            lines.append(line)
            continue
        d_knn = red["knn"] - full["knn"]
        d_ridge = red["ridge"] - full["ridge"]
        d_lgbm = red["lgbm"] - full["lgbm"]
        deltas_knn.append(d_knn)
        deltas_ridge.append(d_ridge)
        deltas_lgbm.append(d_lgbm)
        n_total += 1
        if d_knn > 0: n_improved["knn"] += 1
        if d_ridge > 0: n_improved["ridge"] += 1
        if d_lgbm > 0: n_improved["lgbm"] += 1
        line = (
            f"  {t:<28} {fam:<28} {pn:<14} {full['n']:>4}  "
            f"{full['knn']:>+10.4f} {red['knn']:>+10.4f} {d_knn:>+8.4f}  "
            f"{full['ridge']:>+10.4f} {red['ridge']:>+10.4f} {d_ridge:>+8.4f}  "
            f"{full['lgbm']:>+10.4f} {red['lgbm']:>+10.4f} {d_lgbm:>+8.4f}"
        )
        print(line, flush=True)
        lines.append(line)

    if n_total:
        summary = (f"\n# {n_total} triples\n"
                   f"# mean Δ:  knn={np.mean(deltas_knn):+.4f}  "
                   f"ridge={np.mean(deltas_ridge):+.4f}  "
                   f"lgbm={np.mean(deltas_lgbm):+.4f}\n"
                   f"# improved: knn={n_improved['knn']}/{n_total}  "
                   f"ridge={n_improved['ridge']}/{n_total}  "
                   f"lgbm={n_improved['lgbm']}/{n_total}")
        print(summary, flush=True)
        lines.append(summary)

    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text("\n".join(lines) + "\n")
    print(f"\nsummary: {args.out_txt}", flush=True)


if __name__ == "__main__":
    main()
