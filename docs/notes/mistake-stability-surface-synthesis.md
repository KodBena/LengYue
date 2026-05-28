# Mistake-surface ↔ stability-surface synthesis

- **Status:** `design-note: exploratory`
- **Date:** 2026-05-27
- **Scope:** the cross-cutting view across two design-space notes —
  `mistake-finder-design-space.md` (per-move evaluation-quality
  surface for the automatic mistake-finder feature) and
  `stability-surface-design-space.md` (per-position
  evaluation-stability surface lifted from the shelved
  visit-scaling research arc). This synthesis names what the
  two share, where they diverge, and whether they should
  unify at the substrate level.
- **Genre:** synthesis. The project author asked for this
  explicitly: "a synthesis note that covers the overlap and
  identified orthogonal components across these two concerns."

## Why this exists

Both notes describe user-authored DSL surfaces over KataGo
analysis packets that produce per-unit scalars the SPA
consumes for display and selection. The shared shape is
strong enough that "should they share a substrate?" is the
honest first question. The answer turns on a few axes of
difference that look minor in framing but carry through to
non-trivial substrate-design consequences. This note maps
both sides so the eventual implementation arcs (whichever
ships first) don't accidentally pre-commit the other.

## The two concerns in brief

**Mistake-surface.** The palette's `delta_fn` emits a per-move
scalar, but the substrate is intentionally non-opinionated
about that scalar's sign convention or bounds across
palettes (the robust child palette emits goodness in [0, 1];
other shipped palettes carry score-loss with different
conventions). So the mistake-finder cannot assume a
universal severity transform on `delta_fn`'s output. Instead,
each palette declares its own ranking expression via the
existing `move_selector_fn` binding (the substrate already has
this shape for adaptive_reevaluate's deepening choices; the
convention is "lower selector value = worse"). The SPA's
mistake-finder reads per-move selector values and ranks
(top-K, percentile, threshold) for the worst-set. Recommended
substrate path: reuse `move_selector_fn`; zero new substrate
vocabulary; per-palette severity is the palette author's
authored choice consistent with the project's non-opinionation
posture. Two earlier framings of this surface were corrected by
the project author across conversation turns — first the
channel was wrong (`state_fns` is per-turn, not per-move),
then the goodness-in-[0, 1] universality assumption was
wrong. The current shape reflects both corrections.

**Stability-surface.** A user-authored function (an
`extract: packet → Q | None` per the research arc's
functorial framing) defines the quantity whose stability
across the V-axis of a single position is interesting.
Derived metrics (log-V-weighted stable-fraction, change-count,
last-change-V) per-position are computed by the SPA and
surfaced as judgement-aids for the user. Recommended
substrate path: SPA-side authoring + storage + display over
existing `is_during_search=True` previews, with honest
labelling about the proxy-cadence limitation; full V-axis
control gated on a future `staged_analysis` capability
dispatch when warranted.

## Where they overlap (shared structure)

### 1. Both are palette-shaped authoring surfaces

The palette already establishes the codebase's authoring
vocabulary for user-defined analysis functions: expression
strings over a symbol library, parameter-meta with optional
qEUBO control, mutation through `PaletteEditor.vue`. Both
the mistake-surface and the stability-surface are natural
fits — they share the *grammar* of the palette even when
the input shape and output cardinality differ. A unified
authoring UI is plausible without unifying the underlying
function families.

### 2. Both produce per-unit scalars consumed by SPA ranking

