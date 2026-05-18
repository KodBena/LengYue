"""Plan the benchmark sweep given a wall-clock budget and the
calibrated per-model throughput.

Decision variables:
  - n_i : cells per tier i (one per model)
  - k   : seeds per cell (uniform across tiers)
  - T   : turns per cell (uniform across tiers)

Constants (from inputs):
  - vps_i : visits/sec for tier i (calibrated)
  - V_pre, V_oracle : visits per turn for the pre-state and oracle queries
  - C_max_i : max unique cells available for tier i (limited by SGF
              count × turn-range stride)
  - T_budget : total wall-clock seconds available

Per-cell GPU cost (independent of k — seeds reuse cached oracle data
in pure-Python policy evaluation):

    cell_time_i = T * (V_pre + V_oracle) / vps_i

Constraints:
  Σ n_i * cell_time_i ≤ T_budget
  n_i ≤ C_max_i
  n_i ≥ n_min  (minimum cells for any tier to have meaningful stats)

Objective: maximize statistical reliability. Two interpretations:

  (a) min-max:   max min_i √(n_i * k)  — equalise the worst tier's
                 statistical power (suitable when cross-tier rank
                 comparison matters).

  (b) max-total: max Σ √(n_i * k)  — maximise overall information
                 (favours faster tiers).

We compute both and let the user pick. Tier-stop heuristic is
modelled separately: if top-3 stabilises across the first three
tiers, the fdx6d budget is freed; we plan as-if fdx6d will run, but
flag the early-stop savings.

The Spearman ρ on a T-element vector has approximate
σ_ρ ≈ 1/√(T-1) ≈ 1/√11 ≈ 0.30 for T=12. With n_eff = n × k
independent measurements (per policy), the SE on mean ρ is
σ_ρ / √n_eff. We aim for SE ≤ 0.05, i.e. n_eff ≥ 36 per policy
per tier.

Outputs a plan JSON for the benchmark to consume.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

# Inputs (overridable via CLI argv or environment).
CALIBRATION = Path("/home/bork/benchmark_allocation/calibration.json")
OUTPUT = Path("/home/bork/benchmark_allocation/plan.json")

DEFAULT_T_BUDGET_S = 5 * 3600        # 5 hours
DEFAULT_V_PRE = 200
DEFAULT_V_ORACLE = 5000
DEFAULT_T_PER_CELL = 12
DEFAULT_N_SEEDS = 3                  # per cell, for stochastic policies
DEFAULT_N_MIN = 24                   # any tier we run gets ≥24 cells
DEFAULT_N_MAX_PER_TIER = 200         # data-variety cap

# SGF lengths (preloaded; benchmark.py loads the same set). Used to
# compute max-unique-cells per tier based on stride/turn-range.
SGF_LENGTHS = {
    "30377107": 94,
    "30385020": 158,
    "30400454": 54,
    "30405755": 86,
    "30407460": 118,
    "30432811": 154,
    "30438422": 84,
    "30439290": 138,
    "30446359": 189,
}


def max_unique_cells(turns_per_cell: int, stride: int = 15, start: int = 30) -> int:
    """Count (sgf, range) cells available under the given window."""
    total = 0
    for length in SGF_LENGTHS.values():
        s = start
        while s + turns_per_cell <= length:
            total += 1
            s += stride
    return total


def plan(
    *,
    vps_per_model: dict[str, float],
    t_budget_s: float = DEFAULT_T_BUDGET_S,
    v_pre: int = DEFAULT_V_PRE,
    v_oracle: int = DEFAULT_V_ORACLE,
    t_per_cell: int = DEFAULT_T_PER_CELL,
    n_seeds: int = DEFAULT_N_SEEDS,
    n_min: int = DEFAULT_N_MIN,
    n_max: int | None = None,
) -> dict[str, Any]:
    """Return a plan: n_cells_per_tier, total compute, expected SE per tier."""
    visits_per_cell = t_per_cell * (v_pre + v_oracle)
    cell_time = {
        m: visits_per_cell / vps for m, vps in vps_per_model.items()
    }
    c_max = max_unique_cells(t_per_cell)
    if n_max is None:
        n_max = min(c_max, DEFAULT_N_MAX_PER_TIER)

    # Approximate σ_ρ for Spearman on T-element vector.
    sigma_rho = 1.0 / math.sqrt(t_per_cell - 1)

    # ---- Option A: equal-n across all 4 tiers ----
    # n × Σ cell_time_i ≤ T_budget → n ≤ T_budget / Σ cell_time
    sum_ct_all4 = sum(cell_time.values())
    n_a = min(int(t_budget_s / sum_ct_all4), n_max)
    plan_a = {
        "name": "equal-n-all-tiers",
        "n_cells_per_tier": {m: n_a for m in vps_per_model},
        "total_seconds": n_a * sum_ct_all4,
        "se_per_tier": {
            m: sigma_rho / math.sqrt(n_a * n_seeds)
            for m in vps_per_model
        },
    }

    # ---- Option B: skip fdx6d (rely on tier-stop) ----
    tiers_3 = [m for m in vps_per_model if m != "fdx6d"]
    sum_ct_3 = sum(cell_time[m] for m in tiers_3)
    n_b = min(int(t_budget_s / sum_ct_3), n_max)
    plan_b = {
        "name": "skip-fdx6d-assume-tier-stop",
        "n_cells_per_tier": {
            m: (n_b if m in tiers_3 else 0)
            for m in vps_per_model
        },
        "total_seconds": n_b * sum_ct_3,
        "se_per_tier": {
            m: sigma_rho / math.sqrt(n_b * n_seeds) if m in tiers_3 else float("nan")
            for m in vps_per_model
        },
    }

    # ---- Option C: hedged — full n on first 3 tiers, residual budget on fdx6d ----
    n_c_3 = min(n_b, n_max)
    used_3 = n_c_3 * sum_ct_3
    residual = t_budget_s - used_3
    n_c_fdx = min(int(residual / cell_time.get("fdx6d", 1e9)), n_max)
    plan_c = {
        "name": "hedged-3-tier-priority-fdx6d-residual",
        "n_cells_per_tier": {
            **{m: n_c_3 for m in tiers_3},
            "fdx6d": n_c_fdx,
        },
        "total_seconds": used_3 + n_c_fdx * cell_time.get("fdx6d", 0),
        "se_per_tier": {
            m: sigma_rho / math.sqrt(
                (n_c_3 if m in tiers_3 else n_c_fdx) * n_seeds
            )
            for m in vps_per_model
        },
    }

    # ---- Option D: min-max balanced (largest equal n that satisfies n_min everywhere) ----
    # Equivalent to A if A's n ≥ n_min and ≤ all tiers' upper bounds.
    # If n_a < n_min, we can't satisfy the equal-n constraint.

    # Constraint feasibility check.
    feasible_n_min = n_min * sum_ct_all4 <= t_budget_s

    return {
        "config": {
            "t_budget_s": t_budget_s,
            "v_pre": v_pre,
            "v_oracle": v_oracle,
            "t_per_cell": t_per_cell,
            "n_seeds": n_seeds,
            "n_min": n_min,
            "n_max_per_tier": n_max,
            "max_unique_cells_available": c_max,
            "sigma_rho_approx": sigma_rho,
        },
        "vps_per_model": vps_per_model,
        "cell_time_s_per_model": cell_time,
        "feasibility": {
            "all4_at_nmin_fits": feasible_n_min,
        },
        "options": [plan_a, plan_b, plan_c],
    }


def _format_se(s: float) -> str:
    if math.isnan(s):
        return "  n/a"
    return f"{s:.3f}"


def _print_plan(p: dict[str, Any]) -> None:
    cfg = p["config"]
    print(f"Wall budget: {cfg['t_budget_s']/3600:.1f}h ({cfg['t_budget_s']:.0f}s)")
    print(f"Per cell: T={cfg['t_per_cell']} turns × (V_pre={cfg['v_pre']} + V_oracle={cfg['v_oracle']}) = "
          f"{cfg['t_per_cell']*(cfg['v_pre']+cfg['v_oracle'])} visits")
    print(f"Max unique cells available: {cfg['max_unique_cells_available']} "
          f"(cap per tier: {cfg['n_max_per_tier']})")
    print(f"σ_ρ ≈ {cfg['sigma_rho_approx']:.3f} (Spearman on T={cfg['t_per_cell']}-element vector)")
    print()
    print(f"{'model':14s} {'vps':>8s} {'cell_time':>10s}")
    for m, vps in p["vps_per_model"].items():
        print(f"  {m:12s} {vps:>8.0f} {p['cell_time_s_per_model'][m]:>9.2f}s")
    print()
    for opt in p["options"]:
        print(f"--- {opt['name']} ---")
        print(f"  total compute: {opt['total_seconds']/3600:.2f}h ({opt['total_seconds']:.0f}s)")
        print(f"  {'model':14s} {'n':>5s} {'SE_ρ':>7s}")
        for m, n in opt["n_cells_per_tier"].items():
            se = opt["se_per_tier"].get(m, float("nan"))
            print(f"    {m:12s} {n:>5d} {_format_se(se):>7s}")
        print()


def _robust_vps(raw_measurements: list[dict[str, float]]) -> float:
    """Trimmed mean of visits/sec across measurements: drop the
    fastest (cache hit) and the slowest (cold start / queue
    contention), then mean the rest. Median works similarly with
    n=6 measurements.

    The cache-hit confounder is real on SELECTOR: the first
    measurement per model in the calibration sweep typically reports
    10-30x the throughput of subsequent measurements because the
    SELECTOR pool has the position state cached from earlier probes
    or the SPA's recent activity. Using the raw mean would massively
    over-estimate the model's sustained throughput.
    """
    vpses = sorted(m["vps"] for m in raw_measurements)
    if len(vpses) >= 4:
        # Trim min + max.
        trimmed = vpses[1:-1]
        return sum(trimmed) / len(trimmed)
    return sum(vpses) / len(vpses) if vpses else 0.0


def main() -> None:
    cal = json.loads(CALIBRATION.read_text())
    vps_per_model = {}
    for r in cal["per_model"]:
        if r.get("n", 0) > 0:
            vps_per_model[r["model"]] = _robust_vps(r["raw_measurements"])
    p = plan(vps_per_model=vps_per_model)
    OUTPUT.write_text(json.dumps(p, indent=2))
    print(f"wrote {OUTPUT}\n")
    _print_plan(p)


if __name__ == "__main__":
    main()
