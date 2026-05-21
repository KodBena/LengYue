# Session handoff (2026-05-21) — successor brief

## What this session was about
Visit-scaling research on KataGo trajectories. The user (bork) is
exploring whether MCTS visit-trajectory shape across positions can be
predicted from features available before-search (phase35) and at
search endpoints, with the long-term goal of a learned visit-allocator
for LengYue's analysis.

## Active workflows when context wraps

### 1. Phase-3 collection (running in background)
- Orchestrator: `validate_volatile_cards.py` at **concurrency=2**
  (PID 18266 as of context-wrap, launched via `setsid`)
- Target: 750 phase-3 volatile-card SGFs at 10 realizations each
- Status: **385/750 cards complete, ETA ~3 hours at ~1100 reals/hour**
- Logs to `/home/bork/plots/validate_volatile_phase3_run.log`;
  per-card sub-logs in `logs/`
- The orchestrator was modified today to add `--skip-done` and
  `--concurrency N` flags
- **Process-management trick**: launched with `setsid` so SIGTERM to
  parent doesn't cascade to children; if you need to kill the parent,
  the in-flight collectors will reparent to PID 1 and finish committing
  to Postgres before exiting

### 2. Throughput data points discovered today
| config | rate | notes |
|---|---|---|
| c=1, batch 32 | 861/hr | morning, before any bumps |
| c=4, batch 192 | 676/hr | proxy-bottlenecked |
| **c=2, batch 192** | **~1098/hr** | the winner |

Don't go above c=2 — the proxy CPU ceiling (single-process asyncio,
caps at 100% one core), not KataGo or the collectors, is the binding
constraint.

## Today's findings (ordered by ROI; full results in /home/bork/plots/)

### 1. regression_advanced_features.py
Extracted policy_kl + 7 score_histogram features in 12 sec from
existing packets. +0.07 to +0.18 R² across 12 targets. `+both`
(phase35 + ownership + advanced) wins 9/12. Best: `scoreLead_drift|y_range`
at R²=+0.401.

### 2. permutation_importance.py
Three "hero" features across the 12-target panel:
- `adv:score_hist_range` — top-1 on 3 score-family targets, max drop −0.114
- `adv:policy_kl` — top-1 on 3 visit-family targets, max drop −0.099
- `own:own_contested_count` — top-1 on L2_joint, −0.098

### 3. regression_per_mode.py — settled the two-stage architecture question
- `+mode_oh` (one-hot mode as feature) wins big on 4/12 targets — up
  to **+0.153 R²** on `scoreLead_drift|H_dlp_median` (+0.192 → +0.345).
  Mode info has bits LGBM can't derive from raw features.
- `per_mode` (specialized heads, one per mode) **loses on 11/12 targets.**
  Specializing the head is a net loss; modes share more structure than
  they differ.
- Conclusion: the two-stage allocator should be **"tasting → derive-mode
  → feed-as-feature into one global head"**, NOT "classify-then-route
  to mode-specific head."

### 4. regression_soft_mode.py
Continuous distance-to-centroid features beat one-hot by **+0.037 R²**
on the test target (+0.345 → +0.382). The K=3 categorical bottleneck
has been costing us throughout, not just here. Only ran on 1 target
(`scoreLead_drift|H_dlp_median`); 3 other mode-helped targets
(`scoreLead|y_at_V_max`, `winrate|y_range`, `logit_winrate|y_range`)
still pending — ~15 min combined, run when CPU is idle.

## Files created today
- `research/regression_advanced_features.py`
- `research/extract_advanced_features.py` (the policy_kl + score_histogram
  extractor, V_pre + V_max only, ~2GB query)
- `research/regression_per_mode.py`
- `research/permutation_importance.py`
- `research/regression_soft_mode.py`
- Modifications to `research/validate_volatile_cards.py` (added
  `--skip-done`, `--concurrency`)

## Architectural conclusions (settled today)
- **Don't do classification → regression.** Mode-as-feature works;
  mode-as-routing-key doesn't.
- **The categorical bottleneck is costly.** Even K=3 hard assignment
  loses ~+0.04 R² vs continuous distances.
- **Pivot for next phase:** "tasting → direct partial-search features
  → one global regression head → cost-aware allocation" (mode may
  re-enter at the *allocation* step as a policy switch, but not at the
  regression step).

## What's left in the bag
1. **Expand soft-mode** to the 3 other mode-helped targets (15 min
   when CPU is free; uses
   `regression_soft_mode.py --target X --column Y`).
2. **Direct partial-search regression** — feed +1/3 partial-MCTS
   features straight into regression, skipping mode classification
   entirely. The architectural test of the pivot.
3. **Multi-timestep advanced features** — policy_kl + score_histogram
   at +1/3 and +2/3 packet windows, not just V_pre and V_max.
4. **CNN/sequence models retrain** once phase-3 doubles the corpus.

## Important context for resumption

### ADRs and CLAUDE.md discipline
Project has very strict documentation/ADR rules. Read
`docs/adr-synopsis.md` first. ADR-0002 (fail loudly) and ADR-0004
(minimal-touch under partial visibility) are load-bearing. ADR-0002
applies with special force to *documentation consumption* — read
end-to-end before citing.

### Memory system
At `/home/bork/.claude/projects/-home-bork-w-omega/memory/`. Key
memories saved today (or already there):
- `feedback_long_running_scripts_progress.md` — scripts >1 min must
  emit progress with `flush=True`
- `feedback_tensorboard_default.md` — tensorboard for any process the
  user wants to follow live (server at :6006)
- `project_research_redis_topology.md` — research Redis is 6380
  (memory-only), NOT 6379 (qEUBO, persistent on tight /home)
- `project_cards_db_semantics.md` — `num_moves` is sparring length,
  position is LAST move of SGF
- `feedback_let_chips_fall_where_they_may.md` — pick reasonable, name
  tradeoff, proceed
- `project_actual_pedagogy.md` — LengYue has 5 vantage points, don't
  author product-thesis statements
- `project_move_vs_turn_axes.md` — moves and turns are co-equal
  first-class axes
- `feedback_type_sanity_primary_motive.md` — lean toward comprehensive
  type-tightening

### Useful tensorboard paths
- `regression_advanced/run_1779334290`
- `regression_per_mode/run_1779339198`
- `permutation_importance/run_1779339200`
- `regression_soft_mode/run_1779344507`

### Postgres / DB
Research DB at `host=192.168.122.1 dbname=research`. Schema:
`mcts_position`, `mcts_realization`, `mcts_packet`. Use the batched
CTE pattern for endpoint queries (see `extract_advanced_features.py`'s
`fetch_endpoints_batched`) — 390× speedup over per-realization
queries.

### Branch
`KodBena/feat/spa-adaptive-max-rounds` (mixed bag — research/ changes
and the SPA adaptive-rounds work). The phase-3 work and today's
research files are uncommitted; ask the user before staging.

### Tone
Methodical, deferential to existing structure. User is very honest
about their out-of-depth-ness on the ML side, asks teaching questions,
appreciates accurate caveats. They reset context frequently — prefer
informative tightly-written summaries over flowery prose.
