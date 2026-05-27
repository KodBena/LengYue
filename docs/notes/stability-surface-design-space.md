# Stability-surface substrate — design-space note

- **Status:** `design-note: exploratory`
- **Date:** 2026-05-27
- **Scope:** SPA-side authoring surface for user-defined stability
  metrics over the V-axis of KataGo analysis packets; proxy-side
  wire dependencies are named but not committed to. Companion to
  `mistake-finder-design-space.md`; the cross-cutting view lives
  in `mistake-stability-surface-synthesis.md`.
- **Genre:** exploration. The project author asked for a separate
  note framing the design space, motivated by carrying forward a
  shelved research arc into a user-judgement surface.

## Why this exists

The visit-scaling research arc (branch
`bork/research/visit-scaling-memo-2026-05-21`, May 2026) explored
whether `adaptive_reevaluate` could automatically detect which
moves deserve more visits by predicting per-position evaluation
stability across the KataGo search trajectory. The arc produced
a complete characterisation of the visit-scaling problem at the
b10c128 testbed scale and a working per-packet optimal-stopping
allocator, but the deployment arc was shelved on operational-ROI
grounds — the truth-oracle 20pp agreement gap is uncapturable
from the current feature set with current data, and the
engineering payoff against an unmeasured status-quo baseline
isn't strong enough to justify the cross-team dispatch work yet.
The closing assessment is recorded in
`research/notes/session-handoff-2026-05-22-per-packet-allocator.md`
§"Addendum — GRU null result and operational ROI assessment" on
that branch.

But the science is real. The research arc produced a substrate
— a functorial trajectory abstraction over per-packet extractors,
a catalogue of operationally-meaningful extractors, a body of
empirical results about which signals carry information at b10
scale — that has value independent of the automated-allocator
deployment. The project author's framing: since automation
didn't ship, **expose the stability substrate to the user's
judgement** via a DSL-like authoring surface analogous to the
palette's `state_fn` / `delta_fn` / `summary_fn`. Users define
the stability metrics they care about, the SPA displays them per
move, and the user decides which moves deserve attention.

## What the research arc produced

The substrate (currently in `research/stability_trajectory.py`
on the visit-scaling branch) carries three components worth
naming up front because they shape the design space.

### The `StabilityTrajectory[Q]` functorial framing

The data structure is generic over an equality-typed quantity
`Q`:

```python
Q = TypeVar("Q", bound=Hashable)

@dataclass
class StabilityTrajectory(Generic[Q]):
    changepoints: list[tuple[float, Any]]  # (V, Q | _UNKNOWN_SENTINEL)
    V_max: float
    n_packets: int = 0
```

A trajectory is built from a stream of (V, packet) pairs and an
`extract: packet → Q | None` function:

```python
@classmethod
def from_packet_stream(
    cls,
    packets: list[tuple[float, dict]],
    extract: Callable[[dict], Any],
) -> "StabilityTrajectory":
```

The representation is change-point-compressed (only V-values
where `Q` changes are stored), giving O(log K) any-V lookup and
O(log K + neighbours_in_tail) tail-stability-fraction. The
`_UNKNOWN` sentinel handles "extractor returned None at this
packet" — extractor failure is recorded but does not vote
against stability in derived metrics.

The functorial framing is the load-bearing observation: **any
equality-typed per-packet observation defines its own stability
question**. The user-authored DSL surface is parameterised on
this `extract` function — exactly the shape the palette already
uses for `state_fn`.

### The extractor catalogue

The arc shipped eight registered extractors in three classes,
all in `research/stability_trajectory.py`:

- **rootInfo-only** (immune to moveInfos truncation):
  - `scoreLead_sign` — sign of score lead, in {-1, 0, +1}.
  - `winrate_polarity` — `winrate > 0.5`. Empirically degenerate
    (pos_rate≈0.97); kept as a diagnostic warning, not for use.
  - `winrate_quintile` — winrate bucketed into {0,1,2,3,4}.
