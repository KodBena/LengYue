# ADR-0003: Frontend Portability and Domain Boundaries

- **Status:** Accepted
- **Genre:** Bounded Context Map (structural-descriptive with
  prescriptive elements) — a third genre after the *decision* of
  ADR-0001 and the *tenet* of ADR-0002. Maps the domain coupling of
  the codebase and gives a principle for evaluating future changes
  against it.
- **Date:** 2026-04-24
- **Scope:** Frontend (`gogui`). Cross-references the backend's
  parallel work (item 30b's `PositionNormalizerPort`, item 34's
  domain-agnostic-core umbrella).

## Context

The frontend (`gogui`) has been a single-domain Go (Weiqi) client
since inception. The backend (`fastapi_service`), in contrast,
underwent a deliberate generalization: its schema, wire vocabulary,
and Port surfaces (`PositionNormalizerPort`, `LineageRepositoryPort`,
etc.) were reshaped during items 30a/30b/34 so that the same backend
could plausibly serve a Chess or Shogi adopter. The README has an
"adopting for another domain" section.

The frontend never went through an analogous reshape — partly because
the value was unclear (no concrete adopter was on the horizon) and
partly because the cost of preemptive generalization in TypeScript +
Vue is higher than in Python + Pydantic. (In Python, a `Protocol`
declares a Port at zero runtime cost; in TypeScript, an `interface`
declares a Port at compile-time cost only, but Vue's reactivity
system, the Vue ecosystem's idioms, and the codebase's existing
shape all bias toward concrete-first code.)

The question became urgent when the **analysis-recording** future
project was discussed. That feature is unusually domain-coupled: it
records KataGo's response packets (a Go-specific wire shape, with
`moveInfos` in GTP coordinates, ownership maps over a square board
grid, policy heads sized by board area) and gates persistence on a
Go-specific `isDuringSearch` predicate. A Chess port would replace
the engine entirely and the response shape with it.

This raised a more general question: **which parts of the frontend
codebase are accidentally Go-coupled, which are essentially Go-coupled,
and which are domain-agnostic?** Without a map, future features can't
be honestly designed against the boundary — and without a principle,
the map is just inventory.

## Decision

**Document the current domain coupling of the frontend, and adopt
a single forward-looking principle for evaluating new features
against it. Do not preemptively extract Port abstractions; do
design new features so that future extraction is cheap.**

The principle, stated plainly:

> When designing a new module, ask: "what would change for a Chess
> port?" Not because we are doing a Chess port, but because the
> question forces honest separation between the abstraction and
> the instance. If the answer is "everything in this module" — fine,
> the module is intrinsically domain-bound; isolate it behind a
> clear interface so a Chess version could replace it wholesale.
> If the answer is "nothing" — fine, the module is domain-agnostic;
> name its abstractions for the problem class, not the instance. If
> the answer is "some of it" — that's the seam; design the seam
> deliberately, even if you don't extract a Port today.

This is not a Port-extraction mandate. It's a *design discipline at
authoring time*. Existing code stays put; new code is written with
the seam in mind.

### Why not extract Ports preemptively now

Sandi Metz's principle from "The Wrong Abstraction" applies in
force: *duplication is far cheaper than the wrong abstraction*. An
abstraction extracted before a second concrete use case exists is
shaped by speculation about what variation will be needed; it is
almost always wrong-shaped, and refactoring against it once a real
second use case arrives is harder than starting from concrete code.

In Haskell, this principle bites less because parametric polymorphism
+ type-class dispatch + inference combine to make abstract code as
ergonomic as concrete code. Generalizing a function from `Int` to
`Num a => a` is nearly free in source weight and totally free at
runtime. In TypeScript, every layer of generic type parameter has
ergonomic cost (verbose call sites, harder error messages, occasional
inference failures requiring explicit type arguments) and the runtime
gets nothing for the cost. The cost-benefit tilts toward "extract
when the second use case exists" for longer than a Haskell
practitioner's intuition would suggest.

The backend's `PositionNormalizerPort` succeeded because two
conditions held: (a) Pydantic + FastAPI's Protocol style made the
extraction nearly free in source weight, and (b) the team had
genuine intent to ship a domain-portable backend. The frontend
satisfies neither condition today: extraction is more expensive
because of Vue's mutation-first reactive model, and no concrete
second-domain consumer exists.

