"""
research/diagnose_hk_distribution.py

Quick qualitative diagnostic on the per-position (H, κ) joint distribution
from the averaged-trajectory hyperbolic fits. Triggered by the firewall
observation that ResNet predictions for κ come out uniformly negative —
the hypothesis is curve_fit identifiability (H and κ co-determine the
early-V curvature, anti-correlate during the fit, and the noisy early-V
points can shove κ across decades while H barely moves).

For each target (visit_entropy_reduction, winrate_drift, scoreLead_drift,
L2_joint_drift) we plot:

  1. Scatter of H vs log10(κ) for clean fits, colored by rel_resid_std
     (fit quality). If (H, κ) live on a 1-D ridge, identifiability is the
     story.
  2. Marginal histograms of H and log10(κ).
  3. Pearson correlation of (H, log κ) over clean fits.

All output to ~/plots/diagnose_hk_*.png + a short text summary printed
and saved to ~/plots/diagnose_hk_summary.txt.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--plot-dir", default=Path.home() / "plots", type=Path)
    ap.add_argument("--family", default="hyperbolic",
                    help="Curve family to extract (H, κ) from (default hyperbolic)")
    args = ap.parse_args()
    args.plot_dir.mkdir(parents=True, exist_ok=True)

    print(f"=== loading {args.csv} ===", flush=True)
    rows_by_target: dict[str, list[dict]] = defaultdict(list)
    with args.csv.open() as f:
        for row in csv.DictReader(f):
            if row["family"] != args.family:
                continue
            if row["status"] != "clean":
                continue
            params = json.loads(row["params_json"])
            H = params.get("H")
            kappa = params.get("kappa")
            if H is None or kappa is None:
                continue
            if not (np.isfinite(H) and np.isfinite(kappa) and kappa > 0):
                continue
            rrs = float(row["rel_resid_std"]) if row["rel_resid_std"] else np.nan
            rows_by_target[row["target"]].append({
                "stem": row["stem"], "turn": int(row["turn"]),
                "n_real": int(row["n_realizations"]),
                "H": float(H), "kappa": float(kappa),
                "rel_resid_std": rrs,
            })

    if not rows_by_target:
        sys.exit("no clean rows found for family")

    targets = sorted(rows_by_target.keys())
    print(f"targets: {targets}", flush=True)
    for t in targets:
        print(f"  {t:<28} n_clean={len(rows_by_target[t])}", flush=True)

    # ── Per-target diagnostic ───────────────────────────────────────────────
    lines: list[str] = []
    lines.append(f"# (H, κ) joint-distribution diagnostic — family {args.family}")
    lines.append(f"# {sum(len(v) for v in rows_by_target.values())} clean rows total")
    lines.append("")
    header = (f"  {'target':<28} {'n':>5} "
              f"{'H med':>10} {'H IQR':>14} "
              f"{'log10κ med':>12} {'log10κ IQR':>14} "
              f"{'ρ(H, logκ)':>11} {'ρ(rrs, logκ)':>13}")
    lines.append(header)

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle(f"(H, κ) joint distribution per target — family={args.family}\n"
                 f"averaged-trajectory fits from /tmp/summary_averaged.csv")
    for ax, t in zip(axes.flat, targets):
        rs = rows_by_target[t]
        H = np.array([r["H"] for r in rs])
        kappa = np.array([r["kappa"] for r in rs])
        rrs = np.array([r["rel_resid_std"] for r in rs])
        n_real = np.array([r["n_real"] for r in rs])
        log_kappa = np.log10(kappa)

        # Pearson correlations
        rho_Hlk = float(np.corrcoef(H, log_kappa)[0, 1]) if len(H) >= 3 else np.nan
        mask_rrs = np.isfinite(rrs)
        rho_rl = (float(np.corrcoef(rrs[mask_rrs], log_kappa[mask_rrs])[0, 1])
                  if mask_rrs.sum() >= 3 else np.nan)

        H_med, H_q1, H_q3 = np.median(H), np.percentile(H, 25), np.percentile(H, 75)
        lk_med, lk_q1, lk_q3 = (np.median(log_kappa),
                                 np.percentile(log_kappa, 25),
                                 np.percentile(log_kappa, 75))
        lines.append(
            f"  {t:<28} {len(rs):>5} "
            f"{H_med:>+10.4g} [{H_q1:>+5.2g},{H_q3:>+5.2g}] "
            f"{lk_med:>+12.3f} [{lk_q1:>+5.2f},{lk_q3:>+5.2f}] "
            f"{rho_Hlk:>+11.3f} {rho_rl:>+13.3f}"
        )

        sc = ax.scatter(H, log_kappa, c=rrs if mask_rrs.any() else None,
                        cmap="viridis", s=18, alpha=0.6,
                        vmin=0 if mask_rrs.any() else None,
                        vmax=np.nanpercentile(rrs, 95) if mask_rrs.any() else None)
        ax.set_xlabel("H (fitted asymptote)")
        ax.set_ylabel("log10 κ (fitted half-saturation visits)")
        ax.set_title(f"{t}  n={len(rs)}  ρ(H, log κ)={rho_Hlk:+.3f}")
        if mask_rrs.any():
            cb = fig.colorbar(sc, ax=ax, label="rel_resid_std (fit quality)")
        ax.grid(alpha=0.3)

    fig.tight_layout()
    out_scatter = args.plot_dir / f"diagnose_hk_scatter_{args.family}.png"
    fig.savefig(out_scatter, dpi=110)
    plt.close(fig)
    print(f"\nscatter: {out_scatter}", flush=True)

    # ── Marginal histograms ────────────────────────────────────────────────
    fig, axes = plt.subplots(2, len(targets), figsize=(4 * len(targets), 7))
    for col, t in enumerate(targets):
        rs = rows_by_target[t]
        H = np.array([r["H"] for r in rs])
        kappa = np.array([r["kappa"] for r in rs])
        log_kappa = np.log10(kappa)
        axes[0, col].hist(H, bins=40, color="steelblue", edgecolor="black", linewidth=0.3)
        axes[0, col].set_title(f"{t}\nH (n={len(H)})", fontsize=9)
        axes[0, col].axvline(np.median(H), color="red", lw=1, linestyle="--", label="median")
        axes[0, col].grid(alpha=0.3)
        axes[1, col].hist(log_kappa, bins=40, color="darkorange", edgecolor="black", linewidth=0.3)
        axes[1, col].set_title(f"log10 κ (n={len(log_kappa)})", fontsize=9)
        axes[1, col].axvline(np.median(log_kappa), color="red", lw=1, linestyle="--")
        axes[1, col].grid(alpha=0.3)
    fig.suptitle(f"Marginal (H, log κ) distributions — family={args.family}")
    fig.tight_layout()
    out_hist = args.plot_dir / f"diagnose_hk_marginals_{args.family}.png"
    fig.savefig(out_hist, dpi=110)
    plt.close(fig)
    print(f"marginals: {out_hist}", flush=True)

    summary = "\n".join(lines)
    print()
    print(summary)
    out_txt = args.plot_dir / f"diagnose_hk_summary_{args.family}.txt"
    out_txt.write_text(summary + "\n")
    print(f"\nsummary: {out_txt}", flush=True)


if __name__ == "__main__":
    main()
