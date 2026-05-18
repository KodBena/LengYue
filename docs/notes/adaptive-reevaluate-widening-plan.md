# Widening `adaptive_reevaluate` — design note

- **Status:** `design-note: planned`
- **Date:** 2026-05-18
- **Scope:** proxy submodule (substrate); SPA-side authoring surface
  as an out-of-scope follow-on.
- **Genre:** planning record. The note maps the design space;
  eventual implementation lands as proxy-side roadmap arcs under
  `proxy/docs/`, one per phase or grouped.

This note proposes a widening of `adaptive_reevaluate` from its
current single-shot, hardcoded-metric shape into a pluggable
adaptation-policy substrate. The widening is phased so the first
arc ships small and immediately useful, with subsequent arcs
mapping the destination.

## Why this exists

Three observations.

**The current shape implements one policy on one of two valid
axes.** `_find_worst_turns` reads `extra.<color>.deltas`
(per-color move-loss metrics emitted by the analysis-enricher
transformer) and applies per-color quantile selection. That is
one valid policy on the **move-based** axis — fundamentally a
color-agnostic move-loss substrate with per-color quantile
selection as one applied policy on top. Adjacent move-based
policies (color-agnostic pooled, per-color with separate
thresholds, alternate move-loss metrics) are unexpressed, and the
entire **turn-based** axis (position-level metrics: policy
entropy, score variance, ownership flux) does not exist in the
substrate at all. Both axes are first-class concerns; the
substrate should support either.

**The orchestration substrate already supports multi-round
adaptation; the abstraction is missing.** `OrchestrationContext.spawn`
returns an async iterator, and a coroutine can call it
sequentially any number of times within one parent query. The
framework's depth bound (`max_depth=4`) governs *nested*
orchestration — a coroutine whose spawn triggers another
orchestrator — not sequential spawns at the same depth. A
multi-round adaptive loop expressed as
`for round in budget.rounds(): async for resp in ctx.spawn(deeper_k): yield resp`
is mechanically supported today. Current `adaptive_reevaluate`
does one round.

**Real adaptation is a budgeted decision problem.** The current
`extra_visits` parameter is a single per-deepening scalar —
useful, but not a budget. A budgeted formulation asks: given a
constraint (K rounds, total extra-visits, wall-clock time, a
convergence threshold), what allocation maximises what the
researcher values? Under that framing, "worst by some metric"
reads as a crude proxy for an acquisition function in the
multi-armed-bandit sense; the principled framing has a value
function (expected information gain) and an allocation algorithm
(greedy, knowledge-gradient, Thompson sampling, UCB).

## Map of the design space

Five threads, named for the rest of the note's organisation:

- **(a) Selector pluggability across two co-equal axes** —
  move-based (transition-indexed, per-color) and turn-based
  (position-indexed). Both first-class; neither subsumes the
  other.
- **(b) Multi-round adaptation** — loop the select-and-deepen K
  times.
- **(c) Budget abstraction** — what does "K times" mean (rounds,
  visits, time, convergence; context-dependent profiles).
- **(d) Information-theoretic allocation** — principled
  value-of-visits modelling and budget-constrained optimisation.
- **(e) Window correction** — move-space concept for move-based
  selectors only; turn-based selectors get a separate turn-space
  window or none.

A substrate-level concern carried by Phase 1: **type branding at
the move/turn seam**. `MoveIndex` (per-color, transition-indexed)
versus `TurnIndex` (position-indexed) are runtime-equal `int`s
but type-distinct, paralleling the proxy's v1.0.21 identity-type
branding (`ClientId` / `InternalId` / `CanonicalId` / `WireId`).
The translation lives at one named seam; user expressions never
see the open-coded arithmetic.

## The substrate — two axes and the move/turn seam

### The two axes