## Domain Coupling Inventory

The frontend's modules sit on a spectrum from fully agnostic (would
survive any port) to essentially Go-bound (their existence presumes
Go). Three useful bands, with examples in each:

### Band 1 — Truly domain-agnostic

These modules have no concepts that wouldn't survive a port to any
other knowledge domain (Chess, Shogi, language flashcards, music
theory drills). They speak in concepts the problem *class* needs
(reactive state, content-addressed caches, debounced persistence,
generic UI primitives) rather than concepts the *instance* uses.

- **`store/index.ts` and the GlobalStore machinery.** Reactive store
  with named mutators, version counters, deep-watch sync. The shape
  of `GlobalStore` carries Go-flavored field names today
  (`boards`, `activeBoardIndex`), but the *machinery* is generic.
- **`services/sync-service.ts`.** Stateless persistence bridge. PUTs
  a JSON blob; doesn't care what's in it.
- **`services/api-client.ts` + `services/resource-service.ts`.**
  HTTP client and static-resource fetcher; no domain in either.
- **`services/analysis-ledger.ts`.** Content-addressed cache keyed by
  `(configHash, nodeId)` with reactive version refs per entry. The
  abstraction — "a versioned reactive cache of expensive computed
  values keyed by config and node identity" — is independent of
  what the cached value is.
- **`composables/wait-for-analysis.ts`.** Wait primitive with timeout
  + abort. The current return type is `KataAnalysisResponse`, but the
  shape of the abstraction (single resolution, idempotent settle,
  three-channel race) is fully generic.
- **`config/env.ts`, `lib/utils.ts`, the system-message machinery,
  the registry editor.** All generic infrastructure.

### Band 2 — Game-class agnostic but tree/turn coupled

These modules speak in concepts that would survive a port to *any
turn-based game with branching variations and AI analysis* — Chess,
Shogi, Xiangqi, Othello — but would not survive a port outside that
class (e.g., to language flashcards, where there is no game tree
and no "turn"). They are domain-agnostic *within* the game-tree
problem class.

- **`engine/navigator.ts`.** Walks the game tree, computes LCA,
  applies move deltas. Knows about "captures" and "ko" (Go-specific!),
  but the navigation skeleton — LCA + delta-replay — is generic to
  any game tree.
- **`composables/useTreeExpansion.ts`, `useTreeLayout.ts`.** Tree
  display logic. Knows nothing Go-specific; would render a Chess
  variation tree identically.
- **`composables/useReviewSession.ts`.** SR session orchestration.
  The flow (fetch queue, load card, await user move, analyze, score,
  advance) is game-tree-agnostic; only the per-move scoring details
  are Go-shaped.
- **`composables/useChartNavigation.ts`, `BaseChart.vue`.** Generic
  charting machinery; no domain.

### Band 3 — Essentially Go-bound

These modules carry concepts that don't exist outside Go (or carry
specific Go encodings of concepts that exist generally). Porting
them isn't refactoring — it's replacement.

- **`engine/sgf-loader.ts`, `engine/sgf-writer.ts`.** SGF format is
  a Go (and a few other games) serialization. A Chess port reads
  PGN; the loader gets replaced wholesale.
- **`engine/katago/*`.** KataGo's wire protocol — query shape,
  response shape, action verbs. A Chess port talks to Stockfish
  with UCI; the entire `engine/katago/` directory gets replaced.
- **`engine/helper.ts` (`big_table`, `ALPHA_KNOTS`).** The visit-color
  table is calibrated to KataGo's visit-distribution semantics; it's
  Go-specific by construction.
- **`engine/suggestion-colors.ts`.** Color overlay for move-quality
  visualization; the coloring scheme is tuned to KataGo's score
  ranges.
- **`components/BoardDisplay.vue`, `BoardWidget.vue`, `TreeWidget.vue`
  (the rendering of stones, hoshi, captures, ko markers).** A board-
  rendering component for Chess looks completely different.
