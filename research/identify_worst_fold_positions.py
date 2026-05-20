"""
research/identify_worst_fold_positions.py

For scoreLead_drift|hyperbolic|H the per-fold R² breakdown was:
  fold 0: +0.329, fold 1: +0.107, fold 2: +0.259,
  fold 3: -0.283, fold 4: +0.138.

One fold (3) drags the +0.119 mean down to a wide [-0.28, +0.33]
spread. This script identifies WHICH positions populate the worst
fold and looks for patterns in:
  - decade distribution (year prefix of the SGF stem)
  - score_stdev distribution
  - n_realizations distribution
  - label value distribution
  - residual magnitude vs other folds

GroupKFold is deterministic given groups, so re-running with the
same data gives the same fold assignment.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.model_selection import GroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent))
from regression import load_corpus, _LightGBMWrap, _signed_log1p  # noqa: E402


_DECADE_RE = re.compile(r"^(\d{4})")


def _decade_of_stem(stem: str) -> str:
    """Stem typically starts with YYYY or YYYY-MM-DD; extract decade."""
    m = _DECADE_RE.match(stem)
    if m:
        return m.group(1)[:3] + "0s"  # e.g. '200' + '0s' = '2000s'
    return "unknown"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--labels-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--target", default="scoreLead_drift")
    ap.add_argument("--family", default="hyperbolic")
    ap.add_argument("--param", default="H")
    ap.add_argument("--n-folds", default=5, type=int)
    ap.add_argument("--out-dir",
                    default=Path.home() / "plots", type=Path)
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    corpus = load_corpus(args.labels_csv, expand_by_realization=True)
    X = corpus["X"]
    feature_names = corpus["feature_names"]
    per_label = corpus["per_label"]
    groups = corpus["groups"]
    sample_ids = corpus["sample_ids"]

    key = (args.target, args.family, args.param)
    if key not in per_label:
        sys.exit(f"no labels for {key}")
    labels = per_label[key]
    vals = labels[:, 0]
    mask_clean = labels[:, 1] == 1.0
    X_m = X[mask_clean]
    y_raw = vals[mask_clean]
    g_m = groups[mask_clean]
    sample_ids_m = [sample_ids[i] for i in range(len(sample_ids))
                    if mask_clean[i]]
    log_y = _signed_log1p(y_raw)

    print(f"=== identifying fold-3 positions for {args.target}|{args.family}|{args.param} ===",
          flush=True)
    print(f"  n_samples (clean)={len(X_m)}  n_groups={len(set(g_m))}",
          flush=True)

    kf = GroupKFold(n_splits=args.n_folds)
    per_fold_data = []
    for fold_i, (train_idx, test_idx) in enumerate(kf.split(X_m, log_y, groups=g_m)):
        m = _LightGBMWrap().fit(X_m[train_idx], log_y[train_idx])
        p_test = m.predict(X_m[test_idx])
        residuals = log_y[test_idx] - p_test
        ss_res = float((residuals ** 2).sum())
        ss_tot = float(((log_y[test_idx] - log_y[test_idx].mean()) ** 2).sum())
        r2 = 1.0 - ss_res / max(ss_tot, 1e-12)
        per_fold_data.append({
            "fold": fold_i,
            "test_idx": test_idx,
            "r2": r2,
            "residuals": residuals,
            "preds": p_test,
            "n": len(test_idx),
        })
        print(f"  fold {fold_i}: n_test={len(test_idx)}  R²={r2:+.4f}",
              flush=True)

    worst_fold = min(per_fold_data, key=lambda d: d["r2"])
    print(f"\nworst fold: {worst_fold['fold']}  R²={worst_fold['r2']:+.4f}",
          flush=True)

    # Profile the worst fold
    worst_test_idx = worst_fold["test_idx"]
    worst_residuals = worst_fold["residuals"]

    # Per-position aggregation (a position spans multiple realizations)
    worst_positions: dict[int, list[int]] = {}
    for j, ti in enumerate(worst_test_idx):
        pos = int(g_m[ti])
        worst_positions.setdefault(pos, []).append(ti)

    print(f"\nworst fold has {len(worst_positions)} unique positions "
          f"({len(worst_test_idx)} samples)", flush=True)

    # Score_stdev distribution
    if "score_stdev" in feature_names:
        score_idx = feature_names.index("score_stdev")
        worst_stdev = X_m[worst_test_idx, score_idx]
        other_test_idx = np.concatenate(
            [d["test_idx"] for d in per_fold_data if d["fold"] != worst_fold["fold"]]
        )
        other_stdev = X_m[other_test_idx, score_idx]
        print(f"\nscore_stdev distribution:")
        print(f"  worst fold:  μ={worst_stdev.mean():.3f}  σ={worst_stdev.std():.3f}  "
              f"median={np.median(worst_stdev):.3f}", flush=True)
        print(f"  other folds: μ={other_stdev.mean():.3f}  σ={other_stdev.std():.3f}  "
              f"median={np.median(other_stdev):.3f}", flush=True)

    # Decade distribution
    worst_decades: list[str] = []
    for pos in worst_positions:
        sample_ids_for_pos = [sample_ids_m[ti] for ti in worst_positions[pos][:1]]
        for sid in sample_ids_for_pos:
            stem = sid.split(":")[0]
            worst_decades.append(_decade_of_stem(stem))
    decade_counter = Counter(worst_decades)
    print(f"\nworst fold decade distribution:")
    for dec, n in decade_counter.most_common():
        print(f"  {dec}: {n}", flush=True)

    # Label distribution (in raw and log space)
    worst_labels_raw = y_raw[worst_test_idx]
    worst_labels_log = log_y[worst_test_idx]
    other_idx = np.concatenate([d["test_idx"] for d in per_fold_data
                                  if d["fold"] != worst_fold["fold"]])
    other_labels_log = log_y[other_idx]
    print(f"\nlabel (signed_log1p) distribution:")
    print(f"  worst fold:  μ={worst_labels_log.mean():.3f}  σ={worst_labels_log.std():.3f}",
          flush=True)
    print(f"  other folds: μ={other_labels_log.mean():.3f}  σ={other_labels_log.std():.3f}",
          flush=True)

    # Top-residual positions in worst fold
    abs_resid = np.abs(worst_residuals)
    order = np.argsort(abs_resid)[::-1]
    print(f"\ntop 15 worst-residual samples in fold {worst_fold['fold']}:")
    for rank, j in enumerate(order[:15]):
        ti = worst_test_idx[j]
        sid = sample_ids_m[ti]
        print(f"  {rank+1:>2d}. {sid}  "
              f"actual_log={log_y[ti]:+.3f}  "
              f"pred_log={worst_fold['preds'][j]:+.3f}  "
              f"|resid|={abs_resid[j]:.3f}", flush=True)

    # Plot: residual distribution per fold + label distribution per fold
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    for d in per_fold_data:
        axes[0].hist(d["residuals"], bins=30, alpha=0.4,
                     label=f"fold {d['fold']} R²={d['r2']:+.3f}")
    axes[0].set_xlabel("OOF residual (signed_log1p y)")
    axes[0].set_ylabel("count")
    axes[0].set_title(f"OOF residual distribution per fold")
    axes[0].axvline(0, color="black", lw=0.5)
    axes[0].legend()
    axes[0].grid(alpha=0.3)

    for d in per_fold_data:
        axes[1].hist(log_y[d["test_idx"]], bins=30, alpha=0.4,
                     label=f"fold {d['fold']}")
    axes[1].set_xlabel("label (signed_log1p)")
    axes[1].set_ylabel("count")
    axes[1].set_title(f"label distribution per fold")
    axes[1].legend()
    axes[1].grid(alpha=0.3)
    fig.suptitle(f"{args.target}|{args.family}|{args.param} — per-fold breakdown")
    fig.tight_layout()
    out = args.out_dir / f"worst_fold_{args.target}_{args.family}_{args.param}.png"
    fig.savefig(out, dpi=110)
    plt.close(fig)
    print(f"\nplot: {out}", flush=True)


if __name__ == "__main__":
    main()