A **move-based selector** scores a transition between two
positions. The natural data unit is the per-color move: for
Black's m-th move (0-indexed within Black's move sequence), the
view exposes the color, the move index, the per-arrival deltas
emitted by the analysis-enricher transformer, and references to
the before-position and after-position analysis packets. Move
quality is per-move-per-color in its natural shape; selection
policies (per-color quantile, pooled, per-color-with-different-
thresholds) are applied policies on top.

A **turn-based selector** scores a single position. The natural
data unit is the analyze response packet at that turn: the policy
distribution over moveInfos, the visit distribution, the score
lead, the ownership map, the rootInfo bundle. Color enters as
"whose turn it is at this position" if the metric cares, but is
not a partition over the data; most turn-based metrics (entropy,
variance) are color-blind by nature.

Examples by axis:

| Axis | Example metric | Why it lives here |
|---|---|---|
| **Move-based** | Mean policy delta (the current default) | Per-color move-loss, the analysis-enricher's natural output. |
| **Move-based** | Score-lead drop across the move | Quantity-of-change is a transition property. |
| **Move-based** | Policy surprise (KL of played-move vs. policy prior) | The transition's policy commitment relative to the prior. |
| **Turn-based** | Policy entropy at this position | Live on a single position's policy distribution. |
| **Turn-based** | Score-lead variance over a window | Aggregation over consecutive turns; no transition needed. |
| **Turn-based** | Ownership-map flux | Two-turn diff over the ownership grid; per-position framing. |
| **Turn-based** | Visit distribution shape clarity | Live on the moveInfos distribution at one position. |

Neither axis subsumes the other. A move-based selector cannot
naturally express position-level entropy (which has no
transition); a turn-based selector cannot naturally express
move-loss (which has no single-position scope).

### Type branding at the seam

`MoveIndex` and `TurnIndex` are introduced as
`typing.NewType("...", int)` aliases — runtime-equal `int`s but
type-distinct under `mypy --strict`. The pattern is the same one
the proxy's v1.0.21 identity-type-branding migration applied to
the namespace boundaries that earlier carried mappings as plain
`str`s. The discipline:

- **`MoveIndex`** — 0-indexed within a single color's move
  sequence. Carries color context implicitly via the surrounding
  value (`move_view.color`, `move_view.move_index`).
- **`TurnIndex`** — position index, 0 = root. Position-only; the
  surrounding value carries whose-turn-it-is when relevant.

The framework owns one named translation seam:

```python
def move_to_turn_pair(color: Color, m: MoveIndex) -> tuple[TurnIndex, TurnIndex]:
    """Translate a per-color move index to its (before, after) turn pair."""
```

All open-coded `2*t + displacement` arithmetic migrates to calls
to this function. User-authored selectors never see `TurnIndex`
when they're move-based and never see `MoveIndex` when they're
turn-based — the framework keeps the kinds separated at the
substrate seam.

The motivation parallels the umbrella's branded-types posture on
the frontend: bugs at the move/turn boundary are a recurring
shape that types make mechanical to prevent. Proxy-side, the
v1.0.21 arc established the precedent for `NewType`-based
discipline at namespace seams; extending it to the move/turn axis
is the natural next application.

### Selector contracts (Phase 1 specifics)

Two new binding roles in `RegistryInterpreter`'s vocabulary,
either of which the user may set in `analysis_config.bindings`:

- **`move_selector_fn(move_view) → scalar`** — lower is worse.
  `move_view` carries `color`, `move_index: MoveIndex`, the per-
  arrival `deltas` for this move, and references to the
  before/after analyze packets.
- **`turn_selector_fn(turn_view) → scalar`** — lower is worse.
  `turn_view` carries `turn_index: TurnIndex`, the analyze packet
  at this turn, and the side-to-play at this position.

The expression substrate is the existing curated stdlib (entropy,
normalized_entropy, mean, median, percentile, sliding_*,
apply_window, plus the standard numpy reductions and arithmetic);
the 2026-05-02 security audit's boundary holds unchanged.