- **search-vs-network-prior** (per-packet, evolves with search):
  - `search_agrees_with_policy` — does `argmax(moveInfos.visits)`
    match the highest-prior move within moveInfos? Binary. Raw
    `argmax(policy)` over the full 362-element policy
    distribution is explicitly excluded as an extractor because
    it's the network's prior, constant across packets — would be
    trivially "stable" for the wrong reason.
- **moveInfos-based**:
  - `top1_move` — best move. Mostly truncation-immune.
  - `top3_set` — top-3 set as frozenset. Vulnerable to
    truncation; defensive `None` handling.
  - `top2_margin_quintile` — visit-fraction margin between top-1
    and top-2, bucketed into quintiles. Captures search
    *confidence* independent of top-1 identity (a position where
    top-1 just barely beats top-2 looks stable in `top1_move`
    but is operationally fragile).
- **Stateful** (per-realisation closure via factory):
  - `extract_winrate_change_threshold_factory(δ)` — band-relative
    direction wrt the first packet's winrate. Returns -1 / 0 /
    +1 for below-band / within-band / above-band.

Two operational lessons the catalogue carries that the SPA
surface should preserve:

- **Not every plausible extractor carries signal.**
  `winrate_polarity` and `winrate_change_threshold(0.10)` are
  degenerate (pos_rate 0.97–0.99); their AUC on stability tasks
  is a ranking artefact of extreme label imbalance, not a real
  signal. The SPA surface should support degeneracy detection or
  at least a per-extractor "is this carrying signal" diagnostic,
  not silently surface a meaningless metric.
- **Stateful extractors are a real need.** The reference-relative
  pattern (remember the first packet's value, compare subsequent
  packets to it) doesn't fit a per-packet pure expression. A
  per-trajectory factory pattern, or a `state: dict` accumulator
  passed through the expression, is the substrate-level question.

### The derived-metric vocabulary

Beyond the trajectory itself, the arc settled on a small
vocabulary of derived metrics:

- **Stable-fraction over a V-interval** — "of the V-weighted
  intervals from V_start to V_end, what fraction have the same
  `Q` as the value at V_start?" Log-V-weighted is canonical
  (rescale-invariant; the same label semantics whether training
  at V_max=15000 or V_max=600). Cache schema v2_logV on the
  research branch.
- **Change-count over a V-interval** — number of change-points
  in the interval. Coarser than stable-fraction; useful as a
  diagnostic.
- **Per-cutoff stability vector** — the K-vector of
  stable-fractions at cutoffs along the V-axis. The substrate
  for the per-packet optimal-stopping allocator that the arc
  built.

These are the "what to display" half of the surface. A
user-authored DSL would let users build their own — but the
shipped vocabulary covers the operationally-validated cases.

## Why the deployment arc was shelved

From `research/notes/session-handoff-2026-05-22-per-packet-allocator.md`
§"Addendum":

> the science is real, the operational ceiling is
> well-characterized, but the engineering payoff at b10 + 1,161
> positions isn't strong enough to justify the dispatch work
> yet. The arc is complete as a research output; deployment is
> deferred.

Three reasons compose into the shelf decision:

1. **Truth-oracle headroom (~20pp at low budget) is not
   capturable by the current classifier**, confirmed by three
   independent probes (marginal-value rule null result, GRU
   hyperparameter sweep, GRU + AUC-OOD stopping). The bottleneck
   is upstream of model choice; the corpus at b10c128 is
   exhausted at 1,164 positions.
2. **The relevant baseline is unmeasured.** Skip-rate vs
   "current proxy `adaptive_reevaluate` quantile-of-worst
   policy" was never measured; without it, the
   savings-vs-status-quo claim is speculative.
3. **Asymmetric risk.** Silent compute savings vs visible
   recommendation-quality regressions. The 7pp agreement cost
   on skipped positions is potentially user-visible on an
   application a serious Go student trusts to surface mistakes.

None of these argue against exposing stability metrics to user
inspection. They argue against shipping the classifier as an
automated gate on adaptive deepening. The user-judgement surface
is downstream of the same substrate but doesn't need the
classifier to ship.

## The design question

