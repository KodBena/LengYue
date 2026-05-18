"""Post-hoc analysis of the v2 benchmark.

Two questions:

  1. **Which scaling assumption fits the measured curve?**
     We have 3-point data per (cell, turn): H(V=200), H(V=1000),
     H(V=5000). The intermediate point is at V_extra = 800; the full
     is at V_extra = 4800. Each scaling assumption predicts a specific
     ratio ΔH_int / ΔH_full:
       - linear: 800/4800 = 0.167
       - sqrt:   √(800/4800) = 0.408
       - log:    log(1 + 800/200) / log(1 + 4800/200) = 0.500
     We compute the empirical ratio per (cell, turn, oracle metric)
     and check which predicted ratio it's closest to. Aggregate by
     model + oracle metric.

  2. **Is the policy ranking robust to the scaling assumption?**
     Per (model, scaling), rank policies by mean efficiency at the
     headline budget. Compare rankings across scalings via
     Spearman rank correlation on the policy-ordering itself.
     High = robust; low = the scaling assumption matters.

Outputs a markdown report to stdout.

Usage:
    python analyze.py
"""

from __future__ import annotations

import csv
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path

from scipy.stats import spearmanr

CSV_PATH = Path("/home/bork/benchmark_allocation/results_v2.csv")
CELLS_PATH = Path("/home/bork/benchmark_allocation/cells_v2.jsonl")
PLAN_PATH = Path("/home/bork/benchmark_allocation/plan_v2.json")

ORACLE_METRICS = (
    "visit_entropy_reduction",
    "visit_kl_divergence",
    "top1_changed",
    "score_stdev_reduction",
)
SCALINGS = ("linear", "sqrt", "log", "piecewise")
HEADLINE_BUDGET = 2000


def _load_cells() -> list[dict]:
    if not CELLS_PATH.exists():
        return []
    out = []
    with open(CELLS_PATH) as f:
        for line in f:
            try:
                out.append(json.loads(line))
            except Exception:
                continue
    return out


def _scaling_fit_per_metric(
    cells: list[dict],
) -> dict[str, dict[str, list[float]]]:
    """Per (model, metric): list of empirical ΔH_int / ΔH_full ratios
    across all (cell, turn) with positive ΔH_full."""
    out: dict[str, dict[str, list[float]]] = defaultdict(
        lambda: defaultdict(list),
    )
    for c in cells:
        model = c["model"]
        for m_name in ORACLE_METRICS:
            r_int = c["metrics"][m_name]["r_int"]
            r_full = c["metrics"][m_name]["r_full"]
            for turn_str in r_full:
                rf = r_full[turn_str]
                ri = r_int.get(turn_str, 0.0)
                if rf > 0:
                    out[model][m_name].append(ri / rf)
    return out


def _predicted_ratio(scaling: str, v_int: int, v_full: int, v_pre: int) -> float:
    """The scaling assumption's prediction for ΔH_int / ΔH_full."""
    v_int_extra = v_int - v_pre
    v_full_extra = v_full - v_pre
    if scaling == "linear":
        return v_int_extra / v_full_extra
    if scaling == "sqrt":
        return math.sqrt(v_int_extra / v_full_extra)
    if scaling == "log":
        return math.log(1.0 + v_int_extra / v_pre) / math.log(
            1.0 + v_full_extra / v_pre,
        )
    return float("nan")


def _scaling_predictions(v_int: int, v_full: int, v_pre: int) -> dict[str, float]:
    return {
        s: _predicted_ratio(s, v_int, v_full, v_pre)
        for s in ("linear", "sqrt", "log")
    }