- **`composables/use-move-suggestions.ts` (GTP coordinate parsing,
  best-move overlay).** GTP coordinates are KataGo-Go; would be
  replaced entirely.
- **`engine/util.ts` (board-state walks, captures math).** Captures
  are a Go-rule artifact; the math doesn't transfer.

### Band-mixed — the seams

A few modules straddle the boundary and are worth flagging
explicitly because they are where future seam-design matters most:

- **`engine/navigator.ts`** sits in Band 2 architecturally but knows
  about Go-specific things (captures, ko) at the leaf level. The
  navigator's *skeleton* is portable; its *delta-application* is not.
  A Chess port would reuse the LCA + delta-replay structure and
  swap the per-move delta semantics.
- **`composables/useReviewSession.ts`** sits in Band 2 but reads a
  KataGo-specific packet field (`extra.black.deltas` /
  `extra.white.deltas`) for scoring. The orchestration is portable;
  the scoring extraction is not.
- **The (planned) analysis-recording feature**, before it is built,
  sits between Band 2 and Band 3 by design. The *storage abstraction*
  ("persist engine analyses keyed by `(configHash, nodeId)`,
  surface them reactively, fail loudly per ADR-0002") is Band 1.
  The *gating predicate* and the *response shape it stores* are
  Band 3. **The feature should be designed so that the seam between
  these two layers is explicit**, even though we won't extract a
  Port today.

### What's NOT in this inventory

- `App.vue` — too omnibus to classify cleanly. It's a wiring file;
  most of its contents would be rewritten for any port simply
  because the UI shape would change.
- One-off utility files where the classification doesn't drive any
  decision.
- `types.ts` — the interface declarations are themselves the
  boundary documentation; classifying them as "agnostic" or
  "Go-bound" misses the point.

## What this means for the analysis-recording feature

The trigger for this ADR was the recognition that analysis-recording
is unusually domain-coupled. That recognition has a constructive
implication for how the feature should be designed.

Following the principle above, when we eventually build it:

- **The storage layer's abstractions name the problem class, not the
  instance.** `AnalysisPersistenceService.persistRecord(hash, nodeId,
  payload)` accepts `payload: T` for some `T` that the service
  doesn't introspect. The service knows about HTTP endpoints, opt-in
  toggles, fail-loud surfacing, batch coalescing — all generic.
- **The Go-specific gating lives in a named, isolated function.**
  `defaultGatingPredicate(packet: KataAnalysisResponse): boolean` is
  Go-shaped (it understands `isDuringSearch`, `rootInfo.visits`,
  `moveInfos`). The persistence service takes the predicate as a
  parameter; it doesn't import it.
- **The wire payload shape is a generic envelope.** The backend
  endpoint accepts `{ configHash, nodeId, payload }` where `payload`
  is opaque JSON. The backend doesn't know it's KataGo. A Chess
  fork could store Stockfish PV lines through the same endpoint
  with no schema change.

Notice what we are NOT doing:

- We are NOT extracting an `EngineResponseAnalyzerPort` interface
  with `analyze(): Score` that both KataGo and Stockfish implement.
  No Stockfish adopter exists; that abstraction would be wrong-shaped.
- We are NOT making the gating predicate a configurable strategy
  with multiple registered implementations. One predicate exists;
  it lives in one file; future variations get added when they exist,
  not in anticipation.

The seam is *designed* (the predicate is parameterizable, the
storage abstraction is generic over payload), but the abstraction
is *not extracted* (there is no Port interface, no registry, no
strategy pattern). The seam is a property of the code's shape, not
a documented interface contract. Future-us can extract a Port
cheaply because the seam is clean, and we don't pay the abstraction
cost until then.

This is the principle in action.

## What a Chess port would actually require

A useful concrete sizing. To port this codebase to Chess:

- **Wholesale replacement** (Band 3): all of `engine/katago/`,
  `engine/sgf-*`, `engine/util.ts`, `engine/helper.ts`'s tables,
  `engine/suggestion-colors.ts`'s tuning, `BoardDisplay.vue`,
  `BoardWidget.vue`, the GTP-coordinate parsing in
  `use-move-suggestions.ts`. Estimated 3000–5000 lines.
- **Refactor with reuse** (Band 2 mixed): `engine/navigator.ts`'s
  delta-application, `useReviewSession.ts`'s scoring extraction.
  Skeletons reused; leaves swapped. Estimated 200–500 lines of
  modification.
- **No change** (Band 1): everything in `store/`, `services/`,
  `composables/wait-for-analysis.ts`, `config/`, generic UI.
  Probably 60–70% of the codebase by line count.

This is a meaningful but not overwhelming undertaking — and that's
because the Band 1 / Band 2 / Band 3 distinction was already roughly
honored by the codebase's organic evolution. The principle above
doesn't ask for radical restructuring; it asks for ongoing
discipline so the boundary stays this clean as new features land.

## Consequences

### Positive

- **New features are evaluated against the boundary at design time.**
  The "what would change for a Chess port?" question is fast to ask
  and clarifies the shape of new code.
- **Auditability of domain coupling.** A future maintainer (or
  Chess-port adopter) has this document as a starting map.
- **Explicit seams without premature Port extraction.** The
  analysis-recording feature gets the right shape without paying
  for an abstraction we don't have a use case for.

### Negative

- **The principle is policy, not mechanism.** A contributor who
  doesn't ask the question won't have the type system catch them.
  Like ADR-0002, the discipline lives in code review.
- **The inventory will drift.** As modules change, their band
  assignments may shift. This document needs occasional refresh —
  realistically once or twice a year, or whenever a substantial
  domain-touching feature lands.

### Neutral

- **No code change today.** This ADR documents existing structure
  and establishes a discipline for future structure. Existing code
  is not refactored against it.

## Revisit when…

This ADR would be worth revisiting if any of the following:

1. **A second domain adopter materializes** (someone wants to fork
   for Chess, Shogi, or another problem class). At that point, Port
   extraction stops being premature — the second use case is the
   trigger that flips the cost-benefit. The seams documented here
   become the natural extraction points.
2. **The inventory drifts substantially.** If a wave of new features
   shifts the Band 1 / Band 2 / Band 3 distribution noticeably,
   refresh the inventory.
3. **A specific module's band classification turns out to be wrong
   in practice.** E.g., if `useReviewSession.ts` turns out to be far
   more KataGo-coupled than the inventory suggests once we look
   closely, the band moves and the principle's application to that
   module changes.
4. **The "what would change for a Chess port?" question stops being
   useful** as a thought experiment. If the team decides the
   codebase's future is exclusively Go and there's no reason to
   ever consider portability, the principle relaxes — though even
   then the seam-design discipline tends to produce better code,
   so it's worth retaining as a heuristic.

## Related

- **Backend item 34 / `PositionNormalizerPort` (item 30b).** The
  backend's analogous extraction. Established the precedent that
  domain-portability is a real architectural goal across the system.
  This ADR is the frontend's reply: same goal, different velocity,
  same discipline applied at design time.
- **`ANALYSIS_PERSISTENCE_PLAN.md`.** The future-project planning
  note that triggered this ADR. The principle here applies directly
  to that feature; see "What this means for the analysis-recording
  feature" above.
- **ADR-0001 (state mutation and `readonly`).** The same general
  philosophy — *type declarations should match actual behavior, no
  aspirational annotations* — applies to abstractions: *don't
  declare a Port until a second concrete implementation exists*.
- **ADR-0002 (fail loudly).** The analysis-recording feature's
  fail-loud-per-record discipline lives in the storage layer, which
  is Band 1; a Chess port inherits that discipline for free.

## Not goals (explicit)

- **Not a refactoring mandate.** Existing code stays put. This ADR
  is about future authoring discipline.
- **Not a Port-extraction roadmap.** No `*Port` interfaces are
  being declared, registered, or planned. The seams are designed;
  the abstractions are not extracted.
- **Not a portability promise.** We are not committing to ever
  shipping a Chess version. The discipline produces better code
  even in a Go-only future, which is the actual justification.
- **Not a substitute for backend item 34.** The backend's domain-
  agnostic-core work was a real refactor with concrete deliverables.
  This ADR is the frontend's lighter-touch counterpart, appropriate
  to the frontend's different cost structure and adoption status.
