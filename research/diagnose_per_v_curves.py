"""
research/diagnose_per_v_curves.py

Per-V_t stable_fraction curves for the top1_move extractor across the
full corpus. Visualizes the three operational regimes the per-packet
optimal-stopping framework distinguishes:

  CONVERGED       — curve rises to high P_stable; terminate immediately
  WORTH_DEEPENING — curve rises monotonically but slowly; spend more budget
  PATHOLOGICAL    — curve stays flat and low; "budgeting trap" — no amount
                    of additional budget will resolve. Terminate without
                    spending more.

For each position, we evaluate
  stable_fraction_logV(V_t, V_max=V_hi)
at K log-spaced V_t cutoffs along the V_grid, average across the
position's realizations, and plot the resulting K-point curve.

The shape of these curves is the regime indicator. A position whose
curve is flat-and-low is pathological; a position whose curve climbs
toward 1.0 with V_t is worth deepening; a position whose curve is
already high is converged.

Output:
  ~/plots/per_v_curves/per_v_curves_top1_move.png      — multi-panel figure
  ~/plots/per_v_curves/per_v_curves_summary.txt        — per-regime counts

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import multiprocessing as mp
import sys
import time
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pg_sink import connect, fetch_positions_bundle_thin_batch  # noqa: E402
from stability_trajectory import (  # noqa: E402
    StabilityTrajectory,
    extract_top1_move,
)


# Grid indices at which to evaluate stable_fraction_logV(V_grid[idx], V_hi).
# Skip the last few because the post-V_t tail becomes too narrow there.
CUTOFF_INDICES = list(range(4, 45, 4))   # [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44]


# ── Per-position computation ───────────────────────────────────────────────

def _build_top1_change_points(packets) -> tuple[list, float, int]:
    """Walk packets, return (change-points, last_V, n_packets) for top1_move."""
    cps = []
    last = None
    last_V = 0.0
    n_packets = 0
    UNK = StabilityTrajectory._UNKNOWN
    sentinel = object()  # distinct from None so the first packet always records
    prev = sentinel
    for _t_pkt, pkt in packets:
        V = float((pkt.get("rootInfo") or {}).get("visits", 0))
        val = extract_top1_move(pkt)
        tagged = val if val is not None else UNK
        if prev is sentinel or tagged != prev:
            cps.append((V, tagged))
            prev = tagged
        last_V = V
        n_packets += 1
    return cps, last_V, n_packets


def _per_position_curve(bundle, V_grid: np.ndarray) -> np.ndarray | None:
    """Compute K-point per-V_t stable_fraction_logV curve, averaged across
    a position's realizations."""
    K = len(CUTOFF_INDICES)
    V_max_query = float(V_grid[-1])
    rows = []
    for _r_idx, packets in bundle.items():
        if not packets:
            continue
        cps, last_V, n_pkts = _build_top1_change_points(packets)
        if not cps:
            continue
        traj = StabilityTrajectory.from_changepoints(
            cps, V_max=last_V, n_packets=n_pkts,
        )
        row = np.full(K, np.nan)
        for ki, idx in enumerate(CUTOFF_INDICES):
            V_t = float(V_grid[idx])
            if V_t >= V_max_query:
                continue
            frac, _ = traj.stable_fraction_logV(V_t, V_max=V_max_query)
            if np.isfinite(frac):
                row[ki] = frac
        rows.append(row)
    if not rows:
        return None
    return np.nanmean(np.stack(rows, axis=0), axis=0)


# ── Worker (one Postgres conn per process) ─────────────────────────────────

_WORKER_CONN = None


def _worker_init() -> None:
    global _WORKER_CONN
    _WORKER_CONN = connect()


def _worker_compute_chunk(
    chunk: list[tuple[str, int, np.ndarray]],
) -> list[tuple[str, int, np.ndarray | None]]:
    """Fetch a chunk of positions via thin batch, compute per-position
    curves, return (stem, turn, curve)."""
    conn = _WORKER_CONN
    if conn is None:
        conn = connect()
    keys = [(s, t) for s, t, _g in chunk]
    bundles = fetch_positions_bundle_thin_batch(conn, keys)
    out: list[tuple[str, int, np.ndarray | None]] = []
    for stem, turn, V_grid in chunk:
        bundle = bundles.get((stem, turn))
        if not bundle:
            out.append((stem, turn, None))
            continue
        curve = _per_position_curve(bundle, V_grid)
        out.append((stem, turn, curve))
    return out


# ── Regime classification ──────────────────────────────────────────────────

