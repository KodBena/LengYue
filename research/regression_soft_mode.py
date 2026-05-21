"""
research/regression_soft_mode.py

Follow-up to regression_per_mode.py: tests whether a *continuous*
mode representation (distances to each K-means cluster centroid)
captures more signal than the one-hot mode label.

Previous result: +mode_oh gained up to +0.15 R² over the global head
on score-family targets (scoreLead|H_dlp_median: +0.192 → +0.345).
That's a big gain from a 3-bit one-hot. If LGBM can use 3 *continuous*
distance-to-centroid features even better, soft-mode should beat
one-hot.

Target: scoreLead_drift|H_dlp_median (the biggest +mode_oh winner).

Three variants, all with the +both base feature set:
  1. baseline_both        — phase35 + own + adv (replicated for reference)
  2. plus_mode_one_hot    — + 3-dim one-hot
  3. plus_soft_mode       — + 3-dim K-means centroid distances (standardized)

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from torch.utils.tensorboard import SummaryWriter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from regression import (  # noqa: E402
    load_corpus, _LightGBMWrap, _cv_r2_grouped, _signed_log1p,
)
from classify_volatility_mode import (  # noqa: E402
    _shape_features, DRIFT_TARGETS as MODE_DRIFT_TARGETS, MODE_NAMES,
)


def _build_mode_with_centroids(features_csv: Path):
    """Reproduces _build_mode_assignments but also returns the K-means
    object so we can compute centroid distances for any new sample."""
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

    keep: list[tuple[str, int]] = []
    X_shape: list[list[float]] = []
    for (stem, turn), per_t in sorted(per_pos.items()):
        if not all(t in per_t for t in MODE_DRIFT_TARGETS):
            continue
        row = []
        bad = False
        for t in MODE_DRIFT_TARGETS:
            feats = _shape_features(per_t[t])
            if any(not np.isfinite(v) for v in feats):
                bad = True
                break
            row.extend(feats)
        if not bad:
            keep.append((stem, turn))
            X_shape.append(row)
    X_shape = np.array(X_shape)
    scaler = StandardScaler().fit(X_shape)
    X_std = scaler.transform(X_shape)
    km = KMeans(n_clusters=3, random_state=42, n_init=10).fit(X_std)
    labels = {keep[i]: int(km.labels_[i]) for i in range(len(keep))}
    # Per-position shape features (standardized) so we can compute
    # distances for matched samples.
    shape_by_pos = {keep[i]: X_std[i] for i in range(len(keep))}
    return labels, km, shape_by_pos


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--averaged-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--ownership-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "ownership_features.csv"), type=Path)
    ap.add_argument("--advanced-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "advanced_features.csv"), type=Path)
    ap.add_argument("--labels-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "trajectory_features_dlp.csv"), type=Path)
    ap.add_argument("--features-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "trajectory_features_dlp.csv"), type=Path)
    ap.add_argument("--tb-log-dir",
                    default=Path("/home/bork/w/vdc/tensorboard/regression_soft_mode"),
                    type=Path)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" /
                            "regression_soft_mode_summary.txt", type=Path)
    ap.add_argument("--target", default="scoreLead_drift")
    ap.add_argument("--column", default="H_dlp_median")
    ap.add_argument("--n-folds", default=5, type=int)
    args = ap.parse_args()

    run_tag = f"run_{int(time.time())}"
    tb_path = args.tb_log_dir / run_tag
    tb_path.mkdir(parents=True, exist_ok=True)
    print(f"  tensorboard log dir: {tb_path}", flush=True)
    writer = SummaryWriter(log_dir=str(tb_path), flush_secs=5)
    writer.add_scalar("progress/started", 1.0, 0)
    writer.flush()

    print(f"=== building mode assignments + centroids (K=3) ===", flush=True)
    labels_by_pos, km, shape_by_pos = _build_mode_with_centroids(
        args.features_csv)
    print(f"  {len(labels_by_pos)} positions with mode + shape features",
          flush=True)

    print(f"\n=== loading phase35 corpus ===", flush=True)
    corpus = load_corpus(args.averaged_csv, expand_by_realization=True)
    X35 = corpus["X"]
    groups = corpus["groups"]
    sample_ids = corpus["sample_ids"]
    print(f"  corpus: n={len(X35)}", flush=True)

    print(f"\n=== loading ownership features ===", flush=True)
    own_by_pos = {}; counts = {}
    with args.ownership_csv.open() as f:
        rdr = csv.DictReader(f)
        own_cols = [c for c in rdr.fieldnames
                     if c not in ("stem", "turn", "realization")]
        for r in rdr:
            try:
                key = (r["stem"], int(r["turn"]))
                vec = np.array([float(r[c]) for c in own_cols])
                if key not in own_by_pos:
                    own_by_pos[key] = np.zeros_like(vec); counts[key] = 0
                own_by_pos[key] += vec; counts[key] += 1
            except (ValueError, KeyError):
                pass
    own_by_pos = {k: own_by_pos[k] / counts[k] for k in own_by_pos}

    print(f"\n=== loading advanced features ===", flush=True)
    adv_by_key = {}
    with args.advanced_csv.open() as f:
        rdr = csv.DictReader(f)
        adv_cols = [c for c in rdr.fieldnames
                     if c not in ("stem", "turn", "realization")]
        for r in rdr:
            try:
                key = (r["stem"], int(r["turn"]), int(r["realization"]))
                adv_by_key[key] = np.array([float(r[c] or "nan")
                                              for c in adv_cols])
            except (ValueError, KeyError):
                pass

    labels = {}
    with args.labels_csv.open() as f:
        for r in csv.DictReader(f):
            try:
                if r['status'] != 'clean':
                    continue
                key = (r["stem"], int(r["turn"]), r["target"])
                labels[key] = {col: float(r[col]) for col in
                                ['y_range', 'y_at_V_max', 'dip_depth',
                                 'slope_terminal', 'H_dlp_median',
                                 'log_kappa_dlp_median']
                                if r[col] not in ('', None)}
            except (ValueError, KeyError):
                pass

    X_own = np.zeros((len(X35), len(own_cols)))
    X_adv = np.full((len(X35), len(adv_cols)), np.nan)
    valid_own = np.ones(len(X35), dtype=bool)
    valid_adv = np.ones(len(X35), dtype=bool)
    mode_id = np.full(len(X35), -1, dtype=np.int64)
    soft_mode = np.zeros((len(X35), 3))
    valid_mode = np.zeros(len(X35), dtype=bool)

    for i, sid in enumerate(sample_ids):
        parts = sid.split(":")
        stem = parts[0]; turn = int(parts[1].lstrip("t"))
        ri = int(parts[2].lstrip("r")) if len(parts) > 2 else 0
        own = own_by_pos.get((stem, turn))
        if own is None:
            valid_own[i] = False
        else:
            X_own[i] = own
        adv = adv_by_key.get((stem, turn, ri))
        if adv is None or np.any(np.isnan(adv)):
            valid_adv[i] = False
        else:
            X_adv[i] = adv
        shp = shape_by_pos.get((stem, turn))
        m = labels_by_pos.get((stem, turn))
        if shp is not None and m is not None:
            valid_mode[i] = True
            mode_id[i] = m
            # Euclidean distance to each cluster centroid in
            # standardized shape-feature space
            dists = np.linalg.norm(km.cluster_centers_ - shp[None, :], axis=1)
            soft_mode[i] = dists
    col_means = np.nanmean(X_adv, axis=0)
    X_adv = np.where(np.isnan(X_adv), col_means, X_adv)

    # Standardize soft-mode distances so LGBM splits don't dominate on
    # scale. (Trees are scale-invariant, but standardization makes the
    # comparison to one-hot more parallel.)
    dist_scaler = StandardScaler()
    soft_mode_std = np.zeros_like(soft_mode)
    soft_mode_std[valid_mode] = dist_scaler.fit_transform(soft_mode[valid_mode])

    # One-hot mode features for the +mode_oh variant
    X_mode_oh = np.zeros((len(X35), 3))
    for i in range(len(X35)):
        if mode_id[i] >= 0:
            X_mode_oh[i, mode_id[i]] = 1.0

    # ── Run comparison ────────────────────────────────────────────────────
    target = args.target
    col = args.column
    print(f"\n=== target: {target}|{col} ===", flush=True)

    y_all = np.full(len(X35), np.nan)
    ymask = np.zeros(len(X35), dtype=bool)
    for i, sid in enumerate(sample_ids):
        parts = sid.split(":")
        stem = parts[0]; turn = int(parts[1].lstrip("t"))
        ent = labels.get((stem, turn, target))
        if ent is None:
            continue
        v = ent.get(col)
        if v is None or not np.isfinite(v):
            continue
        y_all[i] = v; ymask[i] = True

    full_mask = ymask & valid_own & valid_adv & valid_mode
    n = int(full_mask.sum())
    print(f"  n={n}", flush=True)

    ym = y_all[full_mask]
    gm = groups[full_mask]
    log_y = _signed_log1p(ym)
    Xb = np.concatenate([X35[full_mask], X_own[full_mask],
                          X_adv[full_mask]], axis=1)
    Xb_oh = np.concatenate([Xb, X_mode_oh[full_mask]], axis=1)
    Xb_sm = np.concatenate([Xb, soft_mode_std[full_mask]], axis=1)

    print(f"\n=== fitting (3 variants × 5-fold CV) ===", flush=True)
    results: dict[str, float] = {}
    for label, X_v in [("baseline_both", Xb),
                        ("plus_mode_one_hot", Xb_oh),
                        ("plus_soft_mode", Xb_sm)]:
        t0 = time.monotonic()
        r2, _ = _cv_r2_grouped(X_v, log_y, gm, _LightGBMWrap, args.n_folds)
        results[label] = r2
        writer.add_scalar(f"r2/{target}_{col}/{label}", r2, 0)
        writer.flush()
        print(f"  {label:<22} R² = {r2:+.4f}   "
              f"({time.monotonic()-t0:.1f}s)", flush=True)

    # Summary
    lines = [
        f"# soft-mode vs one-hot regression — {target}|{col}  n={n}",
        f"# tensorboard: {tb_path}",
        "",
        f"  {'variant':<22} {'R²':>9}",
        f"  {'baseline_both':<22} {results['baseline_both']:>+9.4f}",
        f"  {'plus_mode_one_hot':<22} {results['plus_mode_one_hot']:>+9.4f}  "
        f"(Δ vs base = "
        f"{results['plus_mode_one_hot'] - results['baseline_both']:+.4f})",
        f"  {'plus_soft_mode':<22} {results['plus_soft_mode']:>+9.4f}  "
        f"(Δ vs base = "
        f"{results['plus_soft_mode'] - results['baseline_both']:+.4f}; "
        f"Δ vs one-hot = "
        f"{results['plus_soft_mode'] - results['plus_mode_one_hot']:+.4f})",
    ]
    text = "\n".join(lines) + "\n"
    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text(text)
    writer.close()
    print()
    print(text)
    print(f"summary: {args.out_txt}", flush=True)


if __name__ == "__main__":
    main()
