# Mistake-finder substrate — design-space note

- **Status:** `design-note: exploratory`
- **Date:** 2026-05-27
- **Scope:** proxy substrate (palette / selector functions); SPA
  consumer surface (the eventual automatic mistake-finder UI). No
  implementation arc is proposed; the note maps the design space
  and names a recommended direction.
- **Genre:** exploration. The project author asked for "thoughts
  on this matter" — what the design space looks like, where the
  natural seams are, what the ranking question turns into when
  placed against the existing substrate.
- **Companion notes:** `stability-surface-design-space.md`
  (parallel substrate exploration for a different axis),
  `mistake-stability-surface-synthesis.md` (cross-cutting view),
  `mistake-finder-pedagogy-and-followups.md` (pedagogical
  posture, API-shaping observations, and two related
  visualisation features).

## Why this exists

The umbrella has long named an "automatic mistake finder" as a
forward-looking surface — the autonomous-SR-loop notes
(`docs/notes/autonomous-srs-loop-revised.md`) sketch the broader
shape, where loaded SGFs surface their worst moments as candidate
SR cards without manual marking. The proxy-side palette substrate
is where the per-move signal lives today; the question is what
the right substrate shape is for picking the moments out of the
stream.

The project author named two parts of the question:

1. A "simple predicate to the palette as a function of deltas" —
   the per-move "is this a mistake" classification.
2. The harder question of **ranking** mistakes — top-K, percentile,
   or some other discipline — and how to express it without
   feeling hacky (the author's own concern about hijacking
   `summary_fn` for percentile collection).

This note treats (1) and (2) as one design space: a mistake-finder
needs both *what counts* and *which to pick*, and the substrate
choices for the two interact.

## What the substrate already provides

The palette substrate on the proxy side is more developed than
the "function of deltas" framing might suggest. Three families
of per-position / per-move functions live on the active palette,
declared by the SPA's `AnalysisPalette` shape in
`frontend/src/types.ts:330-336`:

```ts
export interface AnalysisPalette {
  id: string;
  name: string;
  delta_fn: string;
  summary_fn: string;
  state_fns: Record<string, string>;
}
```

And on the proxy side, the analysis enricher resolves and
applies them via `proxy/registry_interpreter.py:600-617`'s
`get_delta_fn` / `get_summary_fn` / `get_state_fns` accessors.

Crucially, a fourth family of functions exists with exactly the
"per-unit scoring" shape this design space cares about:
`move_selector_fn` and `turn_selector_fn`, added at proxy v1.0.23
for adaptive_reevaluate's pluggable selection
(`proxy/registry_interpreter.py:642-658`). Their input shape is
typed and rich — not "a delta," but a full `MoveView` or
`TurnView` (`proxy/middleware/adaptive_reevaluate.py:243-279`):

- `MoveView` carries `color, move_index, deltas: list[float],
  before: AnalyzeResponse, after: AnalyzeResponse, round_history`.
- `TurnView` carries `turn_index, to_play, packet: AnalyzeResponse,
  round_history`.

The user-authored selector expression returns a scalar; lower is
worse by the substrate's convention. The default move selector
(when no binding is present) is the mean of per-arrival policy
deltas — already a defensible "mistake score" by itself.

Then there are the selection-policy primitives, which is the
ranking machinery that already exists
(`proxy/middleware/adaptive_reevaluate.py:282-381`):

- **Move axis:** per-color quantile, pooled quantile, per-color
  absolute threshold, pooled top-K.
- **Turn axis:** pooled quantile, top-K (per-color partitioning
  does not apply on the turn axis — positions are color-agnostic
  for selection purposes; the `to_play` field is the user's to
  consult).

These primitives currently dispatch internally within
`adaptive_reevaluate` to pick which moves / turns deserve deeper
KataGo compute. They are not exposed at the wire boundary today.

## Where the design space actually lies

The crucial axis check (clarified by the project author
across two iterations of this note):

**(1) Channel.** `state_fns` are per-turn functions and have
no reach into move-evaluation semantics. `delta_fn` is the
move-evaluation channel. Every consumer of move-quality
reads `delta_fn`'s output — the multiresolution heatmap's
`summary_fn` aggregation, `adaptive_reevaluate`'s
`extra.<color>.deltas`, the chart-side per-move
visualisations.

