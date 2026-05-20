"""
research/plot_extreme_trajectories.py

Plots actual y(V) trajectories for selected cards.db positions
plus the fitted hyperbolic curve overlay. Goal: see what makes
"extreme κ" positions extreme (multi-regime? noisy? monotonic
but slow-saturating?) and what makes "fit-pathology" positions
unfittable (oscillating? non-monotone? sharp transitions?).

Selected positions:
  - 1408 (parent of 3197, NON-volatile, κ=95640 for visit_entropy
    — the most extreme κ in our dataset)
  - 3198 (sibling of 3197, volatile, κ=69720 for scoreLead — 23×
    corpus median)
  - 4889 (descendant of 2935, NON-volatile, κ=5.5 for scoreLead
    — extreme LOW κ)
  - 2886 (sibling of 2893, volatile, 0/4 clean — all degenerate)
  - 2935 (seed, volatile, 4/4 clean — "normal" volatile)

For each: average over 10 realizations, plot y vs V on log-V axis,
overlay the hyperbolic fit (or note "no fit"). One subplot per
target.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from curve_families import FAMILIES  # noqa: E402
from fit_averaged import averaged_trajectory_for_target  # noqa: E402
from fit_hyperbolic import VALUE_CANDIDATES  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_realizations, realization_as_flat_arrays,
)


SELECTED = [
    ("card_1408_spar5_r1", "1408 (parent, non-V, κ_visit≈95k — most extreme)"),
    ("card_3198_spar5_r0", "3198 (sibling of 3197, V, κ_scoreLead≈70k)"),
    ("card_4889_spar7_r0", "4889 (descendant of 2935, non-V, κ_scoreLead=5.5 — extreme LOW κ)"),
    ("card_2886_spar8_r0", "2886 (sibling of 2893, V, 0/4 clean — fit-pathology)"),
    ("card_2935_spar9_r1", "2935 (seed, V, 4/4 clean — 'normal' volatile)"),
]


def _count_moves(text: str) -> int:
    return len(re.findall(r";[BW]\[[a-z]{0,2}\]", text))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seed-sgf-dir", default=Path.home() / "volatile_sgfs",
                    type=Path)
    ap.add_argument("--family-sgf-dir",
                    default=Path.home() / "volatile_sgfs_family", type=Path)
    ap.add_argument("--out-dir",
                    default=Path.home() / "plots" / "validate_volatile_family",
                    type=Path)
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    hyper = FAMILIES["hyperbolic"]
    targets = list(VALUE_CANDIDATES.keys())
    conn = connect()

    for stem, label in SELECTED:
        # find SGF
        sgf_path = args.seed_sgf_dir / f"{stem}.sgf"
        if not sgf_path.exists():
            sgf_path = args.family_sgf_dir / f"{stem}.sgf"
        if not sgf_path.exists():
            print(f"  ✗ no SGF for {stem}", flush=True)
            continue
        n_moves = _count_moves(sgf_path.read_text())
        real_idxs = list_realizations(conn, stem, n_moves)
        if not real_idxs:
            print(f"  ✗ no realizations for {stem}", flush=True)
            continue
        realizations = []
        for ri in real_idxs:
            arrs = realization_as_flat_arrays(conn, stem, n_moves, ri)
            if arrs is not None:
                realizations.append(arrs)
        if not realizations:
            continue
        print(f"  {stem}: n_realizations={len(realizations)}", flush=True)

        fig, axes = plt.subplots(2, 2, figsize=(13, 9))
        fig.suptitle(f"trajectory: {label}\n"
                     f"({stem}, n_realizations={len(realizations)})",
                     fontsize=10)
        for ax, tname in zip(axes.flat, targets):
            value_fn = VALUE_CANDIDATES[tname]
            avg = averaged_trajectory_for_target(realizations, value_fn)
            if avg is None:
                ax.set_title(f"{tname}: no trajectory")
                continue
            V_g, y_g = avg
            V_g = V_g.astype(np.float64)
            y_g = y_g.astype(np.float64)
            # per-realization scatter
            for d in realizations:
                V_r = d["visits"].astype(np.float64)
                ids = d["isDuringSearch"]
                V_max_idx = int(np.where(~ids)[0][-1]) if (~ids).any() else int(np.argmax(V_r))
                try:
                    y_r = value_fn(d, V_max_idx).astype(np.float64)
                except Exception:
                    continue
                if not np.isfinite(y_r).all() or len(y_r) < 4:
                    continue
                order = np.argsort(V_r)
                ax.plot(V_r[order], y_r[order], color="gray", alpha=0.25,
                        linewidth=0.8)
            # averaged
            ax.plot(V_g, y_g, color="steelblue", linewidth=2,
                    label=f"avg (n={len(realizations)})")
            # fit
            fit = hyper.fit(V_g, y_g)
            if fit.status == "clean":
                H, kappa = fit.params["H"], fit.params["kappa"]
                V_fit = np.geomspace(V_g.min(), V_g.max(), 200)
                y_fit = H * V_fit / (V_fit + kappa)
                ax.plot(V_fit, y_fit, color="red", linewidth=1.5,
                        linestyle="--",
                        label=f"hyper fit: H={H:.3g} κ={kappa:.3g}")
                ax.set_title(f"{tname}: clean fit rrs={fit.rel_resid_std:.3f}")
            else:
                ax.set_title(f"{tname}: {fit.status} ({fit.reason or 'n/a'})")
            ax.set_xscale("log")
            ax.set_xlabel("V (visits, log scale)")
            ax.set_ylabel(tname)
            ax.legend(fontsize=8)
            ax.grid(alpha=0.3, which="both")
        fig.tight_layout()
        out = args.out_dir / f"trajectory_{stem}.png"
        fig.savefig(out, dpi=110)
        plt.close(fig)
        print(f"    plot: {out}", flush=True)

    conn.close()


if __name__ == "__main__":
    main()