def _format_scaling_fits(
    fits: dict[str, dict[str, list[float]]],
    predictions: dict[str, float],
) -> str:
    lines = []
    lines.append("## Scaling-fit analysis\n")
    lines.append(
        "For each (model × oracle metric), we compute the empirical "
        "ratio `ΔH_int / ΔH_full` per (cell, turn) and compare to the "
        "scaling assumptions' predictions:\n"
    )
    lines.append("Predictions (with V_pre=200, V_int=1000, V_full=5000):\n")
    lines.append("  - linear: ratio = 0.167\n")
    lines.append("  - sqrt:   ratio = 0.408\n")
    lines.append("  - log:    ratio = 0.500\n\n")
    for model, by_metric in fits.items():
        lines.append(f"### {model}\n")
        lines.append(
            f"| metric | n | median | mean ± SE | "
            f"closest-pred | empirical fits |\n"
        )
        lines.append("|---|---:|---:|---:|---|---|\n")
        for m_name in ORACLE_METRICS:
            ratios = by_metric.get(m_name, [])
            ratios = [r for r in ratios if not math.isnan(r) and r != float("inf")]
            if not ratios:
                lines.append(f"| {m_name} | 0 | — | — | — | — |\n")
                continue
            n = len(ratios)
            med = statistics.median(ratios)
            mean = statistics.mean(ratios)
            se = (
                statistics.stdev(ratios) / math.sqrt(n) if n > 1 else 0
            )
            # Closest prediction
            closest = min(
                ("linear", "sqrt", "log"),
                key=lambda s: abs(predictions[s] - med),
            )
            # Empirical: which scaling's prediction sits within ±SE of mean?
            fits_within = [
                s for s in ("linear", "sqrt", "log")
                if abs(predictions[s] - mean) < se
            ]
            fits_str = ", ".join(fits_within) if fits_within else "(none within ±SE)"
            lines.append(
                f"| {m_name} | {n} | {med:.3f} | {mean:.3f} ± {se:.3f} "
                f"| {closest} | {fits_str} |\n"
            )
        lines.append("\n")
    return "".join(lines)


