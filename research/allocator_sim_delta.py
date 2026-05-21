"""
research/allocator_sim_delta.py

Allocator simulation using the DELTA predictor instead of the
hyperbolic-H predictor. Closes the Tier 1 loop from the firewall
consult: does predicting (y(V_target) - y(V_current)) / σ_position
produce a better allocator than predicting H?

The decision rule for binary policy:
  - Observe first window_floor_frac of trajectory at V_term_floor.
  - Train a delta predictor on year2k: features = phase35 + traj-window,
    label = (y(V_max) - y(V_term_floor)) / σ_position.
  - At inference, predict the normalized delta-to-V_max.
  - If predicted_delta < τ (small remaining gain) → terminate at V_term_floor.
  - Else continue to V_max.

Comparison: this allocator's Pareto curve plotted alongside the
H-predictor's curve from allocator_sim.py. If the delta-predictor
dominates, Tier 1 reframe is the right next step. If not, the
H-predictor is operationally sufficient even though the delta-reframe
has theoretical appeal.

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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from allocator_sim import (  # noqa: E402
    build_feature_row, modal_top1_at_v_max,
    baseline_always_vmax_agreement,
)
from regression import _LightGBMWrap  # noqa: E402


def compute_sigma_pos_idx(y_realiz: np.ndarray, idx: int) -> float:
    """Across-realization std of y at V-grid index `idx`."""
    valid = ~np.isnan(y_realiz[:, idx])
    if valid.sum() < 2:
        return 1.0
    s = float(np.std(y_realiz[valid, idx], ddof=1))
    return max(s, 1e-6)


def train_delta_predictor(
    cache: dict, target: str, window_frac: float,
) -> tuple[object, int]:
    """Train a LightGBM predictor for the normalized delta
    `(y(V_max) - y(V_term)) / σ_position`, where V_term is the
    V-grid index corresponding to window_frac.

    Trains on year2k. Returns (model, n_train)."""
    n = len(cache["stems"])
    domains = np.array(cache["domains"], dtype=object)
    y2k_mask = domains == "year2k"
    N_GRID = int(np.asarray(cache["N_GRID"]).flat[0])
    term_idx = max(4, int(round(N_GRID * window_frac))) - 1
    max_idx = N_GRID - 1
    X_rows = []
    y_rows = []
    for i in range(n):
        if not y2k_mask[i]:
            continue
        V_lo = float(cache["V_lo"][i])
        V_hi = float(cache["V_hi"][i])
        if not np.isfinite(V_lo) or not np.isfinite(V_hi) or V_lo >= V_hi:
            continue
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)
        y_mean = cache[f"y_mean_{target}"][i]
        if not np.isfinite(y_mean).all():
            continue
        y_realiz = cache[f"y_realiz_{target}"][i]
        sigma = compute_sigma_pos_idx(y_realiz, N_GRID // 2)
        row = build_feature_row(
            cache["phase35"][i], V_grid, y_mean, window_frac=window_frac,
        )
        if row is None:
            continue
        delta = (float(y_mean[max_idx]) - float(y_mean[term_idx])) / sigma
        X_rows.append(row)
        y_rows.append(delta)
    if not X_rows:
        raise SystemExit(f"no training data for {target}")
    X = np.array(X_rows, dtype=np.float64)
    y = np.array(y_rows, dtype=np.float64)
    m = _LightGBMWrap()
    m.fit(X, y)
    return m, len(X)


def simulate_delta_binary(
    predictor,
    cards_data: dict,
    window_floor_frac: float,
    tau_grid: np.ndarray,
    target: str,
) -> dict:
    """Simulate binary policy using delta predictor:
    - Build feature row at window_floor.
    - Predict normalized delta to V_max.
    - If predicted_delta < τ → terminate at V_term_floor; else V_max.
    """
    n_pos = len(cards_data["stems"])
    N_GRID = int(cards_data["N_GRID"])
    floor_idx = max(4, int(round(N_GRID * window_floor_frac))) - 1
    avg_visits = np.zeros(len(tau_grid))
    agreement = np.zeros(len(tau_grid))
    terminate_frac = np.zeros(len(tau_grid))
    for ti, tau in enumerate(tau_grid):
        total_visits = 0.0
        total_agree = 0.0
        total_count = 0
        n_terminate = 0
        for i in range(n_pos):
            V_lo = float(cards_data["V_lo"][i])
            V_hi = float(cards_data["V_hi"][i])
            if not np.isfinite(V_lo) or not np.isfinite(V_hi) or V_lo >= V_hi:
                continue
            V_grid = np.geomspace(V_lo, V_hi, N_GRID)
            y_mean = cards_data[f"y_mean_{target}"][i]
            if not np.isfinite(y_mean).all():
                continue
            top1_realiz = cards_data["top1_realiz"][i]
            modal_v_max = modal_top1_at_v_max(top1_realiz)
            if modal_v_max < 0:
                continue
            row = build_feature_row(
                cards_data["phase35"][i], V_grid, y_mean,
                window_frac=window_floor_frac,
            )
            if row is None:
                continue
            predicted_delta = float(predictor.predict(row[None, :])[0])
            if predicted_delta < tau:
                V_term = float(V_grid[floor_idx])
                v_idx = floor_idx
                n_terminate += 1
            else:
                V_term = V_hi
                v_idx = N_GRID - 1
            agree_count = 0
            real_count = 0
            for r in range(top1_realiz.shape[0]):
                t1 = int(top1_realiz[r, v_idx])
                if t1 < 0:
                    continue
                if t1 == modal_v_max:
                    agree_count += 1
                real_count += 1
            if real_count == 0:
                continue
            total_visits += V_term
            total_agree += agree_count / real_count
            total_count += 1
        if total_count > 0:
            avg_visits[ti] = total_visits / total_count
            agreement[ti] = total_agree / total_count
            terminate_frac[ti] = n_terminate / total_count
    return {
        "tau": tau_grid,
        "avg_visits": avg_visits,
        "agreement": agreement,
        "terminate_frac": terminate_frac,
    }


def load_h_predictor_pareto(target: str) -> tuple[list, list] | None:
    """Read the H-predictor's Pareto curve from the existing
    summary text for overlay comparison."""
    p = Path.home() / "plots" / "allocator_pareto" / f"summary_{target}.txt"
    if not p.exists():
        return None
    visits = []
    agree = []
    in_binary = False
    for line in p.read_text().splitlines():
        if line.startswith("# binary policy"):
            in_binary = True
            continue
        if line.startswith("# 3-stage policy"):
            in_binary = False
            continue
        if not in_binary:
            continue
        parts = line.split()
        if len(parts) >= 4:
            try:
                v = float(parts[1])
                a = float(parts[2])
                visits.append(v)
                agree.append(a)
            except ValueError:
                continue
    return visits, agree


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cache",
                    default=Path(__file__).resolve().parent /
                            "data" / "trajectory_cache.npz",
                    type=Path)
    ap.add_argument("--out-dir",
                    default=Path.home() / "plots" / "allocator_pareto_delta",
                    type=Path)
    ap.add_argument("--target", default="scoreLead_drift")
    ap.add_argument("--window-floor-frac", default=1.0/3.0, type=float)
    ap.add_argument("--n-tau", default=25, type=int)
    args = ap.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    print(f"=== delta-predictor allocator: {args.target} "
          f"window_floor={args.window_floor_frac:.3f} ===", flush=True)

    cache = np.load(args.cache, allow_pickle=True)
    cache = {k: cache[k] for k in cache.files}

    print(f"  training delta predictor (year2k)...", flush=True)
    t0 = time.monotonic()
    predictor, n_train = train_delta_predictor(
        cache, args.target, args.window_floor_frac,
    )
    print(f"  trained on {n_train} positions in {time.monotonic()-t0:.1f}s",
          flush=True)

    # Build cards.db sub-dict
    domains = np.array(cache["domains"], dtype=object)
    cards_idx = np.where(domains == "cards")[0]
    def slice_cache(idx):
        out = {}
        for k, v in cache.items():
            v = np.asarray(v)
            if v.ndim > 0 and v.shape[0] == len(domains):
                out[k] = v[idx]
            else:
                out[k] = v
        out["N_GRID"] = int(np.asarray(cache["N_GRID"]).flat[0])
        return out
    cards_data = slice_cache(cards_idx)

    baseline = baseline_always_vmax_agreement(cards_data, args.target)
    print(f"  baseline: visits={baseline['avg_visits']:.0f}  "
          f"agree={baseline['agreement']:.4f}", flush=True)

    # τ grid in normalized-delta units
    tau_grid = np.linspace(-2.0, 4.0, args.n_tau)
    print(f"  running binary sim with delta predictor ({len(tau_grid)} τ)...",
          flush=True)
    t0 = time.monotonic()
    delta_res = simulate_delta_binary(
        predictor, cards_data, args.window_floor_frac, tau_grid, args.target,
    )
    print(f"  delta sim done in {time.monotonic()-t0:.1f}s", flush=True)

    # Load H predictor's Pareto for overlay
    h_pareto = load_h_predictor_pareto(args.target)

    # Save summary
    summary = args.out_dir / f"summary_delta_{args.target}.txt"
    with summary.open("w") as f:
        f.write(f"# delta-predictor allocator sim: {args.target}\n")
        f.write(f"# window_floor_frac={args.window_floor_frac:.3f}  "
                f"n_train={n_train}\n\n")
        f.write(f"# baseline (always V_max)\n")
        f.write(f"  avg_visits = {baseline['avg_visits']:.0f}\n")
        f.write(f"  agreement  = {baseline['agreement']:.4f}\n\n")
        f.write(f"# delta-predictor binary policy\n")
        f.write(f"  {'tau':>8} {'visits':>10} {'agree':>9} {'term%':>7}\n")
        for ti in range(len(tau_grid)):
            f.write(f"  {tau_grid[ti]:>+8.3f} "
                    f"{delta_res['avg_visits'][ti]:>10.0f} "
                    f"{delta_res['agreement'][ti]:>+9.4f} "
                    f"{delta_res['terminate_frac'][ti]:>7.2%}\n")
    print(f"  summary: {summary}", flush=True)

    # Pareto plot
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.plot(delta_res["avg_visits"], delta_res["agreement"],
            marker="o", linestyle="-", color="tab:red",
            label="delta-predictor allocator")
    if h_pareto is not None and h_pareto[0]:
        ax.plot(h_pareto[0], h_pareto[1],
                marker="s", linestyle="--", color="tab:blue", alpha=0.7,
                label="H-predictor allocator (overlay)")
    ax.scatter([baseline["avg_visits"]], [baseline["agreement"]],
               color="black", s=80, marker="*",
               label="baseline (always V_max)")
    ax.set_xlabel("avg visits spent per position")
    ax.set_ylabel("top-1 agreement vs modal-top-1 at V_max")
    ax.set_title(f"Delta-predictor vs H-predictor allocator — {args.target}\n"
                 f"OOD: year2k-trained → cards.db evaluated")
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    plot_path = args.out_dir / f"delta_vs_h_{args.target}.png"
    fig.savefig(plot_path, dpi=120)
    plt.close(fig)
    print(f"  plot: {plot_path}", flush=True)


if __name__ == "__main__":
    main()
