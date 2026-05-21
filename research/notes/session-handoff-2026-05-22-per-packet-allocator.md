# Session handoff (2026-05-22, per-packet allocator arc) — successor brief

Continuation of the visit-scaling research arc from
`session-handoff-2026-05-22-stability-reframe.md`. That handoff
described the user's first architectural intervention (predict the
*decision* — P(top-1 stable) — instead of continuous shape
descriptors). This session built the substrate behind the
stability-classifier into a full per-packet **optimal-stopping
allocator**, validated the budget-fraction reframe, and surfaced the
critical headroom-vs-classifier-quality tradeoff via a marginal-value
null result.

The arc is now in a state where the **per-position policy is
settled**: ship the threshold rule with `f_max≈0.85` as the training
anchor. The remaining cross-team work is the capability dispatch
shape (and the cross-position batch-allocation layer it would carry).

## Where the arc is RIGHT NOW

**Branch**: `bork/research/visit-scaling-memo-2026-05-21`
**Eight commits on top of `286778d`** form this session's arc:

```
616a72b  marginal-value stopping rule — null result vs threshold
2686379  bootstrap confirms f_max≈0.85 peak (follow-up to 8bb10ed)
8bb10ed  f_max sweep — budget-fraction transfer test
62ca0c8  per-packet sim — Pareto frontier filter
e69b7b0  per-packet stability allocator (optimal-stopping reframe)
75962d6  budget-fraction reframe + diagnostics
e41c425  per-chunk + per-200-scan Phase A progress prints
c4b81e8  stability-classifier perf — 9× Phase A speedup
```

No background processes running. All changes committed locally; not
pushed (per the user's standing `feedback_no_push_before_test`
memory — push only after user testing).

## Architectural decisions settled this session

1. **Optimal-stopping framing is the right semantic.** The classifier
   is queried at every packet, not just at one V_term. The simplest
   stopping rule (terminate at first cutoff where `P_stable > τ`) is
   the deployment policy.

2. **Log-V-weighted stable_fraction is the canonical label** (vs the
   old linear-V weighting). Makes labels invariant under absolute
   budget rescaling — same label semantics whether training at
   V_max=15000 or V_max=600. Cache schema v2_logV; old caches
   force-invalidated.

3. **Phase A reads the thin-projected packet column** (`mcts_packet.msg_thin`)
   populated by the one-time backfill. ~9× faster pickle.loads vs
   the lossless path. Backfill is done; all 2.23M packets carry both
   columns; forward writes (`StreamWriter.append`) populate both.

4. **Per-packet evaluation at K=11 cutoffs** (grid indices
   `[4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44]`) along the V_grid.
   For f_max < 1.0, the runtime cutoff set filters to those strictly
   below the budget endpoint (max_idx).

5. **`f_max=0.85` is the training anchor**, not f_max=1.0. Bootstrap
   confirmed (20 retrains, paired win rate 75–100% vs f_max=1.0
   across top1_move / top2_margin_quintile / top3_set). Effect size
   is small (+0.02–0.03 mean AUC OOD lift) but consistent. The
   mechanism: the late-V tail [V_grid[44], V_grid[49]] adds
   un-predictable flips that hurt the label.

6. **Threshold rule is near-optimal given the current classifier.**
   Marginal-value sweep with P-trajectory oracle (look-ahead on the
   classifier's per-cutoff P_stable) gives essentially zero
   improvement over the threshold rule. Truth-oracle (look-ahead on
   ground-truth per-cutoff agreement) opens a +0.20 agreement gap at
   low budgets — but the classifier's per-position cutoff ordering
   isn't reliable enough to capture it. Building a learnable
   look-ahead policy on the current classifier won't beat threshold.

7. **`b10c128` is a deliberate testbed net.** Production targets
   larger nets (b28 at V=200 + 800 adaptive named on 2026-05-22).
   The visit-scaling research uses b10 because it's cheap;
   transfer to other nets is a separate future-work axis.
   See `[[project_b10_testbed_intent]]` memory.

## Unsettled questions (queued for next session)

1. **Specific deployment τ.** The Pareto curves are visible; the
   operator needs to pick an operating point. For `top1_move @
   f_max=0.85, threshold=0.95` the curve sweeps `avg V ~672 →
   ~14000` with agreement `0.75 → 0.90`. The cost-utility λ that
   defines "the" τ hasn't been specified.

2. **Cost-utility function.** Open since firewall consult #2 (2026-
   05-21). Candidates: `agreement − λ·visits`, `agreement −
   λ·log(visits)`, `min visits s.t. agreement ≥ floor`. The Pareto
   sweep sidesteps the question by giving the operator the whole
   curve.

3. **Cross-position batch allocation.** User confirmed (this session)
   that the dispatch should carry this. Mechanism: after the initial
   B=200 stream completes for N positions in flight, the SPA sorts
   by `E[gain from continuing]` per position (from the classifier
   output) and spends the remaining adaptive budget on the top-k.
   Pathological / converged positions naturally get zero.