How to expose the stability substrate to user judgement, given
that:

- The substrate is real and validated at b10c128 scale.
- The natural authoring surface is palette-like (DSL expressions
  over a symbol library, mirroring `state_fn` / `delta_fn` /
  `summary_fn`).
- The substrate operates on a different axis than the palette
  (V-axis within a position, vs. move/turn-axis across the
  analysis range).
- The wire-level requirements are non-trivial — the SPA needs
  V-axis resolution that today's stream may or may not provide.

## What the existing wire gives the SPA today

The SPA receives `is_during_search=True` previews on the
streaming delta-analysis path (the v1.0.20 streaming
refactor), promoted to authoritative `is_during_search=False`
once the relevant decisions are in. The cadence of those
previews is **SPA-controllable** via KataGo's
`reportDuringSearchEvery` setting (in seconds), exposed on
the settings tree at
`store.profile.settings.engine.katago.reportDuringSearchEvery`
and threaded through `analysis-service.ts:567` onto every
analysis query the SPA fires. A small value gives a dense
V-axis sampling; a large value gives a sparse one.

This closes the cadence question that earlier versions of
this note flagged as a load-bearing grounding gap: the SPA
does *not* depend on the proxy's internal heuristics for
preview cadence — it asks for the cadence it wants. The
research arc's `staged_analysis` capability (firewall consult
#2 §Q3, referenced in
`research/notes/firewall-strategic-2026-05-21.md` on the
research branch) was a sharper shape — declare the specific
V-cutoffs you want packets at — but the existing wire's
`reportDuringSearchEvery` is sufficient for the curated
metrics in the research arc's catalogue, which work on
post-hoc V-windows rather than V-precise cutoffs.

The research arc's firewall consult #4 recommended **"proxy
emits trajectory packets at SPA-declared budgets; SPA does
extractor work locally. Don't put stability tracking in the
proxy"** — the existing wire already implements the
SPA-declared-budget half of that recommendation via
`reportDuringSearchEvery`, so the SPA-side extractor work is
the remaining piece.

## Design options

### Option α — Curated extractor set, SPA-side, forward-compatible plumbing

