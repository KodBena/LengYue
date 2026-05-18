# Phase 3 allocation-policy benchmark — archive

This directory is the **archaeological deposit** for the 2026-05-18
benchmark of v1.0.25's Phase 3 allocation substrate. Every
numeric claim in the retrospective at
`docs/notes/retrospective-phase3-policy-benchmark-2026-05.md` can
be reproduced from the data and tooling here, without depending
on the project author's external working directory.

## What's the question?

v1.0.25 of the proxy ships an information-theoretic allocation
substrate: three pluggable layers (`VisitScalingModel`, value
function, `AllocationAlgorithm`) compose into a per-turn visit
budget; the SPA can call into this via `capabilities.adaptive_reevaluate.allocation_algorithm`. The substrate is mechanism — what
should the SPA recommend as defaults? That's what this benchmark
answers, and the retrospective documents the arc.

## Headline

**SPA default**: `greedy_eig + monte_carlo_sqrt + lcb_spread`.
Cross-model invariant across three tested NN tiers (b10c128 /
b18c384nbt / b28c512nbt). ~0.62 efficiency on the principled
metric (realised / optimal info gain, piecewise scaling on the
visit-distribution-entropy oracle). The 0.62 ceiling motivates
the Phase 3.5 learned-VF arc as the immediate follow-up.

Read the retrospective for the full picture, methodological
notes, and firewall corrections.

## What's here

| File | Purpose |
|---|---|
| `benchmark_v2.py` | The sweep tool. Resume-capable; reads `plan_v2.json` for configuration, writes to `results_v2.csv` and `cells_v2.jsonl`. Includes the heartbeat workaround for KeepAliveMiddleware and the send-lock for concurrent ws.send. |
| `dashboard_v2.py` | aiohttp + plotly live dashboard. Reads the CSV; serves an auto-refreshing view at `localhost:8001`. |
| `analyze.py` | Post-hoc analysis: scaling-fit table, cluster-robust top-N per model, paired cross-model deltas, ranking-robustness Spearman matrices. Run `python analyze.py` after a sweep completes. |
| `calibrate.py` | Per-model visits/sec calibration. Run before `plan.py` to refresh throughput numbers. Writes `calibration.json`. |
| `plan.py` | OR planner: given a wall-clock budget and the calibrated throughput, compute `n_cells_per_tier` under three allocation strategies (equal-n / skip-fdx6d / hedged). Writes `plan_v2.json`. |
| `calibration.json` | Cached calibration output from the 2026-05-18 run. Median trimmed-mean vps: b10c128 ≈ 13000, b18c384nbt ≈ 2240, b28c512nbt ≈ 1055, fdx6d ≈ 370. |
| `plan_v2.json` | The chosen plan: 145/145/145/25 cells per tier under the tilted-cheap-tiers strategy. T=12 turns/cell. Three budgets (1000, 2000, 5000) per cell. Ten Thompson seeds per (cell, budget). |
| `results_v2.csv.gz` | Compressed raw results — 103,095 rows × 37 columns. Decompressed via `gunzip -k results_v2.csv.gz`. The authoritative source for every quantitative claim. |
| `cells_v2.jsonl.gz` | Per-cell raw oracle measurements (one JSON-line record per cell, 435 records). Contains per-turn `r_int` and `r_full` for each of four oracle metrics, plus cell metadata. Used by `analyze.py`'s scaling-fit calculation. |
| `NOTES.md` | In-process scratch notes from the benchmark session. Contains intermediate hypotheses (some retracted), firewall verdicts, and roadmap entries for Phase 3.5 / 3.7 / 4. The retrospective is the polished record; this is the raw process trail. |

## Reproducing the analysis

```bash
# Unpack the data:
gunzip -k results_v2.csv.gz cells_v2.jsonl.gz

# Run the analysis with cluster-robust + paired SE:
python analyze.py
```

The analysis script is self-contained: it reads `results_v2.csv`,
`cells_v2.jsonl`, and `plan_v2.json`, produces the four-section
markdown report (scaling-fit, top-5-per-model, cross-model
deltas, ranking-robustness Spearman matrices).

## Re-running the sweep

Requires a KataProxy SELECTOR (with `b10c128`, `b18c384nbt`,
`b28c512nbt`, `fdx6d` upstreams configured) and the
`kataproxy` venv with `websockets`, `aiohttp`, `plotly`,
`scipy`, `numpy`, `pandas`, `sgfmill`, `lightgbm`. The SGF
pool at `~/benchmark_sgfs/` should contain a few thousand
real game records.

```bash
# (optional) recalibrate if proxy / hardware changed:
python calibrate.py    # writes calibration.json
python plan.py         # writes plan.json (sibling, equal-n variant)

# Start the dashboard (separate terminal):
python dashboard_v2.py

# Run the sweep:
python benchmark_v2.py    # writes results_v2.csv, cells_v2.jsonl
```

The benchmark is **resume-capable**: if interrupted, just re-run.
It reads the existing CSV to identify completed `(model, sgf,
turn_start)` cells and skips those.

## Notable bugs found during the arc

The benchmark hit four interacting silent-failure bugs before
producing a single clean cell. All four are documented in the
retrospective's "The arc, in chronological shape" section and
in `NOTES.md`'s KeepAliveMiddleware-mis-specification section.

- **Adaptive-reevaluate legacy auto-engage**: queries without an
  explicit `capabilities` field auto-engage all middleware. Fix:
  `"capabilities": {}` opt-out.
- **KeepAliveMiddleware 25-second message-level idle timeout**:
  the proxy terminates long ANALYZE queries from naive clients
  that don't send `query_version` heartbeats. Workaround: parallel
  asyncio heartbeat task at 10s intervals. Underlying contract
  revision filed as a follow-up arc.
- **Concurrent `ws.send()` race**: the websockets library doesn't
  serialise concurrent sends across coroutines. Fix: `asyncio.Lock`
  around every send.
- **Quarter-integer komi rejection**: some SGFs carry komi values
  not on the half-integer grid. Fix: round to nearest 0.5 on SGF
  load + raise loudly on any `error`-field response.

## Methodological notes

Firewall pattern (Opus 4.7 fresh-context reviewers) was applied
twice in this arc:

1. **Pseudo-replication check** on cross-model claims. Found that
   Thompson seed rows (10 per cell) had been treated as 10×
   independent observations; cluster-robust SE drops most |z|
   values from ≈ 5 to ≈ 2. The retrospective uses cluster-robust
   throughout.

2. **Architectural review** on a proposed end-to-end RL approach.
   Returned a "DOWN at current data scale" verdict — supervised
   LightGBM is the right next step; PG-from-scratch on a
   continuous K-simplex action with 435 trajectories is 2-3 OOM
   short of standard PG sample-efficiency.

3. **Retrospective audit** of the document itself before merge.
   Caught a column-count error, a missing filter caveat, and
   a paired-vs-unpaired SE issue that hid a real
   `greedy_eig + policy_entropy` decay on the b18→b28 step.

The firewall pattern was first formalised in the F-optimizer arc;
see `docs/notes/retrospective-katago-f-optimizer-2026-05.md`'s
"Reaching for the firewall" section.

License: Public Domain (The Unlicense).
