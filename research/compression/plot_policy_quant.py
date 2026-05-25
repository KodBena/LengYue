"""
research/compression/plot_policy_quant.py

Reads the per-packet CSV produced by
`research.compression.measure_policy_quant` and produces summary
plots characterising the policy-quantisation loss distribution:

  - Empirical CDFs of JSD per variant (the load-bearing one for gate
    thresholds — answers "what fraction of packets fall below X JSD?")
  - Empirical CDFs of max-abs per variant
  - Box-plot of JSD by variant for compact comparison
  - JSD vs n_legal scatter — shows whether the loss correlates with
    game phase (n_legal shrinks as the board fills up)

Also prints a quantile table to stdout: p50/p90/p95/p99/max for each
(variant, metric) pair. These are the numbers a soundness gate
threshold should be informed by — set the threshold above the
worst-acceptable-quantile.

Output destination follows the user's convention: ~/plots/ for one-
shot characterisation, not the repo.

Usage:
  python -m research.compression.plot_policy_quant
  python -m research.compression.plot_policy_quant --csv ~/plots/policy-quant-per-packet.csv

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import argparse
import csv
import statistics
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # headless; no GUI
import matplotlib.pyplot as plt
import numpy as np


VARIANT_ORDER = ["Q4_full", "Q4_factored", "Q8_full", "Q8_factored"]
VARIANT_COLORS = {
    "Q4_full":     "#d62728",
    "Q4_factored": "#ff7f0e",
    "Q8_full":     "#2ca02c",
    "Q8_factored": "#1f77b4",
}
VARIANT_LABELS = {
    "Q4_full":     "Q4 over [-1, 1]",
    "Q4_factored": "Q4 factored (legals over [0, 1])",
    "Q8_full":     "Q8 over [-1, 1]",
    "Q8_factored": "Q8 factored (legals over [0, 1])",
}


def load_csv(path: Path) -> dict[str, dict[str, np.ndarray]]:
    """Group rows by variant; return {variant: {column: np.array}}."""
    rows_by_variant: dict[str, list[dict]] = {v: [] for v in VARIANT_ORDER}
    with path.open() as f:
        for row in csv.DictReader(f):
            v = row["variant"]
            if v not in rows_by_variant:
                continue
            rows_by_variant[v].append({
                "rmse": float(row["rmse"]),
                "max_abs": float(row["max_abs"]),
                "jsd": float(row["jsd"]),
                "n_legal": int(row["n_legal"]),
                "turn": int(row["turn"]),
                "stem": row["stem"],
            })
    out = {}
    for v, rows in rows_by_variant.items():
        out[v] = {
            "rmse": np.array([r["rmse"] for r in rows]),
            "max_abs": np.array([r["max_abs"] for r in rows]),
            "jsd": np.array([r["jsd"] for r in rows]),
            "n_legal": np.array([r["n_legal"] for r in rows]),
            "turn": np.array([r["turn"] for r in rows]),
            "stem": [r["stem"] for r in rows],
        }
    return out


def plot_cdf(data: dict[str, dict[str, np.ndarray]],
             metric: str, label: str, out_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(9, 6))
    for v in VARIANT_ORDER:
        vals = data[v][metric]
        vals = vals[~np.isnan(vals)]
        if vals.size == 0:
            continue
        sorted_vals = np.sort(vals)
        # Empirical CDF.
        y = np.arange(1, len(sorted_vals) + 1) / len(sorted_vals)
        ax.plot(sorted_vals, y, label=VARIANT_LABELS[v],
                color=VARIANT_COLORS[v], linewidth=2)
    ax.set_xlabel(label)
    ax.set_ylabel("fraction of packets ≤ x")
    ax.set_title(f"Empirical CDF: {label} across all packets, by variant")
    ax.grid(True, alpha=0.3)
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    plt.close(fig)
    print(f"  wrote {out_path}")


def plot_box(data: dict[str, dict[str, np.ndarray]],
             metric: str, label: str, out_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(9, 6))
    by_variant: list[np.ndarray] = []
    labels: list[str] = []
    for v in VARIANT_ORDER:
        vals = data[v][metric]
        vals = vals[~np.isnan(vals)]
        by_variant.append(vals)
        labels.append(VARIANT_LABELS[v])
    bp = ax.boxplot(by_variant, tick_labels=labels, showfliers=True,
                    patch_artist=True, widths=0.6, whis=(5, 95))
    for patch, v in zip(bp["boxes"], VARIANT_ORDER):
        patch.set_facecolor(VARIANT_COLORS[v])
        patch.set_alpha(0.5)
    ax.set_ylabel(label)
    ax.set_title(f"{label} distribution by variant (whiskers at 5th / 95th percentile)")
    ax.grid(True, alpha=0.3, axis="y")
    plt.setp(ax.get_xticklabels(), rotation=15, ha="right")
    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    plt.close(fig)
    print(f"  wrote {out_path}")


def plot_jsd_vs_nlegal(data: dict[str, dict[str, np.ndarray]],
                        out_path: Path) -> None:
    fig, axes = plt.subplots(2, 2, figsize=(12, 9), sharex=True, sharey=True)
    for ax, v in zip(axes.flatten(), VARIANT_ORDER):
        jsd = data[v]["jsd"]
        nleg = data[v]["n_legal"]
        mask = ~np.isnan(jsd)
        ax.scatter(nleg[mask], jsd[mask], alpha=0.35, s=8,
                   color=VARIANT_COLORS[v])
        ax.set_title(VARIANT_LABELS[v])
        ax.grid(True, alpha=0.3)
    for ax in axes[1]:
        ax.set_xlabel("n_legal (number of legal moves in packet)")
    for ax in axes[:, 0]:
        ax.set_ylabel("policy JSD (normalised, log base 2)")
    fig.suptitle("JSD vs n_legal — does loss correlate with game phase?", y=1.00)
    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    plt.close(fig)
    print(f"  wrote {out_path}")


def quantile_table(data: dict[str, dict[str, np.ndarray]]) -> None:
    print()
    print(f"{'variant':22s}  {'metric':>10s}  {'p50':>8s}  {'p90':>8s}  "
          f"{'p95':>8s}  {'p99':>8s}  {'max':>8s}  {'n':>6s}")
    print("-" * 90)
    for v in VARIANT_ORDER:
        for metric in ("jsd", "max_abs", "rmse"):
            vals = data[v][metric]
            vals = vals[~np.isnan(vals)]
            if vals.size == 0:
                continue
            p50, p90, p95, p99 = np.percentile(vals, [50, 90, 95, 99])
            mx = vals.max()
            print(f"{VARIANT_LABELS[v]:22s}  {metric:>10s}  "
                  f"{p50:>8.4f}  {p90:>8.4f}  {p95:>8.4f}  "
                  f"{p99:>8.4f}  {mx:>8.4f}  {vals.size:>6d}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(Path.home() / "plots" /
                                         "policy-quant-per-packet.csv"))
    ap.add_argument("--out-dir", default=str(Path.home() / "plots"))
    args = ap.parse_args()

    csv_path = Path(args.csv)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not csv_path.exists():
        print(f"ERROR: {csv_path} not found; run "
              f"`python -m research.compression.measure_policy_quant` first")
        return 2

    print(f"loading {csv_path}")
    data = load_csv(csv_path)
    n_total = sum(d["jsd"].size for d in data.values())
    print(f"loaded {n_total} per-packet rows across "
          f"{len(VARIANT_ORDER)} variants")

    plot_cdf(data, "jsd", "policy JSD (normalised, log base 2)",
             out_dir / "policy-quant-jsd-cdf.png")
    plot_cdf(data, "max_abs", "policy max-abs reconstruction error",
             out_dir / "policy-quant-maxabs-cdf.png")
    plot_box(data, "jsd", "policy JSD (normalised)",
             out_dir / "policy-quant-jsd-boxplot.png")
    plot_jsd_vs_nlegal(data, out_dir / "policy-quant-jsd-vs-nlegal.png")
    quantile_table(data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
