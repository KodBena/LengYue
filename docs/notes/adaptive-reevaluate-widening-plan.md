# Widening `adaptive_reevaluate` — design note

- **Status:** `design-note: planned`
- **Date:** 2026-05-18
- **Scope:** proxy submodule (substrate); SPA-side authoring surface
  as an out-of-scope follow-on.
- **Genre:** planning record. The note maps the design space;
  eventual implementation lands as proxy-side roadmap arcs under
  `proxy/docs/`, one per phase or grouped.

This note proposes a widening of `adaptive_reevaluate` from its
current single-shot, hardcoded-metric, symmetric-window shape into
a pluggable adaptation-policy substrate. The widening is phased so
the first arc ships small and immediately useful, with subsequent
arcs mapping the destination.

## Why this exists

Three observations.

**The current shape is calibrated to one phenomenon.**
`_find_worst_turns` hardcodes "mean of `extra.<color>.deltas`" —
averaged policy deltas — as the selector. This calibrates
adaptive's intervention to the strong-player MCTS-vindication
phenomenon, where deeper search shifts the visit distribution
toward moves the player chose despite their initial low ranking.
The phenomenon is real and the selector serves it well, but it is
one phenomenon among several worth chasing: positions with high
policy entropy (where KataGo is uncertain regardless of player
strength), positions where the score lead is unstable across
turns, positions where the played move diverges sharply from the
policy head, positions where ownership flux is high. Each is a
different study question; the current selector serves one of them.

**The orchestration substrate already supports multi-round
adaptation; the abstraction is missing.** `OrchestrationContext.spawn`
returns an async iterator, and a coroutine can call it
sequentially any number of times within one parent query. The
framework's depth bound (`max_depth=4`) governs *nested*
orchestration — a coroutine whose spawn triggers another
orchestrator — not sequential spawns at the same depth. So a
multi-round adaptive loop expressed as
`for round in budget.rounds(): async for resp in ctx.spawn(deeper_k): yield resp`
is mechanically supported today. Current `adaptive_reevaluate`
does one round. The substrate is there; the abstraction is
missing.

**Real adaptation is a budgeted decision problem.** The current
`extra_visits` parameter is a single per-deepening scalar —
useful, but not a budget. A budgeted formulation asks: given a
constraint (K rounds, total extra-visits, wall-clock time, a
convergence threshold), what allocation maximises what the
researcher values? Under that framing, the "worst by some
metric" rule reads as a crude proxy for an acquisition function
in the multi-armed-bandit sense; the principled framing has a
value function (expected information gain) and an allocation
algorithm (greedy, knowledge-gradient, Thompson sampling, UCB).

## Map of the design space

Five threads, named for the rest of the note's organisation:

- **(a) Selector pluggability** — which turns to deepen, authored
  as expression.
- **(b) Multi-round adaptation** — loop the select-and-deepen K
  times.
- **(c) Budget abstraction** — what does "K times" mean (rounds,
  visits, time, convergence; context-dependent profiles).
- **(d) Information-theoretic allocation** — principled
  value-of-visits modelling and budget-constrained optimisation.
- **(e) Window correction** — small bundled fix per the per-color
  displacement observation.

The phasing treats (a) + (e) as the immediately-shippable arc, (b)
+ (c) as the next substantive widening, (d) as the principled
direction, and a destination — user-authored policies on the same
substrate — as charted but out of scope here.

## Phase 1 — Selector pluggability + window correction

The immediately-shippable arc. Delivers user-named cheap-metric
examples (policy entropy, score-lead variance, ownership flux,
policy-vs-played divergence) without changing the loop structure,
plus the window correction bundled in the same change.

### Selector as expression

Add a fourth binding role to `RegistryInterpreter`'s vocabulary:
`selector_fn` (working name; alternatives in the open-questions
section). Same shape as the existing three roles (`delta_fn`,
`summary_fn`, `state_fns`). The expression returns a per-turn
scalar; lower is worse. The orchestration coroutine collects
per-turn scalars, sorts, and selects the worst-quantile fraction
as it does today — the only change is *how* the per-turn scalar
is computed.

