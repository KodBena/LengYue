# Pipeline-DSL hyperparameter harness — implementation

- **Status:** Ready to ship; `npm run build` green (vue-tsc -b +
  vite build), `npm run test:run` reports 197 / 200 (3 pre-existing
  skips, 31 new tests added in `tests/unit/lib/dsl-harness.test.ts`).
  Branch / PR to be assigned on push.
- **Genre:** Feature — closes the planned arc in
  `docs/archive/notes/dsl-hyperparameter-harness-plan.md`; that note
  transitions from `design-note: planned` to `design-note:
  implemented` in the same arc.
- **Date:** 2026-05-12.

## Context

The Tree DSL pipeline a deck declares is a parameterised strategy:
the `n` a `take` stage pulls, the expression a `FilterSelection`
tags against, the seed a `shuffle` might want. Pre-harness, every
varied value forced either a deck edit (rewrites the canonical
declaration) or a deck duplication (multiplies near-identical
JSON). The plan named the right shape: expose chosen leaves as
named handles bound at run time, leaving the declaration intact.

The disambiguator the plan latched onto is syntactic: every
legitimate DSL atom is either quoted or numeric, so a bare
identifier in value position unambiguously marks a hole. The
harness materialises that observation as a JSON5 superset that
parses bare identifiers into `{ $param: name }` AST nodes, plus a
typed declaration list (`HyperparamDecl[]`) the user maintains
alongside the pipeline, plus a bind-time prompt modal that
collects values and substitutes them into the AST before the wire
call.

## What changed

### Pure logic — `src/lib/dsl-harness.ts` (new)

Recursive-descent parser, formatter, validator, and `substitute()`
walker. The dialect is the JSON-strict subset plus three
ergonomic extensions: trailing commas, single-quoted strings, and
bare-identifier holes. Everything else is rejected (no comments,
no unquoted keys, no hex numbers). Hand-rolled — zero new
dependencies. Tests at `tests/unit/lib/dsl-harness.test.ts` (31
tests covering parse, format, validate, substitute, the
parse∘format round-trip, and the v1 path-aware coherence checks).

Path-aware schema coherence is intentionally narrow in v1: a
declared `number` slot must agree with `take.n`, and a
`tag_expression` slot accepts only `string` or `enum`. Other
leaves pass with declaration-existence checks only. The backend's
typed pipeline executor remains the loud-failure surface for
malformed downstream payloads (ADR-0002).

### Types — `src/types.ts`

`Hole`, `Holed<T>`, `PipelineStageWithHoles`, and
`HyperparamDecl` added adjacent to the existing `PipelineStage`
alias. `Holed<T>` is a mapped type that admits `Hole` on open
primitives (`string`, `number`, `boolean`) while letting literal
discriminator types (`"select"`, `"take"`, …) pass unchanged, so
the discriminated union still narrows.

`CardSet` gains `hyperparameters: HyperparamDecl[]` as a required
field, and its `pipeline` field generalises from
`PipelineStage[]` to `PipelineStageWithHoles[]`. Decks without
holes type-check identically because the wider type is a
supertype of the narrower one.

### Schema migration 32 → 33 — `src/store/migrations.ts`

Idempotent: walks every `cardSets[*]` and stamps
`hyperparameters: []` when missing or non-array; existing arrays
preserved. Pre-v33 decks have no holes so their pipeline content
is structurally identical post-migration. Built-in default decks
in `src/store/defaults.ts` get `hyperparameters: []` directly.

### `src/components/editors/CardSetEditor.vue`

The JSON.parse / JSON.stringify boundary is replaced with the
harness's `parse` / `format`. The ADR-0002 boundary cast that
previously trusted `JSON.parse` to produce `PipelineStage[]` now
trusts the harness parser to produce `PipelineStageWithHoles[]`,
with parser errors and validator errors surfaced inline via the
`validationMsg` computed in the pipeline header. A child
`HyperparameterPanel.vue` carries the declaration table —
extracted to keep the SFC under ADR-0007's 250-line budget
(parent now ≈260, panel ≈210).

### `src/components/editors/HyperparameterPanel.vue` (new)

Declarations editor. One row per `HyperparamDecl` with
columns Name / Type / Default / Constraints (range for `number`,
options for `enum` / `string`) / Label / delete. Type-change
forces a fresh default that fits the new type and drops
constraints that no longer apply. Emits the full array back to
the parent on every edit so `CardSet.hyperparameters` stays the
source of truth.