Ship the research arc's catalogue of validated extractors (the
six surviving after the degenerate ones are dropped) as a
fixed-by-v1, registry-indirected set on the SPA side. SPA
ingests `is_during_search=True` previews at user-set
`reportDuringSearchEvery` cadence, builds per-(board, move)
change-point trajectories via a TypeScript port of
`StabilityTrajectory[Q]`, computes the derived-metric
vocabulary (log-V-weighted stable-fraction, change-count,
last-change-V) per named extractor, and surfaces the results
in the existing chart panel (currently file-named
`StabilityPanel.vue`, displayed as "Multiresolution Interval
Analysis" since commit b8b7c43).

The forward-compatibility discipline is the load-bearing
authoring constraint: the curated extractors are fixed in v1,
but the *infrastructure* around them is built so DSL-authored
extractors are an incremental extension rather than a
substrate rework. Concretely:

- **Registry indirection.** The curated extractors live in a
  named registry, not hardcoded into UI components or
  consumers. The registry is the integration point future
  DSL-authored extractors slot into.
- **Open-ended extra-state namespace.** Derived metrics
  surface to consumers via a key-prefixed convention (e.g.
  `Stability/<extractor>/<metric>`), not via named fields
  baked into a TypeScript interface. Future extractor names
  land in the same namespace without consumer-side changes.
- **Configurable V-windows.** The "what V-range is this
  stable-fraction over" decision is parameterised, not
  hard-coded. v1 may ship one or two preset windows; the
  parameter is exposed (probably as knob-registry entries) so
  future DSL-authored extractors get the same configurability
  for free.
- **Extractor-typed not extractor-named consumers.** UI
  components read "the set of available extractors and their
  metric outputs" from the registry, not the literal names
  `top1_move`, `top3_set`, etc. Adding a future extractor
  surfaces in the UI without component-level edits.

**Tradeoffs.** Lowest cost to a working surface. Honest about
the gradient: v1 is the validated catalogue; the DSL
authoring layer is a separable later arc that drops into the
already-built infrastructure. The forward-compatibility
discipline is what prevents the curated-first decision from
becoming a static-wiring trap that blocks DSL extension. The
risk is the opposite: over-investing in forward compatibility
that the future DSL arc doesn't actually want. Mitigation:
keep the abstractions thin — registry indirection and a
key-prefixed namespace, not a general expression-evaluation
substrate before there's a second consumer.

### Option β — `staged_analysis` capability dispatch + full SPA surface

The arc's intended endpoint. Proxy gains a `staged_analysis`
capability where the SPA declares specific V-cutoffs it wants
packets at (rather than the time-based cadence
`reportDuringSearchEvery` provides); proxy emits accordingly;
SPA holds the extractor authoring surface and the full
derived-metric vocabulary including the per-cutoff stability
vectors and optimal-stopping primitives. Wire dispatch is
authored against the firewall consult #2 §Q3 sketch.

**Tradeoffs.** The destination state if V-axis-precise metrics
turn out to be operationally necessary. Cost: cross-team work
— proxy capability dispatch, SPA-side capability negotiation,
new wire shape. Multi-week to multi-month per the shelf
assessment. The `reportDuringSearchEvery` cadence already
provides "enough" V-axis sampling for the catalogue's
metrics, so β is gated on the curated arc actually surfacing
demand for V-precise cutoffs.

### Option γ — Stability surface as a proxy-side palette extension

Add a `stability_fn` family alongside `state_fn` / `delta_fn` /
`summary_fn` on `AnalysisPalette`. Proxy maintains the
change-point list incrementally per packet, emits derived
stability values into `extra.state[turn]['Stability/<key>']`.
SPA reads these unchanged. Avoids any new capability; reuses
the existing palette-enrichment path.

**Tradeoffs.** Tempting because it composes with the existing
palette dispatch. The cost is in the wrong place: the firewall
consult #4 explicitly recommended **against** putting stability
tracking in the proxy ("its job stays wire-stable + minimal").
A proxy-side `stability_fn` family expands the proxy's
responsibility from "wire-stable + minimal" to "stateful
trajectory accumulation per query," coupling its lifecycle to
the user-authored extractor catalogue. Substrate growth in the
wrong sub-project.

## Recommendation

Option α — curated catalogue, SPA-side, forward-compatible
plumbing. The project author's posture (named in the
conversation that produced this revision): the research arc's
metrics are broad enough that the curated set is a defensible
v1; shipping that first will inform what the eventual DSL
authoring layer actually needs; and the infrastructure built
to deliver the curated metrics doubles as the host for the
DSL extension when (if) it's authored. The constraint —
"not too opinionated on static wiring" — translates into the
forward-compatibility discipline above.

Concretely the v1 shape is:

1. **A TypeScript port of `StabilityTrajectory[Q]`** in
   `src/lib/` or `src/engine/analysis/` — change-point storage,
   `from_packet_stream` constructor, stable-fraction-over-window
   query. Plain TypeScript, no Vue reactivity coupling.
2. **A curated extractor registry** mapping names to
   `(packet) → Q | None` functions. v1 entries are
   `scoreLead_sign`, `winrate_quintile`,
   `search_agrees_with_policy`, `top1_move`, `top3_set`,
   `top2_margin_quintile`. Degenerate extractors
   (`winrate_polarity`, `winrate_change_threshold(0.10)`) are
   intentionally excluded — the empirical record on the
   research branch is the evidence.
3. **SPA-side ingestion** in `analysis-service.ts`: per
   incoming `is_during_search=True` preview, dispatch the
   registry's extractors against the packet and update the
   per-(board, move) trajectory. Composes with existing
   preview handling.
4. **A derived-metric composable** under
   `src/composables/analysis/` reading the trajectory and
   producing per-move stability scalars on demand. The
   metric vocabulary (stable-fraction with a configurable
   V-window, change-count, last-change-V) is a small fixed
   set; the V-window parameter is a knob-registry entry.
