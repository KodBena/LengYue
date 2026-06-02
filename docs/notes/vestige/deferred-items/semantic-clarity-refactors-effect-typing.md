# Semantic-clarity refactors surfaced by the effect-typing consult arc (analysis-service multiplexer; error-encoding consistency)

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status SSOT: see item `semantic-clarity-refactors-effect-typing` in `docs/work-status.json` (query: `node tools/work-status/sql.mjs "SELECT * FROM items WHERE id='semantic-clarity-refactors-effect-typing'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-06-01, alongside the stringly-typed-error item
  above — the effect-typing consults named the code's actual semantics
  sharply enough to expose two further spots where structure lags those
  semantics. Distinct from that item: these are *liked in principle but
  undecided*, lower-stakes, no discipline hazard — parked for a later
  decision, not an audit. The maintainer likes both in principle and is
  settled on neither.

**(a) Name the analysis-service packet multiplexer (nuanced).**
`onAnalysisUpdate` (`analysis-service.ts:910-1000`) is an *implicit*
fan-out hub: one normalised packet pushed inline to ~5 disjoint stateful
sinks — `telemetry.recordPacket`, `ledger.record`,
`stabilityTrajectoryStore.record`, the `store.engine.metrics` bump,
`analysisPersistenceService.markDirty` (finals-only), plus the
ponder-ceiling warning. The true semantics (per the Effect-TS
architectural-merits consult) is a multiplexing *Subject*, but the code
doesn't name it, and the service imports all five spokes — a hub
depending on every consumer. **The caveat that keeps it undecided:** the
sinks are *heterogeneous* (different packet projections, different firing
conditions), so a clean generic `Subject<packet>` interface may obscure
more than it clarifies. The cheaper, likelier-correct win is smaller —
extract the dispatch into a named unit and consider *inverting the
dependency* (sinks register with the hub rather than the hub importing
them). Decide the shape (full Subject vs. named-dispatch + dependency
inversion vs. leave) when revisited.

**(b) Unify the multi-variant error encoding (marginal; overlaps the (e) residual).**
The typed-error spaces use three encodings for one concept: a `class`
with a discriminant field (`AnalysisWaitError.reason`), a `class` without
one (`CardTreeOverflowError`), and a discriminated `type` union
(`AnalysisBundleStorageError`). A reader learns three idioms. Picking one
— the discriminated union + `never`-default exhaustiveness, the project's
type-driven-design idiom — would unify and enable compiler-enforced
exhaustive handling at callers. **Overlaps** the deferred (e) residual in
`decisions-deferred.md` ("Effect-typing as documentation") and is
**substantially subsumed** by the structured-`ApiError` audit above
(which upgrades the error channel library-free); best revisited *after /
together with* that audit, since it may shrink to "just unify the ≤4
hand-rolled spaces' encoding" once `ApiError` lands.

- **Cross-references.** `docs/notes/consult/opus-consult-2026-06-01-effect-ts-architectural-merits.md`
  (the Subject characterisation), `docs/notes/consult/opus-consult-2026-06-01-neverthrow-overhaul.md`
  (the error-encoding inventory), the stringly-typed-error item above, and
  the (e) residual in `docs/notes/decisions-deferred.md`.

---

License: Public Domain (The Unlicense).