The substrate is already in place. The registry interpreter
compiles user-supplied symbols against a curated stdlib
(`entropy`, `normalized_entropy`, `mean`, `median`, `percentile`,
`sliding_*`, `apply_window`, plus standard numpy reductions and
arithmetic). The 2026-05-02 security audit settled the curation
boundary: no arbitrary callables, refused-dtype gates,
element-count caps, the `apply_window` higher-order combinator
restricted to asteval-compiled procedures only. Adding a binding
role rides this surface unchanged; no new attack surface.

### Example expressions

The selector returns a per-turn scalar; lower-is-worse. Concrete
examples:

- **Mean policy delta** (the current default, restated as an
  expression for parity). Negated because the current behaviour
  treats low deltas as worst; lower-is-worse keeps the sort
  orientation honest:

  ```
  selector_fn(x) = -mean(x['deltas'])
  ```

- **Policy entropy.** High entropy means the policy distribution
  is dispersed: KataGo is uncertain about the best move.
  Negative because higher entropy is more interesting to deepen,
  by hypothesis:

  ```
  selector_fn(x) = -normalized_entropy([mi['policy'] for mi in x['moveInfos']])
  ```

- **Score-lead instability.** Variance over a sliding window of
  consecutive turns' score leads:

  ```
  selector_fn(x) = -var(window_score_leads(x))
  ```

  Where `window_score_leads` is a user symbol built from
  `apply_window`.

- **Policy-vs-played divergence.** How far is the move actually
  played from the policy head's top suggestion:

  ```
  selector_fn(x) = abs(played_policy(x) - top1_policy(x))
  ```

- **Combinations.** Standard arithmetic over the above. The
  substrate composes cleanly.

### Expression input shape — open

What does the selector see? Three candidate shapes:

1. **Per-turn packet alone:** `selector_fn(packet) → scalar`.
   Matches the existing `delta_fn` shape. Simplest to author and
   explain. Cross-turn metrics (windowed variance, multi-turn
   aggregations) require pre-computation in `state_fns` plus a
   value lookup in the selector. Curated `apply_window` makes
   this tractable but indirect.

2. **List of all finals:** `selector_fn(finals) → list[scalar]`.
   Returns one scalar per turn in one call. Enables global /
   windowed metrics natively but breaks the "one function per
   packet" mental model the rest of the substrate uses.

3. **Per-turn packet plus windowed context:**
   `selector_fn(packet, neighbours) → scalar`. Middle ground.
   Adds one argument; gives cross-turn access without changing
   the per-packet shape.

Recommendation: shape (1), with cross-turn aggregations channeled
through `state_fns` and `apply_window`. Shape (2) and (3) are
available as later extensions if shape (1) proves too narrow in
practice.

### Defaults and backwards compatibility

