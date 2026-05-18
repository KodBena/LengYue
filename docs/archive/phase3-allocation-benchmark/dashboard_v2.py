"""Live dashboard for v2 benchmark results.

Reads results_v2.csv (multi-budget, multi-seed) and serves an
auto-refreshing plotly view on http://localhost:8001/. Per
(model, policy, budget), aggregates spearman across cells and
seeds. Ranks policies by mean Spearman at budget=2000 (the
"headline" budget); shows budget-dependence as a secondary panel.

License: Public Domain (Unlicense).
"""

from __future__ import annotations

import asyncio
import csv
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

import aiohttp
import aiohttp.web
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots

CSV_PATH = Path("/home/bork/benchmark_allocation/results_v2.csv")
LISTEN_PORT = 8001
HEADLINE_BUDGET = 2000
ORACLE_METRICS = (
    "visit_entropy_reduction",  # primary
    "visit_kl_divergence",
    "top1_changed",
    "score_stdev_reduction",
)
SCALINGS = ("linear", "sqrt", "log", "piecewise")
PRIMARY_ORACLE = "visit_entropy_reduction"
PRIMARY_SCALING = "piecewise"


def _eff_col(metric: str, scaling: str) -> str:
    return f"efficiency_{metric}_{scaling}"


def _eff_f_col(metric: str, scaling: str) -> str:
    return f"efficiency_{metric}_{scaling}_f"

_HTML = """<!DOCTYPE html>
<html>
<head>
<title>Phase 3 policy benchmark v2</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<style>
body { font-family: monospace; margin: 16px; background: #1a1a1a; color: #ddd; }
#status { color: #8c8; margin-bottom: 8px; }
#figure { width: 100%; height: 88vh; }
</style>
</head>
<body>
<div id="status">loading...</div>
<div id="figure"></div>
<script>
async function refresh() {
  try {
    const r = await fetch('/figure.json?ts=' + Date.now());
    const j = await r.json();
    document.getElementById('status').textContent = j.status;
    if (j.figure) {
      Plotly.react('figure', j.figure.data, j.figure.layout, {responsive: true});
    }
  } catch (e) {
    document.getElementById('status').textContent = 'fetch error: ' + e;
  }
}
refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>
"""


