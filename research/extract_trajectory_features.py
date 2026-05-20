"""
research/extract_trajectory_features.py

Non-parametric trajectory feature extractor — replaces the (H, κ)
hyperbolic-fit labels with shape-robust summary statistics.

Motivated by the 2026-05-20 finding that the hardest positions
(Hatsuyoron-level, "reading-paradox") have non-monotone trajectories
that hyperbolic family fundamentally cannot capture. The "extreme κ"
values from those fits are artifacts of pushing a monotone family
through dip-then-rise data.

For each (position, target) we compute:

  Trajectory shape:
    - y_at_V_min          first value on the averaged trajectory
    - y_at_V_max          final value
    - y_min, y_max        min/max over the trajectory
    - y_range             y_max - y_min
    - dip_depth           max(0, y_at_V_min - y_min); magnitude of
                          the reading-paradox dip (0 = monotone rise)
    - rise_after_dip      y_at_V_max - y_min; recovery from the
                          lowest point
    - log_V_at_y_min      log10 of V at the minimum (where the dip
                          bottoms out)
    - log_V_at_y_max      log10 of V at the maximum

  Monotonicity:
    - monotonicity_frac   fraction of adjacent V-grid pairs where
                          y[i+1] >= y[i] (1.0 = strictly monotone
                          increasing; 0.5 = noisy / mixed)
    - sign_changes        number of sign changes in dy/dV; 0 means
                          monotone, larger means multiple regimes

  Slopes (log-V) at fixed anchors:
    - slope_terminal      (y[-1] - y[-K]) / (log V[-1] - log V[-K])
                          for K = n_grid // 4; positive = still
                          rising, negative = past asymptote
    - slope_early         analogous over first quartile
    - slope_midrange      analogous over second quartile

  Explicit V anchors (intermediate-V values):
    - y_at_V100, y_at_V500, y_at_V2000, y_at_V10000
                          interpolated values at fixed V (useful for
                          downstream regression as both labels and
                          features)

CSV schema (long-format, one row per (stem, turn, target)):
  stem, turn, n_realizations, target, status, reason,
  y_at_V_min, y_at_V_max, y_min, y_max, y_range, dip_depth,
  rise_after_dip, log_V_at_y_min, log_V_at_y_max,
  monotonicity_frac, sign_changes,
  slope_terminal, slope_early, slope_midrange,
  y_at_V100, y_at_V500, y_at_V2000, y_at_V10000

Status semantics: 'clean' = the trajectory has ≥4 points AND a
non-zero y_range. 'degenerate' otherwise. Importantly, this is far
weaker than the hyperbolic-fit "clean" check — we WANT to include
the non-monotone positions whose hyperbolic fits failed.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fit_averaged import averaged_trajectory_for_target  # noqa: E402
from fit_hyperbolic import VALUE_CANDIDATES  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_positions, list_realizations, realization_as_flat_arrays,
)


FIELDS = [
    "stem", "turn", "n_realizations",
    "target", "status", "reason",
    "y_at_V_min", "y_at_V_max", "y_min", "y_max", "y_range",
    "dip_depth", "rise_after_dip",
    "log_V_at_y_min", "log_V_at_y_max",
    "monotonicity_frac", "sign_changes",
    "slope_terminal", "slope_early", "slope_midrange",
    "y_at_V100", "y_at_V500", "y_at_V2000", "y_at_V10000",
    # DLP (Eisenthal–Cornish-Bowden direct linear plot) estimates:
    # closed-form solve of F(V) = H·V/(V+κ) from each pair of points,
    # median across C(N,2) pairs. Robust to outliers/non-monotonicity
    # because median tolerates 50% bad pairs. log_kappa_* is reported
    # because κ spans orders of magnitude; the log-scale median is
    # more stable.
    "H_dlp_median", "log_kappa_dlp_median",
    "H_dlp_mad", "log_kappa_dlp_mad",
    "dlp_n_valid_pairs",
]


def _slope_log_V(V: np.ndarray, y: np.ndarray, lo: int, hi: int) -> float:
    """(y[hi] - y[lo]) / (log V[hi] - log V[lo])."""
    if hi <= lo or hi >= len(V):
        return float("nan")
    dlog = np.log(V[hi]) - np.log(V[lo])
    if dlog <= 0:
        return float("nan")
    return float((y[hi] - y[lo]) / dlog)


def _y_at_V(V: np.ndarray, y: np.ndarray, V_target: float) -> float:
    """Log-V linear interpolation. Returns NaN if V_target out of range."""
    if V_target < V[0] or V_target > V[-1]:
        return float("nan")
    return float(np.interp(np.log(V_target), np.log(V), y))


def _dlp_estimates(V: np.ndarray, y: np.ndarray,
                   V_min_drop: float = 8.0) -> dict[str, float]:
    """Eisenthal–Cornish-Bowden direct linear plot: for each pair of
    points (V_i, y_i), (V_j, y_j), solve the 2×2 system from
    F(V) = H·V/(V+κ) for (H, κ). Returns median + MAD of all valid
    pairs.

    Closed form (re-derived from y_i + y_i·κ/V_i = y_j + y_j·κ/V_j):
      common denom: D = y_i·V_j − y_j·V_i
      κ = V_i·V_j·(y_j − y_i) / D
      H = y_i·y_j·(V_j − V_i)  / D

    Robustness:
      - Drops points with V < V_min_drop (early-MCTS noise zone).
      - Drops pairs where the denominator (V_i·y_i − V_j·y_j) is
        below 1e-9 (lines are near-parallel; (κ, H) undefined).
      - Drops pairs that produce κ ≤ 0 or H ≤ 0 (non-physical for
        a saturation curve — these are the pairs straddling a
        reading-paradox dip).
      - Reports MEDIAN over valid pairs (50% breakdown point —
        tolerates non-monotonicity in up to half the pairs).
    """
    mask = V >= V_min_drop
    Vf = V[mask].astype(np.float64)
    yf = y[mask].astype(np.float64)
    n = len(Vf)
    if n < 3:
        return {
            "H_dlp_median": float("nan"),
            "log_kappa_dlp_median": float("nan"),
            "H_dlp_mad": float("nan"),
            "log_kappa_dlp_mad": float("nan"),
            "dlp_n_valid_pairs": 0,
        }
    # Vectorized: compute all C(n,2) pairs.
    i_idx, j_idx = np.triu_indices(n, k=1)
    Vi, Vj = Vf[i_idx], Vf[j_idx]
    yi, yj = yf[i_idx], yf[j_idx]
    # Common denominator: D = y_i·V_j − y_j·V_i
    D = yi * Vj - yj * Vi
    valid = np.abs(D) > 1e-9
    Vi, Vj, yi, yj, D = Vi[valid], Vj[valid], yi[valid], yj[valid], D[valid]
    kappa = Vi * Vj * (yj - yi) / D
    H = yi * yj * (Vj - Vi) / D
    # Physical pairs: κ > 0 and H > 0 (saturation curve).
    physical = (kappa > 0) & (H > 0)
    kappa = kappa[physical]
    H = H[physical]
    n_valid = len(kappa)
    if n_valid < 3:
        return {
            "H_dlp_median": float("nan"),
            "log_kappa_dlp_median": float("nan"),
            "H_dlp_mad": float("nan"),
            "log_kappa_dlp_mad": float("nan"),
            "dlp_n_valid_pairs": int(n_valid),
        }
    log_kappa = np.log(kappa)
    H_med = float(np.median(H))
    lk_med = float(np.median(log_kappa))
    H_mad = float(np.median(np.abs(H - H_med)))
    lk_mad = float(np.median(np.abs(log_kappa - lk_med)))
    return {
        "H_dlp_median": H_med,
        "log_kappa_dlp_median": lk_med,
        "H_dlp_mad": H_mad,
        "log_kappa_dlp_mad": lk_mad,
        "dlp_n_valid_pairs": int(n_valid),
    }


def extract_trajectory_features(
    V: np.ndarray, y: np.ndarray,
) -> dict[str, float]:
    """Compute non-parametric features. V is sorted ascending, y is
    the averaged trajectory."""
    n = len(V)
    if n < 4:
        return {"status": "degenerate", "reason": f"too few points ({n})"}
    y_range = float(y.max() - y.min())
    if y_range < 1e-12:
        return {"status": "degenerate", "reason": "zero y-range"}

    y_min_idx = int(np.argmin(y))
    y_max_idx = int(np.argmax(y))

    out: dict[str, float] = {
        "status": "clean",
        "reason": "",
        "y_at_V_min": float(y[0]),
        "y_at_V_max": float(y[-1]),
        "y_min": float(y.min()),
        "y_max": float(y.max()),
        "y_range": y_range,
        "dip_depth": float(max(0.0, y[0] - y.min())),
        "rise_after_dip": float(y[-1] - y.min()),
        "log_V_at_y_min": float(np.log10(V[y_min_idx])),
        "log_V_at_y_max": float(np.log10(V[y_max_idx])),
    }

    # Monotonicity
    dy = np.diff(y)
    if len(dy) > 0:
        out["monotonicity_frac"] = float((dy >= 0).sum() / len(dy))
        sign_dy = np.sign(dy)
        sign_dy_nz = sign_dy[sign_dy != 0]
        out["sign_changes"] = float(int((np.diff(sign_dy_nz) != 0).sum())
                                     if len(sign_dy_nz) > 1 else 0)
    else:
        out["monotonicity_frac"] = float("nan")
        out["sign_changes"] = float("nan")

    # Slopes at fixed quartiles
    q = max(1, n // 4)
    out["slope_early"] = _slope_log_V(V, y, 0, q)
    out["slope_midrange"] = _slope_log_V(V, y, q, 2 * q)
    out["slope_terminal"] = _slope_log_V(V, y, n - 1 - q, n - 1)

    # Anchored y values
    for anchor in [100, 500, 2000, 10000]:
        out[f"y_at_V{anchor}"] = _y_at_V(V, y, float(anchor))

    # DLP estimates (Eisenthal–Cornish-Bowden direct linear plot
    # median-of-pairs). Robust hyperbolic-fit alternative; works on
    # non-monotone trajectories because pair-median has 50%
    # breakdown point.
    out.update(_dlp_estimates(V, y))

    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out-csv",
                    default=Path("/tmp/trajectory_features.csv"), type=Path)
    args = ap.parse_args()

    conn = connect()
    positions = list_positions(conn)
    if not positions:
        sys.exit("no positions in Postgres")
    print(f"=== extracting trajectory features for "
          f"{len(positions)} positions × {len(VALUE_CANDIDATES)} targets ===",
          flush=True)

    args.out_csv.parent.mkdir(parents=True, exist_ok=True)
    csv_f = args.out_csv.open("w", buffering=1)
    csv_w = csv.DictWriter(csv_f, fieldnames=FIELDS, extrasaction="ignore")
    csv_w.writeheader()
    csv_f.flush()

    t0 = time.monotonic()
    n_done = 0
    n_clean = {t: 0 for t in VALUE_CANDIDATES}
    n_total = {t: 0 for t in VALUE_CANDIDATES}
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
        for tname, value_fn in VALUE_CANDIDATES.items():
            avg = averaged_trajectory_for_target(realizations, value_fn)
            n_total[tname] += 1
            if avg is None:
                csv_w.writerow({
                    "stem": stem, "turn": turn,
                    "n_realizations": n_real,
                    "target": tname,
                    "status": "degenerate",
                    "reason": "no usable trajectory",
                })
                continue
            V_g, y_g = avg
            feats = extract_trajectory_features(
                V_g.astype(np.float64), y_g.astype(np.float64)
            )
            row = {
                "stem": stem, "turn": turn,
                "n_realizations": n_real,
                "target": tname,
                **feats,
            }
            csv_w.writerow(row)
            if feats.get("status") == "clean":
                n_clean[tname] += 1
        csv_f.flush()

        n_done += 1
        if n_done % 25 == 0 or n_done == len(positions):
            dt = time.monotonic() - t0
            rate = n_done / max(dt, 1e-9)
            eta = (len(positions) - n_done) / max(rate, 1e-9)
            print(f"    [{n_done}/{len(positions)}] {rate:.1f} pos/s  "
                  f"elapsed {dt:.0f}s  eta {eta:.0f}s", flush=True)

    csv_f.close()
    conn.close()
    elapsed = time.monotonic() - t0
    print(f"\n=== done in {elapsed:.0f}s ===", flush=True)
    print(f"CSV: {args.out_csv}", flush=True)
    print(f"\n  per-target clean-feature count:", flush=True)
    for t in VALUE_CANDIDATES:
        c = n_clean[t]; tot = n_total[t]
        pct = 100.0 * c / max(tot, 1)
        print(f"    {t:<28} {c:>4}/{tot:>4} ({pct:.1f}%)", flush=True)


if __name__ == "__main__":
    main()
