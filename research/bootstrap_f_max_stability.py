"""
research/bootstrap_f_max_stability.py

Bootstrap-resample the year2k training positions and retrain the
per-packet stability classifier per f_max value. Report the AUC OOD
distribution (mean, std, 5th/95th percentile) per f_max so we can
read whether the apparent +0.02 AUC OOD lift at f_max=0.85 vs
f_max=1.0 survives training-set noise.

Bootstrap definition: sample n_y2k positions with replacement from
the year2k set; build a substrate restricted to those positions
(replicated for replacement-with-duplicates); train a full-fit
LightGBMClassifier; eval AUC OOD on the (fixed) cards.db slice.

Scope kept small for tractability: 2 extractors × 1 threshold ×
3–4 f_max values × N bootstraps. ~5s per fit, so 80–100 fits ≈
8–10 min.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.metrics import roc_auc_score

sys.path.insert(0, str(Path(__file__).resolve().parent))

import allocator_sim_per_packet as app  # noqa: E402
import pg_sink  # noqa: E402


def bootstrap_one_f_max(
    cache: dict, f_max: float, n_bootstrap: int,
    extractors: list[str], threshold: float,
    rng: np.random.Generator,
) -> dict[str, list[float]]:
    """Run n_bootstrap re-trains at this f_max. Returns {extractor:
    [AUC_OOD per bootstrap]}."""
    # Build substrate once (cached labels already on disk)
    print(f"\n--- f_max={f_max:.3f} ---", flush=True)
    t0 = time.monotonic()
    app._USE_THIN = True  # we know coverage is full
    stability_data = app.phase_a_build_per_packet(
        cache, f_max=f_max, workers=4, batch_size=8,
    )
    N_GRID = int(np.asarray(cache["N_GRID"]).flat[0])
    max_idx = min(N_GRID - 1, int(round(N_GRID * f_max)) - 1)
    runtime_cutoffs = [c for c in app.CUTOFF_INDICES if c < max_idx]
    sub = app.build_phase_b_substrate_per_packet(
        cache, stability_data, f_max=f_max,
        cutoff_indices=runtime_cutoffs,
    )
    print(f"  substrate built in {time.monotonic()-t0:.1f}s; "
          f"X={sub['X'].shape}", flush=True)

    # Pre-extract domain masks once
    domains = sub["domains"]
    groups = sub["groups"]
    X = sub["X"]
    y2k_rows = np.where(domains == "year2k")[0]
    cards_rows = np.where(domains == "cards")[0]
    y2k_groups = np.unique(groups[y2k_rows])

    results: dict[str, list[float]] = {ext: [] for ext in extractors}
    import lightgbm as lgb

    for b in range(n_bootstrap):
        # Bootstrap: sample year2k POSITIONS (groups) with replacement,
        # then expand to row indices. Each sampled position contributes
        # all of its substrate rows. We may include the same position
        # multiple times.
        sampled_groups = rng.choice(
            y2k_groups, size=len(y2k_groups), replace=True,
        )
        # Build row index for sampled positions
        rows_per_group: dict[int, np.ndarray] = {
            int(g): np.where((groups == g) & (domains == "year2k"))[0]
            for g in y2k_groups
        }
        sampled_rows = np.concatenate(
            [rows_per_group[int(g)] for g in sampled_groups]
        )
        for ext in extractors:
            frac = sub["frac_by_extractor"].get(ext)
            if frac is None:
                continue
            # Train set
            tr_mask = np.isfinite(frac[sampled_rows])
            X_tr = X[sampled_rows][tr_mask]
            y_tr = (frac[sampled_rows][tr_mask] >= threshold).astype(np.int32)
            if len(set(y_tr.tolist())) < 2:
                results[ext].append(float("nan"))
                continue
            # Test set (fixed cards)
            test_frac = frac[cards_rows]
            te_mask = np.isfinite(test_frac)
            X_te = X[cards_rows][te_mask]
            y_te = (test_frac[te_mask] >= threshold).astype(np.int32)
            if len(set(y_te.tolist())) < 2:
                results[ext].append(float("nan"))
                continue
            m = lgb.LGBMClassifier(
                n_estimators=200, num_leaves=15, min_data_in_leaf=5,
                learning_rate=0.05, reg_lambda=0.1, verbose=-1,
            )
            m.fit(X_tr, y_tr)
            probs = m.predict_proba(X_te)[:, 1]
            try:
                auc = float(roc_auc_score(y_te, probs))
            except ValueError:
                auc = float("nan")
            results[ext].append(auc)
        if (b + 1) % max(1, n_bootstrap // 5) == 0 or b == n_bootstrap - 1:
            print(f"  bootstrap [{b+1}/{n_bootstrap}]  "
                  f"elapsed {time.monotonic()-t0:.0f}s", flush=True)
    return results


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--cache",
        default=Path(__file__).resolve().parent / "data" / "trajectory_cache.npz",
        type=Path,
    )
    ap.add_argument("--n-bootstrap", type=int, default=20)
    ap.add_argument(
        "--f-max-values", nargs="+", type=float,
        default=[0.70, 0.85, 1.0],
    )
    ap.add_argument(
        "--extractors", nargs="+",
        default=["top1_move", "top2_margin_quintile", "top3_set"],
    )
    ap.add_argument("--threshold", type=float, default=0.95)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    print(f"=== bootstrap f_max stability ===", flush=True)
    print(f"  f_max:       {args.f_max_values}", flush=True)
    print(f"  extractors:  {args.extractors}", flush=True)
    print(f"  threshold:   {args.threshold}", flush=True)
    print(f"  n_bootstrap: {args.n_bootstrap}", flush=True)
    print(f"  seed:        {args.seed}", flush=True)

    rng = np.random.default_rng(args.seed)
    cache_npz = np.load(args.cache, allow_pickle=True)
    cache = {k: cache_npz[k] for k in cache_npz.files}

    all_results: dict[float, dict[str, list[float]]] = {}
    for f_max in args.f_max_values:
        all_results[f_max] = bootstrap_one_f_max(
            cache, f_max, args.n_bootstrap,
            args.extractors, args.threshold, rng,
        )

    # Report
    print(f"\n=== summary (AUC OOD distribution per (extractor, f_max)) ===",
          flush=True)
    for ext in args.extractors:
        print(f"\n## {ext}  threshold={args.threshold}", flush=True)
        print(f"  {'f_max':>6s}  {'mean':>7s}  {'std':>7s}  "
              f"{'p5':>7s}  {'p50':>7s}  {'p95':>7s}  {'n_valid':>8s}", flush=True)
        for f_max in args.f_max_values:
            arr = np.array(all_results[f_max][ext], dtype=float)
            valid = arr[np.isfinite(arr)]
            if valid.size == 0:
                print(f"  {f_max:>6.3f}  no valid bootstraps", flush=True)
                continue
            print(f"  {f_max:>6.3f}  "
                  f"{valid.mean():>+7.4f}  "
                  f"{valid.std():>7.4f}  "
                  f"{np.percentile(valid, 5):>+7.4f}  "
                  f"{np.percentile(valid, 50):>+7.4f}  "
                  f"{np.percentile(valid, 95):>+7.4f}  "
                  f"{valid.size:>8d}", flush=True)

        # Pairwise comparisons: how often does f_max=A beat f_max=B?
        if len(args.f_max_values) >= 2:
            print(f"\n  pairwise win rates (rows of A wins vs cols of B):", flush=True)
            arrs = {fm: np.array(all_results[fm][ext], dtype=float)
                    for fm in args.f_max_values}
            min_n = min(np.isfinite(a).sum() for a in arrs.values())
            if min_n < args.n_bootstrap:
                print(f"  (NaN-pruned to min n_valid={min_n})", flush=True)
            print(f"  {'A\\B':>6s}  " + "  ".join(
                f"{fm:>6.2f}" for fm in args.f_max_values
            ), flush=True)
            for a in args.f_max_values:
                row = f"  {a:>6.3f}  "
                for b in args.f_max_values:
                    if a == b:
                        row += f"  {'-':>6s}"
                        continue
                    # Paired wins: bootstrap i compared to bootstrap i
                    # for both A and B.
                    aa = arrs[a]
                    bb = arrs[b]
                    n = min(len(aa), len(bb))
                    paired = (aa[:n] > bb[:n]) & np.isfinite(aa[:n]) & np.isfinite(bb[:n])
                    n_valid = (np.isfinite(aa[:n]) & np.isfinite(bb[:n])).sum()
                    if n_valid == 0:
                        row += f"  {'n/a':>6s}"
                    else:
                        row += f"  {paired.sum()/n_valid:>6.2%}"
                print(row, flush=True)


if __name__ == "__main__":
    main()