def _load_rows() -> list[dict[str, Any]]:
    if not CSV_PATH.exists():
        return []
    rows = []
    with open(CSV_PATH, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            for m in ORACLE_METRICS:
                for prefix in ("spearman", "top3"):
                    try:
                        v = row.get(f"{prefix}_{m}", "")
                        row[f"{prefix}_{m}_f"] = (
                            float(v) if v else float("nan")
                        )
                    except ValueError:
                        row[f"{prefix}_{m}_f"] = float("nan")
                for s in SCALINGS:
                    try:
                        v = row.get(_eff_col(m, s), "")
                        row[_eff_f_col(m, s)] = (
                            float(v) if v else float("nan")
                        )
                    except ValueError:
                        row[_eff_f_col(m, s)] = float("nan")
            try:
                row["budget_i"] = int(row.get("budget") or "0")
            except ValueError:
                row["budget_i"] = 0
            rows.append(row)
    return rows


def _build_figure(rows: list[dict[str, Any]]) -> tuple[dict[str, Any], str]:
    if not rows:
        return _empty_figure(), "no data — start benchmark_v2.py"

    # Aggregate (model, policy, budget) → list[primary_efficiency,
    # primary_top3]. Efficiency is the headline metric (per-range
    # total info gain ratio under √V scaling).
    eff_agg: dict[tuple[str, str, int], list[float]] = defaultdict(list)
    t3_agg: dict[tuple[str, str, int], list[float]] = defaultdict(list)
    eff_key = _eff_f_col(PRIMARY_ORACLE, PRIMARY_SCALING)
    t3_key = f"top3_{PRIMARY_ORACLE}_f"
    for row in rows:
        key = (row["model"], row["policy"], row["budget_i"])
        if not math.isnan(row[eff_key]):
            eff_agg[key].append(row[eff_key])
        if not math.isnan(row[t3_key]):
            t3_agg[key].append(row[t3_key])
    # Alias for downstream code that still refers to sp_agg.
    sp_agg = eff_agg

    models = sorted({row["model"] for row in rows})
    model_order = ["b10c128", "b18c384nbt", "b28c512nbt", "fdx6d"]
    completed_models = [m for m in model_order if m in models]

    # Headline ranking: most recent model, headline budget.
    last_model = completed_models[-1] if completed_models else None
    policies = sorted({row["policy"] for row in rows})
    headline_means: dict[str, float] = {}
    headline_ns: dict[str, int] = {}
    for p in policies:
        vals = sp_agg.get((last_model, p, HEADLINE_BUDGET), [])
        headline_means[p] = float(np.mean(vals)) if vals else float("-inf")
        headline_ns[p] = len(vals)
    ordered_policies = sorted(
        policies, key=lambda p: -headline_means[p],
    )

    # Build 2-panel figure: Efficiency per tier (top), Top-3 (bottom).
    fig = make_subplots(
        rows=2, cols=1,
        subplot_titles=(
            f"Mean efficiency (realised / optimal info gain) at budget="
            f"{HEADLINE_BUDGET}, oracle=<i>{PRIMARY_ORACLE}</i>. "
            "Higher = better; bounded [0, 1] under √V scaling. SEM bars.",
            f"Mean top-3 overlap at budget={HEADLINE_BUDGET} (0–3) — "
            "policy's top-3 allocated turns ∩ oracle's top-3 turns.",
        ),
        vertical_spacing=0.12,
    )

    tier_colors = {
        "b10c128": "#9bd", "b18c384nbt": "#5af",
        "b28c512nbt": "#27c", "fdx6d": "#149",
    }

    for m in completed_models:
        sp_means, sp_sems, sp_ns = [], [], []
        t3_means, t3_sems = [], []
        for p in ordered_policies:
            sp_vals = sp_agg.get((m, p, HEADLINE_BUDGET), [])
            t3_vals = t3_agg.get((m, p, HEADLINE_BUDGET), [])
            if sp_vals:
                sp_means.append(float(np.mean(sp_vals)))
                sp_sems.append(
                    float(np.std(sp_vals, ddof=1) / math.sqrt(len(sp_vals)))
                    if len(sp_vals) > 1 else 0.0
                )
            else:
                sp_means.append(float("nan"))
                sp_sems.append(0.0)
            sp_ns.append(len(sp_vals))
            if t3_vals:
                t3_means.append(float(np.mean(t3_vals)))
                t3_sems.append(
                    float(np.std(t3_vals, ddof=1) / math.sqrt(len(t3_vals)))
                    if len(t3_vals) > 1 else 0.0
                )
            else:
                t3_means.append(float("nan"))
                t3_sems.append(0.0)

        fig.add_trace(
            go.Bar(
                x=ordered_policies, y=sp_means,
                error_y=dict(type="data", array=sp_sems),
                name=f"{m} (n_cell≈{max(sp_ns) if sp_ns else 0})",
                marker_color=tier_colors.get(m, "#888"),
                legendgroup=m,
            ),
            row=1, col=1,
        )
        fig.add_trace(
            go.Bar(
                x=ordered_policies, y=t3_means,
                error_y=dict(type="data", array=t3_sems),
                name=f"{m} top3",
                marker_color=tier_colors.get(m, "#888"),
                legendgroup=m, showlegend=False,
            ),
            row=2, col=1,
        )

    fig.update_layout(
        barmode="group",
        template="plotly_dark",
        title=(
            f"Phase 3 allocation policy benchmark v2 — ranked by Spearman "
            f"on <b>{last_model}</b> at budget={HEADLINE_BUDGET}, oracle="
            f"<i>{PRIMARY_ORACLE}</i>"
        ),
        height=900,
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
        margin=dict(l=60, r=20, t=80, b=140),
    )
    fig.update_xaxes(tickangle=-45)
    fig.update_yaxes(title_text="Mean efficiency (0–1)", row=1, col=1)
    fig.update_yaxes(title_text="Mean top-3 overlap (0–3)", row=2, col=1)

    n_total_rows = len(rows)
    headline_n = max(headline_ns.values()) if headline_ns else 0
    status = (
        f"{n_total_rows} rows • "
        f"tiers: {' → '.join(completed_models)} • "
        f"policies: {len(ordered_policies)} • "
        f"headline budget: {HEADLINE_BUDGET} (n≈{headline_n} per (model,policy))"
    )
    return fig.to_dict(), status


def _empty_figure() -> dict[str, Any]:
    fig = go.Figure()
    fig.update_layout(template="plotly_dark", title="Waiting for results_v2.csv...")
    return fig.to_dict()


async def index_handler(_r: aiohttp.web.Request) -> aiohttp.web.Response:
    return aiohttp.web.Response(text=_HTML, content_type="text/html")


async def figure_handler(_r: aiohttp.web.Request) -> aiohttp.web.Response:
    rows = _load_rows()
    figure, status = _build_figure(rows)
    return aiohttp.web.json_response({"figure": figure, "status": status})


async def main() -> None:
    app = aiohttp.web.Application()
    app.router.add_get("/", index_handler)
    app.router.add_get("/figure.json", figure_handler)
    runner = aiohttp.web.AppRunner(app)
    await runner.setup()
    site = aiohttp.web.TCPSite(runner, "0.0.0.0", LISTEN_PORT)
    await site.start()
    print(f"Dashboard at http://localhost:{LISTEN_PORT}/", flush=True)
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
