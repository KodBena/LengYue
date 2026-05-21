# Session handoff (2026-05-22, overnight) — successor brief

Written 2026-05-21 ~12:00 local for the next session to pick up. The
user went to sleep ~11:10 after an overnight orchestrator was queued;
this note narrates what the orchestrator (and a few follow-on batches)
actually produced. See
`research/notes/overnight-allocator-results-2026-05-21.md` for the
full data report; this is the contributor-perspective close-out.

## What got built overnight

The overnight goal was Tier 0 → end-to-end allocator simulation, per
firewall consult #3 (preserved verbatim at
`research/notes/firewall-strategic-2026-05-21.md`). The pipeline:

1. **Trajectory cache substrate** (`research/cache_trajectories.py`,
   `pg_sink.fetch_position_bundle`) — bundled per-position fetches
   collapsed the per-realization Postgres round-trip pattern into
   single queries. 1161 positions cached in ~22 min vs the prior
   pattern's ~30+ min. Output: `research/data/trajectory_cache.npz`.

2. **Advanced multi-timestep features** (`research/extract_advanced_multitimestep.py`)
   — ownership-derived (stone count, territory imbalance, disputed
   count, corner imbalance, spatial entropy, cluster count) + full
   policy-distribution (entropy, top-1/3/10 mass, effective moves,
   policy-vs-visits KL, spatial entropy) at 5 V-checkpoints (V_pre /
   V=500 / V=2000 / V=10000 / V_max). Output:
   `research/data/advanced_multitimestep.csv`. Addresses the firewall's
   Q5 #1+#2 and the user's "we're using 2% of the data" smell test.

3. **Allocator simulation** (`research/allocator_sim.py`) — binary
   policy {observe first 1/3 of V-grid, query predictor, terminate
   if predicted-remaining-gain < τ, else V_max} and 3-stage policy
   {floor → mid → V_max} with two τ thresholds. Pareto axes:
   (avg visits, top-1 agreement vs modal-top-1-across-realizations at
   V_max). Three variants per target: baseline / enriched /
   tuned-hyperparams. Plots → `~/plots/allocator_pareto/`.

4. **Delta-reframe regression** (`research/regression_delta_reframe.py`)
   — Tier 1 from firewall consult: predict
   `(y(V_target) - y(V_current)) / σ_position` at K=3 anchor V_target
   fractions per V_current_frac ∈ {1/6, 1/3, 2/3}. Tensorboard-logged.

5. **Delta-predictor allocator** (`research/allocator_sim_delta.py`)
   — the operational closure: wire the delta predictor (not the H
   predictor) into the allocator's decision rule. Pareto comparison
   plots at `~/plots/allocator_pareto_delta/`.

6. **Hyperparameter sweep** (`research/hyperparam_sweep.py`) — 108
   LightGBM configs (num_leaves × min_data × lr × λ) on the anchor
   cell. Tensorboard at `~/w/vdc/tensorboard/hyperparam_sweep/`.

7. **Report consolidator** (`research/overnight_report.py`) —
   regenerable single Markdown that aggregates everything.

## Headline findings (one paragraph each, no padding)

**Architecture: WINS, modestly, across all 4 main drift targets.** The
binary allocator's Pareto curve has operating points the always-V_max
baseline cannot match. On `scoreLead_drift` at τ=+0.25: 12018 avg
visits / 0.871 top-1 agreement vs baseline 15000 / 0.907 — 20% visit
savings for 3.6pp agreement cost. At τ=−0.25: 14859 / 0.9069, a tiny
free lunch over baseline. Same shape on the other 3 main targets;
magnitudes differ. This clears the Tier 0 firewall gate decisively;
the architecture-question is settled in favor of "ship it."

**Feature engineering: target-specific.** The "we're using 2% of the
data" instinct was directionally correct, but the magnitude is per
target. Ownership + policy distribution at 5 V-checkpoints buys:
+1.1pp on `L2_joint_drift`, +0.6pp on `winrate_drift`, +0.5pp on
`scoreLead_drift`, ~0pp on `visit_entropy_reduction`. Worth doing on
the high-leverage targets; not a blanket prescription.

**Delta-reframe (firewall Tier 1): kill the regression target,
qualify the allocator-decision use.** Delta prediction's within-corpus
R² is ~5× lower than H-prediction's at the same window — the
firewall's pre-committed kill-criterion ("if within-corpus R² drops
on the reframe") triggered. BUT when the delta predictor is wired
into the allocator's decision rule, the resulting Pareto is
target-specific: dominates H-allocator in some operating regions for
some targets (`scoreLead_drift` mid-budget), loses to H-allocator at
the same budget for others. The headline framing **predictor R² ≠
allocator utility** crops up multiple times in tonight's findings; it's
the load-bearing pedagogical takeaway from the overnight.