The framework iterates per-move (move-based) or per-turn
(turn-based), collects scalars, applies the selection policy
(below), and produces a worst-set. The translation from worst-set
to deepening `analyze_turns` is the framework's responsibility:
move-based worst-sets pass through `move_to_turn_pair`; turn-based
worst-sets pass through identity plus optional turn-space window.

## Phase 1 — Selectors + window correction

The immediately-shippable arc. Substrate gain: two pluggable
selector axes with type-branded contracts; recovery of the
current adaptive policy as the move-based default; bundled
window correction in move-space.

### Turn-based selector examples

The selector returns a per-turn scalar; lower is worse.

- **Policy entropy.** High entropy means the policy distribution
  at this position is dispersed; KataGo is uncertain about the
  best move. Negative because higher entropy is more interesting
  to deepen, by hypothesis:

  ```
  turn_selector_fn(x) = -normalized_entropy([mi['policy'] for mi in x.packet['moveInfos']])
  ```

- **Score-lead variance over a window.** Variance of the score
  lead across a sliding window of consecutive turns; high
  variance flags positions where the game's state estimate is
  unstable:

  ```
  turn_selector_fn(x) = -var(window_score_leads(x))
  ```

  Where `window_score_leads` is a user symbol built on
  `apply_window` and a precomputed state series.

- **Ownership-map flux.** Magnitude of the ownership-grid change
  between this turn and the previous (precomputed via `state_fns`
  cross-turn series):

  ```
  turn_selector_fn(x) = -ownership_flux(x)
  ```

- **Visit distribution shape clarity.** KL between the policy
  head and the visit distribution at this position; flags
  positions where search hasn't converged with the prior:

  ```
  turn_selector_fn(x) = visit_policy_kl(x)
  ```

The selection policy default for turn-based is **pooled
quantile** (the worst Q% of all turns enter the worst-set).
Color-conditioned alternatives are available via metadata but
not the default.

### Move-based selector examples

The selector returns a per-move-per-color scalar; lower is worse.

