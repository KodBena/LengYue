# Card-Tree — Backend Specification

- **Status:** Specification (pending implementation).
- **Genre:** Backend capability specification.
- **Date:** 2026-04-26.
- **Scope:** The endpoints and Port-level capabilities required
  to serve the frontend's card-tree widget (specified in
  `card-tree-frontend-spec.md`). Builds on the existing
  `LineageRepositoryPort` and the tenancy spine.

## What this provides

The frontend widget that visualizes Tree DSL pipeline results in
context (per the frontend specification) needs structural forest
data the backend doesn't currently expose. This document
specifies the minimum capability set: two endpoints and their
underlying Port methods.

The capability set is deliberately small. The frontend's
progressive-disclosure logic wants the full tree(s), not a
precomputed visualization-shaped subset. The backend's job is to
serve trees efficiently and within tenancy bounds; what to
visualize is a frontend question.

## Architectural rationale

The non-obvious choice is **two thin endpoints rather than one
composite endpoint or a richer subforest-computation endpoint.**
The reasoning, in priority order:

- **Auditability.** Each endpoint does one thing. Composite
  endpoints accumulate side responsibilities (caching, ordering,
  error aggregation) that audit poorly under change. Two thin
  endpoints, each individually inspectable, are easier to reason
  about — both at implementation time and during the inevitable
  later debugging session when something downstream goes wrong
  and the question becomes "which call returned what."
- **Reusability.** The frontend currently composes the two
  endpoints as part of one user-facing flow (pipeline result →
  identify roots → fetch trees). Future consumers may want
  either capability independently — fetching a tree from a known
  root for some other widget, resolving roots for a stat-line
  query. Independent endpoints support both consumers without
  coupling them.
- **Composition with existing infrastructure.** Both endpoints
  are recursive-CTE walks over the existing card lineage tables.
  They naturally extend `LineageRepositoryPort` rather than
  growing a new abstraction.

The choice rejected here was a richer endpoint that returns
something like `{ trees: [...], highlighted: [...] }` in one
round-trip. That endpoint could be added later as a service-level
composition of the two thin Port methods — at which point its
implementation is a few lines and its existence is justified by
an actual second consumer per `docs/notes/reflection.md`'s
Port-extraction discipline.

## The two endpoints

### `POST /lineage/resolve-roots`

For each input card id owned by the requesting user, identifies
the game-source root that card descends from, and groups the
input cards by their root.

**Request:**
```
{ "card_ids": [int, ...] }
```

**Response:**
```
{
  "roots": [
    {
      "root_card_id": int,
      "game_source_id": int,
      "card_ids_in_tree": [int, ...]    # subset of input belonging here
    },
    ...
  ],
  "unmatched_card_ids": [int, ...]      # input ids not owned or not found
}
```

The `unmatched_card_ids` field surfaces silently-dropped cards
explicitly per ADR-0002. Silent omission would let the frontend
display incomplete results without knowing it.

### `POST /lineage/tree-by-root`

Returns the full subtree rooted at a specified card,
structure-only.

**Request:**
```
{
  "root_card_id": int,
  "max_nodes": int             # optional, default 10000
}
```

**Response:**
```
{
  "root_card_id": int,
  "game_source_id": int,
  "tree": { "id": int, "children": [...recursive...] }
}
```

**On overflow:** `422 Unprocessable Entity` with body:
```
{
  "detail": "tree exceeds max_nodes",
  "actual_size": int,
  "max_nodes": int
}
```

Early termination — count nodes during the CTE walk and abort
when the cap is reached — is required, not post-hoc truncation.
The reasoning is the same as the auditability argument above:
post-hoc truncation produces an undefined "which subset of the
tree did the user receive" question that no caller can audit;
early termination produces a clean "this query is too big, here's
the size, decide what to do" failure that the caller can react
to deliberately.

## Port surface

Both endpoints map to two new methods on
`LineageRepositoryPort`:

```
async def resolve_roots(
    self,
    card_ids: list[CardId],
    *,
    user_id: UserId,
) -> RootResolution: ...

async def fetch_tree_by_root(
    self,
    root_card_id: CardId,
    *,
    user_id: UserId,
    max_nodes: int = 10000,
) -> CardTree: ...
```