Mistake-surface produces per-move severities; stability-surface
produces per-position stability scalars. In both cases the SPA
sorts, slices, and surfaces a worst-set. The ranking primitives
the user might want are largely shared: top-K, percentile,
absolute threshold. Per-color partitioning applies on the
mistake side (only the mover's losses count); does not apply
on the stability side (positions are color-agnostic).

The shape of the SPA-side ranking composable is essentially
the same: a small typed module taking `(items: Item[],
scoreOf: Item → number, policy: SelectionPolicy) → Item[]`.
The selection-policy parameters (K, quantile, threshold)
naturally live as knob-registry entries — composing with the
existing knob substrate is the obvious move on both sides.

### 3. Both touch the "predicate vs. severity" question

The mistake-finder note's framing: the project author's
intuition that the mistake-finder's predicate "could be a
function of the deltas" is exactly right — the predicate is
`move_selector_fn(move_view) < threshold` where the palette's
bound expression carries the per-palette sign-and-magnitude
convention and the threshold is a knob-registry entry. The
expression itself is the palette author's choice (the
substrate is non-opinionated about `delta_fn`'s convention);
the consumer just reads the per-palette declaration.

The stability side has the same question with a different
flavour: is "stability" boolean (this move's top-1 is stable
across V=200 to V=1000: yes/no) or continuous (the
stable-fraction is 0.87)? The research arc's empirical
finding is that continuous metrics dominate boolean
classifiers on Pareto terms — degeneracy is the failure mode
(see `winrate_polarity` with pos_rate≈0.97). The lesson
generalises: prefer continuous scalars, derive boolean
predicates by thresholding, expose the threshold as a knob.

### 4. Both want the same diagnostic vocabulary

A "this extractor / state_fn is degenerate" warning is useful
on both sides. The stability research arc surfaced two
extractors (`winrate_polarity`, `winrate_change_threshold(0.10)`)
that look like signal in their AUC but are degenerate under
label imbalance. The mistake-surface has the analogous
failure mode: a state_fn that returns identical values across
nearly every move surfaces no useful ordering. A shared
"signal-distribution diagnostic" — pos-rate, value-entropy,
or just a histogram — applies on both sides and is cheap to
build once.

### 5. Both compose with the autonomous-SR loop

The autonomous-SR loop note (`docs/notes/autonomous-srs-loop-revised.md`)
sketches a pipeline where loaded SGFs surface candidate cards
without manual marking. The mistake-surface and the
stability-surface are both signals that loop could read.
Mistakes → "this move is a teaching moment because the
player blundered." Stability → "this position deserves more
attention because the engine's evaluation didn't settle."
Both are inputs to a downstream selection-policy that picks
SR candidates; both want to be expressible as ranking
sources rather than terminal classifiers.

## Where they diverge (orthogonal components)

### 1. Axis of computation

**Mistake-surface: move/turn axis.** The relevant per-unit is
a single move (transition) or a single turn (position) in the
analysis range. Packets are at terminal V; the stream is
across moves.

**Stability-surface: V-axis.** The relevant per-unit is a
single position. Packets are at varying V across the search
trajectory; the stream is *within* a single position, over
the engine's deliberation.

This is the load-bearing difference. The palette's existing
`state_fn` / `delta_fn` / `summary_fn` operate on the
move/turn axis (`state_fn` per turn, `delta_fn` per move,
`summary_fn` over the range). The stability-surface needs a
new function shape — `extract: packet → Q | None` over a
trajectory — that operates on the V-axis. No existing palette
function gives you this; the substrate growth (or substrate
parallel) is real.

The research arc's `StabilityTrajectory[Q]` substrate is the
authoring vocabulary for the V-axis. It does not generalise to
the move/turn axis because the V-axis is *within* a packet
stream for one position, while the move/turn axis is across
packets-at-final-V across many positions. Different temporal
scopes; different stream shapes.

### 2. Temporal scope and wire-shape

**Mistake-surface: snapshot.** Final-V packets per move are
sufficient. The existing wire already gives the SPA everything
it needs — `state_fn` outputs at each turn arrive via the
existing analysis pipeline.

**Stability-surface: streaming.** Intermediate-V packets are
required. Today's `is_during_search=True` previews provide
*some* V-axis sampling but at proxy-chosen cadence; honest
V-axis-precise metrics need the `staged_analysis` capability
dispatch the research arc sketched but never authored.

Consequence: the mistake-surface is shippable end-to-end as a
frontend-only arc today; the stability-surface in its full
form is cross-team work. The stability-surface in its
limited form (Option α from its note) is shippable
SPA-only too, with explicit caveats.

### 3. Statefulness of user-authored extractors

**Mistake-surface: per-packet stateless.** A state_fn reads
one packet and returns one value. The palette's expression
language is shaped for this; no closure-over-prior-packets is
contemplated.

**Stability-surface: per-trajectory stateful.** The research
arc's `winrate_change_threshold_factory(δ)` is the canonical
example: the extractor remembers the *first packet's*
winrate as a reference and compares subsequent packets to it.
The factory pattern (instantiate a fresh extractor per
realisation, closure over per-realisation state) is a real
need on the stability side. The palette's stateless
expression language doesn't directly admit this without
substrate work.

Consequence: if a unified palette is attempted, it has to
absorb stateful extractors. Either the language grows (a
`state` argument threaded through the closure, akin to React
hooks) or the surface bifurcates (palette stays stateless;
stability authoring uses a different language). The
recommendation in the stability-surface note assumes the
latter — keep the languages separate.

### 4. What "worst" means under ranking

**Mistake-surface: worst = largest eval drop.** Severity is
positive-valued; "worst" is "highest severity." Direction
matters: only the mover's losses count (per-color
selection).