4. **Capability dispatch wire shape.** The dispatch to the proxy
   maintainer is unwritten. From firewall consult #2 §Q3 the working
   sketch is `staged_analysis` with mid-stage termination via
   `early_termination_token`. The cross-position layer (3) adds a
   batch-awareness component to that shape that the firewall
   anticipated as a separate question.

5. **Future classifier work**. The truth-oracle 20pp gap is the
   prize. Approaches: per-position optimal-cutoff prediction
   (vs global stability prediction), better features (advanced
   multi-timestep already done; ownership / policy fusion
   considered), sequence-model on the packet stream. Out of scope
   for the deployment-track arc but on the roadmap.

## Empirical findings the successor needs to know

### Phase A is now fast

- ~22 positions/sec on the thin-fetch path
- Full corpus (1161 positions) Phase A rebuild: ~33s (cold)
- Re-runs at the same `(f_max, schema)` hit the disk cache for free

### Skip-rate at production operating points

From `analyze_immediate_rejection.py`:

| B_initial | B_total | skip rate τ≥0.90 (ALL) | year2k | cards |
|---|---|---|---|---|
| 200 | 1000 (≈) | ~0.52 | ~0.61 | ~0.49 |
| 200 | 3000 | 0.43 | 0.47 | 0.41 |
| 400 | 1000 (≈800) | 0.67 | 0.69 | 0.66 |

The B_initial=200 ↔ V_max=1000 skip ceiling at τ=0.90 is **~50%**, not 80%.
This corrects an earlier mis-read of "80% converged" from the regime
classification — the 80% was "reaches stability eventually," not
"safe to skip from V_pre."

### Per-extractor Pareto envelope (top1_move @ f_max=0.85, threshold=0.95)

```
   tau   avg_visits   agreement
  0.05         674      0.7820
  0.50        3500      0.7900  (very approximate; read from /home/bork/plots/...)
  0.85       10000      0.8700
  0.95       13500      0.8950
```

For deployment B≈1000 the relevant range is the low-V end (τ ≤ 0.30
typically picks up the smaller cutoffs). The Pareto extends smoothly
through the production budget envelope.

### Truth-oracle headroom

| at avg V | truth − threshold | marg(P) − threshold |
|---|---|---|
| 1500 | +0.20 | ≈ 0 |
| 3000 | +0.18 | ≈ 0 |
| 6000 | +0.12 | ≈ 0 |
| 10000 | +0.06 | ≈ 0 |

20pp at low budget is real and meaningful. **Not** capturable by the
current classifier; needs better classifier work.

### winrate_change_10 is operationally degenerate

Pos_rate stays at 0.98–0.99 across all f_max. The AUC OOD is a
ranking artifact of extreme label imbalance, not a real signal.
**Deprecate this extractor in any future runs.** User flagged the
tracker design itself as unreliable; consider replacing with a
calibrated band-crossing variant or dropping entirely.

## Files inventory

### New this session (committed)

- `pg_sink.py` (modified) — `msg_thin` column, `project_thin()`,
  `fetch_positions_bundle_thin_batch()`, `count_thin_coverage()`,
  `StreamWriter.append` populates both columns.
- `backfill_msg_thin.py` — restartable backfill (already run).
- `stability_trajectory.py` (modified) — `stable_fraction_logV`
  (log-V weighted variant), V-sorted change-point cache,
  `from_changepoints` constructor.
- `allocator_sim_stability.py` (modified) — budget-fraction reframe,
  thin-fetch path, Pareto-aware sims, cache schema v2_logV.
- `allocator_sim_per_packet.py` (new) — per-packet optimal-stopping
  allocator. Phase A produces K-vector stable_fractions per cell.
  Phase B substrate has K rows per (position, realization). Sim
  walks cutoffs and stops at first `P > τ`. Marginal-value sibling
  sim is included for the comparison study. Per-f_max cache
  subdirectories (`data/stability_cache_per_packet/f_max_{:.3f}/`).
- `diagnose_per_v_curves.py` (new) — per-V_t curve diagnostic
  visualizing converged / worth-deepening / pathological regimes.
- `analyze_immediate_rejection.py` (new) — per-(B_initial, B_total)
  rejection-rate matrix.
- `compare_sweeps.py` (new) — v1/v2 sweep-summary diff utility.
- `compare_stopping_rules.py` (new) — threshold vs marg-val(P) vs
  truth-oracle Pareto comparison.
- `sweep_f_max.py` (new) — wrapper that runs the per-packet pipeline
  at multiple f_max values and aggregates summaries.
- `bootstrap_f_max_stability.py` (new) — 20-bootstrap retrain at
  fixed f_max for AUC OOD distribution and paired win rates.

### Artifacts (uncommitted, plots / summaries on disk)

- `~/plots/allocator_pareto_per_packet/` — main per-packet sim plot +
  summary
- `~/plots/per_v_curves/` — per-V_t curve diagnostic
- `~/plots/immediate_rejection/` — production-aligned rejection rates
- `~/plots/allocator_pareto_f_max_sweep/` — f_max ∈ {0.5, 0.7, 0.85, 1.0}
- `~/plots/allocator_pareto_f_max_fine/` — finer grid {0.7…1.0}
- `~/plots/compare_stopping_rules/` — threshold vs marg-val vs truth
- `~/plots/allocator_pareto_stability_v1_linearV/` — v1 baseline
  (preserved for the v1 vs v2 weighting comparison)

