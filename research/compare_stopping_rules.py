"""
research/compare_stopping_rules.py

Compare three stopping-rule families on a single trained per-packet
classifier. For each (extractor, threshold) cell, runs:

  (1) Threshold rule (current production): walk cutoffs in order;
      stop at first V_t where P_stable > τ. τ sweep traces a curve.

  (2) Marginal-value with classifier P-trajectory (oracle look-ahead
      on P, NOT truth): per position, pick the cutoff that maximises
        argmax_k ( P_stable_k - λ · V_at_cutoff[k] ).
      λ sweep traces a curve. This is NOT deployment-feasible (it
      assumes the SPA can see P_stable at all cutoffs before
      committing) but bounds what a learnable look-ahead approach
      could in principle achieve, conditional on the classifier
      being a reliable ranker of per-cutoff P.

  (3) Marginal-value with true-agreement trajectory (absolute oracle):
      per position, pick
        argmax_k ( agree_at_cutoff[k] - λ · V_at_cutoff[k] ).
      Uses ground truth — bounds what ANY stopping rule can achieve.

Plot overlays all three Pareto curves per cell.

If (3) >> (1), the threshold rule is leaving operational headroom on
the table; (2) shows whether the classifier sees enough of that
headroom to be worth pursuing a learnable look-ahead policy. If (1)
≈ (2) ≈ (3), the threshold rule is near-optimal and look-ahead isn't
worth the complexity.

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

import allocator_sim_per_packet as app  # noqa: E402
from allocator_sim import baseline_always_vmax_agreement  # noqa: E402


def pareto_filter(visits: np.ndarray, agree: np.ndarray) -> np.ndarray:
    """Indices of the Pareto-optimal subset (min visits, max agreement),
    sorted by visits ascending. Drops dominated points and NaN points."""
    n = len(visits)
    keep = np.zeros(n, dtype=bool)
    for i in range(n):
        vi, ai = float(visits[i]), float(agree[i])
        if not (np.isfinite(vi) and np.isfinite(ai)):
            continue
        dom = False
        for j in range(n):
            if i == j:
                continue
            vj, aj = float(visits[j]), float(agree[j])
            if not (np.isfinite(vj) and np.isfinite(aj)):
                continue
            if vj <= vi and aj >= ai and (vj < vi or aj > ai):
                dom = True
                break
        if not dom:
            keep[i] = True
    idx = np.where(keep)[0]
    order = np.argsort(visits[idx])
    return idx[order]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--cache",
        default=Path(__file__).resolve().parent / "data" / "trajectory_cache.npz",
        type=Path,
    )
    ap.add_argument(
        "--out-dir",
        default=Path.home() / "plots" / "compare_stopping_rules",
        type=Path,
    )
    ap.add_argument("--f-max", default=0.85, type=float,
                    help="Per-bootstrap-confirmed best operating point")
    ap.add_argument("--threshold", default=0.95, type=float)
    ap.add_argument(
        "--extractors", nargs="+",
        default=["top1_move", "top2_margin_quintile", "top3_set"],
    )
    ap.add_argument("--n-folds", default=5, type=int)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--batch-size", type=int, default=8)
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    print("=== compare stopping rules ===", flush=True)
    print(f"  f_max={args.f_max:.3f}  threshold={args.threshold:.3f}",
          flush=True)
    print(f"  extractors: {args.extractors}", flush=True)

    cache_npz = np.load(args.cache, allow_pickle=True)
    cache = {k: cache_npz[k] for k in cache_npz.files}
    domains = np.array(cache["domains"], dtype=object)
    cards_idx = np.where(domains == "cards")[0]
    cards_data = app.slice_cache(cache, cards_idx)

    # Thin-fetch coverage
    from pg_sink import connect, count_thin_coverage
    try:
        conn = connect()
        n_thin, n_total = count_thin_coverage(conn)
        conn.close()
        if n_thin / max(n_total, 1) >= 0.999:
            app._USE_THIN = True
    except Exception:
        pass

    # Phase A (cached for the matching f_max)
    print("\n=== Phase A ===", flush=True)
    stability_data = app.phase_a_build_per_packet(
        cache, f_max=args.f_max, workers=args.workers,
        batch_size=args.batch_size,
    )

    N_GRID = int(np.asarray(cache["N_GRID"]).flat[0])
    max_idx = min(N_GRID - 1, int(round(N_GRID * args.f_max)) - 1)
    runtime_cutoffs = [c for c in app.CUTOFF_INDICES if c < max_idx]
    print(f"  runtime_cutoffs: {runtime_cutoffs}", flush=True)

    print("\n=== Phase B substrate + sim substrate ===", flush=True)
    t0 = time.monotonic()
    phaseb_sub = app.build_phase_b_substrate_per_packet(
        cache, stability_data, f_max=args.f_max,
        cutoff_indices=runtime_cutoffs,
    )
    sim_sub = app._precompute_cards_per_packet_sim_substrate(
        cards_data, f_max=args.f_max, cutoff_indices=runtime_cutoffs,
    )
    print(f"  built in {time.monotonic()-t0:.1f}s", flush=True)

    baseline = baseline_always_vmax_agreement(cards_data, "scoreLead_drift")
    print(f"\n  baseline (always V_max): visits={baseline['avg_visits']:.0f}  "
          f"agree={baseline['agreement']:.4f}  n={baseline['n']}", flush=True)

    # τ grid for threshold sim; λ grid log-spaced for marginal-value
    tau_grid = np.linspace(0.05, 0.99, 25)
    lambda_grid = np.concatenate([
        np.array([0.0]),
        10 ** np.linspace(-6, -3, 25),
    ])

    summary_lines: list[str] = []
    summary_lines.append("# compare_stopping_rules — top1_move + family")
    summary_lines.append(f"# f_max={args.f_max:.3f}  label_threshold={args.threshold:.3f}")
    summary_lines.append(f"# baseline (always V_max): visits={baseline['avg_visits']:.0f}  "
                          f"agree={baseline['agreement']:.4f}\n")

    n_cells = len(args.extractors)
    fig, axes = plt.subplots(1, n_cells, figsize=(7 * n_cells, 6), squeeze=False)
    axes = axes[0]

    for ei, extractor_name in enumerate(args.extractors):
        print(f"\n=== extractor: {extractor_name} ===", flush=True)
        X, y, g, d, _c = app.materialize_labels_for_cell(
            phaseb_sub, extractor_name, args.threshold,
        )
        if len(X) < 50:
            print(f"  too few rows ({len(X)}); skipping", flush=True)
            continue
        clf = app.train_classifier_and_eval(X, y, g, d, args.n_folds)
        if "error" in clf:
            print(f"  classifier error: {clf['error']}", flush=True)
            continue
        print(f"  AUC: within={clf['auc_within']:+.4f}  OOD={clf['auc_ood']:+.4f}",
              flush=True)

        # Three sims
        sim_threshold = app.simulate_per_packet_allocator(
            sim_sub, clf["predictor"], tau_grid,
        )
        sim_pstable_oracle = app.simulate_marginal_value_allocator(
            sim_sub, clf["predictor"], lambda_grid,
            use_true_agreement=False,
        )
        sim_truth_oracle = app.simulate_marginal_value_allocator(
            sim_sub, clf["predictor"], lambda_grid,
            use_true_agreement=True,
        )

        # Pareto filter each
        for sim, label in (
            (sim_threshold, "threshold"),
            (sim_pstable_oracle, "marginal-value (P-oracle)"),
            (sim_truth_oracle, "marginal-value (truth-oracle)"),
        ):
            front_idx = pareto_filter(sim["avg_visits"], sim["agreement"])
            sim["pareto_idx"] = front_idx

        ax = axes[ei]
        # Threshold (existing rule, light line)
        idx = sim_threshold["pareto_idx"]
        ax.plot(sim_threshold["avg_visits"][idx],
                sim_threshold["agreement"][idx],
                marker="o", linestyle="-", color="tab:blue", linewidth=1.6,
                label=f"threshold (τ sweep, n_pareto={len(idx)})")
        # P-oracle marginal-value
        idx = sim_pstable_oracle["pareto_idx"]
        ax.plot(sim_pstable_oracle["avg_visits"][idx],
                sim_pstable_oracle["agreement"][idx],
                marker="s", linestyle="-", color="tab:orange", linewidth=1.6,
                label=f"marg-val (P-oracle, λ sweep, n_pareto={len(idx)})")
        # Truth oracle
        idx = sim_truth_oracle["pareto_idx"]
        ax.plot(sim_truth_oracle["avg_visits"][idx],
                sim_truth_oracle["agreement"][idx],
                marker="*", linestyle="--", color="tab:green", linewidth=1.6,
                label=f"marg-val (truth-oracle, ABSOLUTE UB, n_pareto={len(idx)})")
        ax.scatter([baseline["avg_visits"]], [baseline["agreement"]],
                   color="black", s=160, marker="*",
                   label=f"baseline V_max ({baseline['avg_visits']:.0f}, {baseline['agreement']:.3f})")
        ax.set_xlabel("avg visits at stop")
        ax.set_ylabel("top-1 agreement")
        ax.set_title(f"{extractor_name}\nAUC OOD = {clf['auc_ood']:+.4f}")
        ax.grid(alpha=0.3)
        ax.legend(loc="lower right", fontsize=8)

        # Headline summary numbers per cell
        def gap_at_visits(sim_a, sim_b, target_visits=2000.0) -> float:
            """At ~target_visits, how much better is sim_b than sim_a on agreement?"""
            ia = sim_a["pareto_idx"]
            ib = sim_b["pareto_idx"]
            if len(ia) == 0 or len(ib) == 0:
                return float("nan")
            va = sim_a["avg_visits"][ia]
            aa = sim_a["agreement"][ia]
            vb = sim_b["avg_visits"][ib]
            ab = sim_b["agreement"][ib]
            agree_a = float(np.interp(target_visits, va, aa,
                                      left=aa[0], right=aa[-1]))
            agree_b = float(np.interp(target_visits, vb, ab,
                                      left=ab[0], right=ab[-1]))
            return agree_b - agree_a

        summary_lines.append(f"## {extractor_name}")
        summary_lines.append(f"  AUC within = {clf['auc_within']:+.4f}  OOD = {clf['auc_ood']:+.4f}")
        for tv in (1500.0, 3000.0, 6000.0, 10000.0):
            gap_p = gap_at_visits(sim_threshold, sim_pstable_oracle, tv)
            gap_t = gap_at_visits(sim_threshold, sim_truth_oracle, tv)
            summary_lines.append(
                f"  at avg V≈{tv:>5.0f}:  "
                f"marg(P) − threshold = {gap_p:+.4f}    "
                f"truth − threshold = {gap_t:+.4f}"
            )
        summary_lines.append("")

    fig.suptitle(
        f"Stopping-rule comparison — f_max={args.f_max:.2f}, "
        f"threshold={args.threshold:.2f}\n"
        f"(curves further up-and-left = better; truth-oracle is absolute UB)",
        fontsize=12,
    )
    fig.tight_layout()
    plot_path = args.out_dir / f"compare_stopping_rules_f_max_{args.f_max:.3f}.png"
    fig.savefig(plot_path, dpi=120)
    plt.close(fig)
    print(f"\n  multi-panel plot: {plot_path}", flush=True)

    summary_path = args.out_dir / f"compare_stopping_rules_f_max_{args.f_max:.3f}.txt"
    with summary_path.open("w") as f:
        f.write("\n".join(summary_lines))
    print(f"  summary:        {summary_path}", flush=True)
    for line in summary_lines:
        print(line, flush=True)


if __name__ == "__main__":
    main()
