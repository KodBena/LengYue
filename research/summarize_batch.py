"""
research/summarize_batch.py

Stage-1 batch summary — multi-target panel version.

Loads every NPZ in a batch directory and runs the per-target hyperbolic
fit pass committed in `roadmap-learned-continuous-scaling.md` §4.2.
For each trajectory and each panel member from
`fit_hyperbolic.VALUE_CANDIDATES`, computes:

  - Trajectory shape (peak_position, monotonicity_drop, y_range).
  - Hyperbolic fit (H, κ).
  - Residual quality (rel_resid_std, pearson(resid, V), max|r|).
  - Status: `clean` if the fit is hyperbolic-shaped and the residuals
    are bounded; `degenerate` if the fit collapsed (H≈0, κ outside
    plausible band) or residuals are too large to be a saturating
    curve.

Produces:

  - Per-position-per-target CSV with full metrics.
  - Per-target aggregate plot: rel_resid_std histogram, κ histogram,
    clean-vs-degenerate fraction. Shows which target is the
    best-behaved canonical candidate for this corpus.
  - Best-target assignment per position: which panel member has the
    cleanest fit. Diagnostic for whether one canonical target
    dominates or whether positions split across targets.
  - "Rogues gallery" PNG: the N most non-monotonic trajectories under
    the visit_entropy_reduction target, with all four targets
    overlaid for side-by-side inspection.

Usage:
  python summarize_batch.py /home/bork/w/omega/research/trajectories/batch_year2000

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.optimize import curve_fit

sys.path.insert(0, str(Path(__file__).parent))
from fit_hyperbolic import F, VALUE_CANDIDATES  # noqa: E402


# Status thresholds for the per-target `clean | degenerate` flag.
# `clean` requires: meaningful H, plausible κ, bounded residuals, and
# bounded shape-deviation. The thresholds are tuned for the Stage-1
# b10c128 setup; they may need re-tuning at other model tiers.
H_MIN_CLEAN = 1e-3
KAPPA_MIN_CLEAN = 1.0
KAPPA_MAX_CLEAN = 1e6
REL_RESID_STD_CLEAN_MAX = 0.25
MONOTONICITY_DROP_CLEAN_MAX = 0.30


def fit_one_target(
    V: np.ndarray,
    y: np.ndarray,
) -> dict:
    """Fit hyperbolic to one trajectory under one value() candidate.
    Returns a dict of metrics + a status flag."""
    if not np.isfinite(y).all() or len(y) < 4:
        return {"status": "degenerate", "reason": "insufficient data"}

    # Trajectory-shape diagnostics
    y_peak_idx = int(np.argmax(y))
    y_peak = float(y[y_peak_idx])
    y_final = float(y[-1])
    y_range = float(y.max() - y.min())
    monotonicity_drop = (
        (y_peak - y_final) / max(y_peak, 1e-9) if y_peak > 0 else float("inf")
    )
    peak_position = y_peak_idx / max(len(y) - 1, 1)

    # Hyperbolic fit
    H_guess = max(y.max(), 1e-6)
    kappa_guess = max(float(V[np.argmin(np.abs(y - H_guess / 2))]), 1.0)
    try:
        popt, _ = curve_fit(
            F, V, y, p0=[H_guess, kappa_guess],
            bounds=([0.0, 1e-3], [np.inf, np.inf]),
            maxfev=10_000,
        )
        H, kappa = float(popt[0]), float(popt[1])
        y_hat = F(V, H, kappa)
        resid = y - y_hat
        if y_range > 0 and resid.std() > 0:
            v_c = V - V.mean()
            r_c = resid - resid.mean()
            denom = np.sqrt((v_c**2).sum() * (r_c**2).sum())
            pearson = float((v_c * r_c).sum() / denom) if denom > 0 else 0.0
        else:
            pearson = 0.0
        rel_std = float(resid.std() / max(y_range, 1e-9))
        max_abs_r = float(np.abs(resid).max())
    except Exception as e:
        return {"status": "degenerate", "reason": f"fit failed: {e}"}

    # Status classification per §4.2: clean if hyperbolic is a good
    # fit and the trajectory is roughly monotonic-saturating.
    if (
        H < H_MIN_CLEAN
        or kappa < KAPPA_MIN_CLEAN
        or kappa > KAPPA_MAX_CLEAN
        or rel_std > REL_RESID_STD_CLEAN_MAX
        or monotonicity_drop > MONOTONICITY_DROP_CLEAN_MAX
    ):
        status = "degenerate"
    else:
        status = "clean"

    return {
        "status": status,
        "H": H,
        "kappa": kappa,
        "y_range": y_range,
        "y_peak": y_peak,
        "y_final": y_final,
        "monotonicity_drop": monotonicity_drop,
        "peak_position": peak_position,
        "rel_resid_std": rel_std,
        "max_abs_resid": max_abs_r,
        "pearson_resid_v": pearson,
    }


def fit_all_targets(d: dict) -> dict[str, dict]:
    """Run every VALUE_CANDIDATES target on this trajectory. Returns
    {target_name: per-target-result-dict}."""
    V = d["visits"].astype(np.float64)
    ids = d["isDuringSearch"]
    V_max_idx = int(np.where(~ids)[0][-1]) if (~ids).any() else int(np.argmax(V))

    out: dict[str, dict] = {}
    for name, value_fn in VALUE_CANDIDATES.items():
        try:
            y = value_fn(d, V_max_idx).astype(np.float64)
        except Exception as e:
            out[name] = {"status": "degenerate", "reason": f"value_fn error: {e}"}
            continue
        out[name] = fit_one_target(V, y)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("batch_dir", type=Path)
    ap.add_argument("--rogues", default=8, type=int,
                    help="N trajectories with worst visit_entropy fit to plot")
    args = ap.parse_args()

    npzs = sorted(args.batch_dir.glob("*.npz"))
    if not npzs:
        sys.exit(f"no NPZs in {args.batch_dir}")
    print(f"=== {len(npzs)} trajectories ===")
    target_names = list(VALUE_CANDIDATES.keys())
    print(f"=== panel: {target_names} ===")

    # Per-position records: {name, n_samples, V_max, per_target: {target: result}, best_target: str}
    records: list[dict] = []
    for p in npzs:
        d = dict(np.load(p, allow_pickle=True))
        per_target = fit_all_targets(d)
        # Best target = the clean one with the smallest rel_resid_std;
        # if none clean, the one with smallest rel_resid_std overall.
        clean = {n: r for n, r in per_target.items() if r.get("status") == "clean"}
        if clean:
            best = min(clean.items(), key=lambda kv: kv[1]["rel_resid_std"])[0]
        else:
            cand = {n: r for n, r in per_target.items() if "rel_resid_std" in r}
            best = (
                min(cand.items(), key=lambda kv: kv[1]["rel_resid_std"])[0]
                if cand else "(none)"
            )
        records.append({
            "name": p.stem,
            "_npz_path": str(p),
            "n_samples": int(len(d["visits"])),
            "V_max": int(d["visits"][-1]),
            "per_target": per_target,
            "best_target": best,
        })

    # ── Write per-position-per-target CSV ────────────────────────────────────
    csv_path = args.batch_dir / "summary.csv"
    base_fields = ["name", "n_samples", "V_max", "best_target", "target"]
    metric_fields = ["status", "H", "kappa", "rel_resid_std", "pearson_resid_v",
                     "monotonicity_drop", "peak_position", "y_range", "reason"]
    with csv_path.open("w") as f:
        w = csv.DictWriter(f, fieldnames=base_fields + metric_fields, extrasaction="ignore")
        w.writeheader()
        for r in records:
            for tname in target_names:
                row = {
                    "name": r["name"],
                    "n_samples": r["n_samples"],
                    "V_max": r["V_max"],
                    "best_target": r["best_target"],
                    "target": tname,
                }
                row.update(r["per_target"].get(tname, {}))
                w.writerow({k: row.get(k, "") for k in base_fields + metric_fields})
    print(f"  CSV: {csv_path}  ({len(records) * len(target_names)} rows)")

    # ── Per-target distributions ────────────────────────────────────────────
    print(f"\n=== per-target status distribution ===")
    print(f"  {'target':<28} {'clean':>6} {'degen':>6} {'clean%':>7}")
    for tname in target_names:
        statuses = Counter(r["per_target"].get(tname, {}).get("status", "missing")
                           for r in records)
        clean = statuses.get("clean", 0)
        degen = statuses.get("degenerate", 0)
        pct = 100.0 * clean / max(len(records), 1)
        print(f"  {tname:<28} {clean:>6} {degen:>6} {pct:>6.1f}%")

    print(f"\n=== best-target assignment (which target wins per position) ===")
    best_counts = Counter(r["best_target"] for r in records)
    for tname, ct in best_counts.most_common():
        pct = 100.0 * ct / len(records)
        print(f"  {tname:<28} {ct:>3} ({pct:5.1f}%)")

    # Aggregate stats on clean fits per target
    print(f"\n=== per-target fit statistics over clean fits ===")
    for tname in target_names:
        clean_metrics = [
            r["per_target"][tname]
            for r in records
            if r["per_target"].get(tname, {}).get("status") == "clean"
        ]
        if not clean_metrics:
            print(f"  {tname}: no clean fits")
            continue
        Hs = np.array([m["H"] for m in clean_metrics])
        kappas = np.array([m["kappa"] for m in clean_metrics])
        rel_stds = np.array([m["rel_resid_std"] for m in clean_metrics])
        print(f"  {tname} ({len(clean_metrics)} clean):")
        print(f"      H        median {np.median(Hs):.4g}  p10 {np.percentile(Hs,10):.4g}  p90 {np.percentile(Hs,90):.4g}")
        print(f"      κ        median {np.median(kappas):.4g}  p10 {np.percentile(kappas,10):.4g}  p90 {np.percentile(kappas,90):.4g}")
        print(f"      rel_std  median {np.median(rel_stds):.3f}  p10 {np.percentile(rel_stds,10):.3f}  p90 {np.percentile(rel_stds,90):.3f}")

    # ── Aggregate plot: per-target panel ─────────────────────────────────────
    plot_path = args.batch_dir / "summary.png"
    n_targets = len(target_names)
    fig, axes = plt.subplots(3, n_targets, figsize=(4 * n_targets, 9))
    if n_targets == 1:
        axes = axes.reshape(3, 1)
    for col, tname in enumerate(target_names):
        clean_metrics = [
            r["per_target"][tname]
            for r in records
            if r["per_target"].get(tname, {}).get("status") == "clean"
        ]
        all_with_resid = [
            r["per_target"][tname]
            for r in records
            if "rel_resid_std" in r["per_target"].get(tname, {})
        ]

        # Row 0: status pie
        ax = axes[0, col]
        statuses = Counter(r["per_target"].get(tname, {}).get("status", "missing")
                           for r in records)
        labels, vals = list(statuses.keys()), list(statuses.values())
        colors = ["#4CAF50" if l == "clean" else "#E57373" for l in labels]
        ax.pie(vals, labels=[f"{l}\n{v}" for l, v in zip(labels, vals)],
               colors=colors, startangle=90, wedgeprops={"edgecolor": "white"})
        ax.set_title(f"{tname}\n{statuses.get('clean', 0)}/{len(records)} clean")

        # Row 1: rel_resid_std distribution (clean fits)
        ax = axes[1, col]
        if all_with_resid:
            rel_stds_all = [m["rel_resid_std"] for m in all_with_resid]
            ax.hist(rel_stds_all, bins=30)
            ax.axvline(REL_RESID_STD_CLEAN_MAX, color="red", lw=1, label=f"clean threshold")
            ax.set_xlabel("rel_resid_std")
            ax.set_title("fit residual / signal range")
            ax.legend(fontsize=7)
            ax.grid(alpha=0.3)
        else:
            ax.text(0.5, 0.5, "no fits", ha="center", va="center", transform=ax.transAxes)

        # Row 2: log-κ distribution (clean fits)
        ax = axes[2, col]
        if clean_metrics:
            kappas = np.array([m["kappa"] for m in clean_metrics])
            ax.hist(kappas, bins=np.logspace(0, 5, 25))
            ax.set_xscale("log")
            ax.set_xlabel("κ (visits)")
            ax.set_title(f"fitted κ (clean only, median {np.median(kappas):.0f})")
            ax.grid(alpha=0.3)
        else:
            ax.text(0.5, 0.5, "no clean fits", ha="center", va="center", transform=ax.transAxes)

    fig.suptitle(f"per-target panel summary: {len(records)} trajectories from {args.batch_dir.name}")
    fig.tight_layout()
    fig.savefig(plot_path, dpi=110)
    print(f"\n  summary plot: {plot_path}")

    # ── Rogues gallery: worst visit_entropy fits, all targets overlaid ──────
    sort_key = "visit_entropy_reduction"
    ranked = sorted(
        records,
        key=lambda r: (
            r["per_target"].get(sort_key, {}).get("monotonicity_drop", -1.0)
            if r["per_target"].get(sort_key, {}).get("status") == "degenerate"
            else -1.0
        ),
        reverse=True,
    )
    rogues = ranked[: args.rogues]
    if rogues:
        rg_path = args.batch_dir / "rogues_gallery.png"
        ncols = 4
        nrows = ((args.rogues + ncols - 1) // ncols)
        fig, axes = plt.subplots(nrows, ncols, figsize=(4.5 * ncols, 3.2 * nrows))
        axes = axes.flatten() if hasattr(axes, "flatten") else [axes]
        target_colors = {
            "visit_entropy_reduction": "#1f77b4",
            "winrate_drift": "#ff7f0e",
            "scoreLead_drift": "#2ca02c",
            "L2_joint_drift": "#d62728",
        }
        for ax_idx, r in enumerate(rogues):
            d = dict(np.load(r["_npz_path"], allow_pickle=True))
            V = d["visits"].astype(np.float64)
            ids = d["isDuringSearch"]
            V_max_idx = int(np.where(~ids)[0][-1]) if (~ids).any() else int(np.argmax(V))
            ax = axes[ax_idx]
            for tname, value_fn in VALUE_CANDIDATES.items():
                try:
                    y = value_fn(d, V_max_idx).astype(np.float64)
                    if not np.isfinite(y).all(): continue
                    # Normalize to [0, 1] of its own range for overlay
                    y_n = (y - y.min()) / max(y.max() - y.min(), 1e-9)
                    color = target_colors.get(tname, "gray")
                    stat = r["per_target"].get(tname, {}).get("status", "?")
                    marker = "o" if stat == "clean" else "x"
                    ax.scatter(V, y_n, s=8, alpha=0.5, c=color,
                               label=f"{tname[:18]} [{stat[:5]}]",
                               marker=marker)
                except Exception:
                    pass
            ax.set_title(f"{r['name'][:32]}\nbest={r['best_target'][:18]}", fontsize=8)
            ax.set_xlabel("V")
            ax.set_ylabel("value (norm)")
            ax.legend(fontsize=6, loc="best")
            ax.grid(alpha=0.3)
        for j in range(len(rogues), len(axes)):
            axes[j].axis("off")
        fig.suptitle(
            f"rogues gallery: {len(rogues)} worst {sort_key} fits "
            f"with all four targets overlaid (normalized)",
        )
        fig.tight_layout()
        fig.savefig(rg_path, dpi=110)
        print(f"  rogues gallery: {rg_path}")


if __name__ == "__main__":
    main()