**(2) Non-opinionation about `delta_fn`'s output semantics.**
The robust child palette (in the project author's judgement
the canonical palette) emits goodness in [0, 1] — higher is
better. But **other shipped palettes have score-loss
semantics with no [0, 1] bound**. And the project's
intentional posture is that the *user* chooses the sign
convention per palette: a score-loss `delta_fn` might be
authored as `max(0, x_1 - x_0)` (player's loss as positive),
or `-(x_1 - x_0)` (negated), or a fixed sign regardless of
color, or anything else the palette author finds meaningful.
The SPA ships reasonable defaults but the substrate is
deliberately uncommitted to one convention.

This constrains the framework around mistake detection and
ranking. The mistake-finder consumer **cannot** assume any
of:

- That `delta_fn`'s output is bounded in [0, 1].
- That a fixed monotonic direction ("higher is worse" or
  "lower is worse") holds across palettes.
- That a fixed neutral-point ("zero means no mistake") holds
  across palettes.
- That a `1 - goodness` transform yields severity in general
  (true for the robust child palette only).

The earlier version of this note's recommendation —
"consumer derives severity as `1 - goodness` at the SPA" —
was incorrect on this axis. It assumed the robust child
palette's [0, 1] goodness shape generalises across the
seeded set; the project author confirms it does not.

**(3) Selection-policy machinery already exists, per
palette.** The proxy's `move_selector_fn` and
`turn_selector_fn` bindings — added at v1.0.23 for
adaptive_reevaluate's pluggable selection — are exactly the
shape "per-palette declaration of how to rank moves /
turns". A palette ships its own `move_selector_fn`
expression in `analysis_config.bindings`; the convention is
*lower selector value = worse* (the substrate's documented
direction); the substrate's default move selector when
unbound is mean policy delta. This is the natural carrier
for per-palette severity semantics — the substrate already
*has* the shape and respects the user's non-opinionation
posture by making the expression palette-author's call.

**(4) Two genuine open design questions the project author
named explicitly, neither pre-settled by this note:**

- **Q1 — Severity as derived substrate component?** Does the
  palette gain an explicit `severity_fn` (or similar)
  component? Earlier framing deferred this on the basis that
  no shipped palette needs a non-trivial goodness→severity
  mapping; the corrected substrate picture reverses that
  premise. Different shipped palettes already have
  meaningfully different `delta_fn` semantics, and a
  per-palette severity declaration is genuinely needed —
  the question is whether it lives as a *new* substrate
  family (`severity_fn`) or *reuses an existing one*
  (`move_selector_fn`).
- **Q2 — Overload `delta_fn`'s semantics?** Does `delta_fn`'s
  output channel widen to carry more than the existing
  per-palette value — a tuple, a multi-channel emission, or
  a redefined-per-palette meaning that carries the severity
  axis alongside whatever the palette author chose? Cost
  remains high — every existing consumer would have to
  learn the new shape.

**(5) The author's hijack concern is correct.** Overloading
`summary_fn` to carry a ranking-indexed collection breaks
the single-source-of-truth tenet (ADR-0005 Rule 1).
`summary_fn`'s nominal handle is "summarise the range"; it
stays that way.

## The axes of "what is a mistake"

Before picking a substrate location, it's worth naming what the
predicate / selector actually needs as input. "Function of deltas"
is a narrow framing; richer mistakes are functions of more.

- **Severity** — magnitude of the eval drop. The most obvious
  axis. Policy delta, winrate delta, score-lead delta — different
  palettes will privilege different metrics.
- **Direction** — only the mover's losses count as their
  mistakes. The substrate has color via `MoveView.color` and
  `TurnView.to_play`; the per-color selection primitives respect
  this.
- **Game phase** — early / middle / endgame. A 5% winrate loss
  in fuseki is structurally different from a 5% loss in yose.
  The substrate doesn't model phase; user expressions could
  read `move_index` or the position's stone count to gate, but
  that places phase-awareness on the user's plate.
- **Difficulty** — was the right move hard to find? KataGo's
  policy head answers this. A blunder against a 95%-policy move
  is a different teaching opportunity than a near-miss against
  a 10%-policy move.
- **Recoverability** — did the player lose the game because of
  this, or recover? Cross-move integration; lives naturally at
  the `summary_fn` or `round_history` level, not at the
  per-move selector level.
- **Pattern** — recurring mistake class (joseki blunder vs.
  tactical miss vs. counting error). Not derivable from the
  packet alone; would need pattern-recognition machinery the
  substrate doesn't have and arguably shouldn't.

The first four are expressible inside the existing `MoveView` /
`TurnView` substrate. The last two are outside scope for any
near-term mistake-finder; they belong in the autonomous-SR loop's
longer roadmap.

## Design options

### Option α — Per-palette severity declaration via existing `move_selector_fn`

The mistake-finder reads a per-palette ranking expression
that the palette author authors and the palette declares.
The substrate already has the exact shape: `move_selector_fn`
in `analysis_config.bindings`, with the documented convention
"lower selector value = worse." Each shipped palette declares
its own `move_selector_fn` consistent with its own `delta_fn`
semantics:

- The robust child palette's `move_selector_fn` reads
  goodness from the MoveView and returns it directly (lower
  goodness = worse, matches the convention).
- A score-loss palette with "positive = loss" convention
  declares a `move_selector_fn` returning `-score_loss`
  (so the most-negative selector value picks out the
  worst — biggest loss).
- A score-loss palette with the opposite sign convention
  declares a `move_selector_fn` returning `score_loss`
  directly.
- A palette author who doesn't want to be ranked by `delta_fn`
  output at all (e.g., wants ranking by visit margin)
  authors a `move_selector_fn` reading whatever they want
  from the MoveView.

The SPA's mistake-finder reads per-move selector values from
the wire (or computes them locally if the proxy emits the
inputs) and applies SPA-side selection — top-K, percentile,
threshold — with the knob-registry-controlled parameters.
Substrate growth: zero. The shape `move_selector_fn` was
designed for is exactly this kind of per-palette ranking
declaration; the mistake-finder is a second consumer of an
already-extant substrate.

**Tradeoffs.** Honest about the non-opinionation constraint
— the palette author owns the ranking semantics, the
consumer just reads the declaration. Reuses the substrate
that already exists; doesn't grow it. The cost lives at the
*entanglement seam* — `move_selector_fn` today is consumed
by `adaptive_reevaluate` for deepening choices; the
mistake-finder would become a second consumer of the same
expression. If a palette ever wants "rank by X for adaptive
deepening, by Y for user-visible mistakes" the namespace has
to bifurcate (split into `adaptive_move_selector_fn` and
`mistake_move_selector_fn`, or similar). The substrate
bifurcation is cheap-when-needed, ADR-0003-shaped — "extract
when the second concrete consumer demands it" — and the
default of "same expression for both purposes" is honest
when adaptive's notion of "worst move for deepening" and
user-visible "worst move as mistake" coincide, which they do
for every shipped palette today.

There's a sub-question α has to answer: **does the proxy emit
per-move `move_selector_fn` output on non-adaptive queries
today?** If yes, the SPA reads the output and ranks. If no,
either (a) the SPA computes the selector itself from
available inputs (the MoveView's `deltas: list[float]` is
already on the wire via `extra.<color>.deltas`; the MoveView's
`before` / `after` AnalyzeResponse references may or may not
be reconstructible from the SPA's stream), or (b) the proxy
adds wire-level emission of selector output, which is a
small change relative to the rest of α's surface. This is the
load-bearing wire-shape question α has to resolve before
implementation.

### Option β — Surface the existing selector + selection-policy machinery at the wire

The proxy adds a wire-level opt-in (a capability or per-query
flag) that runs the existing selector + selection-policy
pipeline and emits only the worst-set. The SPA receives a
pre-filtered list of (color, move_index) pairs (or TurnIndex
values) with their selector scores attached. The
configuration — which policy, which parameters — lives in
`analysis_config`.

**Tradeoffs.** Reuses the adaptive_reevaluate machinery
verbatim end-to-end. Cheaper wire than α (only the worst-set
crosses; α's wire carries all per-move selector values).
The cost is contract surface: a new wire field, a new
capability, a new dispatch path inside the proxy. Aligned
with α's per-palette posture — the same `move_selector_fn`
expression drives both — but commits more proxy-side machinery
to a single-consumer path until the second consumer exists.
The right destination once wire size is measured and shown
to be a real concern, or when the autonomous-SR loop becomes
a second concrete consumer.

### Option γ — A separate `severity_fn` substrate family (Q1's "yes")

Add a `severity_fn` (or similarly named) component alongside
`delta_fn` on `AnalysisPalette`. Each palette declares its
own severity expression, evaluated by the proxy and emitted
to the SPA via `extra.<color>.severities` or analogous. The
mistake-finder reads severity values per move and ranks.

**Tradeoffs.** Cleanly names the consumer's ranking
declaration as a first-class substrate concept (rather than
reusing `move_selector_fn`, which was named for adaptive's
purposes). Substrate growth: a new function family with the
authoring surface, the proxy-side dispatch, the wire emission.
Cost composes with the existing palette schema; benefit is
naming clarity. The honest case for γ over α is *if the
ranking semantics for "deepening candidates" and "user-visible
mistakes" diverge across palettes* — then a dedicated channel
avoids overloading `move_selector_fn`. Today no palette
demonstrates that divergence, so γ's added clarity comes at
unjustified substrate cost.

### Option δ — Overload `delta_fn`'s semantics (Q2's "yes")

Widen `delta_fn`'s output channel — a tuple, a multi-channel
emission, or a redefined-per-palette meaning. Mistake-finder
reads the severity component directly from `delta_fn`'s
emission.

**Tradeoffs.** Avoids adding a new substrate family. The cost
is on every existing consumer of `delta_fn`'s output — the
multiresolution heatmap's `summary_fn` aggregation,
`adaptive_reevaluate`'s `extra.<color>.deltas`, every chart
that consumes the per-palette value. Each existing consumer
has to learn the new shape or be opted out. Substrate
breakage risk is high; ADR-0002's fail-loudly tenet applies —
silent shape drift in the move-evaluation channel is the
failure mode this would invite. The recommendation does not
go here unless there is a definite reason `delta_fn`'s
existing per-palette semantics need to widen, and that
reason is named explicitly.

## Recommendation

Option α — reuse the existing `move_selector_fn` binding as
the per-palette severity declaration. The substrate already
has the shape; the user's non-opinionation about `delta_fn`'s
sign convention is honoured because each palette author
declares their own ranking expression; no substrate growth.

The reasoning, in light of the corrected substrate picture:

- The user's non-opinionation about `delta_fn` semantics
  rules out any consumer-side default that hardcodes a sign
  or bound assumption.
- Per-palette severity *declaration* is now genuinely needed
  (not deferrable, as the earlier note version supposed) —
  but the substrate already has the right shape via
  `move_selector_fn`.
- ADR-0008 classification discipline applies in the
  *refuse-fuzzy-match* direction: don't add a new
  `severity_fn` substrate category when an existing category
  (`move_selector_fn`) already fits. If the categories
  diverge later (deepening rank ≠ user-visible rank), they
  split *then*; until then, "one selector expression for both
  purposes" is the honest classification.
- The load-bearing wire-shape question (does the proxy emit
  per-move `move_selector_fn` output on non-adaptive
  queries?) is the implementation prerequisite. If it
  doesn't, the dispatch to the proxy is small — emit the
  per-move scalar — and is sized closer to a clarification
  than a capability arc.

The user's instruction to "be very circumspect in how we
encode the framework around mistake detection and ordering"
is honoured by α: zero substrate vocabulary growth, no
pre-commitment to a sign convention, no consumer-side
assumption about `delta_fn`'s output bounds, no reserved-key
convention. The framework's only commitment is the substrate's
*existing* documented convention for `move_selector_fn`:
lower = worse.

Options β (proxy-side worst-set computation) and γ (new
`severity_fn` family) are escalations that compose with α.
β escalates wire efficiency without changing the
per-palette declaration. γ escalates the naming clarity at
substrate cost; the right time is when a palette demonstrates
that "deepening rank" and "mistake rank" need to diverge.

The SPA-side ranking composable — `(items, scoreOf, policy)
→ items[]` — is the load-bearing reusable piece. Under α
its `scoreOf` is "per-move selector value as emitted by the
palette's bound expression"; the composable doesn't need to
know what the palette's `delta_fn` semantics are, only that
the convention "lower = worse" is honoured by the bound
expression. The selection-policy parameters (K, quantile,
threshold) are knob-registry entries composing with the
existing knob substrate.

### What the predicate question collapses to

The project author's "simple predicate as a function of
deltas" framing is honest with one substrate correction: the
predicate is `move_selector_fn(move_view) < threshold`,
where the palette's bound expression carries the per-palette
sign-and-magnitude convention and the threshold is a
knob-registry entry. The deltas (the substrate input to the
expression) are exposed via the MoveView the substrate
already documents. No predicate-as-substrate-concept needs
adding; the boolean flag is the threshold's result; the
continuous severity is the negated selector value (under
the documented lower=worse convention).

### What the ranking question collapses to

Top-K and quantile-based selection live in a SPA-side
composable that reads the collection of per-move selector
values, sorts ascending (lower-first, per substrate
convention), and slices. The selection composable is
naturally a sibling of `useAnalysisProjection` or a successor
under `src/composables/analysis/`. The author's concern that
`summary_fn`-for-collection would feel hacky is preserved by
*not doing it* — the ranking lives where the consumer lives,
not in the per-range summary.

## What this note does not settle

- **The wire-shape prerequisite.** Does the proxy emit
  per-move `move_selector_fn` output on non-adaptive
  queries today? If yes, α is shippable SPA-only. If no, a
  small proxy-side dispatch is needed — emit the per-move
  selector scalar as part of `extra.<color>.*` or analogous.
  Resolving this is the first concrete step on the
  implementation path; a worklog-style code read of the
  enricher's emission path settles it.
- **The default `move_selector_fn` binding per shipped
  palette.** Each shipped palette (robust child, the score-loss
  palettes, the rank palette, the default palette) needs a
  declared `move_selector_fn` for the mistake-finder consumer
  to be honest. Authoring those defaults is a per-palette
  calibration question — what the palette author considers
  "worst move" — and is the substantive work of the v1
  shipment beyond the consumer-side code.
- **Q1 — `severity_fn` as separate substrate family.** Option
  γ above is the concrete shape if the answer is "yes."
  Recommended *against* in v1 because `move_selector_fn`
  already fits. Reopens if "deepening rank" and "user-visible
  mistake rank" diverge meaningfully for any shipped palette.
- **Q2 — overload `delta_fn`'s semantics.** Option δ above is
  the concrete shape if the answer is "yes." Recommended
  *against* on substrate-breakage grounds. Reopens only if a
  future palette feature genuinely requires multi-channel
  per-move emission and `move_selector_fn` cannot absorb the
  need.
- **Where the auto-mistake-finder UI lives.** A new tab? An
  overlay on the existing analysis surface? A modal launched
  from the mint flow? The substrate question is independent
  of the UI question; the UI question deserves its own note
  before implementation.
- **The autonomous-SR loop integration.** This note assumes
  the SPA is in the loop. The autonomous-SR loop's "headless
  mistake finder" use case is where Option β becomes
  load-bearing; that arc has its own design document
  (`docs/notes/autonomous-srs-loop-revised.md`) and the
  intersection deserves a dispatch when the work approaches.
- **Cross-team status.** Option α with proxy-side emission of
  per-move selector output is small enough that a
  clarification-style dispatch likely suffices. Option β
  (proxy-side worst-set computation) is a proper capability
  arc and would file as a `frontend-to-proxy-*.md` dispatch.
  The recommendation defers the dispatch shape until the
  wire-shape prerequisite is settled.

## Gaps in this note's grounding

The author should know what this note read and what it
inferred:

- Read: `frontend/src/types.ts:300-358` (palette shape),
  `proxy/registry_interpreter.py:560-660` (binding accessors),
  `proxy/middleware/adaptive_reevaluate.py:160-400` (selector
  views, selection-policy primitives, default selector).
- Cited (not read end-to-end, taken from the project
  author's authoritative clarifications across two
  conversation turns): `state_fns` are per-turn functions
  with no reach into move-evaluation semantics; `delta_fn`
  defines the move-evaluation channel; the robust child
  palette's `delta_fn` emits goodness in [0, 1] but other
  shipped palettes (score-loss family) do not share that
  shape; the substrate is intentionally non-opinionated
  about `delta_fn`'s sign convention, and the user owns the
  choice per palette.
- Not read: the seeded palette expressions in code (so the
  catalogue of "which palettes ship what `delta_fn`
  conventions" is asserted from the author's description,
  not verified); the proxy's wire emission for
  `move_selector_fn` on non-adaptive queries (the
  load-bearing wire-shape question α has to resolve); the
  palette expression language's actual grammar
  (`proxy/registry_interpreter.py` beyond the binding
  accessors); the seeded symbol library's current entries.

The recommendation is reversible at each escalation. If
`move_selector_fn` proves an unhappy fit (a palette wants
deepening-rank and mistake-rank to diverge), the path
opens to Option γ (`severity_fn` as a separate substrate
family). If wire size or a headless second consumer
appears, the path opens to Option β (proxy-side worst-set
computation). The substrate stays in α's shape until one
of those triggers fires.
