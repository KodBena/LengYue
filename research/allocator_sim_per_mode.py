"""
research/allocator_sim_per_mode.py

Per-mode allocator Pareto analysis. Splits the cards.db OOD slice by
the K=2 cluster IDs (from prior `discover_volatility_modes.py` work)
and plots the binary allocator's Pareto curve per-mode plus the
combined overlay.

Question this answers: do the modes have different operational
needs? E.g., does the allocator save more visits on cluster-0 (the
bulk low-magnitude positions) while preserving accuracy on
cluster-1 (the high-magnitude, larger-dip positions)?

The K=2 cluster centroids from `~/plots/mode_discovery/mode_discovery_summary.txt`:
  cluster 0: low-H, low-dip-depth, low-slope (the bulk)
  cluster 1: high-H (~5×), 0.5 dip-depth, high-slope (the rich ones)

We re-derive cluster assignments by running K-means on the shape-
invariant features of cards.db positions (using the same feature
recipe as the prior session).

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from allocator_sim import (  # noqa: E402
    build_feature_row, modal_top1_at_v_max, train_predictor,
    baseline_always_vmax_agreement, simulate_binary,
)


# Shape-invariant features per the prior mode_discovery setup.
# Computed from y_mean per target.
def shape_invariant_features(V_grid, y_mean, target_label: str) -> dict | None:
    if not np.isfinite(y_mean).all():
        return None
    y_max = float(y_mean.max())
    y_min = float(y_mean.min())
    y_range = y_max - y_min
    if y_range < 1e-9:
        return None
    # Dip depth: how far below y[0] does the trajectory go?
    dip = max(0.0, float(y_mean[0]) - y_min)
    dip_norm = dip / y_range
    # Terminal slope (last 5 points) and early slope (first 5 points)
    if len(V_grid) >= 10:
        late_slope = float((y_mean[-1] - y_mean[-5]) / (V_grid[-1] - V_grid[-5] + 1e-9))
        early_slope = float((y_mean[4] - y_mean[0]) / (V_grid[4] - V_grid[0] + 1e-9))
    else:
        late_slope = 0.0
        early_slope = 0.0
    slope_ratio = late_slope / (abs(early_slope) + 1e-9)
    # Monotonicity fraction
    diffs = np.diff(y_mean)
    monotone = float((diffs >= 0).mean())
    return {
        "dip_norm": dip_norm,
        "log_y_range": float(np.log1p(y_range)),
        "slope_ratio": float(np.clip(slope_ratio, -10, 10)),
        "monotonicity_frac": monotone,
    }


def derive_cluster_ids(cache: dict, target: str, k: int = 2) -> np.ndarray:
    """Returns cluster IDs for ALL positions in cache. -1 if features
    can't be derived for that position."""
    n = len(cache["stems"])
    N_GRID = int(np.asarray(cache["N_GRID"]).flat[0])
    feats = []
    indices = []
    for i in range(n):
        V_lo = float(cache["V_lo"][i])
        V_hi = float(cache["V_hi"][i])
        if not np.isfinite(V_lo) or not np.isfinite(V_hi) or V_lo >= V_hi:
            continue
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)
        y_mean = cache[f"y_mean_{target}"][i]
        f = shape_invariant_features(V_grid, y_mean, target)
        if f is None:
            continue
        feats.append([f["dip_norm"], f["log_y_range"], f["slope_ratio"], f["monotonicity_frac"]])
        indices.append(i)
    if not feats:
        return -np.ones(n, dtype=np.int32)
    X = np.array(feats, dtype=np.float64)
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(Xs)
    out = -np.ones(n, dtype=np.int32)
    for j, i in enumerate(indices):
        out[i] = int(labels[j])
    return out