When no `metric_binding` is named (legacy clients, or
capability-aware clients that don't author a metric), the selector
falls back to the current hardcoded path. Wire-compatible in both
directions. The hardcoded path remains the reference
implementation for "what adaptive does without configuration."

### Wire shape

The capability metadata gains an optional field:

```json
"capabilities": {
  "adaptive_reevaluate": {
    "worst_quantile": 0.25,
    "extra_visits": 800,
    "metric_binding": "my_entropy_metric"
  }
}
```

The named binding resolves against the `analysis_config.symbols`
block already carried for delta-analysis. One block; one
expression world; the capability metadata names which symbol is
the adaptive selector.

The alternative shape — a sibling top-level wire field
(`adaptive_config`) parallel to `analysis_config` — is named in
the open-questions section.

### Window correction (bundled)

The asymmetry: `_find_worst_turns` does per-color displacement at
the worst-turn identification level (Black turns get
`displacement=0`, White turns `displacement=1`), but
`_expand_window` then applies a symmetric `range(-half, half+1)`
expansion that ignores color. The asymmetry is a bug: for a Black
move at turn T, the contextually-load-bearing neighbour is T-2
(Black's own previous move), not T-1 (White's intervening move).

Proposed: replace the symmetric expansion with same-color
predecessor expansion. For each worst turn T, include T-2, T-4, …
back through `window_size - 1` same-color predecessors. Default
`window_size=2` (the worst turn plus its immediate same-color
predecessor), matching the observation that 2-element per-color
is more honest than the current symmetric ±1.

Backwards-compat: hard-flip on the version bump (one consumer is
coordinated; the release annotation names the change). Alternative
— opt-in via capability metadata — is named in the open-questions
section.

## Phase 2 — Multi-round adaptation + budget abstraction

The first substantive widening. The coroutine grows a wrapping
loop; the loop reads a budget abstraction from the capability
metadata; each iteration is one round of select-and-deepen.

### The loop

```python
async def coro(parent, ctx):
    finals = await collect_originals(ctx)
    state = init_state(finals)
    budget = parse_budget(capability_metadata)

    while budget.has_capacity(state):
        candidates = state.candidate_turns()
        scalars = compute_scalars(candidates, state)
        chosen = budget.allocate(candidates, scalars)
        deeper = build_round_query(parent, chosen, budget.visits_for_round())
        async for resp in ctx.spawn(deeper):
            yield resp
            state.observe(resp)
        budget.consume_round(state)
```

The framework owns parent-child relationships, response routing
onto the parent's orig_id, cancellation propagation. The
coroutine owns the loop logic and the budget bookkeeping. No
framework changes required.

### Budget shapes

Four shapes the budget abstraction admits:

- **Fixed K rounds.** Budget tracks remaining rounds; terminates
  at zero. Simplest. Suitable for "give me three rounds of
  deepening, no matter what."
- **Total extra-visits across all rounds.** Budget tracks
  cumulative extra-visit budget; each round allocates a slice
  (equal-share, or per-allocation-algorithm); terminates when
  remaining < smallest meaningful allocation. Suitable for
  "spend up to 3000 visits total, however you want."
- **Wall-clock / GPU-time.** Budget tracks elapsed time;
  terminates when threshold passes. Useful when the caller has a
  latency contract — review-session, autonomous-loop with
  deadlines.
- **Convergence-driven.** No fixed budget; the budget object
  observes responses and terminates when a stability metric stops
  moving (e.g., the worst-quantile turn's mean score moved less
  than ε in the last round). Useful when the question is "deepen
  until we've learned what we're going to learn."

### Context-dependent profiles

Budgets are not one-size; the right shape depends on caller
context. Three context profiles worth pre-curating:

- **`review-tight`:** single round, K=1, modest extra-visits.
  Review-session queries are turn-locked — long adaptation would
  corrupt the timing the SR session assumes. Current adaptive
  behaviour reframed as a profile.
- **`range-generous`:** up to 3-5 rounds, total-extra-visits
  budget, allows convergence-driven termination. Range-based
  analysis queries from the toolbar — the researcher is studying
  a position; deeper exploration is welcome.
- **`loop-aggressive`:** larger budgets, wall-clock-bounded,
  convergence-driven termination. The autonomous-SR-loop's variant
  when the loop has GPU minutes to spend per card.

Wire shape: the capability metadata names a profile string, or
carries a raw budget object for ad-hoc shapes:

```json
"capabilities": {
  "adaptive_reevaluate": {
    "budget": "range-generous",
    "metric_binding": "my_entropy_metric"
  }
}
```

Or:

```json
"budget": {
  "max_rounds": 5,
  "total_extra_visits": 3000,
  "convergence_epsilon": 0.5
}
```

The profile-to-raw expansion happens proxy-side at coroutine
entry; the SPA authors the raw shape only when ad-hoc profiles
are needed.

### Streaming previews continue to work

The v1.0.20 streaming-preview refactor stays in place: each
round's deeper query emits `is_during_search=True` previews and
`False` authoritative finals as KataGo produces them. From the
SPA's perspective, partial-then-final transitions arrive
throughout the adaptation, not just at the end. The
merge-extra-into-existing logic — the v1.0.21 fix that closed the
empty-extra-from-sub-queries bug — applies unchanged.

### Defaults and backwards compatibility

When no budget is named, the default is K=1 — single round, current
behaviour. Wire-compatible in both directions. Legacy clients (and
capability-aware clients that don't author a budget) see no
behaviour change.

## Phase 3 — Information-theoretic primitives

The principled direction. Frames adaptation as a budget-constrained
acquisition problem and ships the substrate for principled
allocation.

### Three pluggable layers

The information-theoretic framing has three layers, each separately
pluggable.

**(I) Model of "what additional visits buy."** An empirical or
theoretical f(V, current_visits) → expected entropy / variance
reduction. KataGo's LCB-spread-versus-visits is one natural
calibration: the LCB spread on a move's value scales (approximately)
as 1/√N with visits; the visit distribution converges (approximately)
at a known rate. A calibrated model lets the proxy estimate
"spending 200 more visits on turn T will reduce its policy
entropy by Δ in expectation." The model is pluggable: the proxy
can ship an empirical default and accept user-authored overrides.

**(II) Value function over per-turn information.** What does the
researcher value? Several candidates:

- **Confidence in best-move identity.** The probability that the
  top-N visit distribution does not reshuffle with more visits.
- **Tightness of score-trajectory estimates.** The variance of
  the score-lead-through-the-game curve.
- **Policy-distribution shape clarity.** The KL between the
  policy head and the visit distribution; a measure of "has
  search confirmed the prior?"

A value function maps the per-turn analysis state to a scalar
reward-per-unit-of-clarity-gained. The same expression substrate
the selector uses (the registry interpreter with the curated
stdlib) hosts it. One value function per query (named via
capability metadata) suffices.

**(III) Allocation algorithm.** Given the model (I) and the value
function (II), solve the budget-constrained allocation. Standard
active-learning / Bayesian-experimental-design algorithms apply:

- **Greedy:** at each round, pick the turn whose expected
  value-gain-per-visit is highest. Simple; surprisingly hard to
  beat in practice.
- **Knowledge-gradient:** expected one-step improvement in the
  maximum across all turns. Better at exploration; more expensive
  to compute.
- **Thompson sampling:** sample a possible "true" reward
  distribution from each turn's posterior; pick the turn with
  highest sampled reward. Self-regularising.
- **UCB-style:** upper-confidence-bound on the per-turn reward.
  Standard bandit toolkit.

Curated set of named algorithms in capability metadata:

```json
"capabilities": {
  "adaptive_reevaluate": {
    "budget": "range-generous",
    "metric_binding": "best_move_confidence",
    "allocation": "knowledge_gradient",
    "value_binding": "score_trajectory_tightness"
  }
}
```

The registry interpreter substrate remains the escape hatch for
"I want my own allocation algorithm" — that's Phase 4's territory.

### What's deliberately out of scope here

The proxy substrate accepts pluggable models, value functions, and
allocation algorithms. It does *not* ship a calibrated empirical
visit-scaling model in-tree. That calibration is research work —
fit f(V, current_visits) against many positions, validate against
held-out positions, document the calibration's domain of validity.
The research arc is separate from the substrate arc; the substrate
ships first so calibration work has a target shape to fit into.

In practice the substrate ships with an obvious default
(e.g., a 1/√N variance-reduction model with a single calibration
constant) so the system is not useless out of the box, but the
default is explicitly named as "place-holder; calibrate against
your workload."

## Phase 4 — User-authored adaptation policies (future direction)

The destination, not the next arc. Worth charting briefly so the
substrate's eventual shape is honest.

The fullest expression of the widening: the user authors the
entire adaptation policy as a small program against curated
primitives — `select`, `spawn`, `observe`, `update`, `terminate`.
The substrate is the registry interpreter extended for
program-shaped bindings rather than scalar-expression bindings.
The program runs on the proxy in the same security envelope the
scalar expressions do (curated callables only, no arbitrary
Python).

What this enables: novel adaptation policies that don't fit any
pre-curated allocation algorithm; cross-game adaptation policies
(the autonomous-SR-loop note's territory); experimental policies
during research without proxy code changes.

What this requires: substrate work on the registry interpreter to
handle program-shaped bindings (control flow, state, observations)
safely; a curated primitive set covering the policy verbs; a
discipline for resource accounting (a runaway policy must
terminate). Substantive arc; out of scope for an initial widening,
but Phases 1-3 are designed so that the move to Phase 4 is
additive, not a rewrite.

## Wire shape — by phase

Each phase's wire-shape additions are layered on the existing
`capabilities.adaptive_reevaluate.{...}` dict.

| Phase | Field added | Type | Purpose |
|---|---|---|---|
| 1 | `metric_binding` | str | Names the symbol in `analysis_config.symbols` that serves as the per-turn selector. |
| 1 | `window_size` (semantics change) | int | Reinterpreted as same-color predecessor count. Default 2. |
| 2 | `budget` | str \| object | Profile name or raw budget shape. |
| 3 | `allocation` | str | Named allocation algorithm. |
| 3 | `value_binding` | str | Names the value-function symbol. |
| 3 | `visit_model` | str (optional) | Names the visit-scaling model; defaults to proxy default. |
| 4 | `policy_binding` | str (or analogous) | Names a program-shaped user policy. |

All additions are optional; absent fields fall back to per-phase
defaults.

### Wire-shape choice — open

An alternative carries the substantive expressions on a sibling
top-level field (`adaptive_config`) parallel to `analysis_config`,
rather than naming bindings within the existing `analysis_config`
block. Trade-off: separation of concerns (cleaner) versus
reusing one expression world (less plumbing, one interpreter per
query). Recommendation: ride on `analysis_config` (the
`metric_binding: str` reference pattern) for Phase 1; revisit if
Phase 3's value-function expression authoring proves unwieldy
in shared symbols.

## Composition with existing precedents

Across all four phases:

- **`RegistryInterpreter` is the expression substrate.** Phase 1
  adds one binding role; Phase 3 adds two more; Phase 4 extends
  the substrate itself. The 2026-05-02 security audit's boundary
  holds across all phases.
- **`CapabilityGatedMiddleware` is the gate.** Per-query opt-in
  remains the engagement mechanism; real GPU savings on opt-out
  preserved. Unchanged across all phases.
- **`_PROXY_ONLY_FIELDS` is the wire-strip.** Phase 1 reuses the
  existing `analysis_config` entry; Phase 2+ may add
  `adaptive_config` if the alternative wire shape is chosen. The
  central wire-strip discipline (one authoritative line,
  additions as tuple extensions) extends naturally.
- **The orchestration framework is the loop substrate.** Phase 2
  uses `ctx.spawn` sequentially within one coroutine. The
  framework's depth bound applies to nested orchestration only;
  sequential same-depth spawns are unbounded.
- **Streaming previews per v1.0.20** continue to work. Multi-round
  adaptation interleaves preview and authoritative emissions
  across rounds; the SPA's existing partial-then-final
  transitions handle the interleaving.
- **The deeper-sub-query enrichment fix (v1.0.21)** continues to
  apply. Each round's deeper query carries the parent's
  `analysis_config` via opaque cloning; analysis_enricher engages
  on the sub-query; the sub-query's responses carry `extra`
  enrichment.

## Defaults and backwards compatibility — by phase

| Phase | What happens with no per-query metadata | Wire compatibility |
|---|---|---|
| 1 | Hardcoded "mean of `extra.<color>.deltas`" selector; current window shape (unless window correction is hard-flipped). | Legacy and capability-aware clients see today's behaviour modulo the window flip. |
| 2 | K=1 single round (current behaviour). | Same. |
| 3 | Greedy allocation by Phase 1 selector. | Same. |
| 4 | (n/a yet) | (n/a yet) |

The pattern: each phase's absent-metadata default is "the previous
phase's behaviour, exactly." The widening composes without
breaking what came before.

The one behavioural change visible on the wire across all clients
is the window correction in Phase 1: changing the expansion from
symmetric to same-color-predecessor. Two options for handling:

- **Hard-flip on the version bump.** Cleaner; one consumer (the
  SPA) is coordinated; the proxy's release annotation names the
  change.
- **Opt-in via capability metadata.** Legacy keeps the symmetric
  window; capability-aware clients flip via a metadata flag.
  Robust against institutional consumers in the wild.

Recommendation: hard-flip. The proxy's primary consumer is the
umbrella's SPA; coordination is direct; the window correction is
a small enough change that opt-in machinery is not worth the
bookkeeping.

## Scope boundaries (out of scope)

- **SPA-side authoring surface.** Phases 1-3 ship the proxy
  substrate; the SPA's palette editor extensions (a metric
  authoring panel, a budget profile picker, a value-function
  editor for Phase 3) are follow-on arcs once the wire contract
  is settled. The SPA's `capability-injection.ts` would gain a
  `metricBinding` field in Phase 1 and a `budget` field in
  Phase 2 — the substantive UI work follows separately.
- **Other capabilities.** `transposition` and `delta_analysis`
  stay as they are. The widening is adaptive-specific; the
  symmetry argument that prompted it does not generalise (the
  two other capabilities are not decision problems in the same
  sense).
- **Calibrating an empirical visit-scaling model in-tree.**
  Phase 3 ships the pluggable surface; calibration against a
  real workload is research work that lives elsewhere. The
  proxy ships a placeholder default explicitly named as such.
- **Cross-query and cross-session adaptation.** The
  autonomous-SR-loop note's territory. Adaptation that learns
  from many users' positions, or from one user's history across
  sessions, requires session-state persistence that's out of
  scope for the per-query substrate. Phase 4's user-authored
  policies would be the natural substrate for these if pursued.
- **Process isolation / resource limits beyond the existing
  registry interpreter audit.** The 2026-05-02 audit settled
  wall-clock and rlimit memory ceilings as a v1.0.4 arc; not in
  scope here.

## Open questions

For inline review comments:

1. **Binding-role name.** `selector_fn` / `worst_fn` / `metric_fn`
   for Phase 1? The pre-existing pattern (`delta_fn`,
   `summary_fn`) uses descriptive verb-shaped names;
   `selector_fn` matches that pattern; `worst_fn` is more
   literal but reads awkwardly.
2. **Phase 1 selector input shape.** Per-turn packet
   (recommended), list of finals, or per-turn plus windowed
   context? The choice affects how cross-turn metrics are
   authored.
3. **Per-color displacement contract.** Does the selector see
   displaced or pre-displaced turn numbers? The current
   `_find_worst_turns` displaces internally; if the selector
   is computed on displaced turns, the user's metric expression
   does not see the per-color shift. Probably fine, but worth
   naming.
4. **Wire-shape choice.** Ride on `analysis_config` (recommended)
   versus sibling `adaptive_config`. Decision affects Phase 3's
   authoring ergonomics most.
5. **Phasing — ship Phase 1 alone first, or
   designed-as-substrate-implemented-incrementally?** Phase 1
   alone is small and delivers user-named cheap-metric examples.
   Phases 2+ are substantive. The question is whether the design
   note ships as one substrate plan with phased implementation,
   or whether Phase 1 ships as its own arc first and Phases 2-4
   follow as their own arcs later.
6. **Budget profile naming.** What context profiles to
   pre-curate? `review-tight` / `range-generous` /
   `loop-aggressive` as suggested, or other splits?
7. **Window-correction back-compat.** Hard-flip (recommended) or
   opt-in-via-metadata?
8. **Phase 3 algorithm curation.** Prescribe a specific named
   set (greedy, knowledge-gradient, Thompson sampling, UCB) or
   chart them as "future curation as workload surfaces use
   cases"?
9. **Phase 3 visit-scaling model calibration.** In-tree
   empirical default with a clearly-marked placeholder
   calibration, or always require operator configuration?
10. **Sharing the registry interpreter with `analysis_enricher`.**
    Today `analysis_enricher.on_query` builds a per-eid
    interpreter for delta-analysis. When Phase 1's selector also
    reads from `analysis_config`, does it share that interpreter
    or build its own? Sharing saves work; isolating matches the
    current per-consumer caching pattern. The
    opaque-config-stripping bug surfaced by the 2026-05
    postmortem is relevant — careful cleanup at sub-query
    lifecycle boundaries matters.

## References

- `proxy/middleware/adaptive_reevaluate.py` — file the widening
  modifies. Current single-shot coroutine living on the
  orchestration substrate.
- `proxy/middleware/orchestration.py` — the substrate Phase 2's
  multi-round loop runs on; `OrchestrationContext.spawn` is the
  per-round primitive.
- `proxy/registry_interpreter.py` — the expression substrate
  Phases 1, 3, and 4 build on; the curated stdlib already covers
  the example metrics named above.
- `proxy/transformers/analysis_enricher.py` — the structural
  analogue this widening mirrors; same substrate, different
  decision axis.
- `proxy/docs/roadmap-capability-negotiation.md` — the design
  that established the capability-metadata pattern this extends.
- `proxy/docs/roadmap-orchestration-middleware.md` — the design
  that established the orchestration shape adaptive runs on.
- `docs/notes/postmortem-adaptive-deeper-enrichment-2026-05.md` —
  flags `_find_worst_turns` as a hard-coded decision point whose
  architectural discussion was deferred to a separate session;
  this note is that session's output.
- `docs/notes/autonomous-srs-loop-revised.md` — sketches
  per-policy adaptive metric authoring as a future direction;
  this widening provides the substrate that direction would
  build on.
- `frontend/src/engine/katago/capability-injection.ts` — the
  SPA-side capability builder; gains a `metricBinding` field in
  Phase 1 and a `budget` field in Phase 2 in the follow-on arcs.

— end note —