**Stability-surface: worst = least stable.** "Worst" is
"lowest stable-fraction" or "highest change-count." Direction
doesn't matter at the color axis (stability is color-agnostic
within a position; the `to_play` field exists but is the
user's to consult).

Consequence: the SPA-side ranking composables share shape but
differ in defaults. Per-color partitioning is on by default
for mistakes, off by default for stability. The selection-
policy primitives the proxy already exposes via
`adaptive_reevaluate` reflect this distinction (move-axis
selectors have per-color variants; turn-axis selectors do
not).

### 5. Relationship to existing proxy machinery

**Mistake-surface: orthogonal to `adaptive_reevaluate`.** The
existing per-move selector + selection-policy machinery on
the proxy side could be co-opted to ship Option B from the
mistake-finder note (proxy-side worst-set computation), but
the recommendation is to leave it alone for now — the SPA can
do the work on data it already receives.

**Stability-surface: entangled with `adaptive_reevaluate`.**
The current proxy already uses stability-flavoured signals
(via `move_selector_fn` defaults — mean policy-delta is an
implicit stability signal) to decide which moves deserve
deepening. A user-judgement stability surface that surfaces
the same signal at the same moves is redundant with the
adaptive policy's existing decisions; the surface is most
useful for *other* signals the existing adaptive policy
doesn't read (top-2 margin, search-vs-policy agreement,
winrate drift). The stability-surface note flags this as an
open calibration question; the synthesis flags it as the
sharper question the design space has to settle when shipping.

## Synthesis options

### Unification — one palette family covers both

Add a third axis to the palette: alongside `state_fns`
(per-turn) and `delta_fn` (per-move), add `stability_fns`
(per-V-trajectory) as a `Record<string, string>` mapping
names to factory expressions producing `extract` functions.
The expression language grows to admit stateful closures.

**Tradeoffs.** Conceptually clean if it works. The cost: the
palette expression language has to grow non-trivially (state
closures, V-axis input typing), and the proxy's
palette-enrichment path has to either grow to handle V-axis
extraction (which the research arc's firewall consult #4
explicitly recommended against) or restrict `stability_fns`
to SPA-side evaluation only (which makes the unification
asymmetric across the substrate's other families). The
asymmetry is itself a substrate-cohesion failure mode under
ADR-0008 (refuse synthetic categories under ambiguity);
a unified palette where some axes are proxy-evaluated and
others SPA-evaluated is a unification in name only.

### Sibling surfaces — share infrastructure, not substrate

The mistake-surface lives inside the existing palette as a
`state_fns` convention; the stability-surface lives as a
parallel authoring surface (different expression language
admitting stateful closures, different storage path,
different display). Both consume shared infrastructure: the
symbol library, the parameter-meta-with-qEUBO-control
pattern, the knob-registry for selection parameters, the
SPA-side ranking composables, the signal-distribution
diagnostic.

**Tradeoffs.** Honest about the axis difference. Avoids
forcing the palette to grow into a shape its existing
consumers don't need. Cost: two authoring UIs (or two tabs
in one editor), two storage paths, two consumer surfaces in
the SPA. The duplication is a one-time cost; the shared
infrastructure absorbs the recurring cost.