def slice_cache(cache: dict, idx: np.ndarray) -> dict:
    domains = np.array(cache["domains"], dtype=object)
    out = {}
    for k, v in cache.items():
        v = np.asarray(v)
        if v.ndim > 0 and v.shape[0] == len(domains):
            out[k] = v[idx]
        else:
            out[k] = v
    out["N_GRID"] = int(np.asarray(cache["N_GRID"]).flat[0])
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cache",
                    default=Path(__file__).resolve().parent /
                            "data" / "trajectory_cache.npz",
                    type=Path)
    ap.add_argument("--out-dir",
                    default=Path.home() / "plots" / "allocator_pareto_per_mode",
                    type=Path)
    ap.add_argument("--target", default="scoreLead_drift")
    ap.add_argument("--window-floor-frac", default=1.0/3.0, type=float)
    ap.add_argument("--k", default=2, type=int)
    args = ap.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    print(f"=== per-mode allocator sim: {args.target} k={args.k} ===", flush=True)

    cache = np.load(args.cache, allow_pickle=True)
    cache = {k: cache[k] for k in cache.files}

    print("  deriving cluster IDs...", flush=True)
    cluster_ids = derive_cluster_ids(cache, args.target, k=args.k)
    domains = np.array(cache["domains"], dtype=object)
    n_assigned = (cluster_ids >= 0).sum()
    print(f"  assigned cluster IDs to {n_assigned}/{len(cluster_ids)} positions", flush=True)
    # Print per-mode counts in each domain
    for cid in range(args.k):
        in_y2k = ((cluster_ids == cid) & (domains == "year2k")).sum()
        in_cards = ((cluster_ids == cid) & (domains == "cards")).sum()
        print(f"  cluster {cid}: year2k={in_y2k}  cards={in_cards}", flush=True)

    # Train one predictor (on all year2k); per-mode evaluation is on cards.db
    print(f"\n  training predictor on year2k (all modes)...", flush=True)
    predictor, info = train_predictor(
        cache, args.target, window_frac=args.window_floor_frac,
    )

    # Per-mode Pareto on cards.db
    tau_grid = np.linspace(-2.0, 4.0, 25)
    per_mode_results = {}
    for cid in range(args.k):
        cards_mask = (cluster_ids == cid) & (domains == "cards")
        n_cards_mode = int(cards_mask.sum())
        print(f"\n--- cluster {cid}: n_cards={n_cards_mode} ---", flush=True)
        if n_cards_mode < 5:
            print(f"  too few; skipping", flush=True)
            continue
        cards_slice = slice_cache(cache, np.where(cards_mask)[0])
        baseline = baseline_always_vmax_agreement(cards_slice, args.target)
        print(f"  baseline: visits={baseline['avg_visits']:.0f} "
              f"agree={baseline['agreement']:.4f}  n={baseline['n']}", flush=True)
        t0 = time.monotonic()
        res = simulate_binary(
            predictor, cache["phase35_names"], cards_slice,
            args.window_floor_frac, tau_grid, args.target,
        )
        print(f"  binary sim done in {time.monotonic()-t0:.1f}s "
              f"visits={res['avg_visits'].min():.0f}..{res['avg_visits'].max():.0f} "
              f"agree={res['agreement'].min():.4f}..{res['agreement'].max():.4f}",
              flush=True)
        per_mode_results[cid] = {
            "n_cards": n_cards_mode,
            "baseline": baseline,
            "binary": res,
        }

    # Overlay Pareto plot
    fig, ax = plt.subplots(figsize=(8, 5))
    colors = ["tab:blue", "tab:red", "tab:green", "tab:purple"]
    for cid, r in per_mode_results.items():
        ax.plot(r["binary"]["avg_visits"], r["binary"]["agreement"],
                marker="o", linestyle="-", color=colors[cid % len(colors)],
                label=f"cluster {cid} (n={r['n_cards']}) — binary")
        ax.scatter([r["baseline"]["avg_visits"]], [r["baseline"]["agreement"]],
                   color=colors[cid % len(colors)], s=120, marker="*",
                   edgecolor="black", linewidth=1,
                   label=f"cluster {cid} baseline (always V_max)")
    ax.set_xlabel("avg visits spent per position")
    ax.set_ylabel("top-1 agreement vs modal-top-1 at V_max")
    ax.set_title(f"Per-mode allocator Pareto — {args.target}\n"
                 f"K-means clusters on shape-invariant features (k={args.k})")
    ax.grid(alpha=0.3)
    ax.legend(loc="lower right", fontsize=8)
    fig.tight_layout()
    plot_path = args.out_dir / f"per_mode_{args.target}.png"
    fig.savefig(plot_path, dpi=120)
    plt.close(fig)
    print(f"\n  plot: {plot_path}", flush=True)

    # Summary text
    summary_path = args.out_dir / f"summary_per_mode_{args.target}.txt"
    with summary_path.open("w") as f:
        f.write(f"# per-mode allocator sim: {args.target} k={args.k}\n\n")
        f.write(f"# cluster assignments per domain:\n")
        for cid in range(args.k):
            in_y2k = ((cluster_ids == cid) & (domains == "year2k")).sum()
            in_cards = ((cluster_ids == cid) & (domains == "cards")).sum()
            f.write(f"#   cluster {cid}: year2k={in_y2k}  cards={in_cards}\n")
        f.write("\n")
        for cid, r in per_mode_results.items():
            f.write(f"# cluster {cid} (n_cards={r['n_cards']})\n")
            f.write(f"#   baseline (always V_max): visits={r['baseline']['avg_visits']:.0f}  "
                    f"agree={r['baseline']['agreement']:.4f}\n")
            f.write(f"#   binary policy:\n")
            f.write(f"  {'tau':>8} {'visits':>10} {'agree':>9} {'term%':>7}\n")
            for ti in range(len(tau_grid)):
                f.write(f"  {tau_grid[ti]:>+8.3f} "
                        f"{r['binary']['avg_visits'][ti]:>10.0f} "
                        f"{r['binary']['agreement'][ti]:>+9.4f} "
                        f"{r['binary']['terminate_frac'][ti]:>7.2%}\n")
            f.write("\n")
    print(f"  summary: {summary_path}", flush=True)


if __name__ == "__main__":
    main()
