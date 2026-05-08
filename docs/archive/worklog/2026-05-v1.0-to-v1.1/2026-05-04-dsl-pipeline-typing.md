# Pipeline DSL typing on the frontend

- **Status:** Shipped on `frontend/dsl-pipeline-typing` (branched
  off `main` post-cache-control merge), 2026-05-04. Build green.
  Closes the largest remaining `any` in frontend domain types.
- **Genre:** Type-driven design — adopt the OpenAPI-generated
  discriminated union for the pipeline DSL, retiring `any[]` on
  the consumer side. No runtime change.
- **Date:** 2026-05-04.

## Context

Backend item 31 closed the typed-pipeline arc on the server side
(`SelectStage | TakeStage | ShuffleStage | OrderStage` over
`domain/pipeline_dsl.py`); the OpenAPI codegen pipeline (item 30)
projects each stage and its inner selection / ordering strategy
unions into `src/types/backend.ts` automatically. The frontend's
`CardSet.pipeline: any[]` was the only consumer-side residue —
the wire-shaped union has been available all along, just not
adopted.

This is the kind of follow-on that's small once the substrate
work has been done. The work breakdown was: alias + interface
tightening (one file), parameter signature on the ACL boundary
(one file), a localized boundary cast at the JSON-text editor
(one file). Composables are pure pass-throughs; defaults narrow
through contextual typing.

## What changed

### `frontend/src/types.ts`

New `PipelineStage` discriminated-union alias:

```ts
export type PipelineStage =
  | components['schemas']['SelectStage']
  | components['schemas']['TakeStage']
  | components['schemas']['ShuffleStage']
  | components['schemas']['OrderStage'];
```

`CardSet.pipeline: any[]` → `PipelineStage[]`. The alias's
docstring names the wire-shape source, the discriminant (`stage`),
each variant's payload, and the inner-strategy unions (selection
/ ordering — those are themselves wire-typed discriminated
unions, not aliased separately because consumers don't navigate
them at the type level today).

Naming follows the project convention for wire-shape consumption
aliases (precedent: `CardCreatePayload`, `GameMetadataPayload`):
domain-friendly singular name, no `Wire` suffix, declared next
to its consumer rather than in the wire-re-exports block. The
short name `PipelineStage` is unambiguous in the domain
(`stage` is overloaded with KataGo wire vocab, but always
namespaced by surrounding context — there's no
`KataGoStage`-shaped collision risk).

### `frontend/src/services/backend-service.ts`

`queryForest(contextIds: number[], pipeline: any[])` →
`queryForest(contextIds: number[], pipeline: PipelineStage[])`.
Adds `PipelineStage` to the existing import from `../types`.

Internal `fetchEbisuSession` literal: `const pipeline = [...]`
→ `const pipeline: PipelineStage[] = [...]`. The annotation
provides contextual typing so each literal element narrows
correctly via its `stage` discriminant; without the annotation
TypeScript widens `stage: "select"` to `stage: string` and the
discriminated union doesn't apply.

### `frontend/src/components/CardSetEditor.vue`

The editor is a free-form CodeMirror JSON authoring surface; the
parsed value comes from `JSON.parse` (returns `any`) and gets
assigned into `cardSets[id].pipeline`. With `pipeline` now typed,
this becomes the structural type-honesty boundary.

The principled-but-bounded move: a localized
`as PipelineStage[]` cast at the parse-then-assign site, with an
ADR-0002 justification comment. The comment names:

- The editor's role (free-form JSON authoring surface for power
  users — the Tree DSL is intentionally hand-editable).
- The runtime check that does happen (`isJsonValid` covers
  parse-time syntactic validity).
- The runtime check that doesn't (structural shape against the
  discriminated union).
- The reason: the backend's pipeline executor is the loud-failure
  surface for malformed pipelines (rejects with 4xx, surfaces via
  the request-error path); duplicating shape validation
  frontend-side splits responsibility without adding signal.
- An upgrade path: a structural validator at this boundary could
  walk the union and set `isJsonValid = false` on shape mismatch,
  if a future use case justifies it.

The `addCardSet` function constructs a literal pipeline for new
decks; that literal narrows cleanly through `next[id]: CardSet`
contextual typing — no annotation needed at that site.