5. **Display integration** in the existing chart panel.
   `StabilityPanel.vue`'s file name should follow the
   already-shipped display rename to "Multiresolution …"
   (commit b8b7c43); the new stability-display work is the
   natural moment to settle the file rename if it hasn't been
   addressed by then.

The arc's gradient to Option β is preserved: if user demand
for V-precise cutoffs materialises, the curated infrastructure
absorbs the wire-shape change without surface-level rework —
new extractors land in the same registry, new metrics in the
same vocabulary, new wire packets feed the same ingestion
path.

## What this note does not settle

- **The relationship to `adaptive_reevaluate`'s existing skip
  decisions.** The current proxy already uses a quantile-of-worst
  policy to decide which moves deserve deepening; a user-facing
  stability surface that surfaces the same signal at the same
  moves is redundant. Likely the SPA surface is about *other*
  signals (top-2 margin, search-vs-policy agreement, winrate
  drift) that the existing adaptive policy doesn't read. A
  separate calibration question.
- **Per-move vs per-position scope.** Stability is naturally a
  per-position metric (within a position, how stable is the
  evaluation as V grows?). The SPA's analysis range carries
  multiple positions; the surface needs to either present
  per-position stability with a navigation pattern or aggregate
  across positions in some way. The mistake-finder's recommended
  approach (per-move severities surfaced as state_fn outputs)
  doesn't directly apply because stability isn't a per-move
  scalar — it's per-position over the V-axis of that position's
  trajectory.
- **`StabilityPanel.vue`'s file-name lag.** The displayed
  title has matched "Multiresolution Interval Analysis" since
  commit b8b7c43; the filename was left as-is. The
  stability-display arc this note motivates is the natural
  moment to settle the file rename (and reconsider whether
  the same panel hosts both the multiresolution heatmap and
  the new stability metrics, or whether they live as sibling
  components under a shared parent).
- **TypeScript port shape.** The `StabilityTrajectory[Q]`
  substrate exists today in Python on the research branch.
  The SPA needs a TypeScript port. The port is mechanical
  (change-point list, registry extractors, derived metrics)
  but the recommendation doesn't pre-specify the
  decomposition into pure modules vs. composables — that's an
  authoring decision for the implementing arc.
- **Forward-compatibility scope.** The note names the
  discipline ("not too opinionated on static wiring") but
  leaves the specific calibration to the implementing arc.
  Over-investing in forward compatibility — designing a
  general expression-evaluation substrate before there's a
  second consumer — is its own failure mode. The right
  thinness is: registry indirection, key-prefixed namespace,
  configurable V-windows. The wrong thinness is: a fully
  general AST for user-authored extractor expressions on day
  one.

## Gaps in this note's grounding

- Read end to end: `research/notes/session-handoff-2026-05-22-stability-reframe.md`,
  `research/notes/session-handoff-2026-05-22-per-packet-allocator.md`,
  `research/stability_trajectory.py` lines 1-320 (the registry,
  the trajectory data class, three constructors).
- Read partially: `frontend/src/components/charts/StabilityPanel.vue`
  header comment; `frontend/src/types.ts` palette section. The
  `StabilityPanel`'s implementation past its header was not
  read in full — claims about what it hosts beyond the
  multiresolution heatmap are not made.
- Not read: the proxy's wire-emission code for
  `is_during_search=True` previews (the
  `reportDuringSearchEvery` cadence is the SPA's lever per the
  project author's clarification, but per-preview field
  presence of `moveInfos.visits` and `rootInfo.visits` is
  still asserted on the basis of the existing analysis-service
  ingestion, not verified end-to-end); the firewall consult
  records in full (consult #4 details referenced via the
  handoff's summary, not the verbatim consult); the
  `useTriangularHeatmap` composable that powers the existing
  panel.
- Not consulted: `docs/wire-schemas.md`, which is the reference
  for cross-boundary wire shapes and would corroborate the
  per-preview field set.

The recommendation is reversible. Option α can be implemented
incrementally and replaced or augmented by Option β when the
operational case for V-axis-specific metrics is concrete enough
to justify the dispatch.
