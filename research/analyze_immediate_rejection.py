"""
research/analyze_immediate_rejection.py

For the production scenario where the SPA fires an initial range query
of B_initial visits per position, then *optionally* deepens by some
adaptive budget to a total of B_total visits — this script measures
what fraction of positions can be safely skipped from the deepening
step based purely on the V_t=B_initial observation.

Concretely, per position we compute (averaged across realizations):

  P_skip(B_initial, B_total) := stable_fraction_logV(
      V_t       = B_initial,
      V_max     = B_total,
      extractor = top1_move,
  )

This is the V-log-weighted fraction of [B_initial, B_total] where the
top-1 move stayed equal to its value at V_t. When this is ≥ τ, the
SPA's V_t answer matches the would-be V=B_total answer; the adaptive
deepening adds nothing and can be skipped.

Output:
  - Per-position matrix of P_skip across a (B_initial, B_total) grid.
  - Aggregate "fraction of positions with P_skip ≥ τ" table, split by
    domain (year2k / cards) and by threshold τ.

Caveats called out in the summary:
  - At small B_total (close to B_initial), the window is narrow and
    most positions appear "stable" simply because not enough search
    has happened to observe a flip. The script also reports per-
    position change-point counts in each (B_initial, B_total) window
    so the user can see when the window is too narrow for the metric
    to be informative.
  - Positions where V_lo > B_initial have no observation at V_t and
    are excluded (counted separately).
  - The b10c128 testbed net is used; transfer to production nets
    (b28 etc.) is a separate question — see
    [[project_b10_testbed_intent]].

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import multiprocessing as mp
import sys
import time
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pg_sink import connect, fetch_positions_bundle_thin_batch  # noqa: E402
from stability_trajectory import StabilityTrajectory, extract_top1_move  # noqa: E402


# Production-realistic budgets to evaluate. B_initial = first-stream
# range-query budget; B_total = post-adaptive endpoint. The cells of
# interest are (B_initial < B_total).
B_INITIAL_VALUES = [100, 200, 400]
B_TOTAL_VALUES   = [200, 400, 800, 1500, 3000, 7000, 14000]
TAU_VALUES       = [0.70, 0.80, 0.90, 0.95, 0.99]


# ── Per-position computation ───────────────────────────────────────────────

def _build_top1_change_points(packets) -> tuple[list, float, int]:
    cps = []
    sentinel = object()
    prev = sentinel
    last_V = 0.0
    n = 0
    UNK = StabilityTrajectory._UNKNOWN
    for _t_pkt, pkt in packets:
        V = float((pkt.get("rootInfo") or {}).get("visits", 0))
        val = extract_top1_move(pkt)
        tagged = val if val is not None else UNK
        if prev is sentinel or tagged != prev:
            cps.append((V, tagged))
            prev = tagged
        last_V = V
        n += 1
    return cps, last_V, n


def _per_position_pskip_matrix(
    bundle: dict, V_lo: float, V_hi: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray] | None:
    """Returns (P_skip_matrix, n_changepoints_in_window, n_realizations)
    where:
      P_skip_matrix[i, j] = stable_fraction_logV(B_init[i], B_total[j])
                            averaged across the position's realizations
                            where the realization's first packet is at
                            V ≤ B_init[i] (i.e. V_t is observable). Cells
                            with no observable realization are NaN.
      n_changepoints_in_window[i, j] = mean number of top-1 flips in
                            the [B_init[i], B_total[j]] window across
                            realizations (low → small-window confound;
                            high → genuinely unstable)
      n_realizations = how many realizations contributed at any cell.

    The cache's V_lo (passed in but not used here for filtering) is
    max(V_firsts) across realizations and is generally NOT the per-
    realization first-packet V — realizations have packets at lower V
    that the per-position grid doesn't expose. stable_fraction_logV
    returns NaN when V_t precedes the realization's first change-point,
    which we count via pskip_count to expose the observability rate.

    Returns None if no realization had ANY usable cell."""
    n_bi = len(B_INITIAL_VALUES)
    n_bt = len(B_TOTAL_VALUES)
    pskip_sum = np.zeros((n_bi, n_bt))
    pskip_count = np.zeros((n_bi, n_bt), dtype=np.int32)
    cps_sum = np.zeros((n_bi, n_bt))
    n_reals = 0
    for _r_idx, packets in bundle.items():
        if not packets:
            continue
        cps, last_V, n_pkts = _build_top1_change_points(packets)
        if not cps or n_pkts < 4:
            continue
        traj = StabilityTrajectory.from_changepoints(
            cps, V_max=last_V, n_packets=n_pkts,
        )
        for i, b_init in enumerate(B_INITIAL_VALUES):
            for j, b_tot in enumerate(B_TOTAL_VALUES):
                if b_tot <= b_init:
                    continue  # degenerate window
                if b_tot > last_V:
                    continue  # extends past the trajectory's recorded ceiling
                # Don't pre-filter on V_lo — stable_fraction_logV returns
                # NaN if V_t is before the realization's first change-
                # point, which is the right per-realization behavior.
                frac, _ = traj.stable_fraction_logV(b_init, V_max=b_tot)
                if not np.isfinite(frac):
                    continue
                pskip_sum[i, j] += frac
                pskip_count[i, j] += 1
                cp_Vs = traj._cp_Vs
                n_cps_in = sum(1 for v in cp_Vs if b_init < v < b_tot)
                cps_sum[i, j] += n_cps_in
        n_reals += 1
    if n_reals == 0 or pskip_count.sum() == 0:
        return None
    out_pskip = np.full((n_bi, n_bt), np.nan)
    out_cps = np.full((n_bi, n_bt), np.nan)
    valid = pskip_count > 0
    out_pskip[valid] = pskip_sum[valid] / pskip_count[valid]
    out_cps[valid] = cps_sum[valid] / pskip_count[valid]
    # Also expose per-cell observability count via a small payload
    # (returned as a flat sum count for now; richer reporting is the
    # per-realization observation rate which we surface in the
    # n_observed column of the summary table).
    return out_pskip, out_cps, np.int32(n_reals)


# ── Worker ─────────────────────────────────────────────────────────────────

_WORKER_CONN = None


def _worker_init() -> None:
    global _WORKER_CONN
    _WORKER_CONN = connect()


def _worker_compute_chunk(
    chunk: list[tuple[str, int, float, float]],
) -> list[tuple[str, int, dict | None]]:
    conn = _WORKER_CONN if _WORKER_CONN is not None else connect()
    keys = [(s, t) for s, t, _vlo, _vhi in chunk]
    bundles = fetch_positions_bundle_thin_batch(conn, keys)
    out: list[tuple[str, int, dict | None]] = []
    for stem, turn, V_lo, V_hi in chunk:
        bundle = bundles.get((stem, turn))
        if not bundle:
            out.append((stem, turn, None))
            continue
        res = _per_position_pskip_matrix(bundle, V_lo, V_hi)
        if res is None:
            out.append((stem, turn, None))
            continue
        pskip_m, cps_m, n_reals = res
        out.append((stem, turn, {
            "pskip": pskip_m, "cps": cps_m, "n_reals": int(n_reals),
            "V_lo": V_lo, "V_hi": V_hi,
        }))
    return out


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
        default=Path.home() / "plots" / "immediate_rejection",
        type=Path,
    )
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--batch-size", type=int, default=8)
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    print("=== immediate-rejection-rate analysis (top1_move) ===", flush=True)
    print(f"  B_initial: {B_INITIAL_VALUES}", flush=True)
    print(f"  B_total:   {B_TOTAL_VALUES}", flush=True)
    print(f"  τ:         {TAU_VALUES}", flush=True)

    cache_npz = np.load(args.cache, allow_pickle=True)
    cache = {k: cache_npz[k] for k in cache_npz.files}
    domains = np.array(cache["domains"], dtype=object)
    stems = np.array(cache["stems"], dtype=object)
    turns = np.array(cache["turns"], dtype=np.int32)
    V_lo = np.asarray(cache["V_lo"], dtype=np.float64)
    V_hi = np.asarray(cache["V_hi"], dtype=np.float64)
    n_total = len(stems)

    work: list[tuple[str, int, float, float]] = []
    for i in range(n_total):
        vlo = float(V_lo[i])
        vhi = float(V_hi[i])
        if not (np.isfinite(vlo) and np.isfinite(vhi) and vlo < vhi):
            continue
        work.append((str(stems[i]), int(turns[i]), vlo, vhi))

    chunks = [work[k:k + args.batch_size] for k in range(0, len(work), args.batch_size)]
    n_chunks = len(chunks)
    print(f"  positions: {n_total}  chunks: {n_chunks}", flush=True)

    t0 = time.monotonic()
    per_pos: dict[tuple[str, int], dict] = {}
    chunks_done = 0
    with mp.Pool(processes=args.workers, initializer=_worker_init) as pool:
        for batch_out in pool.imap_unordered(_worker_compute_chunk, chunks):
            for stem, turn, data in batch_out:
                if data is not None:
                    per_pos[(stem, turn)] = data
            chunks_done += 1
            if chunks_done % max(1, n_chunks // 20) == 0 or chunks_done == n_chunks:
                dt = time.monotonic() - t0
                rate = chunks_done / max(dt, 1e-9)
                eta = (n_chunks - chunks_done) / max(rate, 1e-9)
                print(f"  [{chunks_done}/{n_chunks}] {rate:.1f} chunks/s  "
                      f"got={len(per_pos)}  elapsed={dt:.0f}s eta={eta:.0f}s",
                      flush=True)
    print(f"  done in {time.monotonic() - t0:.1f}s; {len(per_pos)} positions computed",
          flush=True)

    # ── Aggregate ────────────────────────────────────────────────────────
    # Stack per-position matrices in cache order (skip missing).
    n_bi = len(B_INITIAL_VALUES)
    n_bt = len(B_TOTAL_VALUES)
    pskip_all = np.full((n_total, n_bi, n_bt), np.nan)
    cps_all = np.full((n_total, n_bi, n_bt), np.nan)
    valid_pos = np.zeros(n_total, dtype=bool)
    for i in range(n_total):
        key = (str(stems[i]), int(turns[i]))
        d = per_pos.get(key)
        if d is None:
            continue
        pskip_all[i] = d["pskip"]
        cps_all[i] = d["cps"]
        valid_pos[i] = True

    # For each (B_init, B_total, τ), compute fraction of valid positions
    # with averaged P_skip ≥ τ, split by domain.
    summary_path = args.out_dir / "immediate_rejection_summary.txt"
    with summary_path.open("w") as f:
        f.write("# immediate-rejection-rate — top1_move extractor\n")
        f.write(f"# B_initial values: {B_INITIAL_VALUES}\n")
        f.write(f"# B_total values:   {B_TOTAL_VALUES}\n")
        f.write(f"# thresholds:       {TAU_VALUES}\n\n")
        f.write(f"# n_total={n_total}  n_valid_positions={int(valid_pos.sum())}\n")
        f.write(f"#   year2k={int((domains[valid_pos]=='year2k').sum())}  "
                f"cards={int((domains[valid_pos]=='cards').sum())}\n\n")

        def cohort(name: str, mask: np.ndarray) -> None:
            n = int(mask.sum())
            f.write(f"\n## {name}  (n={n} positions)\n\n")
            for i, b_init in enumerate(B_INITIAL_VALUES):
                f.write(f"### B_initial = {b_init}\n")
                # Header row
                header = f"{'B_total':>8s}  {'n_pos':>5s}  " + "  ".join(
                    f"τ≥{tau:>4.2f}" for tau in TAU_VALUES
                ) + f"  {'mean_cps':>9s}"
                f.write(header + "\n")
                for j, b_tot in enumerate(B_TOTAL_VALUES):
                    if b_tot <= b_init:
                        continue
                    col = pskip_all[mask, i, j]
                    cps_col = cps_all[mask, i, j]
                    n_observed = int(np.isfinite(col).sum())
                    row = f"{b_tot:>8d}  {n_observed:>5d}  "
                    for tau in TAU_VALUES:
                        frac_above = float(np.nanmean(col >= tau)) if n_observed > 0 else float("nan")
                        row += f"  {frac_above:6.3f}"
                    mean_cps = float(np.nanmean(cps_col)) if n_observed > 0 else float("nan")
                    row += f"  {mean_cps:>9.3f}"
                    f.write(row + "\n")
                f.write("\n")

        # Whole corpus + per-domain breakouts.
        cohort("ALL", valid_pos)
        cohort("year2k", valid_pos & (domains == "year2k"))
        cohort("cards", valid_pos & (domains == "cards"))

        f.write("\n# Reading the table:\n")
        f.write("#   τ≥X column: fraction of positions whose top-1 at V_t=B_initial\n")
        f.write("#   matches the modal top-1 in (B_initial, B_total] in ≥X of the\n")
        f.write("#   log-V-weighted window. High → safe to skip adaptive at this B.\n")
        f.write("#   mean_cps: average number of top-1 change-points in the window.\n")
        f.write("#   When mean_cps is near 0, the window is too narrow to observe\n")
        f.write("#   instability — high P_skip there is a small-window artifact.\n")

    print(f"  summary: {summary_path}", flush=True)

    # ── Plot: P_skip CDF per B_total at B_initial=200 ─────────────────────
    fig, axes = plt.subplots(1, 3, figsize=(16, 5))
    bi_to_plot = B_INITIAL_VALUES.index(200) if 200 in B_INITIAL_VALUES else 0
    for ax_idx, (cohort_name, mask, color_map) in enumerate([
        ("ALL", valid_pos, plt.cm.viridis),
        ("year2k", valid_pos & (domains == "year2k"), plt.cm.viridis),
        ("cards", valid_pos & (domains == "cards"), plt.cm.viridis),
    ]):
        ax = axes[ax_idx]
        for j, b_tot in enumerate(B_TOTAL_VALUES):
            if b_tot <= B_INITIAL_VALUES[bi_to_plot]:
                continue
            col = pskip_all[mask, bi_to_plot, j]
            col = col[np.isfinite(col)]
            if col.size == 0:
                continue
            xs = np.sort(col)
            ys = 1.0 - np.arange(len(xs)) / len(xs)  # P(P_skip ≥ x)
            color = color_map(j / max(len(B_TOTAL_VALUES) - 1, 1))
            ax.plot(xs, ys, color=color, linewidth=1.6,
                    label=f"B_tot={b_tot}")
        for tau in (0.90, 0.95):
            ax.axvline(tau, color="gray", linestyle=":", alpha=0.5)
        ax.set_xlabel(f"P_skip threshold τ  (P_skip from V_t={B_INITIAL_VALUES[bi_to_plot]} to V_max=B_tot)")
        ax.set_ylabel("fraction of positions with P_skip ≥ τ")
        ax.set_title(f"{cohort_name}  (n={int(mask.sum())})")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.legend(loc="upper right", fontsize=8)
        ax.grid(alpha=0.3)
    fig.suptitle(
        f"Immediate-rejection rate at B_initial={B_INITIAL_VALUES[bi_to_plot]} — "
        f"top1_move\n"
        f"(curves further left = more positions skippable at any τ; "
        f"narrower-B_tot lines may be high due to small-window artifact)",
        fontsize=11,
    )
    fig.tight_layout()
    plot_path = args.out_dir / f"immediate_rejection_B_initial_{B_INITIAL_VALUES[bi_to_plot]}.png"
    fig.savefig(plot_path, dpi=110)
    plt.close(fig)
    print(f"  plot: {plot_path}", flush=True)


if __name__ == "__main__":
    main()