def classify_regime(
    curve: np.ndarray,
    converged_max_p: float = 0.90,
    deepening_min_rise: float = 0.25,
    pathological_max_p: float = 0.50,
    pathological_max_range: float = 0.30,
) -> str:
    """Bucket a position's curve into one of four regimes:
      "converged"       — peak P_stable >= converged_max_p
      "worth-deepening" — late P_stable - early P_stable >= deepening_min_rise
      "pathological"    — peak P_stable < pathological_max_p AND
                          range < pathological_max_range (flat-low)
      "mixed"           — anything else (catch-all)

    Thresholds are soft defaults; tune to taste."""
    valid = curve[np.isfinite(curve)]
    if valid.size < 3:
        return "noisy"
    max_p = float(valid.max())
    # First and last valid values (handles NaN at the ends).
    finite_idx = np.where(np.isfinite(curve))[0]
    p_first = float(curve[finite_idx[0]])
    p_last = float(curve[finite_idx[-1]])
    rng = float(valid.max() - valid.min())
    if max_p >= converged_max_p:
        return "converged"
    if (p_last - p_first) >= deepening_min_rise:
        return "worth-deepening"
    if max_p < pathological_max_p and rng < pathological_max_range:
        return "pathological"
    return "mixed"


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--cache",
        default=Path(__file__).resolve().parent / "data" / "trajectory_cache.npz",
        type=Path,
    )
    ap.add_argument(
        "--out-dir",
        default=Path.home() / "plots" / "per_v_curves",
        type=Path,
    )
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument(
        "--max-positions", type=int, default=None,
        help="Limit to first N positions (for quick iteration)",
    )
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    print("=== per-V_t stable_fraction curves (top1_move) ===", flush=True)
    print(f"  cutoff indices: {CUTOFF_INDICES}", flush=True)
    print(f"  workers={args.workers}  batch_size={args.batch_size}", flush=True)

    # Load cache
    cache_npz = np.load(args.cache, allow_pickle=True)
    cache = {k: cache_npz[k] for k in cache_npz.files}
    domains = np.array(cache["domains"], dtype=object)
    stems = np.array(cache["stems"], dtype=object)
    turns = np.array(cache["turns"], dtype=np.int32)
    V_lo = np.asarray(cache["V_lo"], dtype=np.float64)
    V_hi = np.asarray(cache["V_hi"], dtype=np.float64)
    N_GRID = int(np.asarray(cache["N_GRID"]).flat[0])
    n_total = len(stems)
    if args.max_positions is not None:
        n_total = min(n_total, args.max_positions)
    print(f"  positions: {n_total}  ({(domains[:n_total]=='year2k').sum()} y2k, "
          f"{(domains[:n_total]=='cards').sum()} cards)", flush=True)

    # Build the work list — (stem, turn, V_grid) per position
    work: list[tuple[str, int, np.ndarray]] = []
    for i in range(n_total):
        vlo = float(V_lo[i])
        vhi = float(V_hi[i])
        if not (np.isfinite(vlo) and np.isfinite(vhi) and vlo < vhi):
            continue
        V_grid = np.geomspace(vlo, vhi, N_GRID)
        work.append((str(stems[i]), int(turns[i]), V_grid))

    # Chunk + parallelize
    chunks = [work[k: k + args.batch_size]
              for k in range(0, len(work), args.batch_size)]
    n_chunks = len(chunks)
    print(f"  chunks: {n_chunks}", flush=True)

    t0 = time.monotonic()
    curve_by_key: dict[tuple[str, int], np.ndarray] = {}
    chunks_done = 0

    with mp.Pool(processes=args.workers, initializer=_worker_init) as pool:
        for batch_out in pool.imap_unordered(_worker_compute_chunk, chunks):
            for stem, turn, curve in batch_out:
                if curve is not None:
                    curve_by_key[(stem, turn)] = curve
            chunks_done += 1
            if chunks_done % max(1, n_chunks // 20) == 0 or chunks_done == n_chunks:
                dt = time.monotonic() - t0
                rate = chunks_done / max(dt, 1e-9)
                eta = (n_chunks - chunks_done) / max(rate, 1e-9)
                print(f"  [{chunks_done}/{n_chunks}] {rate:.1f} chunks/s  "
                      f"computed={len(curve_by_key)}  "
                      f"elapsed={dt:.0f}s eta={eta:.0f}s", flush=True)

    print(f"  computed {len(curve_by_key)} curves in {time.monotonic() - t0:.1f}s",
          flush=True)

    # Stack curves in the original cache order
    K = len(CUTOFF_INDICES)
    curves = np.full((n_total, K), np.nan)
    domain_arr = np.empty(n_total, dtype=object)
    regime_arr = np.empty(n_total, dtype=object)
    for i in range(n_total):
        key = (str(stems[i]), int(turns[i]))
        curve = curve_by_key.get(key)
        domain_arr[i] = domains[i] if i < len(domains) else "?"
        if curve is None:
            regime_arr[i] = "missing"
            continue
        curves[i] = curve
        regime_arr[i] = classify_regime(curve)

    # Per-regime population (also split by domain)
    print("\n  regime counts by domain:", flush=True)
    overall_count = Counter(regime_arr.tolist())
    print(f"    overall: {dict(overall_count.most_common())}", flush=True)
    for dom in ("year2k", "cards"):
        mask = domain_arr == dom
        cnt = Counter(regime_arr[mask].tolist())
        print(f"    {dom:8s}: {dict(cnt.most_common())}", flush=True)

    # ── Plotting ─────────────────────────────────────────────────────────
    grid_idx_arr = np.array(CUTOFF_INDICES, dtype=np.float64)
    frac_x = grid_idx_arr / (N_GRID - 1)  # log-budget fraction

    fig = plt.figure(figsize=(16, 12))
    gs = fig.add_gridspec(3, 3, hspace=0.35, wspace=0.25)

    # Panel A — all curves overlaid, low alpha, colored by regime
    ax = fig.add_subplot(gs[0, :])
    regime_colors = {
        "converged": "tab:green",
        "worth-deepening": "tab:orange",
        "pathological": "tab:red",
        "mixed": "tab:gray",
        "noisy": "lightgray",
        "missing": "white",
    }
    n_plotted = 0
    for i in range(n_total):
        if regime_arr[i] in ("missing", "noisy"):
            continue
        ax.plot(frac_x, curves[i], color=regime_colors.get(regime_arr[i], "gray"),
                alpha=0.12, linewidth=0.6)
        n_plotted += 1
    # Mean curve per regime overlaid
    for regime in ("converged", "worth-deepening", "pathological"):
        mask = regime_arr == regime
        if mask.sum() == 0:
            continue
        mean_curve = np.nanmean(curves[mask], axis=0)
        ax.plot(frac_x, mean_curve, color=regime_colors[regime], linewidth=3.0,
                label=f"{regime} (mean, n={int(mask.sum())})")
    ax.set_xlabel("log-budget fraction (V_t / V_hi in log-V)")
    ax.set_ylabel("stable_fraction_logV(V_t → V_hi)")
    ax.set_title(f"per-V_t stability curves — top1_move ({n_plotted} positions)")
    ax.legend(loc="lower right")
    ax.grid(alpha=0.3)
    ax.set_ylim(-0.02, 1.02)

    # Panels B, C, D — example curves per regime
    rng = np.random.default_rng(seed=42)
    for ci, regime in enumerate(("converged", "worth-deepening", "pathological")):
        ax = fig.add_subplot(gs[1, ci])
        mask = regime_arr == regime
        idxs = np.where(mask)[0]
        sample_idxs = idxs if len(idxs) <= 30 else rng.choice(idxs, 30, replace=False)
        for i in sample_idxs:
            color = "tab:blue" if domain_arr[i] == "year2k" else "tab:purple"
            ax.plot(frac_x, curves[i], color=color, alpha=0.5, linewidth=1.0)
        if mask.sum() > 0:
            mean_curve = np.nanmean(curves[mask], axis=0)
            ax.plot(frac_x, mean_curve, color="black", linewidth=2.5,
                    label=f"mean (n={int(mask.sum())})")
        ax.set_title(f"{regime}\n(blue=year2k, purple=cards)")
        ax.set_xlabel("log-budget fraction")
        ax.set_ylabel("stable_fraction")
        ax.set_ylim(-0.02, 1.02)
        ax.grid(alpha=0.3)
        ax.legend(loc="lower right", fontsize=8)

    # Panel E — regime composition histograms by domain
    ax = fig.add_subplot(gs[2, 0])
    regimes_ordered = ["converged", "worth-deepening", "mixed", "pathological",
                       "noisy", "missing"]
    y2k_counts = [int((regime_arr[domain_arr == "year2k"] == r).sum())
                  for r in regimes_ordered]
    cards_counts = [int((regime_arr[domain_arr == "cards"] == r).sum())
                    for r in regimes_ordered]
    x = np.arange(len(regimes_ordered))
    width = 0.35
    ax.bar(x - width/2, y2k_counts, width, label="year2k", color="tab:blue")
    ax.bar(x + width/2, cards_counts, width, label="cards", color="tab:purple")
    ax.set_xticks(x)
    ax.set_xticklabels(regimes_ordered, rotation=30, ha="right")
    ax.set_ylabel("count")
    ax.set_title("regime population")
    ax.legend()
    ax.grid(alpha=0.3, axis="y")

    # Panel F — curve-shape summary scatter (max vs range)
    ax = fig.add_subplot(gs[2, 1])
    finite_mask = np.array([
        regime_arr[i] not in ("missing", "noisy") for i in range(n_total)
    ])
    if finite_mask.any():
        max_p = np.nanmax(curves[finite_mask], axis=1)
        min_p = np.nanmin(curves[finite_mask], axis=1)
        rng_p = max_p - min_p
        cols = [regime_colors.get(regime_arr[i], "gray")
                for i in np.where(finite_mask)[0]]
        ax.scatter(max_p, rng_p, c=cols, s=8, alpha=0.5)
        ax.set_xlabel("max P_stable across V_t")
        ax.set_ylabel("range (max - min) across V_t")
        ax.set_title("curve-shape map\n(color = regime)")
        ax.grid(alpha=0.3)
        ax.axhline(0.30, color="gray", linestyle="--", alpha=0.4)
        ax.axvline(0.50, color="gray", linestyle="--", alpha=0.4)
        ax.axvline(0.90, color="gray", linestyle="--", alpha=0.4)

    # Panel G — final-V_t P_stable distribution by domain
    ax = fig.add_subplot(gs[2, 2])
    last_p_y2k = []
    last_p_cards = []
    for i in range(n_total):
        if regime_arr[i] in ("missing", "noisy"):
            continue
        finite_idx = np.where(np.isfinite(curves[i]))[0]
        if not finite_idx.size:
            continue
        last_p = curves[i, finite_idx[-1]]
        if domain_arr[i] == "year2k":
            last_p_y2k.append(last_p)
        else:
            last_p_cards.append(last_p)
    bins = np.linspace(0, 1, 21)
    ax.hist(last_p_y2k, bins=bins, alpha=0.6, label="year2k", color="tab:blue")
    ax.hist(last_p_cards, bins=bins, alpha=0.6, label="cards", color="tab:purple")
    ax.set_xlabel(f"P_stable at largest V_t (grid_idx={CUTOFF_INDICES[-1]})")
    ax.set_ylabel("count")
    ax.set_title("last-cutoff P_stable distribution")
    ax.legend()
    ax.grid(alpha=0.3, axis="y")

    plot_path = args.out_dir / "per_v_curves_top1_move.png"
    fig.savefig(plot_path, dpi=110)
    plt.close(fig)
    print(f"\n  multi-panel plot: {plot_path}", flush=True)

    # Summary text
    summary_path = args.out_dir / "per_v_curves_summary.txt"
    with summary_path.open("w") as f:
        f.write(f"# per-V_t stable_fraction curves — top1_move\n")
        f.write(f"# cutoffs (grid index): {CUTOFF_INDICES}\n")
        f.write(f"# cutoffs (log-budget fraction): "
                f"{[f'{idx/(N_GRID-1):.3f}' for idx in CUTOFF_INDICES]}\n\n")
        f.write(f"# n_total={n_total} curves_computed={len(curve_by_key)}\n\n")
        f.write(f"# regime counts (overall):\n")
        for k, v in overall_count.most_common():
            f.write(f"    {k:18s} {v:5d}\n")
        for dom in ("year2k", "cards"):
            mask = domain_arr == dom
            cnt = Counter(regime_arr[mask].tolist())
            f.write(f"\n# regime counts ({dom}):\n")
            for k, v in cnt.most_common():
                f.write(f"    {k:18s} {v:5d}\n")
        # Per-regime curve mean as a quick table
        f.write(f"\n# mean curves per regime:\n")
        f.write(f"#   grid_idx: {CUTOFF_INDICES}\n")
        for regime in ("converged", "worth-deepening", "mixed", "pathological"):
            mask = regime_arr == regime
            if mask.sum() == 0:
                continue
            mean_curve = np.nanmean(curves[mask], axis=0)
            f.write(f"  {regime:18s} (n={int(mask.sum()):4d}): "
                    + "  ".join(f"{v:5.3f}" for v in mean_curve) + "\n")
    print(f"  summary: {summary_path}", flush=True)


if __name__ == "__main__":
    main()
