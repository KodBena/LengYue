"""
research/regression_trajectory_features.py

Regression using the new non-parametric trajectory features as
labels — counterpart to the existing regression.py which predicts
(H, κ) hyperbolic-fit parameters.

For each (target, feature_column) in trajectory_features.csv:
  - X: phase35 features from V_pre (from cached corpus)
  - y: feature_column (e.g. y_at_V_max, dip_depth, slope_terminal)
  - Apply signed_log1p, run GroupKFold k-NN / Ridge / LGBM
  - Report OOF R² per model

The point: if non-parametric features are more predictable from
V_pre than the hyperbolic (H, κ) fits, the parametric framing was
the bottleneck (not the labels).

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from regression import (  # noqa: E402
    load_corpus, _LightGBMWrap, _KNNWrap, _RidgeWrap,
    _cv_r2_grouped, _signed_log1p,
)


# Feature columns to predict (skipping bookkeeping columns)
LABEL_COLUMNS = [
    "y_at_V_min", "y_at_V_max", "y_min", "y_max", "y_range",
    "dip_depth", "rise_after_dip",
    "log_V_at_y_min", "log_V_at_y_max",
    "monotonicity_frac", "sign_changes",
    "slope_terminal", "slope_early", "slope_midrange",
    "y_at_V100", "y_at_V500", "y_at_V2000", "y_at_V10000",
    # DLP-median invariants (Eisenthal–Cornish-Bowden):
    "H_dlp_median", "log_kappa_dlp_median",
    "H_dlp_mad", "log_kappa_dlp_mad",
    "dlp_n_valid_pairs",
]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--averaged-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path,
                    help="The (H,κ) labels CSV (used only to build "
                         "the corpus X via load_corpus's cache)")
    ap.add_argument("--features-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "trajectory_features.csv"),
                    type=Path,
                    help="The new non-parametric trajectory-features CSV")
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" /
                            "regression_trajectory_features.txt",
                    type=Path)
    ap.add_argument("--n-folds", default=5, type=int)
    args = ap.parse_args()

    print(f"=== loading corpus X (from cached) ===", flush=True)
    corpus = load_corpus(args.averaged_csv, expand_by_realization=True)
    X = corpus["X"]
    groups = corpus["groups"]
    sample_ids = corpus["sample_ids"]
    feature_names = corpus["feature_names"]
    print(f"  corpus: n={len(X)}  features={len(feature_names)}  "
          f"groups={len(set(groups))}", flush=True)

    # sample_ids look like "stem:tN:rR" or "stem:tN". Parse to (stem, turn).
    sample_pos = []
    for s in sample_ids:
        parts = s.split(":")
        stem = parts[0]
        turn = int(parts[1].lstrip("t"))
        sample_pos.append((stem, turn))

    # Load trajectory features keyed by (stem, turn, target)
    print(f"\n=== loading new labels from {args.features_csv} ===", flush=True)
    labels_by_key: dict[tuple[str, int, str], dict] = {}
    with args.features_csv.open() as f:
        for row in csv.DictReader(f):
            stem = row["stem"]
            try:
                turn = int(row["turn"])
            except ValueError:
                continue
            target = row["target"]
            labels_by_key[(stem, turn, target)] = row
    print(f"  loaded {len(labels_by_key)} (stem, turn, target) rows",
          flush=True)

    # For each (target, label_column), build a y vector matching the corpus
    # samples (per-realization expansion replicates the label, since
    # trajectory features are averaged-trajectory features = position-level).
    targets = sorted({k[2] for k in labels_by_key})
    print(f"  targets: {targets}", flush=True)
    print(f"  label columns: {LABEL_COLUMNS}", flush=True)
    print(f"\n=== running regression: "
          f"{len(targets)} targets × {len(LABEL_COLUMNS)} feature columns "
          f"× 3 models ===", flush=True)

    lines: list[str] = []
    lines.append(f"# regression on non-parametric trajectory features")
    lines.append(f"# {len(X)} samples, {len(set(groups))} position groups, "
                 f"{len(feature_names)} features → predicting "
                 f"{len(LABEL_COLUMNS)} trajectory-feature columns per target")
    lines.append("")
    header = (f"  {'target':<28} {'column':<22} {'n_clean':>8} "
              f"{'knn':>9} {'ridge':>9} {'lgbm':>9} {'best':<6}")
    print(header, flush=True)
    lines.append(header)

    for target in targets:
        for col in LABEL_COLUMNS:
            y = np.full(len(X), np.nan)
            mask_clean = np.zeros(len(X), dtype=bool)
            for i, (stem, turn) in enumerate(sample_pos):
                row = labels_by_key.get((stem, turn, target))
                if row is None or row.get("status") != "clean":
                    continue
                try:
                    v = float(row[col])
                except (ValueError, KeyError):
                    continue
                if not np.isfinite(v):
                    continue
                y[i] = v
                mask_clean[i] = True
            if mask_clean.sum() < 4 * args.n_folds:
                line = (f"  {target:<28} {col:<22} "
                        f"{int(mask_clean.sum()):>8}  (too few)")
                print(line, flush=True)
                lines.append(line)
                continue
            X_m = X[mask_clean]
            y_m = y[mask_clean]
            g_m = groups[mask_clean]
            log_y = _signed_log1p(y_m)
            if log_y.std() < 1e-6:
                line = (f"  {target:<28} {col:<22} "
                        f"{int(mask_clean.sum()):>8}  (zero variance)")
                print(line, flush=True)
                lines.append(line)
                continue
            r2_knn, _ = _cv_r2_grouped(X_m, log_y, g_m, _KNNWrap, args.n_folds)
            r2_ridge, _ = _cv_r2_grouped(X_m, log_y, g_m, _RidgeWrap, args.n_folds)
            r2_lgbm, _ = _cv_r2_grouped(X_m, log_y, g_m, _LightGBMWrap, args.n_folds)
            best = max((r2_knn, "knn"), (r2_ridge, "ridge"), (r2_lgbm, "lgbm"),
                       key=lambda p: p[0])
            line = (f"  {target:<28} {col:<22} "
                    f"{int(mask_clean.sum()):>8} "
                    f"{r2_knn:>+9.4f} {r2_ridge:>+9.4f} {r2_lgbm:>+9.4f} "
                    f"{best[1]:<6}")
            print(line, flush=True)
            lines.append(line)

    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text("\n".join(lines) + "\n")
    print(f"\nsummary: {args.out_txt}", flush=True)


if __name__ == "__main__":
    main()