### Caches on disk

- `data/stability_cache/` — v2_logV labels (single-cutoff allocator)
- `data/stability_cache_per_packet/f_max_{0.500,0.700,0.850,1.000}/`
  — v3_per_packet labels (per-packet allocator), one subdirectory
  per f_max
- `data/trajectory_cache.npz` — the underlying V_grid/phase35/y_mean
  substrate (unchanged; built 2026-05-21 morning)

### Memory entries added or updated this session

- `feedback_ask_before_probing_db.md` — ask the user about
  intent-laden facts rather than running a SQL probe first.
- `project_b10_testbed_intent.md` — b10 is the deliberate testbed
  net; production transfer is future work.

## Reading priority for the successor

1. **`research/notes/session-handoff-2026-05-22-stability-reframe.md`**
   — the previous handoff, for context on the user's first
   architectural intervention. Names the firewall consult #4
   refinements.
2. **This document**. Especially the "Architectural decisions
   settled" and "Unsettled questions" sections.
3. **`research/allocator_sim_per_packet.py`** — the main deliverable.
   ~1100 lines, ~75% structural docstrings. Read the module
   docstring + the four substrate functions
   (`phase_a_build_per_packet`, `build_phase_b_substrate_per_packet`,
   `_precompute_cards_per_packet_sim_substrate`,
   `simulate_per_packet_allocator`).
4. **`research/notes/firewall-strategic-2026-05-21.md`** §Q3 (the
   `staged_analysis` capability sketch) — the starting shape for the
   dispatch.
5. **`~/plots/compare_stopping_rules/compare_stopping_rules_f_max_0.850.png`**
   — the truth-oracle vs threshold gap visualized. Confirms the
   marginal-value null result and surfaces the 20pp headroom.

## Suggested next concrete actions

In rough order:

1. **Pick a specific deployment τ.** For `top1_move @ f_max=0.85,
   threshold=0.95`, the user's production B≈1000 picks a τ that
   lands the Pareto curve near (avg V≈1000, agreement≈0.79). Browse
   the curve, settle on the operating point.

2. **Cross-position batch allocation design.** Concrete:
   - SPA holds a batch of N positions post-initial-V=200 streams
   - Per position, classifier outputs `(P_stable_k, V_at_cutoff[k])`
     at each observable cutoff so far
   - Allocator's `E[gain from continuing]` per position ≈
     `next_cutoff_P_stable − current_P_stable` (or a learned
     continuation-value estimate; see the truth-oracle gap finding)
   - Sort batch by descending expected gain; allocate remaining
     adaptive budget top-down
   - Pathological / converged positions naturally get zero

3. **Draft the `staged_analysis` capability dispatch** to the proxy
   maintainer. Should include both:
   - Per-position mid-stage termination (firewall consult #2 §Q3
     sketch already covers this)
   - Batch-awareness: a way for the SPA to declare "I'm working on
     N positions, here's my priority order for the next stage"

4. **f_max=0.85 as canonical training anchor.** Any production
   classifier checkpoint should train with V_max truncated to
   grid_idx=42 of the per-position V_grid (or equivalent absolute V
   on a re-collected corpus). Bootstrap evidence is on file in
   `2686379`.

5. **Future-work flag: per-position optimal-cutoff classifier.** The
   20pp truth-oracle gap is the prize. A classifier trained to
   identify WHICH cutoff is best per position (vs predicting global
   stability) is a different learning problem and likely needs
   sequence-model architecture. Out of scope for this arc; on the
   visit-scaling roadmap.

## User preferences observed this session

- "Everything is today" — concrete actions over week-by-week
  planning.
- Ask before probing the DB for intent-laden facts (the user has
  context that isn't in the data; see
  `[[feedback_ask_before_probing_db]]`).
- The b10 net is deliberate; don't conflate it with production
  net-transfer concerns (see `[[project_b10_testbed_intent]]`).
- Sibling-revision commits rather than amends when findings shift
  (followed for the bootstrap follow-up to `8bb10ed`).
- Bootstrap is the right methodology for noisy AUC comparisons;
  single-fit sweeps are unreliable at the ±0.02 effect size.
- User finds winrate_change_10 / band-tracker design uninteresting;
  not worth investing in.

## Standing notes / running constraints

- All long-running scripts (>1 min) must emit flushed progress (see
  `[[feedback_long_running_scripts_progress]]`).
- Per-packet pipeline is at f_max=0.85 for production; the cache
  directory `data/stability_cache_per_packet/f_max_0.850/` is the
  canonical training corpus. Other f_max caches exist for the
  sweep; they're keep-around-for-now but not the deployment anchor.
- Postgres on `192.168.122.1` with `msg_thin` populated for all
  2.23M packets. `count_thin_coverage(conn)` is the smoke check.

License: Public Domain (The Unlicense)
