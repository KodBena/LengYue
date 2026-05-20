"""
research/discover_volatility_modes.py

Unsupervised mode discovery on cards.db volatile positions using the
DLP-augmented trajectory feature set.

The user's hypothesis (2026-05-20): there are at least two volatility
modes in Go positions —
  1. "endgame precision": small misplays cost points; trajectories
     show sharp dip-then-rise (reading paradox).
  2. "heuristic interaction in tilted games": no obvious tactic, but
     hard to bungle; trajectories show high κ (slow extraction).

This script tests whether the new feature space separates these modes
data-driven. Methodology:

  1. Load trajectory_features_dlp.csv (per-position × per-target).
  2. Build per-position feature vector: concat features across drift
     targets (scoreLead, L2_joint, winrate, logit_winrate).
  3. Standardize features.
  4. PCA / UMAP for 2D visualization.
  5. K-means (k=2,3,4) and HDBSCAN for unsupervised clusters.
  6. Color cards.db positions by:
       - volatile vs non-volatile tag (where known)
       - family group (= parent_id) where known
       - log_κ extreme vs not-extreme
       - dip_depth high vs low
  7. Report per-cluster centroid statistics.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler


# Features to use for clustering (per target)
PER_TARGET_FEATURES = [
    "H_dlp_median", "log_kappa_dlp_median",
    "y_range", "dip_depth", "rise_after_dip",
    "slope_terminal", "slope_early",
    "monotonicity_frac", "dlp_n_valid_pairs",
]
DRIFT_TARGETS = ["scoreLead_drift", "L2_joint_drift", "winrate_drift",
                 "logit_winrate_drift"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--features-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "trajectory_features_dlp.csv"), type=Path)
    ap.add_argument("--out-dir",
                    default=Path.home() / "plots" / "mode_discovery",
                    type=Path)
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    # Load: per (stem, target) → dict of feature values
    per_pos: dict[tuple[str, int], dict[str, dict[str, float]]] = defaultdict(dict)
    with args.features_csv.open() as f:
        for row in csv.DictReader(f):
            if row["status"] != "clean":
                continue
            stem = row["stem"]
            turn = int(row["turn"])
            target = row["target"]
            feats: dict[str, float] = {}
            for col in PER_TARGET_FEATURES:
                try:
                    v = float(row[col])
                except (ValueError, KeyError):
                    v = float("nan")
                feats[col] = v
            per_pos[(stem, turn)][target] = feats

    # Build feature matrix: for each (stem, turn), concat features
    # across drift targets. Drop positions that don't have all 4
    # drift targets clean.
    keep_positions: list[tuple[str, int]] = []
    X_rows: list[list[float]] = []
    for (stem, turn), per_t in sorted(per_pos.items()):
        row_feats: list[float] = []
        ok = True
        for t in DRIFT_TARGETS:
            if t not in per_t:
                ok = False
                break
            for col in PER_TARGET_FEATURES:
                v = per_t[t][col]
                if v is None or not np.isfinite(v):
                    ok = False
                    break
                row_feats.append(v)
            if not ok:
                break
        if not ok:
            continue
        keep_positions.append((stem, turn))
        X_rows.append(row_feats)

    X = np.array(X_rows, dtype=np.float64)
    print(f"  feature matrix: n_positions={len(X)}  n_features={X.shape[1]}",
          flush=True)

    # Classify each position
    def classify_position(stem: str) -> str:
        if stem.startswith("vol_card_") or stem.startswith("card_"):
            if stem.startswith("ctl_card_"):
                return "cards.db non-volatile"
            return "cards.db volatile"
        if stem.startswith("ctl_card_"):
            return "cards.db non-volatile"
        return "year2000 corpus"

    pos_class = [classify_position(s) for s, t in keep_positions]
    print(f"  classification counts:", flush=True)
    for c in sorted(set(pos_class)):
        print(f"    {c}: {pos_class.count(c)}", flush=True)

    # Standardize
    scaler = StandardScaler()
    X_std = scaler.fit_transform(X)

    # PCA 2D
    pca = PCA(n_components=2)
    X_pca = pca.fit_transform(X_std)
    print(f"  PCA explained variance: "
          f"PC1={pca.explained_variance_ratio_[0]:.1%}, "
          f"PC2={pca.explained_variance_ratio_[1]:.1%}", flush=True)

    # K-means clustering (k=2 to test the user's two-mode hypothesis)
    cluster_results = {}
    for k in [2, 3, 4]:
        km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(X_std)
        cluster_results[k] = km.labels_

    # ── Plots ───────────────────────────────────────────────────────────────
    fig, axes = plt.subplots(2, 3, figsize=(18, 11))
    fig.suptitle(
        f"Mode discovery — PCA(2D) of position features "
        f"({len(DRIFT_TARGETS)} drift targets × {len(PER_TARGET_FEATURES)} feats = "
        f"{X.shape[1]} dims)\n"
        f"n_positions={len(X)} (year2000 corpus + cards.db family + expanded)",
        fontsize=11,
    )

    # (1) Classification (corpus vs cards.db vol vs cards.db non-vol)
    ax = axes[0, 0]
    colors = {"year2000 corpus": "lightgray", "cards.db volatile": "red",
              "cards.db non-volatile": "blue"}
    for c, color in colors.items():
        mask = np.array([pc == c for pc in pos_class])
        ax.scatter(X_pca[mask, 0], X_pca[mask, 1], s=18 if c == "year2000 corpus" else 80,
                   alpha=0.35 if c == "year2000 corpus" else 0.85,
                   color=color, label=f"{c} n={mask.sum()}",
                   edgecolor="black" if c != "year2000 corpus" else None,
                   linewidth=0.4)
    ax.set_xlabel(f"PC1 ({pca.explained_variance_ratio_[0]:.1%})")
    ax.set_ylabel(f"PC2 ({pca.explained_variance_ratio_[1]:.1%})")
    ax.set_title("Position class (cards.db vs corpus)")
    ax.legend(fontsize=8, loc="best")
    ax.grid(alpha=0.3)

    # (2-4) K-means clusters k=2, 3, 4
    for col, k in enumerate([2, 3, 4]):
        ax = axes[0, col + 0] if col < 1 else axes[0, col + 1] if col == 1 else None
    for plot_idx, k in enumerate([2, 3, 4]):
        ax = axes[(plot_idx + 1) // 3, (plot_idx + 1) % 3]
        labels = cluster_results[k]
        cmap = plt.cm.get_cmap("tab10")
        for ci in range(k):
            m = labels == ci
            ax.scatter(X_pca[m, 0], X_pca[m, 1], s=20, alpha=0.6,
                       color=cmap(ci), label=f"cluster {ci} n={m.sum()}")
        # Overlay cards.db markers
        for i, pc in enumerate(pos_class):
            if pc == "cards.db volatile":
                ax.scatter(X_pca[i, 0], X_pca[i, 1], s=60, marker="o",
                           facecolor="none", edgecolor="red", linewidth=1.2, zorder=5)
            elif pc == "cards.db non-volatile":
                ax.scatter(X_pca[i, 0], X_pca[i, 1], s=60, marker="x",
                           color="blue", linewidth=1.2, zorder=5)
        ax.set_xlabel(f"PC1 ({pca.explained_variance_ratio_[0]:.1%})")
        ax.set_ylabel(f"PC2 ({pca.explained_variance_ratio_[1]:.1%})")
        ax.set_title(f"K-means k={k} (red ○ = cards.db V, blue × = ctl)")
        ax.legend(fontsize=8, loc="best")
        ax.grid(alpha=0.3)

    # (5) Color by log_κ_scoreLead (high vs low)
    ax = axes[1, 1]
    sl_logk_idx = PER_TARGET_FEATURES.index("log_kappa_dlp_median")
    sl_logk = X[:, DRIFT_TARGETS.index("scoreLead_drift") *
                len(PER_TARGET_FEATURES) + sl_logk_idx]
    sc = ax.scatter(X_pca[:, 0], X_pca[:, 1], c=sl_logk, cmap="viridis",
                    s=18, alpha=0.7)
    fig.colorbar(sc, ax=ax, label="log_κ scoreLead (DLP)")
    ax.set_xlabel("PC1")
    ax.set_ylabel("PC2")
    ax.set_title("Colored by scoreLead log_κ_DLP")
    ax.grid(alpha=0.3)

    # (6) Color by dlp_n_valid_pairs (visit_entropy as proxy for monotonicity)
    ax = axes[1, 2]
    # Use the L2_joint_drift's n_valid_pairs since it's in the matrix
    n_valid_idx = PER_TARGET_FEATURES.index("dlp_n_valid_pairs")
    n_valid_l2 = X[:, DRIFT_TARGETS.index("L2_joint_drift") *
                   len(PER_TARGET_FEATURES) + n_valid_idx]
    sc = ax.scatter(X_pca[:, 0], X_pca[:, 1], c=n_valid_l2, cmap="plasma",
                    s=18, alpha=0.7)
    fig.colorbar(sc, ax=ax, label="dlp_n_valid_pairs (L2)")
    ax.set_xlabel("PC1")
    ax.set_ylabel("PC2")
    ax.set_title("Colored by L2 dlp_n_valid_pairs (monotonicity)")
    ax.grid(alpha=0.3)

    fig.tight_layout()
    out = args.out_dir / "mode_discovery_pca.png"
    fig.savefig(out, dpi=110)
    plt.close(fig)
    print(f"\nscatter: {out}", flush=True)

    # ── Cluster characterization (k=2 — the user's two-mode hypothesis) ─────
    print(f"\n=== K-means k=2 cluster characterization ===", flush=True)
    labels_k2 = cluster_results[2]
    summary_lines: list[str] = []
    summary_lines.append(f"# K-means k=2 cluster centroids in standardized "
                          f"feature space")
    summary_lines.append(f"# {len(X)} positions; PC1={pca.explained_variance_ratio_[0]:.1%}, "
                         f"PC2={pca.explained_variance_ratio_[1]:.1%}")
    summary_lines.append("")
    for ci in range(2):
        mask = labels_k2 == ci
        members = [keep_positions[i] for i in range(len(X)) if mask[i]]
        member_classes = [pos_class[i] for i in range(len(X)) if mask[i]]
        n_corpus = sum(1 for c in member_classes if c == "year2000 corpus")
        n_vol = sum(1 for c in member_classes if c == "cards.db volatile")
        n_ctl = sum(1 for c in member_classes if c == "cards.db non-volatile")
        line = (f"  cluster {ci}: n={mask.sum()}  "
                f"corpus={n_corpus}  cards.db V={n_vol}  cards.db ctl={n_ctl}")
        print(line, flush=True)
        summary_lines.append(line)
        # Centroid in original (non-standardized) space
        centroid_orig = X[mask].mean(axis=0)
        per_t_centroid: dict[str, dict[str, float]] = {}
        for ti, t in enumerate(DRIFT_TARGETS):
            per_t_centroid[t] = {}
            for fi, fname in enumerate(PER_TARGET_FEATURES):
                idx = ti * len(PER_TARGET_FEATURES) + fi
                per_t_centroid[t][fname] = float(centroid_orig[idx])
        for t in DRIFT_TARGETS:
            d = per_t_centroid[t]
            line = (f"    {t}: H={d['H_dlp_median']:+.3f}  "
                    f"log_κ={d['log_kappa_dlp_median']:.2f}  "
                    f"y_range={d['y_range']:.3f}  "
                    f"dip_depth={d['dip_depth']:.3f}  "
                    f"slope_term={d['slope_terminal']:+.3f}  "
                    f"mono_frac={d['monotonicity_frac']:.2f}  "
                    f"n_valid={d['dlp_n_valid_pairs']:.0f}")
            print(line, flush=True)
            summary_lines.append(line)
        summary_lines.append("")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "mode_discovery_summary.txt").write_text(
        "\n".join(summary_lines) + "\n"
    )
    print(f"\nsummary: {args.out_dir / 'mode_discovery_summary.txt'}", flush=True)


if __name__ == "__main__":
    main()
