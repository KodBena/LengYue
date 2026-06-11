# ADR-0003: Frontend Portability and Domain Boundaries

- **Status:** Accepted
- **Genre:** Bounded Context Map (structural-descriptive with
  prescriptive elements) — a third genre after the *decision* of
  ADR-0001 and the *tenet* of ADR-0002. Maps the domain coupling of
  the codebase and gives a principle for evaluating future changes
  against it.
- **Date:** 2026-04-24
- **Amendments:** 2026-06-10 — recorded that **Revisit-when #1 (a
  second domain adopter materializes) has fired** (the maintainer's
  generic knowledge flash-card fork, 2026-06-09/10), with a second
  prospective adopter filed on the game-class axis (the `chess-clone`
  work-status item, open/active; its own proof-of-concept gate is
  unmet) — phrasing precision-corrected 2026-06-11 per the ADR-corpus
  audit's C4 rider, which found the original "fired twice" an
  overclaim — and that **Revisit-when #2
  (the inventory drifts substantially) has fired** (~9 of ~23
  inventory paths went stale across the source-tree
  reorganisations). The per-file inventory listing is delegated to
  `frontend/FILES.md` — the maintained per-file band map, with a
  same-PR update cadence; 78 `[B1]` / 39 `[B2]` / 97 `[B3]` / 1
  `[B?]` at this amendment — while the band definitions, the
  band-mixed seam analysis, and the port-sizing prose are retained
  here (one-line dominant-concern tags cannot carry within-file seam
  detail). A non-game fork sizing is added beside the Chess one
  (Band 2 **splits** rather than transfers). One Revisit-when #3
  instance — `useReviewSession.ts`: Band 2 here, `[B3]` in
  FILES.md — is recorded, not adjudicated. The principle is
  unchanged. One of the bounded ADR record repairs from the
  2026-06-10 history-lessons audit
  (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` §3.23;
  work-status item `adr-record-amendments-2026-06`).
  2026-06-11 — record repairs from the 2026-06-10 ADR-corpus audit
  (`../notes/audit/audit-adr-corpus-2026-06-10.md`, package A3):
  a dated premise annotation in the Decision section (the
  "no concrete second-domain consumer exists" closing premise is no
  longer true); the analysis-recording section re-tensed as a
  substantially-fulfilled prediction with two named deviations; a
  two-axis note after the principle blockquote; the Chess-sizing
  rows annotated as a 2026-04 planning snapshot with named FILES.md
  disagreements; the Related planning-note pointer re-pointed to the
  archive; and the Revisit-#1 "fired twice" phrasing
  precision-corrected (above, and at the trigger). The principle is
  unchanged.
  2026-06-11 — the **structural half of the band discipline became
  mechanism** (Negative-consequence note below; work-status
  `band-conformance-ci-check`): `tools/band-conformance/check.mjs`
  enforces `band(file) >= band(import)` over `frontend/src`'s import
  graph against `frontend/FILES.md`'s tags, gating CI on the crisp
  FILES.md-row ↔ file drift class and running the band-ordering audit
  advisory-first. The content-half band judgment stays with review.
  This is the per-tenet mechanization ADR-0008 Revisit-#4 named; the
  principle is unchanged.
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

*(Note, 2026-06-10: with a non-game adopter named (Amendments line), the
authoring-time question is two-axis. "What would change for a Chess
port?" forces the game-instance seam — Band 3 against the rest. "What
would survive a port outside the game class?" forces the stronger Band 1
boundary, which is the whole kept surface for the generic knowledge fork.
Ask both; `frontend/FILES.md`'s legend was re-keyed to the stronger
criterion in the same change as this amendment.)*

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

*(Note, 2026-06-10 — completing the in-place record the same-day
amendment started: the closing premise above, "no concrete
second-domain consumer exists", is no longer true. Two adopters are
named in the Amendments line; per Revisit-when #1, Port extraction for
the seams a concrete adopter touches is no longer premature by this
section's own cost-benefit argument. The reasoning stands as the
planning-time record of why extraction waited; it is not a standing
instruction to keep waiting.)*

## Domain Coupling Inventory

The frontend's modules sit on a spectrum from fully agnostic (would
survive any port) to essentially Go-bound (their existence presumes
Go). Three useful bands.

*(Amended 2026-06-10 — Revisit-when #2 fired: the per-file example
listings this section originally carried went substantially stale
(~9 of ~23 paths no longer resolved after the source-tree
reorganisations). The per-file inventory is delegated to
`frontend/FILES.md`, which tags every source file with its band and
is maintained in the same PR that touches a file — the maintenance
discipline an ADR-inline listing structurally lacks (ADR-0005
Rule 1: one owning document per handle). The band definitions below
remain canonical here; FILES.md carries the instances.)*

### Band 1 — Truly domain-agnostic

These modules have no concepts that wouldn't survive a port to any
other knowledge domain (Chess, Shogi, language flashcards, music
theory drills). They speak in concepts the problem *class* needs
(reactive state, content-addressed caches, debounced persistence,
generic UI primitives) rather than concepts the *instance* uses.

### Band 2 — Game-class agnostic but tree/turn coupled

These modules speak in concepts that would survive a port to *any
turn-based game with branching variations and AI analysis* — Chess,
Shogi, Xiangqi, Othello — but would not survive a port outside that
class (e.g., to language flashcards, where there is no game tree
and no "turn"). They are domain-agnostic *within* the game-tree
problem class.

### Band 3 — Essentially Go-bound

These modules carry concepts that don't exist outside Go (or carry
specific Go encodings of concepts that exist generally). Porting
them isn't refactoring — it's replacement.

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
  Port today. *(Shipped — 2026-06-10-recorded; see the dated note in
  "What this means for the analysis-recording feature".)*

### What's NOT in this inventory

- `App.vue` — too omnibus to classify cleanly. It's a wiring file;
  most of its contents would be rewritten for any port simply
  because the UI shape would change.
- One-off utility files where the classification doesn't drive any
  decision.
- `types.ts` — the interface declarations are themselves the
  boundary documentation; classifying them as "agnostic" or
  "Go-bound" misses the point.

*(Note, 2026-06-10: the maintained inventory in `frontend/FILES.md`
does tag these — `App.vue` as `[B3]`, `types.ts` as `[B2]` with a
named B3 leakage — under its dominant-concern allowance. The
exclusions above stand as this ADR's planning-time scoping record,
not as a constraint on FILES.md.)*

*(Note, 2026-06-10, later the same day: the `types.ts` exclusion is
retired by the types.ts split (history-lessons audit §3.15, a
Revisit-when #1 consequence) — the single mixed file is now a barrel
over per-domain modules under `src/types/` plus `src/store/schema.ts`,
each carrying its own honest FILES.md band tag, dissolving the
`[B2]`-with-B3-leakage compromise the previous note records.)*

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

*(Note, 2026-06-10: the feature shipped — the analysis-bundle persistence
arc (backend `/analysis-bundles` routes; frontend
`services/analysis-persistence-service.ts` +
`composables/useAutoSaveAnalyses.ts`). Scored against what was built: the
**opaque envelope shipped as designed** — the v1 wire is
`{config_hash, node_id, packet}` with the packet opaque to the backend
(`backend/domain/analysis_bundle.py` states the contract: "the backend
never inspects its shape"), and the v2 evolution strengthened the opacity
(SPA-encoded bytes the backend brotli-wraps and returns verbatim). The
**seam was designed, not extracted** — no Port, no strategy registry,
exactly as prescribed. Two deviations from this section's letter: the
persistence service is Go-typed (`[B3]` in FILES.md; its records carry
`KataAnalysisResponse`, and the v2 encoder hierarchy under
`services/analysis-bundle/` is KataGo-shaped) rather than generic over
`payload: T`; and the gating predicate is not passed as a parameter — the
`isDuringSearch` gate lives at the `analysis-service` call site that bumps
the service's domain-neutral per-board dirty counter, with user-toggle
gating in the auto-save composable. The seam between Go-shaped capture
and generic persistence mechanics exists, one notch further upstream than
drawn here. A fork replaces the encoder hierarchy and the dirty-bump call
site; the wire contract and the backend need no change — the section's
bottom-line claim held.)*

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

*(Note, 2026-06-10: the file rows above are the 2026-04 planning snapshot
and are not maintained — `frontend/FILES.md` is the per-file authority
(Amendments line). Known row-level disagreements exist: this section's
Band-1 "no change" examples include `store/` (`store/index.ts` is `[B3]`
in FILES.md), `services/` (several `[B3]` rows), and
`composables/wait-for-analysis.ts` (`[B3]`); `engine/helper.ts` sits
under wholesale replacement here but is `[B1]` there. These are recorded
in the 2026-06-10 history-lessons audit as adjudication the filed
band-conformance check (work-status `band-conformance-ci-check`) will
force; until then read this section's bands as
definitions-with-seam-detail and FILES.md's rows as the instances — where
they disagree, neither is silently right (Revisit-when #3's posture).)*

## What a generic knowledge fork would actually require

*(Added 2026-06-10, when Revisit-when #1's second firing — the
maintainer's intended fork to a non-game knowledge domain (generic
flash cards) — made the Chess sizing above insufficient on its own.)*

A port outside the turn-based-game class flips the load-bearing
boundary. The Chess sizing partitions Band 3 (replace) from
Band 1 + Band 2 (keep); a generic knowledge fork partitions Band 1
(keep) from Band 2 + Band 3 — and Band 2 **splits** rather than
transferring or being replaced wholesale:

- **Wholesale replacement** (Band 3): the same surface as the Chess
  sizing — the engine wire vocabulary, SGF I/O, board rendering,
  the Go-calibrated tables and overlays.
- **Split, not replace** (Band 2): the game-tree *skeleton* goes —
  outside the game class there is no variation tree and no "turn"
  (the navigator skeleton, tree display / expansion / layout) —
  while the SR-orchestration flow (fetch queue, load card, await
  user response, evaluate, score, advance) and the generic charting
  machinery survive intact. Those two seams are exactly the ones
  worth keeping clean; `useReviewSession`'s orchestration-vs-scoring
  seam (Band-mixed, above) is the worked example.
- **No change** (Band 1): the store machinery, services, generic UI
  and infrastructure. For this fork Band 1 is the *whole* of the
  kept surface — which is why `[B1]` tags deserve checking against
  the any-knowledge-domain criterion in Band 1's definition rather
  than the weaker "chess port" axis (the `frontend/FILES.md` legend
  was re-keyed accordingly in the same change as this amendment;
  the existing tags have not yet been swept against the stronger
  criterion).

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
  Like ADR-0002, the discipline lives in code review. *(2026-06-11:
  the **structural half** became mechanism. `tools/band-conformance/
  check.mjs` (work-status `band-conformance-ci-check`; wired into
  `frontend-ci`) parses `frontend/FILES.md`'s band tags against
  `frontend/src`'s import graph and enforces `band(file) >=
  band(import)` — `[B?]` / type-only / the two band-mixed hubs exempt,
  with an annotated-exception list encoding the dominant-concern legend.
  It gates at `error` only on the crisp FILES.md-row ↔ file-resolution
  drift class; the band-ordering audit runs advisory-first (ADR-0011
  Rule 3/5). So the **content half** — is this band tag right, or an
  expected dominant-concern artifact — stays review judgment, exactly
  the half the "what would change for a Chess/non-game port?" question
  asks a human to weigh. The Revisit-#3 disagreements below are now
  surfaced mechanically rather than only at audit time.)*
- **The inventory will drift.** As modules change, their band
  assignments may shift. This document needs occasional refresh —
  realistically once or twice a year, or whenever a substantial
  domain-touching feature lands. *(2026-06-10: it did — see the
  Amendments line. The per-file half now lives in
  `frontend/FILES.md` with a same-PR cadence; this document keeps
  the definitions and seams, which drift far more slowly.)*

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
   become the natural extraction points. **(Fired; recorded
   2026-06-10, phrasing precision-corrected 2026-06-11 per the
   ADR-corpus audit's C4 rider.)** The trigger has fired (the
   maintainer's generic knowledge flash-card fork, 2026-06-09/10,
   named as a binding constraint during the history-lessons audit),
   with a second prospective adopter filed on the game-class axis
   (the `chess-clone` work-status item, open/active; its own
   proof-of-concept gate is unmet). The two adopters sit on
   different axes, so the seams here are now the extraction map both
   read; the non-game sizing above is the second adopter's column.
   Port extraction for the seams a concrete adopter touches is no
   longer premature by this ADR's own criterion.
2. **The inventory drifts substantially.** If a wave of new features
   shifts the Band 1 / Band 2 / Band 3 distribution noticeably,
   refresh the inventory. **(Fired; recorded 2026-06-10.)** The
   source-tree reorganisations left ~9 of ~23 inventory paths stale.
   Resolved by delegating the per-file listing to
   `frontend/FILES.md` (see the Amendments line) rather than
   refreshing it in place — the same-PR cadence there is the
   structural fix an in-place refresh would not have provided.
3. **A specific module's band classification turns out to be wrong
   in practice.** E.g., if `useReviewSession.ts` turns out to be far
   more KataGo-coupled than the inventory suggests once we look
   closely, the band moves and the principle's application to that
   module changes. **(One instance recorded 2026-06-10, not
   adjudicated:** this ADR places `useReviewSession.ts` in Band 2;
   `frontend/FILES.md` tags it `[B3]`. The disagreement is exactly
   the canary this trigger names — the named-seam extraction work
   the 2026-06-10 audit filed is the adjudication path, not this
   amendment.)
4. **The "what would change for a Chess port?" question stops being
   useful** as a thought experiment. If the team decides the
   codebase's future is exclusively Go and there's no reason to
   ever consider portability, the principle relaxes — though even
   then the seam-design discipline tends to produce better code,
   so it's worth retaining as a heuristic.

## Related

- **`frontend/FILES.md`.** The maintained per-file band inventory
  this ADR's instance listing was delegated to (2026-06-10
  amendment). This ADR carries the band definitions and the seam
  analysis; FILES.md carries the per-file tags, with a same-PR
  update cadence.
- **Backend item 34 / `PositionNormalizerPort` (item 30b).** The
  backend's analogous extraction. Established the precedent that
  domain-portability is a real architectural goal across the system.
  This ADR is the frontend's reply: same goal, different velocity,
  same discipline applied at design time.
- **`../archive/notes/design/analysis-persistence-plan.md`.** The planning
  note that triggered this ADR (archived when the feature shipped; path
  re-pointed 2026-06-11 — the old `docs/notes/` location no longer
  resolves). The principle here applies directly to that feature; see
  "What this means for the analysis-recording feature" above.
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