### Pass-through sites (no edits needed)

- `composables/useCardTreeData.ts:88` — `deck.pipeline` flows
  into `queryForest` as `PipelineStage[]` automatically; the
  composable doesn't navigate the union.
- `composables/useReviewSession.ts:184` — same pattern,
  `cardSet.pipeline` passes through.
- `store/defaults.ts:188, 204` — the two pipeline literals in
  `defaultCardSets` typecheck cleanly via the
  `Record<string, CardSet>` annotation; each element narrows via
  its `stage` discriminant.

### Doc-graph retrofit

`handoff-current.md`'s "Known gaps (frontend)" section dropped
two bullets:

1. The Pipeline DSL gap, retired by this PR.
2. The `useVariationPath` gap, retired by the brand-pair commit
   recorded in the Frontend Completed table at TODO.md:167 — the
   gap section hadn't been swept when that work landed.

Per ADR-0005 / ADR-0004's incremental-retrofit posture: while
editing the Known Gaps section, both stale bullets were visible
in the same edit window, and the closure of the second was
already-recorded fact (a sweep, not new work). Closing only the
DSL bullet would have left a known-stale entry to mislead the
next reader.

`TODO.md`'s Active section's unnumbered `[frontend]` entry
"Type the pipeline DSL on the frontend" replaced with a "moved
to Completed" stub pointing at the Frontend Completed table.

## Why no backend dispatch

The wire schema is unchanged — `SelectStage`, `TakeStage`,
`ShuffleStage`, `OrderStage` (and their inner strategy unions)
have been in `/openapi.json` since backend item 31 shipped
(release-scope.md item 5). The codegen has been emitting them
into `src/types/backend.ts` ever since. This PR is purely a
consumer-side adoption of types that were already available;
no schema renegotiation, no new wire surface, no backend-side
work implied.

## Verification

- `npm run build` (vue-tsc + vite build) clean. No literal-widening
  surprises — every pipeline literal in the codebase narrows
  through contextual typing.
- Manual: open the Decks tab → CardSetEditor → edit a pipeline's
  JSON. Valid pipeline ⟶ commits as before; the `INVALID JSON`
  badge still appears on parse error. Run a deck (Decks tab →
  Run pipeline button) — backend executes the typed pipeline
  identically to pre-PR (same wire shape).
- Manual: mint a card → Decks tab → reload → confirm the
  `defaultCardSets` `'default'` and `'fringe_first'` decks
  hydrate and execute correctly (the literals are typecheck-
  validated; runtime behaviour unchanged).
- Non-regression: SR session start (`useReviewSession.startSession`)
  → calls `queryForest(srContextIds, cardSet.pipeline)` → returns
  the expected card queue.

## Forward notes

The `PipelineStage` alias only goes one level deep — the inner
selection/ordering unions (`ContextSelection | DescendantSelection
| ...`, `DepthKey | EbisuRecallKey | BfsOrder | ...`) remain
addressed via `components['schemas']['<X>']` when needed.
Aliasing those into the domain layer is straightforward (same
pattern as `PipelineStage`) but unnecessary today — no consumer
navigates them by name. If a future feature needs to construct
typed selection / ordering programmatically (e.g. a
visual-pipeline-builder that replaces the JSON-text editor),
that's the right time to introduce `PipelineSelection` and
`PipelineOrdering` aliases.

The CardSetEditor's free-form-JSON authoring posture makes the
editor structurally vulnerable to typo'd pipelines (e.g.
`stage: "selct"` parses as JSON, fails at the backend with a
422). The current defence is the backend's loud error
surfacing via the `pushSystemMessage` path; the boundary-cast
comment names the upgrade path if this ever needs tightening.
A visual pipeline builder is the more comprehensive answer —
pre-validates structurally, eliminates the cast — but that's a
substantial UX redesign rather than a typing-pass follow-on.

`gradingParameter: Record<string, any> | null` on `ReviewCard`
remains as the largest remaining `any`-equivalent in the domain.
That one's intentional per the field's docstring ("opaque on the
OpenAPI boundary because the inner shape is application-defined
and changes more often than the schema") and named in
`handoff-current.md`'s Rough Edges section. Worth tightening
only if/when the inner shape stabilises further.