### Strict separation — no shared scaffolding

Mistake-surface and stability-surface are independent arcs
with no shared code or UI patterns. Each ships standalone.

**Tradeoffs.** Cheapest per-arc; expensive in aggregate.
Symbol-library duplication, divergent ranking composables,
divergent selection-knob conventions. The codebase grows
two parallel substrates where one shared one would have
served. Rejected on ADR-0005 grounds (single source of
truth per nominal handle — "selection policy" should
mean one thing).

## Recommendation

Sibling surfaces with shared infrastructure, both following the
**"ship curated catalogue first, plumb for DSL second"** shape.
The unification option fails on the axis-difference rock; the
strict-separation option fails on the duplication rock; the
sibling option splits the difference honestly.

The symmetry between the two surfaces' v1 shapes is itself
the load-bearing finding of this synthesis, and it cleaned up
further after the 2026-05-28 round-table refined the
mistake-side substrate from "per-palette `move_selector_fn`
authoring" to "per-palette binary `delta_ordering` flag." Both
v1s are now genuinely curated-enum-of-options shapes (binary
direction flag on the mistake side; six-entry extractor
registry on the stability side); both keep their DSL paths as
deferred third arcs. The "ship curated, plumb for DSL" framing
is honest on both sides:

| | Mistake-surface v1 | Stability-surface v1 |
|---|---|---|
| Authoring shape | per-palette `delta_ordering` binary flag (enum field); `move_selector_fn` is the escalation path for the small minority of expressive cases | curated extractor registry (6 of 8 research entries) |
| Substrate growth | one enum field on the palette schema; existing `move_selector_fn` substrate untouched for adaptive use | zero proxy-side; modest SPA-side (trajectory storage + registry) |
| Per-palette calibration | one bit per palette (direction declaration); escalation cases author `move_selector_fn` | no — the curated extractors are fixed across palettes |
| Ranking | SPA-side `(items, scoreOf, policy) → items[]` over `delta_fn` magnitudes oriented by the palette's flag | (deferred — stability is per-position; aggregation across positions is a UI question) |
| Selection parameters | knob-registry | knob-registry |
| Forward-compat to DSL | curated enum on v1; the `move_selector_fn` escalation path is the DSL substrate (post-v1) | registry indirection + key-prefixed namespace; the DSL authoring layer is the post-v1 third arc |
| Cross-team work | none for v1 (`extra.<color>.deltas` already on the wire) | none for cadence (`reportDuringSearchEvery` is the SPA's lever); `staged_analysis` only if V-precise cutoffs become operationally necessary |
| Deferred substrate questions | separate `severity_fn` family (γ); `delta_fn` overload (δ); namespace bifurcation if deepening-rank ≠ mistake-rank | full DSL authoring layer with stateful closures |

The "ship curated, plumb for DSL" shape on both sides means
neither v1 commits to a specific expression-evaluation
substrate; the shared infrastructure that gets lifted at the
second-consumer transition is the *consumer-side* code (ranking
composable, selection-knob pattern, signal-distribution
diagnostic), not the *authoring-side* DSL.

Concretely:

1. **Mistake-surface v1** (Option α from its note, in its
   2026-05-28 round-table-revised form) ships a one-enum-field
   schema addition: each shipped palette declares
   `delta_ordering ∈ {'lower_is_worse', 'higher_is_worse'}`
   indicating which direction of its own `delta_fn`'s output
   counts as bad. The SPA reads `extra.<color>.deltas` from
   the existing wire, orients by the flag, ranks, and applies
   the SPA-side ranking composable backed by a selection-policy
   knob set. No new wire emission needed; `move_selector_fn`
   remains as the escalation path for palettes that need
   expressive ranking. The earlier formulation of α (per-palette
   `move_selector_fn` expression authoring) was overspecified;
   the binary flag sizes the substrate to the actual semantic
   content.
2. **Stability-surface v1** (Option α from its note, in the
   "curated catalogue, forward-compatible plumbing" framing)
   ships next or concurrently. The wire cadence is solved by
   `reportDuringSearchEvery`; the v1 catalogue is fixed to the
   six surviving research extractors. The trajectory storage,
   registry indirection, and key-prefixed namespace are the
   forward-compatibility carriers for the DSL future.
3. **The shared infrastructure gets lifted at the transition.**
   When the second consumer arrives, the SPA-side ranking
   composable, the selection-knob pattern, and the
   distribution-diagnostic move to a named module. ADR-0003's
   "Ports extracted when a second concrete consumer exists"
   composes here: do not pre-extract; do the extraction
   when the second consumer is on the table.
4. **DSL extension is a third arc** for either surface, gated
   on observed need from the curated v1s. The
   forward-compatibility discipline on the stability side
   (registry indirection, configurable V-windows, key-prefixed
   namespace) is what makes that third arc incremental rather
   than substrate-rework. The mistake side's DSL extension is
   trivial because the palette already provides the expression
   substrate; the reserved-key convention extends naturally to
   user-named keys.
5. **Resist forced unification of authoring layers.** The
   palette's existing expression language is calibrated to the
   move/turn axis; the stability surface's eventual DSL
   authoring (if it lands) needs stateful closures the palette
   language doesn't admit. Two authoring languages, one shared
   consumer-side infrastructure, is the honest split.

## What this synthesis does not settle

- **Which arc ships first.** The recommendation orders them by
  cost (mistake-surface is the cheaper arc) and by validation
  value (it exercises the shared infrastructure before the
  more complex arc lands), but the project author's priorities
  may sort differently. This is a scheduling question, not a
  design question.
- **Where the shared infrastructure lives in the source tree.**
  `src/composables/analysis/` is the obvious home for the
  ranking composable; `src/lib/` for the
  signal-distribution diagnostic; `src/components/editors/`
  for the eventual authoring surfaces. Specific file
  placement deferred.
- **The `staged_analysis` dispatch.** The stability-surface
  note flags this as the gated cross-team work — only
  motivated if V-precise cutoffs (rather than time-cadenced
  sampling via `reportDuringSearchEvery`) become operationally
  necessary. The synthesis doesn't push it any further; it
  stays gated on demand surfaced by the curated v1.
- **What the unified ranking composable's type signature is.**
  Both surfaces want `(items, scoreOf, policy) → items[]` but
  the items differ (moves with color on one side, positions on
  the other) and the policies differ (per-color quantile vs
  pooled quantile defaults). A typed-discriminated approach
  vs a more generic approach is a design choice for the
  implementing arc.

## Gaps in this synthesis's grounding

- The synthesis stands on the two sibling notes; their grounding
  gaps propagate here. See `mistake-finder-design-space.md`
  §"Gaps in this note's grounding" and
  `stability-surface-design-space.md` §"Gaps in this note's
  grounding".
- Not consulted: `docs/notes/autonomous-srs-loop-revised.md`
  in full. Claims about how the autonomous-SR loop would
  consume either surface are sketched, not verified against
  that note's contents end to end.
- Not consulted: `docs/wire-schemas.md`, which would settle the
  preview-cadence question that the stability-surface
  recommendation rests on.

The recommendation is reversible at every step. The mistake-
surface ships first; the lifting decision happens at the
transition to the second consumer; the stability-surface
gradient runs Option α → Option β as operational pressure
warrants. None of these steps lock the others.
