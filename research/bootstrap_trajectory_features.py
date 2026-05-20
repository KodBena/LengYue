"""
research/bootstrap_trajectory_features.py

Bootstrap label-noise diagnostic for the NON-PARAMETRIC trajectory
features (replacement for the hyperbolic-fit (H, κ) labels). Same
logic as bootstrap_label_noise.py but instead of curve_fit on each
bootstrap iteration, extract trajectory features directly. Should
be ~10× faster since no curve_fit.

Produces R²_ceiling per (target, feature_column) — the headroom
the non-parametric regression has to capture.

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
from extract_trajectory_features import (  # noqa: E402
    extract_trajectory_features,
)
from fit_averaged import averaged_trajectory_for_target  # noqa: E402
from fit_hyperbolic import VALUE_CANDIDATES  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_positions, list_realizations, realization_as_flat_arrays,
)


# Feature columns (must match extract_trajectory_features.py)
FEATURE_COLUMNS = [
    "y_at_V_min", "y_at_V_max", "y_min", "y_max", "y_range",
    "dip_depth", "rise_after_dip",
    "log_V_at_y_min", "log_V_at_y_max",
    "monotonicity_frac", "sign_changes",
    "slope_terminal", "slope_early", "slope_midrange",
    "y_at_V100", "y_at_V500", "y_at_V2000", "y_at_V10000",
]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n-bootstrap", default=50, type=int)
    ap.add_argument("--out-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "bootstrap_trajectory_features.csv"),
                    type=Path)
    ap.add_argument("--summary-txt",
                    default=Path.home() / "plots" /
                            "bootstrap_trajectory_features_summary.txt",
                    type=Path)
    ap.add_argument("--seed", default=42, type=int)
    ap.add_argument("--log-space", action="store_true",
                    help="Apply signed_log1p to feature values before "
                         "computing σ. Matches regression-side transform.")
    args = ap.parse_args()

    def _maybe_log(arr: np.ndarray) -> np.ndarray:
        if not args.log_space:
            return arr
        return np.sign(arr) * np.log1p(np.abs(arr))

    rng = np.random.default_rng(args.seed)
    conn = connect()
    positions = list_positions(conn)
    print(f"=== bootstrapping {len(positions)} positions × "
          f"{args.n_bootstrap} iter × {len(VALUE_CANDIDATES)} targets × "
          f"{len(FEATURE_COLUMNS)} feature columns "
          f"(log_space={args.log_space}) ===", flush=True)

    # Per (target, column): list of label values across positions
    label_values: dict[tuple[str, str], list[float]] = defaultdict(list)
    within_stds: dict[tuple[str, str], list[float]] = defaultdict(list)
    clean_fractions: dict[str, list[float]] = defaultdict(list)

    args.out_csv.parent.mkdir(parents=True, exist_ok=True)
    fields = ["stem", "turn", "target", "column", "n_realizations",
              "n_clean_bootstrap", "clean_fraction",
              "label_value", "bootstrap_mean", "bootstrap_std"]
    csv_f = args.out_csv.open("w", buffering=1)
    csv_w = csv.DictWriter(csv_f, fieldnames=fields)
    csv_w.writeheader()

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
        n_real = len(realizations)

        # Label values: average ALL realizations once, extract features once
        label_features: dict[str, dict] = {}
        for tname, value_fn in VALUE_CANDIDATES.items():
            avg = averaged_trajectory_for_target(realizations, value_fn)
            if avg is None:
                label_features[tname] = None
                continue
            V_g, y_g = avg
            feats = extract_trajectory_features(
                V_g.astype(np.float64), y_g.astype(np.float64)
            )
            label_features[tname] = feats if feats.get("status") == "clean" else None

        # Bootstrap iterations
        # Shape: per (target, column) → (n_bootstrap,) array of feature values
        boot_per_target: dict[str, np.ndarray] = {}
        statuses_per_target: dict[str, list[str]] = {}
        for tname in VALUE_CANDIDATES:
            boot_per_target[tname] = np.full(
                (args.n_bootstrap, len(FEATURE_COLUMNS)), np.nan
            )
            statuses_per_target[tname] = []

        for b in range(args.n_bootstrap):
            idx = rng.choice(n_real, size=n_real, replace=True)
            bootstrap_reals = [realizations[i] for i in idx]
            for tname, value_fn in VALUE_CANDIDATES.items():
                avg = averaged_trajectory_for_target(bootstrap_reals, value_fn)
                if avg is None:
                    statuses_per_target[tname].append("no_trajectory")
                    continue
                V_g, y_g = avg
                feats = extract_trajectory_features(
                    V_g.astype(np.float64), y_g.astype(np.float64)
                )
                statuses_per_target[tname].append(feats.get("status", "?"))
                if feats.get("status") == "clean":
                    for j, col in enumerate(FEATURE_COLUMNS):
                        v = feats.get(col)
                        if v is not None and np.isfinite(v):
                            boot_per_target[tname][b, j] = v

        # Compute σ_within per (target, column), write CSV row
        for tname in VALUE_CANDIDATES:
            params_arr = boot_per_target[tname]
            statuses = statuses_per_target[tname]
            n_clean = sum(1 for s in statuses if s == "clean")
            clean_fraction = n_clean / max(len(statuses), 1)
            clean_fractions[tname].append(clean_fraction)

            label_f = label_features[tname]
            for j, col in enumerate(FEATURE_COLUMNS):
                col_vals = params_arr[:, j]
                col_clean = col_vals[~np.isnan(col_vals)]
                if len(col_clean) < 3:
                    bootstrap_std = np.nan
                    bootstrap_mean = np.nan
                else:
                    col_eval = _maybe_log(col_clean)
                    bootstrap_std = float(np.std(col_eval, ddof=1))
                    bootstrap_mean = float(np.mean(col_eval))

                label_val = (label_f.get(col) if label_f is not None
                             else np.nan)
                if label_val is not None and np.isfinite(label_val):
                    transformed = float(_maybe_log(np.array([label_val]))[0])
                    label_values[(tname, col)].append(transformed)
                if np.isfinite(bootstrap_std):
                    within_stds[(tname, col)].append(bootstrap_std)

                csv_w.writerow({
                    "stem": stem, "turn": turn,
                    "target": tname, "column": col,
                    "n_realizations": n_real,
                    "n_clean_bootstrap": n_clean,
                    "clean_fraction": clean_fraction,
                    "label_value": label_val
                                   if (label_val is not None and np.isfinite(label_val)) else "",
                    "bootstrap_mean": bootstrap_mean
                                       if np.isfinite(bootstrap_mean) else "",
                    "bootstrap_std": bootstrap_std
                                      if np.isfinite(bootstrap_std) else "",
                })
        csv_f.flush()

        n_done += 1
        if n_done % 25 == 0 or n_done == 1 or n_done == len(positions):
            dt = time.monotonic() - t0
            rate = n_done / max(dt, 1e-9)
            eta = (len(positions) - n_done) / max(rate, 1e-9)
            print(f"  [{n_done}/{len(positions)}] {rate:.1f} pos/s  "
                  f"elapsed {dt:.0f}s  eta {eta:.0f}s", flush=True)

    csv_f.close()
    conn.close()
    elapsed = time.monotonic() - t0
    print(f"\nbootstrap done in {elapsed:.0f}s", flush=True)

    # Summary
    args.summary_txt.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    lines.append(f"# bootstrap on non-parametric trajectory features "
                 f"(log_space={args.log_space})")
    lines.append(f"# {n_done} positions × {args.n_bootstrap} iter "
                 f"× {len(VALUE_CANDIDATES)} targets × {len(FEATURE_COLUMNS)} cols")
    lines.append("")
    header = (f"  {'target':<28} {'column':<22} {'n_pos':>5} "
              f"{'σ_across':>11} {'σ_within':>11} "
              f"{'noise_frac':>11} {'R²_ceiling':>11}  cleanness")
    lines.append(header)

    for tname in sorted(VALUE_CANDIDATES.keys()):
        for col in FEATURE_COLUMNS:
            lv = np.array(label_values.get((tname, col), []))
            wv = np.array(within_stds.get((tname, col), []))
            if len(lv) < 3 or len(wv) < 3:
                lines.append(f"  {tname:<28} {col:<22} {len(lv):>5}  (insufficient)")
                continue
            sigma_across = float(np.std(lv, ddof=1))
            if sigma_across <= 0:
                lines.append(f"  {tname:<28} {col:<22} {len(lv):>5}  (zero σ_across)")
                continue
            noise_frac = float(np.mean(wv ** 2) / (sigma_across ** 2))
            r2_ceiling = 1.0 - noise_frac
            mean_within = float(np.mean(wv))
            avg_clean = float(np.mean(clean_fractions[tname]))
            lines.append(
                f"  {tname:<28} {col:<22} {len(lv):>5} "
                f"{sigma_across:>+11.4g} {mean_within:>+11.4g} "
                f"{noise_frac:>11.3f} {r2_ceiling:>+11.3f}  {avg_clean:.0%}"
            )

    summary = "\n".join(lines)
    print()
    print(summary)
    args.summary_txt.write_text(summary + "\n")
    print(f"\nsummary: {args.summary_txt}", flush=True)


if __name__ == "__main__":
    main()