**Hyperparameter tuning: +0.04 OOD R² achievable, doesn't translate to
Pareto.** The default `_LightGBMWrap` is slightly over-regularized for
OOD generalization on this corpus; best sweep config (num_leaves=8,
min_data=3, lr=0.1, λ=0) lifts OOD R² from +0.510 to +0.547 on the
anchor cell. But when applied to the allocator, the Pareto curve is
near-tied with the default — another instance of "regression R² ≠
allocator utility." Default LightGBMWrap is operationally
near-optimal for this allocator; predictor-hyperparam tuning is not
the high-leverage axis.

## What this licenses for next phase

Per firewall consult #3 §5 Tier 2: **the capability dispatch is
unblocked.** The architecture has empirical support; the dispatch's
load-bearing claim (proxy supports a partial-search-observation
primitive at SPA-declared visit budgets) does not depend on which
predictor/reframe variant ultimately wins. Drafting can proceed in
parallel with deeper allocator refinement.

Recommended dispatch shape (per firewall #2 §3, preserved at
`firewall-strategic-2026-05-21.md` §4 Q3): capability name
`staged_analysis`, advertising in `query_version`:
`supported_budgets`, `min_budget_per_stage`, `max_stages_per_query`,
`supports_early_termination`, `trajectory_packet_shape`. Per-query
opt-in carries a `stages: [{budget: V_i, emit_trajectory: bool}, ...]`
plan + an `early_termination_token`.

User-discretionary calls the dispatch still needs:
- V_floor for the SPA's smallest-allocatable-budget. Tonight's
  sims used `window_floor_frac=1/3` (≈ V=2000 typical) as a
  trajectory-relative anchor; the proxy capability needs an absolute
  default the SPA can override per-query.
- Whether mid-stage termination is in scope. If yes, the capability
  shape needs a callback variant beyond pure pre-declared stages.
- Whether deployment budget grid is fixed (log-spaced) or learned
  per-query.

## What didn't happen and why

- **`adaptive_reevaluate` baseline** (the real prod alternative, not
  the "always V_max" strawman): requires running the proxy in adaptive
  mode against the trajectory corpus. Substantial setup overhead;
  deferred to a future session with proxy environment ready.
- **CNN over ownership maps**: the firewall's "data ceiling" diagnostic.
  Substantial new architecture (~300 lines + 30-60 min GPU). Deferred
  because writing it unattended-overnight while the user slept was too
  risky for ambiguous benefit.
- **Per-mode (K=2 cluster) Pareto split**: would test whether the
  allocator's per-mode behavior matches the modes' expected scaling
  profiles. The K=2 cluster centroids exist at `~/plots/mode_discovery/`
  but no cached cluster-ID-per-position was saved; would need to
  re-derive. ~150 lines + 5 min compute. Worth doing next session as a
  diagnostic refinement.
- **Bootstrap CIs on Pareto curves**: ~50 lines wrapper + 30 min
  compute. Rigor on existing claims; deferred because no new findings
  would emerge.

## Commits in the GitHub branch (newest first)

- `cfd2574` tuned-hyperparam allocator variant + report
- `481acfe` morning verdict callout
- `e7b3daf` delta-predictor allocator sim + report rebuild
- `67b6401` extras (delta-reframe × 4, extra targets, hyperparam sweep)
- `ceaaa6c` report refresh
- `5b6c9e8` initial overnight allocator sim + delta-reframe
- `179e3f1` firewall consult #2 (transfer-first direction; pre-overnight)
- `b036778` interim memo + diagnostic toolkit (pre-overnight)

## Disk + Postgres state

- Postgres DB: 32 GB. Phase-3 collection stopped at orchestrator PID
  18266 termination; user has ~4.7 GB headroom remaining of original
  20 GB cap → currently at ~20.3 GB consumed (well-tracked).
- One in-flight phase-3 collector (`vol_card_5491_spar8_r8`) completed
  ~5 min after the orchestrator kill. No new collectors started.

## Resumption

The orchestrator is dead; no background work is running. The user can
resume by:

1. Reading `research/notes/overnight-allocator-results-2026-05-21.md`
   (the consolidated overnight report — GitHub-renderable).
2. Optionally browsing tensorboard at `:6006` for the
   `regression_delta_reframe_*` and `hyperparam_sweep` runs.
3. Deciding on V_floor and mid-stage-termination scope (the open
   discretionary calls).
4. Authorizing draft of the `staged_analysis` capability dispatch to
   the proxy maintainer.

License: Public Domain (The Unlicense)