- **Mean policy delta (the current default, restated).** The
  current adaptive policy expressed in the new substrate as the
  fallback when no binding is named:

  ```
  move_selector_fn(x) = mean(x.deltas)
  ```

  Lower per-arrival mean delta → worse move. (No negation; the
  current code's "low deltas are worst" convention is preserved.)

- **Score-lead drop across the move.** How much did the position
  worsen for the moving side across this transition:

  ```
  move_selector_fn(x) = score_lead(x.after) - score_lead(x.before)
  ```

  (Sign convention: per-color framing makes this directly
  signed — negative means "got worse from this color's
  perspective.")

- **Policy surprise.** KL between the played move's policy
  weight and the prior's expectation. Flags moves that were
  unlikely under the policy head and stayed unlikely under
  deeper search (or vice versa):

  ```
  move_selector_fn(x) = -played_policy_kl(x)
  ```

- **Color-conditioned variations.** The same metric expressed
  with side-specific thresholds, weights, or aggregations.

The selection policy default for move-based is **per-color
quantile** (the worst Q% of Black's moves and the worst Q% of
White's moves both enter the worst-set), preserving the current
adaptive policy's color-aware structure as the recovered default.

### Selection policy as first-class metadata

Selection policy is the question "given a sorted list of
(unit, scalar) pairs, which units enter the worst-set?". Four
named choices, all valid:

- **`per_color_quantile`** (move-based default) — independent
  per-color sort and threshold; both colors contribute their Q%.
- **`pooled_quantile`** (turn-based default) — single sorted list
  across all units; top Q% enter the set.
- **`per_color_threshold`** — explicit per-color thresholds
  rather than quantile fractions; useful when one color is
  systematically harder than the other and the user wants
  asymmetric attention.
- **`top_k`** — fixed number of worst units regardless of
  distribution shape.

The selection policy lives in capability metadata as a string
naming one of these. Default depends on the selector axis as
listed; users override explicitly when they want a non-default.

### Wire shape

User authors the expression in `analysis_config.symbols` and
binds it under one of the two new roles. Capability metadata
carries the selection-policy choice and the existing scalar
knobs:

```json
"analysis_config": {
  "bindings": {
    "delta_fn": "default_delta_fn",
    "state_fns": {...},
    "summary_fn": "default_summary_fn",
    "move_selector_fn": "my_score_drop_metric"
  },
  "symbols": {
    "my_score_drop_metric": "score_lead(x.after) - score_lead(x.before)",
    ...
  }
}

"capabilities": {
  "adaptive_reevaluate": {
    "worst_quantile": 0.25,
    "extra_visits": 800,
    "selection_policy": "per_color_quantile"
  }
}
```

Resolution: if `bindings.move_selector_fn` is set, use the
move-based axis; if `bindings.turn_selector_fn` is set, use the
turn-based axis; if both, capability metadata's discriminator
field (working name `selector_axis: "move" | "turn"`) chooses; if
neither, fall back to the hardcoded default (move-based,
`mean(deltas)`, per-color quantile).

### Window correction — move-space, move-based only

The current `_expand_window` adds adjacent turns symmetrically in
turn-space (`range(-half, half+1)`). For a worst move whose two
endpoints are already in the deepening set, this expansion
crosses into the immediately-adjacent opposite-color move's
endpoints — turns whose badness is independent of the current
worst move. That is wasted GPU.

The principled correction lives in move-space: extend by
same-color move neighbours (`{m-1, m, m+1}` per color, default
`{m-1, m}` for the user's named 2-element window), with the
framework expanding each move to its two-turn pair via
`move_to_turn_pair`. The window concept applies to **move-based
selectors only**.

Turn-based selectors get a separately-named turn-space window
parameter, or none at all (most turn-based metrics don't benefit
from neighbourhood expansion — the metric already aggregates
where aggregation is wanted, via state_fns and apply_window).

### Defaults and backwards compatibility (Phase 1)

When no selector binding is named, the adaptive coroutine falls
back to the hardcoded default: move-based axis, `mean(deltas)`
selector, per-color quantile selection policy, current window
(or window correction if hard-flipped — see backward-compat
section below). Wire-compatible in both directions.

The hardcoded path remains the reference implementation for
"what adaptive does without configuration."

## Phase 2 — Multi-round adaptation + budget abstraction

The first substantive widening. The coroutine grows a wrapping
loop; the loop reads a budget abstraction from capability
metadata; each iteration is one round of select-and-deepen,
inheriting Phase 1's selector axis choice.

### The loop

```python
async def coro(parent, ctx):
    finals = await collect_originals(ctx)
    state = init_state(finals)
    budget = parse_budget(capability_metadata)
    selector = resolve_selector(analysis_config, capability_metadata)

    while budget.has_capacity(state):
        candidates = state.candidate_units(selector.axis)
        scalars = selector(candidates)
        chosen = budget.allocate(candidates, scalars)
        deeper = build_round_query(parent, chosen, budget.visits_for_round(), selector.axis)
        async for resp in ctx.spawn(deeper):
            yield resp
            state.observe(resp)
        budget.consume_round(state)
```

The framework owns parent-child relationships, response routing
onto the parent's orig_id, cancellation propagation, and the
axis-aware translation of `chosen` units into deepening
`analyze_turns`. The coroutine owns the loop logic and the budget
bookkeeping. No framework changes required.

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
  moving (e.g., the worst-quantile unit's selector value moved
  less than ε in the last round). Useful when the question is
  "deepen until we've learned what we're going to learn."

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

Wire shape: capability metadata names a profile string, or
carries a raw budget object for ad-hoc shapes:

```json
"capabilities": {
  "adaptive_reevaluate": {
    "budget": "range-generous",
    "move_selector_fn": "my_score_drop_metric"
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

### Defaults and backwards compatibility (Phase 2)

When no budget is named, the default is K=1 — single round,
current behaviour. Wire-compatible in both directions.

## Phase 3 — Information-theoretic primitives

The principled direction. Frames adaptation as a
budget-constrained acquisition problem and ships the substrate
for principled allocation. Inherits Phase 1's two-axis substrate:
the value function (II below) can be authored on either axis,
matching whichever axis the selector uses.

### Three pluggable layers

**(I) Model of "what additional visits buy."** An empirical or
theoretical f(V, current_visits) → expected entropy / variance
reduction. KataGo's LCB-spread-versus-visits is one natural
calibration: the LCB spread on a move's value scales (approximately)
as 1/√N with visits; the visit distribution converges (approximately)
at a known rate. A calibrated model lets the proxy estimate
"spending 200 more visits on turn T will reduce its policy
entropy by Δ in expectation." The model is pluggable: the proxy
can ship an empirical default and accept user-authored overrides.

**(II) Value function over per-unit information.** What does the
researcher value? Several candidates, each natural on a specific
axis:

- **Confidence in best-move identity** (turn-based) — the
  probability that the top-N visit distribution does not
  reshuffle with more visits.
- **Tightness of score-trajectory estimates** (turn-based) — the
  variance of the score-lead curve across positions.
- **Move-loss precision** (move-based) — variance of the
  per-arrival deltas for this move; lower variance means the
  loss estimate is well-determined.
- **Policy-distribution shape clarity** (turn-based) — KL
  between the policy head and the visit distribution.

A value function maps the per-unit state to a scalar
reward-per-unit-of-clarity-gained. The same expression substrate
the selectors use (registry interpreter with curated stdlib)
hosts it. One value function per query (named via capability
metadata as `move_value_fn` or `turn_value_fn` in `bindings`),
matching the selector's axis.

**(III) Allocation algorithm.** Given the model (I) and the
value function (II), solve the budget-constrained allocation.
Standard active-learning / Bayesian-experimental-design
algorithms apply:

- **Greedy:** at each round, pick the unit whose expected
  value-gain-per-visit is highest. Simple; surprisingly hard to
  beat in practice.
- **Knowledge-gradient:** expected one-step improvement in the
  maximum across all units. Better at exploration; more
  expensive to compute.
- **Thompson sampling:** sample a possible "true" reward
  distribution from each unit's posterior; pick the unit with
  highest sampled reward. Self-regularising.
- **UCB-style:** upper-confidence-bound on the per-unit reward.
  Standard bandit toolkit.

Curated set of named algorithms in capability metadata:

```json
"capabilities": {
  "adaptive_reevaluate": {
    "budget": "range-generous",
    "allocation": "knowledge_gradient"
  }
}
```

The registry interpreter substrate remains the escape hatch for
"I want my own allocation algorithm" — Phase 4's territory.

### What's deliberately out of scope here

The proxy substrate accepts pluggable models, value functions,
and allocation algorithms. It does *not* ship a calibrated
empirical visit-scaling model in-tree. That calibration is
research work — fit f(V, current_visits) against many positions,
validate against held-out positions, document the calibration's
domain of validity. The research arc is separate from the
substrate arc; the substrate ships first so calibration work has
a target shape to fit into.

The substrate ships with an obvious default (e.g., a 1/√N
variance-reduction model with a single calibration constant)
explicitly named as "place-holder; calibrate against your
workload."

## Phase 4 — User-authored adaptation policies (future direction)

The destination, not the next arc. Worth charting briefly so the
substrate's eventual shape is honest.

The fullest expression of the widening: the user authors the
entire adaptation policy as a small program against curated
primitives — `select`, `spawn`, `observe`, `update`, `terminate`,
operating on whichever axis (or both) the policy needs. The
substrate is the registry interpreter extended for program-shaped
bindings rather than scalar-expression bindings. The program runs
on the proxy in the same security envelope the scalar expressions
do (curated callables only, no arbitrary Python).

What this enables: novel adaptation policies that don't fit any
pre-curated allocation algorithm; cross-axis policies that
combine move-based and turn-based selectors; cross-game
adaptation policies (the autonomous-SR-loop note's territory);
experimental policies during research without proxy code changes.

What this requires: substrate work on the registry interpreter to
handle program-shaped bindings (control flow, state,
observations) safely; a curated primitive set covering the policy
verbs; a discipline for resource accounting (a runaway policy
must terminate). Substantive arc; out of scope for an initial
widening, but Phases 1-3 are designed so that the move to Phase 4
is additive, not a rewrite.

## Wire shape — by phase

Each phase's wire-shape additions are layered on the existing
`analysis_config.{bindings,symbols}` and
`capabilities.adaptive_reevaluate.{...}` channels.

| Phase | Channel | Field | Purpose |
|---|---|---|---|
| 1 | `bindings` | `move_selector_fn` | Names a symbol; activates move-based axis. |
| 1 | `bindings` | `turn_selector_fn` | Names a symbol; activates turn-based axis. |
| 1 | metadata | `selection_policy` | Per-color-quantile / pooled / threshold / top-k. |
| 1 | metadata | `selector_axis` (optional) | Disambiguator when both selector bindings are set. |
| 1 | (semantics) | `window_size` | For move-based: same-color predecessor count. |
| 2 | metadata | `budget` | Profile name or raw budget shape. |
| 3 | metadata | `allocation` | Named allocation algorithm. |
| 3 | `bindings` | `move_value_fn` / `turn_value_fn` | Names value-function symbol; axis-matched to selector. |
| 3 | metadata | `visit_model` (optional) | Names the visit-scaling model; defaults to proxy default. |
| 4 | `bindings` | `policy_binding` (or analogous) | Names a program-shaped user policy. |

All additions are optional; absent fields fall back to per-phase
defaults.

### Wire-shape choice — open

An alternative carries the substantive expressions on a sibling
top-level field (`adaptive_config`) parallel to `analysis_config`,
rather than naming bindings within the existing `analysis_config`
block. Trade-off: separation of concerns (cleaner) versus
reusing one expression world (less plumbing, one interpreter per
query). Recommendation: ride on `analysis_config` for Phase 1;
revisit if Phase 3's value-function expression authoring proves
unwieldy in shared symbols.

## Composition with existing precedents

Across all four phases:

- **`RegistryInterpreter` is the expression substrate.** Phase 1
  adds two binding roles (`move_selector_fn`, `turn_selector_fn`);
  Phase 3 adds two more (`move_value_fn`, `turn_value_fn`); Phase
  4 extends the substrate itself. The 2026-05-02 security audit's
  boundary holds across all phases.
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
- **Type branding follows the v1.0.21 identity-type-branding
  precedent.** `MoveIndex` and `TurnIndex` as `NewType` aliases;
  one named translation seam (`move_to_turn_pair`); existing
  open-coded arithmetic in `_find_worst_turns` and
  `_build_deeper_query` migrates to use the seam; `mypy --strict`
  enforces non-confusion at the typecheck level.

## Defaults and backwards compatibility — by phase

| Phase | What happens with no per-query metadata | Wire compatibility |
|---|---|---|
| 1 | Move-based axis; `mean(deltas)` selector; per-color quantile policy. Window: same-color predecessor (if window correction is hard-flipped) or current symmetric (if opt-in). | Legacy and capability-aware clients see today's behaviour modulo the window flip. |
| 2 | K=1 single round (current behaviour). | Same. |
| 3 | Greedy allocation over Phase 1's default selector. | Same. |
| 4 | (n/a yet) | (n/a yet) |

The pattern: each phase's absent-metadata default is "the previous
phase's behaviour, exactly." The widening composes without
breaking what came before.

The one behavioural change visible on the wire across all clients
is the window correction in Phase 1: changing the expansion from
symmetric (turn-space, color-blind) to same-color predecessor
(move-space). Two options for handling:

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
  authoring panel per axis, a budget profile picker, a
  value-function editor for Phase 3) are follow-on arcs once the
  wire contract is settled. The SPA's `capability-injection.ts`
  would gain selector-binding / axis / budget fields in the
  follow-on arcs.
- **Other capabilities.** `transposition` and `delta_analysis`
  stay as they are. The widening is adaptive-specific.
- **Calibrating an empirical visit-scaling model in-tree.**
  Phase 3 ships the pluggable surface; calibration against a
  real workload is research work that lives elsewhere. The proxy
  ships a placeholder default explicitly named as such.
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

1. **Selector-axis disambiguator naming.** `selector_axis: "move" | "turn"`
   as the capability-metadata discriminator when both bindings
   are set? Other names (`selector_kind`, `axis`)?
2. **Default selection-policy split.** Per-color quantile
   (move-based default) versus pooled quantile (turn-based
   default) as proposed, or different defaults?
3. **`move_view` and `turn_view` payload shape.** How much
   precomputed state should each view expose? Minimal (deltas
   only for move-based; analyze packet only for turn-based) or
   richer (cross-turn series, value-function intermediates)?
4. **Selection-policy enumeration vs. binding.** `selection_policy`
   as a curated string enum (per-color quantile, pooled,
   threshold, top-k) versus a fifth binding role
   (`selection_policy_fn`) that the user authors? Curated for
   Phase 1 is simpler; binding form is the natural Phase 4
   extension.
5. **Wire-shape choice.** Ride on `analysis_config` (recommended)
   versus sibling `adaptive_config`. Decision affects Phase 3's
   authoring ergonomics most.
6. **Phasing.** Ship Phase 1 alone first (small, immediately
   useful) versus designed-as-substrate-implemented-incrementally
   in one arc?
7. **Budget profile naming.** What context profiles to pre-curate
   (`review-tight` / `range-generous` / `loop-aggressive` as
   suggested, or other splits)?
8. **Window-correction back-compat.** Hard-flip (recommended) or
   opt-in-via-metadata?
9. **Phase 3 algorithm curation.** Prescribe a specific named set
   (greedy, knowledge-gradient, Thompson sampling, UCB) or chart
   them as "future curation as workload surfaces use cases"?
10. **Phase 3 visit-scaling model calibration.** In-tree
    empirical default with a clearly-marked placeholder
    calibration, or always require operator configuration?
11. **Sharing the registry interpreter with `analysis_enricher`.**
    Today `analysis_enricher.on_query` builds a per-eid
    interpreter for delta-analysis. When Phase 1's selector also
    reads from `analysis_config`, does adaptive share that
    interpreter or build its own? Sharing saves work; isolating
    matches the current per-consumer caching pattern. The
    opaque-config-stripping bug surfaced by the 2026-05
    postmortem is relevant — careful cleanup at sub-query
    lifecycle boundaries matters.
12. **Type-branding scope.** `MoveIndex` / `TurnIndex` introduced
    in Phase 1 at the adaptive substrate's seam, or pushed
    broader (analysis_enricher, delta_analysis) as a substrate
    arc in parallel?

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
- `proxy/docs/roadmap-identity-type-branding.md` — the v1.0.21
  arc whose `NewType`-based discipline this note extends to the
  move/turn seam.
- `docs/notes/postmortem-adaptive-deeper-enrichment-2026-05.md` —
  flags `_find_worst_turns` as a hard-coded decision point whose
  architectural discussion was deferred to a separate session;
  this note is that session's output.
- `docs/notes/autonomous-srs-loop-revised.md` — sketches
  per-policy adaptive metric authoring as a future direction;
  this widening provides the substrate that direction would
  build on.
- `frontend/src/engine/katago/capability-injection.ts` — the
  SPA-side capability builder; gains selector-binding and budget
  fields in the follow-on arcs.

— end note —