def _cell_aggregated_efficiency(
    rows: list[dict],
    metric: str,
    scaling: str,
    budget: int = HEADLINE_BUDGET,
) -> dict[tuple[str, str], dict[tuple[str, int], float]]:
    """Cluster-robust aggregation: returns dict
    [(model, policy) -> dict[(sgf, turn_start) -> mean_efficiency_across_seeds]].

    For deterministic policies, each (sgf, turn_start) has 1 row and
    the mean is that row's value. For stochastic Thompson policies,
    each (sgf, turn_start) has 10 seeds; we average them to a single
    per-cell estimate. This collapses pseudo-replication: the cell is
    the unit of analysis, not the row.
    """
    col = f"efficiency_{metric}_{scaling}"
    # (model, policy) → (sgf, turn_start) → [efficiency over seeds]
    nested: dict[tuple[str, str], dict[tuple[str, int], list[float]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for row in rows:
        if int(row.get("budget", "0") or 0) != budget:
            continue
        v = row.get(col, "")
        if not v:
            continue
        try:
            cell_key = (row["sgf"], int(row["turn_start"]))
            nested[(row["model"], row["policy"])][cell_key].append(float(v))
        except (ValueError, KeyError):
            pass
    # Collapse seeds to cell means.
    return {
        mp: {ck: statistics.mean(vs) for ck, vs in cells.items()}
        for mp, cells in nested.items()
    }


def _ranking_robustness(rows: list[dict]) -> str:
    """For each model, rank policies by mean efficiency under each
    scaling at the headline budget. Cross-scaling correlation
    on the rank vector.

    Cluster-robust: efficiency is first averaged within (sgf, turn_start)
    cells across seeds, THEN means/SEs are computed across cells. This
    avoids pseudo-replication where Thompson sampling's 10 seeds inflate
    the apparent n by 10x.
    """
    # (model, policy, scaling) → list[cell_mean_efficiency]
    eff_agg: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    for m_name in ORACLE_METRICS:
        for s in SCALINGS:
            agg = _cell_aggregated_efficiency(rows, m_name, s, HEADLINE_BUDGET)
            for (model, policy), per_cell in agg.items():
                eff_agg[(model, policy, f"{m_name}__{s}")] = list(per_cell.values())

    # Per model: ranking under each (metric, scaling)
    models = sorted({k[0] for k in eff_agg})
    lines = []
    lines.append("## Ranking robustness across scalings\n\n")
    lines.append(
        "Per model: rank policies by mean efficiency under each "
        "(oracle metric, scaling) pair. Pairwise Spearman correlations "
        "of the policy-ranking show how robust the ranking is to the "
        "scaling assumption.\n\n"
    )
    for model in models:
        lines.append(f"### {model}\n")
        # Build ranking-vector per (metric, scaling).
        rank_keys = [f"{m}__{s}" for m in ORACLE_METRICS for s in SCALINGS]
        rankings: dict[str, list[str]] = {}
        for key in rank_keys:
            policies_means = [
                (p, statistics.mean(eff_agg[(model, p, key)]))
                for p in {pp for (mm, pp, kk) in eff_agg if mm == model and kk == key}
                if eff_agg.get((model, p, key))
            ]
            policies_means.sort(key=lambda x: -x[1])
            rankings[key] = [p for p, _ in policies_means]

        # Spearman matrix among rankings of the visit_entropy_reduction
        # oracle (most info-theoretic) — compare scalings within this
        # one metric.
        ent_scalings = [f"visit_entropy_reduction__{s}" for s in SCALINGS]
        ranked_lists = {
            k: rankings[k] for k in ent_scalings if rankings.get(k)
        }
        if len(ranked_lists) < 2:
            lines.append("(insufficient data)\n\n")
            continue
        all_policies = sorted(set().union(*(set(v) for v in ranked_lists.values())))
        rank_vectors = {
            k: [v.index(p) if p in v else -1 for p in all_policies]
            for k, v in ranked_lists.items()
        }
        keys_present = sorted(rank_vectors.keys())
        lines.append("Spearman ρ between scaling rankings (visit_entropy_reduction oracle):\n\n")
        lines.append("| | " + " | ".join(k.split("__")[1] for k in keys_present) + " |\n")
        lines.append("|---|" + "|".join("---:" for _ in keys_present) + "|\n")
        for k1 in keys_present:
            row_vals = []
            for k2 in keys_present:
                if k1 == k2:
                    row_vals.append("1.00")
                else:
                    r, _ = spearmanr(rank_vectors[k1], rank_vectors[k2])
                    row_vals.append(f"{r:.2f}" if not math.isnan(r) else "—")
            lines.append(f"| {k1.split('__')[1]} | " + " | ".join(row_vals) + " |\n")
        lines.append("\nTop-3 under each scaling:\n\n")
        for k in keys_present:
            lines.append(
                f"  - **{k.split('__')[1]}**: "
                + ", ".join(rankings[k][:3])
                + "\n"
            )
        lines.append("\n")
    return "".join(lines)


def _cross_model_deltas(rows: list[dict]) -> str:
    """Cluster-robust + paired cross-model deltas. The cells are
    matched across model tiers by (sgf, turn_start): the same 145
    cells were sampled once and run against each model. Paired SE
    is the appropriate test for this design — it removes between-
    cell variance from the SE estimate and is uniformly tighter
    than unpaired SE.

    Per (policy, model_a, model_b): for each cell present on both,
    compute delta_cell = eff_b - eff_a. Mean delta and SE of the
    mean of deltas across the matched cells. |z| = |mean_delta| /
    SE_delta. This is the paired-t-test SE formula.

    Cluster-aggregation: Thompson seeds are collapsed to cell means
    BEFORE the pairing, so each (model, policy, cell) is one
    observation. The firewall (2026-05-18) confirmed: paired SE on
    cluster-aggregated values is the right test for this design.
    """
    out = ["## Cross-model deltas (paired cluster-robust SE, visit_entropy_reduction × piecewise)\n"]
    out.append(
        "Cells are matched across model tiers — same (sgf, turn_start)\n"
        "tuples run against each model. Paired SE is the appropriate\n"
        "test: per cell, compute Δ_cell = eff_b − eff_a, then mean Δ\n"
        "and SE of the mean from the per-cell deltas. Tighter than\n"
        "unpaired SE, which would over-state the variance by lumping\n"
        "between-cell variance in.\n\n"
    )
    metric = "visit_entropy_reduction"
    scaling = "piecewise"
    agg = _cell_aggregated_efficiency(rows, metric, scaling, HEADLINE_BUDGET)
    models = sorted({mp[0] for mp in agg})
    policies = sorted({mp[1] for mp in agg})
    model_order = [m for m in ("b10c128", "b18c384nbt", "b28c512nbt", "fdx6d") if m in models]
    if len(model_order) < 2:
        return "(insufficient models for cross-model comparison)\n"
    pairs = [(model_order[i], model_order[i+1]) for i in range(len(model_order)-1)]
    for m_a, m_b in pairs:
        out.append(f"### {m_a} vs {m_b}\n\n")
        rows_out = []
        for p in policies:
            a = agg.get((m_a, p), {})
            b = agg.get((m_b, p), {})
            common = set(a) & set(b)
            if len(common) < 2:
                continue
            deltas = [b[c] - a[c] for c in common]
            n = len(deltas)
            mean_d = statistics.mean(deltas)
            sd = statistics.stdev(deltas)
            se_d = sd / math.sqrt(n)
            z = abs(mean_d) / se_d if se_d > 0 else 0.0
            mean_a = statistics.mean(a[c] for c in common)
            mean_b = statistics.mean(b[c] for c in common)
            rows_out.append((p, mean_a, mean_b, mean_d, se_d, z, n))
        rows_out.sort(key=lambda x: -abs(x[3]))
        out.append(
            f"| policy | μ_{m_a} | μ_{m_b} | Δ | SE_Δ (paired) | \\|z\\| | n_paired |\n"
        )
        out.append("|---|---:|---:|---:|---:|---:|---:|\n")
        for p, ma, mb, d, se, z, n in rows_out[:12]:
            sig = "**" if z >= 2 else ""
            out.append(
                f"| {p} | {ma:.3f} | {mb:.3f} | {sig}{d:+.3f}{sig} | "
                f"{se:.3f} | {z:.2f} | {n} |\n"
            )
        out.append("\n")
    return "".join(out)


def _top_policies_table(rows: list[dict]) -> str:
    """Per-(model, scaling, metric) top-5 policies by cluster-robust mean."""
    out = ["## Top-5 policies per model (cluster-robust, visit_entropy_reduction × piecewise)\n\n"]
    metric = "visit_entropy_reduction"
    scaling = "piecewise"
    agg = _cell_aggregated_efficiency(rows, metric, scaling, HEADLINE_BUDGET)
    models = sorted({mp[0] for mp in agg})
    model_order = [m for m in ("b10c128", "b18c384nbt", "b28c512nbt", "fdx6d") if m in models]
    for model in model_order:
        rows_out = []
        for (m, p), per_cell in agg.items():
            if m != model:
                continue
            vals = list(per_cell.values())
            if not vals:
                continue
            mean = statistics.mean(vals)
            se = (
                statistics.stdev(vals) / math.sqrt(len(vals)) if len(vals) > 1 else 0.0
            )
            rows_out.append((p, mean, se, len(vals)))
        rows_out.sort(key=lambda x: -x[1])
        out.append(f"### {model}\n\n")
        out.append("| rank | policy | mean efficiency | SE | n_cells |\n")
        out.append("|---:|---|---:|---:|---:|\n")
        for i, (p, mean, se, n) in enumerate(rows_out[:5]):
            out.append(f"| {i+1} | {p} | {mean:.3f} | {se:.3f} | {n} |\n")
        out.append("\n")
    return "".join(out)


def main() -> None:
    if not CSV_PATH.exists():
        print("no results_v2.csv yet")
        return
    rows = list(csv.DictReader(open(CSV_PATH)))
    cells = _load_cells()
    plan = json.loads(PLAN_PATH.read_text())
    cfg = plan["config"]
    v_pre = cfg["V_pre"]
    v_int = cfg["V_intermediate"]
    v_full = cfg["V_oracle"]

    print(f"# Benchmark analysis (rows={len(rows)}, cells={len(cells)})\n")
    print(f"V_pre={v_pre}, V_intermediate={v_int}, V_oracle={v_full}\n")
    print(
        "**All SEs below are cluster-robust**: efficiencies are\n"
        "first averaged within (sgf, turn_start) cells across the\n"
        "10 Thompson seeds, THEN means/SEs are computed across cells.\n"
        "This avoids pseudo-replication; n_cells is the unit, not\n"
        "n_rows.\n\n"
    )

    predictions = _scaling_predictions(v_int, v_full, v_pre)
    fits = _scaling_fit_per_metric(cells)
    print(_format_scaling_fits(fits, predictions))
    print(_top_policies_table(rows))
    print(_cross_model_deltas(rows))
    print(_ranking_robustness(rows))


if __name__ == "__main__":
    main()
