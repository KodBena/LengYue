"""
research/compare_realizations.py

Diagnostic for §4.4 — per-realization variance of MCTS trajectories.
Loads N NPZ files (each a realization of the same (SGF, turn) under
identical query content), plots all four value() candidates with
per-realization spread overlaid, plus the per-V mean as a thick line.

This makes visible:
  - how much per-realization noise the value-head metrics carry
  - how much per-realization noise visit-entropy carries
  - whether the non-monotonic "value-flip" patterns are consistent
    across runs (model misspecification) or per-run (averageable)

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from fit_hyperbolic import (  # noqa: E402
    VALUE_CANDIDATES,
)


def load_traj(path: Path) -> dict:
    return dict(np.load(path, allow_pickle=True))


def per_v_curve(d: dict, value_name: str) -> tuple[np.ndarray, np.ndarray]:
    V = d["visits"].astype(np.float64)
    ids = d["isDuringSearch"]
    V_max_idx = int(np.where(~ids)[0][-1]) if (~ids).any() else int(np.argmax(V))
    y = VALUE_CANDIDATES[value_name](d, V_max_idx).astype(np.float64)
    return V, y


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "npzs",
        nargs="+",
        type=Path,
        help="N realizations of the same (SGF, turn)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        required=True,
        help="output PNG path",
    )
    args = ap.parse_args()

    trajectories = [load_traj(p) for p in args.npzs]
    if not trajectories:
        sys.exit("no NPZs given")

    # Common V grid for averaging — span from max(V_first) to min(V_last)
    V_first = max(t["visits"][0] for t in trajectories)
    V_last = min(t["visits"][-1] for t in trajectories)
    V_grid = np.geomspace(max(V_first, 1), V_last, 40)

    fig, axes = plt.subplots(1, len(VALUE_CANDIDATES), figsize=(4 * len(VALUE_CANDIDATES), 4))
    if len(VALUE_CANDIDATES) == 1:
        axes = [axes]

    for col, name in enumerate(VALUE_CANDIDATES):
        ax = axes[col]
        per_run_on_grid = []
        for i, d in enumerate(trajectories):
            V, y = per_v_curve(d, name)
            if not np.isfinite(y).all():
                ax.text(0.5, 0.5, "(no data)", ha="center", va="center", transform=ax.transAxes)
                break
            ax.scatter(V, y, s=8, alpha=0.4, label=f"r{i}")
            y_interp = np.interp(V_grid, V, y)
            per_run_on_grid.append(y_interp)
        if per_run_on_grid:
            arr = np.array(per_run_on_grid)
            mean = arr.mean(axis=0)
            std = arr.std(axis=0)
            ax.plot(V_grid, mean, "k-", lw=2, label="mean")
            ax.fill_between(V_grid, mean - std, mean + std, color="gray", alpha=0.25, label="±1σ")
            # Print noise-floor metric: mean std relative to mean range
            rel_noise = std.mean() / max(mean.max() - mean.min(), 1e-9)
            ax.set_title(f"{name}\n(mean σ / range = {rel_noise:.3f})")
        else:
            ax.set_title(name)
        ax.set_xlabel("visits V")
        ax.set_ylabel("value(V)")
        ax.grid(alpha=0.3)
        ax.legend(fontsize=7)

    fig.suptitle(f"{len(trajectories)} realizations: {Path(args.npzs[0]).stem.rsplit('__r', 1)[0]}", fontsize=11)
    fig.tight_layout()
    fig.savefig(args.out, dpi=110)
    print(f"saved: {args.out}")


if __name__ == "__main__":
    main()
