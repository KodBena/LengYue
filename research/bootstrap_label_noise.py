"""
research/bootstrap_label_noise.py

Tier-0 diagnostic per the 2026-05-20 firewall consultation
(research/notes/firewall-strategic-2026-05-20.md §3 Tier 0).

For each position with N realizations, repeatedly resample N
realizations with replacement, average their trajectories per target,
fit (H, κ, …) per family on each bootstrap iteration. The bootstrap
variance per (position, target, family, param) estimates label
noise; comparing to across-position label variance gives the R²
ceiling per the decomposition:

    Var(label) = Var(true) + Var(noise)
    R²_ceiling = 1 − Var(noise) / Var(label)

Outputs:
  - CSV (`/tmp/bootstrap_noise.csv`) with per-(position, target,
    family, param) bootstrap stats.
  - Summary text + per-(target, family, param) ceiling estimates.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from curve_families import FAMILIES, CurveFamily  # noqa: E402
from fit_averaged import averaged_trajectory_for_target  # noqa: E402
from fit_hyperbolic import VALUE_CANDIDATES  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_positions, list_realizations, realization_as_flat_arrays,
)


def bootstrap_position(
    realizations: list[dict],
    families: list[CurveFamily],
    rng: np.random.Generator,
    n_bootstrap: int,
) -> dict:
    """For one position, run n_bootstrap iterations of:
    (1) resample realizations with replacement,
    (2) average their trajectories per target,
    (3) fit each family per target.

    Returns dict keyed by (target, family) → dict with:
      params_array: shape (n_bootstrap, n_params)
      param_names: tuple of param names
      statuses: list of status strings
    """
    n_real = len(realizations)
    out: dict[tuple[str, str], dict] = {}

    for tname, value_fn in VALUE_CANDIDATES.items():
        for family in families:
            pnames = list(family.param_names)
            params_arr = np.full((n_bootstrap, len(pnames)), np.nan)
            statuses = []
            for b in range(n_bootstrap):
                idx = rng.choice(n_real, size=n_real, replace=True)
                bootstrap_reals = [realizations[i] for i in idx]
                avg = averaged_trajectory_for_target(bootstrap_reals, value_fn)
                if avg is None:
                    statuses.append("no_trajectory")
                    continue
                V_g, y_g = avg
                fit = family.fit(V_g.astype(np.float64), y_g.astype(np.float64))
                statuses.append(fit.status)
                if fit.status == "clean":
                    for j, pn in enumerate(pnames):
                        params_arr[b, j] = fit.params.get(pn, np.nan)
            out[(tname, family.name)] = {
                "params_array": params_arr,
                "param_names": tuple(pnames),
                "statuses": statuses,
            }
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n-bootstrap", default=50, type=int,
                    help="Bootstrap iterations per position (default 50)")
    ap.add_argument("--families", nargs="+",
                    default=["hyperbolic", "sum_residual_hyperbolic",
                             "convex_mixture_hyperbolic"])
    ap.add_argument("--out-csv", default=Path("/tmp/bootstrap_noise.csv"),
                    type=Path)
    ap.add_argument("--summary-txt",
                    default=Path.home() / "plots" / "bootstrap_summary.txt",
                    type=Path)
    ap.add_argument("--seed", default=42, type=int)
    ap.add_argument("--log-space", action="store_true",
                    help="Compute σ_within and σ_across in signed-log1p "
                         "transformed space (sign(p)·log1p(|p|)). This "
                         "matches the regression pipeline's transform, "
                         "making R²_ceiling directly comparable to "
                         "regression OOF R². Default is raw-value space.")
    args = ap.parse_args()

    def _maybe_signed_log1p(arr):
        if not args.log_space:
            return arr
        return np.sign(arr) * np.log1p(np.abs(arr))

    families = []
    for fname in args.families:
        if fname not in FAMILIES:
            sys.exit(f"unknown family {fname!r}")
        families.append(FAMILIES[fname])

    rng = np.random.default_rng(args.seed)
    conn = connect()
    positions = list_positions(conn)
    print(f"=== bootstrapping {len(positions)} positions × "
          f"{args.n_bootstrap} iter × {len(families)} families × "
          f"{len(VALUE_CANDIDATES)} targets ===", flush=True)

    # Per (target, family, param_name) accumulators across positions
    label_values: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    within_stds: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    clean_fractions: dict[tuple[str, str], list[float]] = defaultdict(list)

    # Open the CSV up front and flush every row so a kill mid-run leaves
    # partial results on disk (the summary needs everything in memory, but
    # the per-position CSV is the recoverable artifact).
    args.out_csv.parent.mkdir(parents=True, exist_ok=True)
    fields = ["stem", "turn", "target", "family", "param",
              "n_realizations", "n_clean_bootstrap", "clean_fraction",
              "label_value", "bootstrap_mean", "bootstrap_std"]
    csv_f = args.out_csv.open("w", buffering=1)  # line-buffered
    csv_w = csv.DictWriter(csv_f, fieldnames=fields)
    csv_w.writeheader()
    csv_f.flush()

    t0 = time.monotonic()
    n_done = 0
    for stem, turn in positions:
        real_idxs = list_realizations(conn, stem, turn)
        if not real_idxs:
            continue
        realizations = []
        for ri in real_idxs:
            arrs = realization_as_flat_arrays(conn, stem, turn, ri)
            if arrs is not None:
                realizations.append(arrs)
        if len(realizations) < 2:
            continue

        # The "label" fit: average ALL realizations once, fit each
        # (target, family). This is what the regression pipeline uses
        # as the per-position label.
        label_fit: dict[tuple[str, str], dict] = {}
        for tname, value_fn in VALUE_CANDIDATES.items():
            for family in families:
                avg = averaged_trajectory_for_target(realizations, value_fn)
                if avg is None:
                    label_fit[(tname, family.name)] = {
                        "params": {}, "status": "no_trajectory"
                    }
                    continue
                V_g, y_g = avg
                fit = family.fit(V_g.astype(np.float64), y_g.astype(np.float64))
                label_fit[(tname, family.name)] = {
                    "params": fit.params if fit.status == "clean" else {},
                    "status": fit.status,
                }

        boot = bootstrap_position(realizations, families, rng, args.n_bootstrap)

        for (tname, fname), per_tf in boot.items():
            pnames = per_tf["param_names"]
            params_arr = per_tf["params_array"]
            statuses = per_tf["statuses"]
            n_clean = sum(1 for s in statuses if s == "clean")
            clean_fraction = n_clean / max(len(statuses), 1)
            clean_fractions[(tname, fname)].append(clean_fraction)

            for j, pn in enumerate(pnames):
                col = params_arr[:, j]
                col_clean = col[~np.isnan(col)]
                if len(col_clean) < 3:
                    bootstrap_std = np.nan
                    bootstrap_mean = np.nan
                else:
                    col_eval = _maybe_signed_log1p(col_clean)
                    bootstrap_std = float(np.std(col_eval, ddof=1))
                    bootstrap_mean = float(np.mean(col_eval))

                label_val = label_fit[(tname, fname)]["params"].get(pn, np.nan)
                if np.isfinite(label_val):
                    transformed_label = float(_maybe_signed_log1p(
                        np.array([label_val])
                    )[0])
                    label_values[(tname, fname, pn)].append(transformed_label)
                if np.isfinite(bootstrap_std):
                    within_stds[(tname, fname, pn)].append(bootstrap_std)

                csv_w.writerow({
                    "stem": stem, "turn": turn,
                    "target": tname, "family": fname, "param": pn,
                    "n_realizations": len(realizations),
                    "n_clean_bootstrap": n_clean,
                    "clean_fraction": clean_fraction,
                    "label_value": label_val
                                   if np.isfinite(label_val) else "",
                    "bootstrap_mean": bootstrap_mean
                                       if np.isfinite(bootstrap_mean) else "",
                    "bootstrap_std": bootstrap_std
                                      if np.isfinite(bootstrap_std) else "",
                })
        csv_f.flush()

        n_done += 1
        if n_done % 5 == 0 or n_done == 1:
            elapsed = time.monotonic() - t0
            rate = elapsed / n_done
            est_total = rate * len(positions)
            eta = est_total - elapsed
            print(f"  [{n_done}/{len(positions)}] {rate:.1f}s/pos  "
                  f"elapsed {elapsed:.0f}s  eta {eta:.0f}s  "
                  f"(est. total {est_total:.0f}s)", flush=True)

    conn.close()
    csv_f.close()
    elapsed_total = time.monotonic() - t0
    print(f"\nbootstrap done: {n_done}/{len(positions)} positions in "
          f"{elapsed_total:.0f}s", flush=True)
    print(f"  per-position CSV: {args.out_csv}", flush=True)

    # ── Summary: R² ceiling per (target, family, param) ────────────────────
    args.summary_txt.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    lines.append(f"# Bootstrap label-noise diagnostic — 2026-05-20")
    lines.append(f"# {n_done} positions × {args.n_bootstrap} bootstrap "
                 f"iterations × {len(families)} families × "
                 f"{len(VALUE_CANDIDATES)} targets")
    lines.append(f"# Method: for each position, resample its realizations")
    lines.append(f"#   with replacement, refit (params) per (target, family).")
    lines.append(f"#   σ_within = bootstrap std per position (per param)")
    lines.append(f"#   σ_across = std of label fits across positions (per param)")
    lines.append(f"#   noise_floor = mean(σ_within²) / σ_across²")
    lines.append(f"#   R²_ceiling = 1 − noise_floor")
    lines.append("")
    lines.append(f"  {'target':<28} {'family':<28} {'param':<14} "
                 f"{'n_pos':>5} {'σ_across':>12} {'σ_within_mean':>14} "
                 f"{'noise_frac':>11} {'R²_ceiling':>11}  cleanness")

    sorted_keys = sorted(label_values.keys())
    for (tname, fname, pname) in sorted_keys:
        label_vals = np.array(label_values[(tname, fname, pname)])
        within = np.array(within_stds.get((tname, fname, pname), []))
        if len(label_vals) < 3 or len(within) < 3:
            lines.append(f"  {tname:<28} {fname:<28} {pname:<14} "
                         f"{len(label_vals):>5}  (insufficient data)")
            continue
        sigma_across = float(np.std(label_vals, ddof=1))
        if sigma_across <= 0:
            noise_frac = float("inf")
            r2_ceiling = float("-inf")
        else:
            noise_frac = float(np.mean(within ** 2) / (sigma_across ** 2))
            r2_ceiling = 1.0 - noise_frac
        mean_within = float(np.mean(within))
        avg_clean = float(np.mean(clean_fractions[(tname, fname)]))
        lines.append(f"  {tname:<28} {fname:<28} {pname:<14} "
                     f"{len(label_vals):>5} {sigma_across:>+12.4g} "
                     f"{mean_within:>+14.4g} {noise_frac:>11.3f} "
                     f"{r2_ceiling:>+11.3f}  {avg_clean:.0%}")

    summary_text = "\n".join(lines)
    print()
    print(summary_text)
    args.summary_txt.write_text(summary_text + "\n")
    print(f"\n  summary written to {args.summary_txt}")


if __name__ == "__main__":
    main()
