"""
research/fit_averaged.py

Multi-realization fit: for each position with N realization NPZs
(`<name>__r0.npz`, `__r1.npz`, …), compute the per-V mean trajectory
across realizations for each value() candidate, then fit hyperbolic
(H, κ) on the mean. Writes a `summary_averaged.csv` parallel to the
single-realization `summary.csv` that `summarize_batch.py` produces.

The averaging step is what addresses the per-realization MCTS noise
identified in `roadmap-learned-continuous-scaling.md` §7.3. If labels
are sharper after averaging, downstream regression should see signal
that single-realization labels masked.

Common-V grid: log-spaced from max(V_first across realizations) to
min(V_last across realizations), 50 points. Each realization is
interpolated onto this grid before averaging.

Usage:
  python fit_averaged.py /home/bork/w/omega/research/trajectories/batch_year2000

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Callable

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from curve_families import FAMILIES, CurveFamily  # noqa: E402
from fit_hyperbolic import VALUE_CANDIDATES  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_positions, list_realizations, realization_as_flat_arrays,
)


def _per_realization_trajectory_local(arrs, value_fn):
    """Same as resnet_trajectory._per_realization_trajectory; duplicated
    locally to avoid the import cycle."""
    V = arrs["visits"].astype(np.float64)
    ids = arrs["isDuringSearch"]
    V_max_idx = int(np.where(~ids)[0][-1]) if (~ids).any() else int(np.argmax(V))
    try:
        y = value_fn(arrs, V_max_idx).astype(np.float64)
    except Exception:
        return None
    if not np.isfinite(y).all() or len(y) < 4:
        return None
    order = np.argsort(V)
    return V[order], y[order]


def averaged_trajectory_for_target(
    realizations: list[dict],
    value_fn: Callable,
    n_grid: int = 50,
) -> tuple[np.ndarray, np.ndarray] | None:
    """For one (position, target), interpolate each realization's
    `value(V)` onto a common log-spaced V grid, return (V_grid, y_mean).

    Returns None if no realization produced a usable trajectory."""
    per_run_curves: list[tuple[np.ndarray, np.ndarray]] = []
    V_firsts: list[float] = []
    V_lasts: list[float] = []
    for d in realizations:
        V = d["visits"].astype(np.float64)
        ids = d["isDuringSearch"]
        V_max_idx = int(np.where(~ids)[0][-1]) if (~ids).any() else int(np.argmax(V))
        try:
            y = value_fn(d, V_max_idx).astype(np.float64)
        except Exception:
            continue
        if not np.isfinite(y).all() or len(y) < 4:
            continue
        # Sort by V (defensive — they should already be monotone)
        order = np.argsort(V)
        V_s = V[order]
        y_s = y[order]
        per_run_curves.append((V_s, y_s))
        V_firsts.append(float(V_s[0]))
        V_lasts.append(float(V_s[-1]))

    if not per_run_curves:
        return None

    V_lo = max(V_firsts)
    V_hi = min(V_lasts)
    if V_lo >= V_hi:
        return None
    V_grid = np.geomspace(V_lo, V_hi, n_grid)

    y_stack = np.empty((len(per_run_curves), n_grid))
    for i, (V_s, y_s) in enumerate(per_run_curves):
        y_stack[i] = np.interp(V_grid, V_s, y_s)
    y_mean = y_stack.mean(axis=0)
    return V_grid, y_mean


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--out-csv",
        default=Path("/tmp/summary_averaged.csv"),
        type=Path,
        help="Output CSV with per-(position, target, family) averaged "
             "labels. Trajectory data lives in Postgres; this is a "
             "labels-only artifact for downstream regression.",
    )
    ap.add_argument(
        "--families",
        nargs="+",
        default=["hyperbolic"],
        help=f"Curve families to fit. Available: {sorted(FAMILIES.keys())}",
    )
    ap.add_argument(
        "--per-realization", action="store_true",
        help="Fit per realization (not averaged): one row per "
             "(stem, turn, realization, target, family). Output CSV "
             "gains a `realization` column.",
    )
    args = ap.parse_args()

    # Validate family list
    families: list[CurveFamily] = []
    for fname in args.families:
        if fname not in FAMILIES:
            sys.exit(f"unknown family {fname!r}; available: {sorted(FAMILIES.keys())}")
        families.append(FAMILIES[fname])

    conn = connect()
    positions = list_positions(conn)
    if not positions:
        sys.exit("no completed positions in Postgres (run run_batch.py first)")
    print(f"=== {len(positions)} positions in Postgres, "
          f"{len(families)} family(ies): {[f.name for f in families]} ===")

    target_names = list(VALUE_CANDIDATES.keys())
    # Long-format schema: one row per (stem, turn[, realization], target, family).
    # `params_json` is a JSON-encoded dict so heterogeneous-arity
    # families share the schema. With --per-realization, a `realization`
    # column is added.
    base_fields = ["stem", "turn"]
    if args.per_realization:
        base_fields.append("realization")
    base_fields += ["n_realizations", "target", "family", "status"]
    fields = base_fields + [
        "params_json", "rel_resid_std", "pearson_resid_v",
        "monotonicity_drop", "peak_position", "y_range", "max_abs_resid",
        "reason",
    ]
    n_clean: dict[tuple[str, str], int] = defaultdict(int)
    n_total: dict[tuple[str, str], int] = defaultdict(int)
    n_processed = 0

    def emit_fit(writer, *, stem, turn, n_real, tname, family,
                 fit_result, realization=None) -> None:
        row = {
            "stem": stem, "turn": turn,
            "n_realizations": n_real,
            "target": tname, "family": family.name,
            "status": fit_result.status,
            "params_json": json.dumps(fit_result.params),
            "rel_resid_std": fit_result.rel_resid_std,
            "pearson_resid_v": fit_result.pearson_resid_v,
            "monotonicity_drop": fit_result.monotonicity_drop,
            "peak_position": fit_result.peak_position,
            "y_range": fit_result.y_range,
            "max_abs_resid": fit_result.max_abs_resid,
            "reason": fit_result.reason,
        }
        if realization is not None:
            row["realization"] = realization
        writer.writerow(row)

    def emit_no_traj(writer, *, stem, turn, n_real, tname, family,
                     reason, realization=None) -> None:
        row = {
            "stem": stem, "turn": turn,
            "n_realizations": n_real,
            "target": tname, "family": family.name,
            "status": "degenerate",
            "params_json": "{}",
            "reason": reason,
        }
        if realization is not None:
            row["realization"] = realization
        writer.writerow(row)

    args.out_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.out_csv.open("w") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for stem, turn in positions:
            real_idxs = list_realizations(conn, stem, turn)
            if not real_idxs:
                continue
            realizations = []
            for ri in real_idxs:
                arrs = realization_as_flat_arrays(conn, stem, turn, ri)
                if arrs is not None:
                    realizations.append((ri, arrs))
            if not realizations:
                continue
            n_processed += 1
            n_real = len(realizations)

            if args.per_realization:
                # One row per (stem, turn, realization, target, family).
                for ri, arrs in realizations:
                    for tname, value_fn in VALUE_CANDIDATES.items():
                        traj = _per_realization_trajectory_local(arrs, value_fn)
                        if traj is None:
                            for family in families:
                                emit_no_traj(
                                    writer, stem=stem, turn=turn,
                                    n_real=n_real, tname=tname, family=family,
                                    reason="no usable trajectory",
                                    realization=ri,
                                )
                                n_total[(tname, family.name)] += 1
                            continue
                        V_g, y_g = traj
                        V_g = V_g.astype(np.float64)
                        y_g = y_g.astype(np.float64)
                        for family in families:
                            fit = family.fit(V_g, y_g)
                            emit_fit(
                                writer, stem=stem, turn=turn,
                                n_real=n_real, tname=tname, family=family,
                                fit_result=fit, realization=ri,
                            )
                            n_total[(tname, family.name)] += 1
                            if fit.status == "clean":
                                n_clean[(tname, family.name)] += 1
            else:
                # Averaged-trajectory path: one row per (stem, turn, target, family).
                avg_trajs: dict[str, tuple[np.ndarray, np.ndarray]] = {}
                for tname, value_fn in VALUE_CANDIDATES.items():
                    avg = averaged_trajectory_for_target(
                        [arrs for _, arrs in realizations], value_fn,
                    )
                    if avg is not None:
                        avg_trajs[tname] = avg
                for tname in target_names:
                    for family in families:
                        if tname not in avg_trajs:
                            emit_no_traj(
                                writer, stem=stem, turn=turn,
                                n_real=n_real, tname=tname, family=family,
                                reason="no usable trajectory",
                            )
                            n_total[(tname, family.name)] += 1
                            continue
                        V_g, y_g = avg_trajs[tname]
                        fit = family.fit(V_g, y_g)
                        emit_fit(
                            writer, stem=stem, turn=turn,
                            n_real=n_real, tname=tname, family=family,
                            fit_result=fit,
                        )
                        n_total[(tname, family.name)] += 1
                        if fit.status == "clean":
                            n_clean[(tname, family.name)] += 1

    print(f"\n  CSV: {args.out_csv}  "
          f"({n_processed * len(target_names) * len(families)} rows)")
    print(f"\n=== per-(target, family) clean-fit count ===")
    print(f"  {'target':<28} {'family':<20} {'clean':>6} / {'total':>5}")
    for tname in target_names:
        for family in families:
            c = n_clean[(tname, family.name)]
            t = n_total[(tname, family.name)]
            pct = 100.0 * c / max(t, 1)
            print(f"  {tname:<28} {family.name:<20} {c:>6} / {t:>5}  ({pct:.1f}%)")
    conn.close()


if __name__ == "__main__":
    main()