The `*` before `user_id` makes it keyword-only per the
convention recorded in `docs/notes/tenancy.md` — adjacent
integer parameters are the transposition risk the `UserId`
brand was designed to catch, and the brand only catches the
type, not the position. Forcing keyword-only at every Port
method that takes `user_id` makes the call site
self-documenting and removes the failure mode entirely.

Domain types:

- `RootResolution` carries the `roots` list and the
  `unmatched_card_ids` set.
- `CardTree` is recursive `{id, children}` — minimal structure,
  no per-card metadata. The frontend's existing card store
  fetches metadata separately.

The Port-level placement is the natural extension of the
existing `LineageRepositoryPort` — both methods walk the lineage
tables via recursive CTE, which is the Port's existing
competence. A service-level placement would either be slow
(N+1 walks via existing single-card methods) or would put SQL
in the service layer (violating the Dependency Rule per
ADR-0003). The implementer should read the existing
`LineageRepositoryPort` methods and follow the established shape.

If the implementer reads the existing Port and feels strongly
that one or both methods belong elsewhere, raise the question
back rather than placing speculatively.

## Tenancy

Both endpoints add new read paths governed by the existing
tenancy spine. Each method filters on `card.user_id = :user_id`
in the recursive CTE.

- `resolve_roots`: cards not owned by the user appear in
  `unmatched_card_ids` rather than as 404. This matches item
  13's per-card 404-not-403 posture, lifted to the bulk case.
- `fetch_tree_by_root`: a root the user does not own returns
  404 (single-resource pattern). A tree where some descendant
  cards belong to a different user — which shouldn't happen
  given the schema but worth being explicit about — has those
  descendants filtered out of the returned tree.

These are the seventh and eighth entries in the tenancy
read-path inventory. Update item 26's tenancy documentation
accordingly.

## Composition with existing infrastructure

Read before implementing:

- `repositories/lineage_repository.py` — existing Port methods
  and CTE patterns. Both new methods should follow the same
  shape.
- `domain/tree_engine.py`, `domain/tree_queries.py` — recursive
  CTE infrastructure. Reuse where applicable.
- `docs/notes/tenancy.md` — the model these methods compose
  with.
- `docs/TODO.md` items 13–16, 25, 26 — the tenancy spine that
  must land before this work begins.
- `docs/adr/0001-state-mutation-and-readonly.md` —
  `RootResolution` and `CardTree` are value objects; `readonly`
  applies.
- `docs/adr/0002-fail-loudly.md` — the early-termination and
  `unmatched_card_ids` decisions both flow from this tenet.
- `docs/adr/0006-source-file-headers.md` — new files carry the
  standard header.

## Non-requirements

Out of scope for this work:

- Computing induced subforests, hot sets, stub/bucket
  classification, or any visualization-shaped projection. That's
  the frontend's job; the backend serves trees, not display
  data.
- Per-card metadata in the wire shape. Card metadata is fetched
  by the frontend's existing card store via separate calls.
- Streaming or pagination for very large trees. The
  early-termination 422 is the v1 answer; if real users hit the
  cap consistently, lazy-subtree-streaming is a future feature
  worth designing then, not now.
- Multi-root composite endpoints. Could be added later as a
  service-level helper if a second consumer materializes;
  premature for v1.

## Open questions

- **Multi-parent edges.** Does `card_source` admit a card with
  multiple parents? If yes, "subtree rooted at X" is genuinely
  a DAG, not a tree, and `fetch_tree_by_root` needs to decide
  whether to return a tree by some canonicalization, return a
  DAG with explicit edges, or reject the request. Formally
  deferred as a decision to be resolved at item-3 implementation
  start; the deferred-decisions ledger
  (`docs/notes/decisions-deferred.md`) carries the deferral
  entry under the title "Card-tree DAG-vs-tree question
  (multi-parent edges in `card_source`)" with the rationale and
  triggers for revisitation. The frontend spec carries the same
  open question; a single answer serves both sides.

## Related

- **`card-tree-frontend-spec.md`** — the frontend widget that
  consumes these endpoints. Together they describe the contract
  from both sides.