### `src/components/modals/HyperparamPromptModal.vue` (new)

Bind-time prompt. Caller invokes `open(decls)`; resolves to a
`Record<name, value>` on submit or `null` on cancel. Per-field
validation gates the submit button — numbers parse and bound-check
against the optional range, enums must be one of the declared
options, constrained strings (when `options` is non-empty)
likewise. Defaults pre-filled at open.

### Call-site rewires — `useCardTreeData.ts`, `ForestDirectory.vue`

`useCardTreeData.runPipeline` gains an optional
`hyperparameterValues: Record<string, number | string>` parameter
and now calls `substitute(deck.pipeline, values)` before
`backendService.queryForest`. Unresolved holes throw
`UnboundHoleError` and surface through the slot's `error` —
ADR-0002 (silent skip would let a holey deck reach the backend
with `{ $param: ... }` literals).

`ForestDirectory.vue`'s `runDeck` and `startReviewFromConfig`
become harness-aware: when `deck.hyperparameters.length > 0`,
open the prompt modal first and short-circuit on cancel. The
modal sits in the component layer because UI doesn't belong in
composables (layering tenet). The composable's defensive
`substitute()` catches the case where the value collection was
skipped or misrouted.

### i18n — `en.json`, `zh-CN.json`, `ja.json`, `ko.json`

Twenty new keys per locale across `cardSet.harness.*` (panel
labels, type names, placeholders) and `harnessPrompt.*` (modal
title, button labels). Pipeline-header key updated from "JSON" to
"JSON5 + holes" to reflect the dialect change.

### `frontend/FILES.md`

Three new rows: `src/lib/dsl-harness.ts`,
`src/components/editors/HyperparameterPanel.vue`,
`src/components/modals/HyperparamPromptModal.vue` (all [B1]).
`CardSetEditor.vue`'s one-line description updated to mention the
JSON5+holes dialect.

## Decisions diverging from the plan

1. **`useReviewSession` is not a substitution site.** The plan
   named it as the second of two call sites; the post
   cards-tab-merge code routes both `runDeck` and
   `startReviewFromConfig` through `useCardTreeData.runPipeline`,
   so the substitution lives there. `useReviewSession.startSession`
   already takes a resolved `ReviewCard[]` queue and never sees
   the pipeline.

2. **Modal opens at the caller layer, not inside the composable.**
   `runPipeline`'s signature accepts a values record; the modal
   lives in `ForestDirectory.vue`. Keeps composables UI-free per
   the layering tenet and avoids hosting a Vue template ref
   inside the composable.

3. **`src/lib/dsl-harness.ts`, not `src/utils/`.** The plan named
   the `lib/` path explicitly; the `lib/` vs `utils/` merger
   flagged in `docs/archive/notes/frontend-source-tree-reorganization.md`
   is still its own open arc. If the merger lands later, the
   harness file moves alongside the other lib inhabitant.

4. **Persistence shape: round-trip through the AST, not the
   source string.** Matches the existing editor's
   `JSON.stringify(parsed, null, 2)` pattern. Source-author
   whitespace and comments don't survive; if user complaints
   surface, a `pipelineSource?: string` companion field is a
   clean upgrade path.

## What's NOT changed

- The wire contract. `backendService.queryForest` receives
  resolved `PipelineStage[]` after substitution; the backend's
  pipeline executor sees no new shape.
- The `useReviewSession` interface or any code path that doesn't
  cross `runPipeline`.
- Pre-existing decks. The schema migration adds `hyperparameters:
  []` and leaves `pipeline` content untouched; behaviour is
  identical until a user introduces a hole.

## Verification

- `npm run build` — green.
- `npm run test:run` — 197 passing, 3 pre-existing skips. 31 new
  tests in `tests/unit/lib/dsl-harness.test.ts` cover parse,
  format, validate, substitute, the parse∘format round-trip, and
  the v1 path-aware coherence checks (`take.n` numeric,
  `filter.tag_expression` string-or-enum).
- Manual smoke (recommended at hand-off): pre-existing deck
  with no holes runs unchanged; introduce a bare-identifier hole
  in `CardSetEditor`, declare it in the new panel, click "Run
  pipeline" or "Start review" → prompt modal opens, defaults
  pre-filled, submit substitutes and runs.

License: Public Domain (The Unlicense)
