# Pipeline-DSL Hyperparameter Harness — Design Note

**Status:** `design-note: planned`. No implementation work has
started. This document records the design at planning time so a
future session can pick it up without re-deriving the shape.

**Motivation.** Decks (CardSets) carry hyperparameters by nature —
the number of cards a `take` stage pulls, the tag-DSL filter a
`select` stage uses, the seed for a `shuffle` stage. Today these
values are baked into the pipeline JSON at deck-authoring time;
varying them means hand-editing the deck or duplicating it.
The right shape is to expose chosen leaves as named handles that
get filled in at pipeline-run time (or review-session-start time)
without touching the deck declaration.

The constraint: the harness is a frontend-only construct. The
backend's pipeline executor sees only the wire DSL
(`PipelineStage[]`); the substitution happens upstream of the
ACL. That keeps the dispatch surface unchanged and isolates the
concept inside the deck-authoring UX where it belongs.

---

## The syntactic disambiguator

Every legitimate DSL atom in a pipeline is either quoted (stage
names, selection types, ordering types, tag-DSL strings) or
numeric (visit counts, take-n, indices). A bare identifier in
value position is currently a JSON syntax error — never produced
by the executor, never emitted by an authoring tool. That fact is
the disambiguator the harness latches onto: a bare identifier
unambiguously marks a hole.

```
[
  { "stage": "select",
    "selection": { "type": "DescendantSelection" },
    "ordering":  { "type": "bfs_order" } },
  { "stage": "take",  "n": deck_size },
  { "stage": "shuffle" }
]
```

The user-facing model: anything quoted is a literal; anything bare
is a hole.

---

## Decision — three knobs

### 1. Authoring dialect

JSON5-superset input. Bare identifiers in value position parse to
`{ $param: 'name' }` AST nodes. Trailing commas and single-quoted
strings are admitted as ergonomic sugar — recommended since we're
rolling a custom parser regardless and stock JSON's strictness has
been a recurring authoring annoyance. Everything else stays
JSON-strict.

### 2. CardSet schema evolution

`CardSet` gains `hyperparameters: HyperparamDecl[]` alongside
`pipeline`. The pipeline shape becomes
`pipeline: PipelineStageWithHoles[]` — same discriminator as
`PipelineStage`, but leaf values are `T | { $param: string }`.
Migration is idempotent for existing decks: no holes means an
empty `hyperparameters` and a structurally-identical `pipeline`.

```ts
type HyperparamDecl =
  | { name: string; type: 'number'; default: number;
      range?: [number, number]; label?: string }
  | { name: string; type: 'string'; default: string;
      options?: string[]; label?: string }
  | { name: string; type: 'enum'; default: string;
      options: string[]; label?: string };
```

The `enum` variant is the tag-DSL case (a fixed list of named
filters the user maintains).

### 3. Bind-time substitution

Two natural call sites: `runPipeline` in
`composables/useCardTreeData.ts` and the analogous
review-session-start path in `composables/useReviewSession.ts`.
Both currently take a `CardSet` and pass `deck.pipeline` directly
to `backendService.queryForest`. They become harness-aware: if
the deck declares any hyperparameters, open a small modal
collecting values (defaults pre-filled, validators in place),
substitute into the AST, then send the resulting `PipelineStage[]`
to the backend as before.

Substitution is a pure function:
`substitute(pipelineWithHoles, values) → PipelineStage[]`. Walks
the AST; replaces `{ $param: name }` nodes with the matching
`values[name]`; throws on unbound names (ADR-0002 — silent skip
would let a deck run with a missing hyperparameter and the user
wouldn't know).

---

## Validation surface (ADR-0002)

The CardSet editor lints continuously:

- Every `{ $param: name }` node in the parsed AST must have a
  matching entry in `hyperparameters`. Save blocked otherwise.
- Every declared hyperparameter should be referenced at least
  once. Warning, not error — declaring "this could vary even
  though I haven't varied it yet" is legitimate.
- Where the surrounding schema is known (e.g., `take.n` is a
  number per the generated `TakeStage` type), the matching
  declaration's `type` must agree. Type mismatch is an error.

Runtime: missing value at bind time blocks the API call. The
modal's submit button stays disabled until every required field
has a value or default.

---

## Viability concerns

- **CodeMirror integration.** The existing editor uses the stock
  JSON syntax mode at `CardSetEditor.vue`; bare identifiers will
  paint as syntax errors and confuse users. Two options:
  (a) custom Lezer grammar for the JSON5+holes dialect
  (correct but substantial); (b) disable the bundled linter and
  rely on the existing `isJsonValid` indicator plus a
  parser-driven status surface (much smaller; recommended for v1).
- **No wire-shape change.** The harness is purely frontend-side.
  Backend's `PipelineStage` discriminated union is unchanged; no
  cross-team dispatch needed.
- **Power-user posture.** The deck DSL is already explicitly
  hand-edited (per the existing ADR-0002 boundary cast in
  `CardSetEditor.vue`'s `updatePipeline`). A JSON5 dialect with
  hole markers fits the surrounding register; this is not a
  drift toward a more visual editor.
- **"Promote literal to hyperparameter" affordance.** The
  harness panel could offer a click-to-extract action on a
  literal. UX win, defer to v2 if scope creeps.

---

## Frontend impact

Band 1 (truly domain-agnostic per ADR-0003 — the harness is a
generic hole-and-fill machine, no Go in it).

- `src/types.ts` — new `HyperparamDecl`, `PipelineStageWithHoles`,
  `CardSet` extension.
- `src/store/migrations.ts` — one schema migration adding
  `hyperparameters: []` to existing decks (idempotent, since old
  decks have no holes and their `pipeline` is structurally
  identical post-migration).
- `src/components/CardSetEditor.vue` — harness panel (declaring
  hyperparameters), dialect parser swap, lint surface.
- New `src/lib/dsl-harness.ts` — pure parse / validate /
  substitute functions; the file is the unit-test target.
- New `src/components/HyperparamPromptModal.vue` — bind-time
  value entry.
- Two call-site rewires in `useCardTreeData.runPipeline` and
  `useReviewSession`'s session-start path.

---

## Cross-references

- ADR-0002: validation surface above.
- ADR-0003: band-1 placement.
- `src/types.ts` `PipelineStage` (the discriminator the harness
  wraps).
- `backend/docs/tree-dsl.md` for the wire-side DSL semantics.

---

## Maintenance contract

`design-note: planned`. When implementation lands, this document
transitions to `design-note: implemented` per the doc-graph
genre lifecycle: a status line at the top names the closing PR
and worklog, and the body becomes historical record (the
worklog carries the "what actually shipped" detail). Until then,
this is the canonical handle for the planned work.

If implementation reveals the design is wrong in some load-bearing
way, that's a worth-publishing rethink — file a sibling
`design-note: revised` rather than silently editing this one.
