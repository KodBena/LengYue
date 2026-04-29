# Card-Tree — Backend → Frontend Status Dispatch

- **Date:** 2026-04-29
- **From:** backend (card-tree implementation session, 2026-04-29)
- **To:** frontend (next session for the card-tree widget per
  `docs/notes/card-tree-frontend-spec.md`)
- **Type:** status — closes the backend half of release-scope item 3
- **Status:** open at the frontend's end; backend half is shipped

## TL;DR

Backend half of release-scope item 3 (card-tree widget) is shipped.
Two new POST endpoints — `/lineage/resolve-roots` and
`/lineage/tree-by-root` — are wired and tested. The wire contract
matches `docs/notes/card-tree-backend-spec.md` with one small
deviation (`game_source_id` is folded into the tree-by-root response
naturally via the Port; the wire shape is unchanged from spec).

When you start the frontend card-tree session, you have a working
backend to talk to. Regenerate `src/types/backend.ts` via
`npm run gen:api` to pick up the new wire shapes.

## What ships

Two endpoints under `/lineage`:

| Method | Path                       | Purpose                                              |
|--------|----------------------------|------------------------------------------------------|
| POST   | `/lineage/resolve-roots`   | group input card ids by their game-source root       |
| POST   | `/lineage/tree-by-root`    | fetch a structure-only subtree from a verified root  |

Both authenticated via the existing JWT bearer flow. Both
tenant-scoped on `user_id` from the JWT — same posture as every
other tenant-aware endpoint.

## Wire shapes

### `POST /lineage/resolve-roots`

```jsonc
// Request
{
  "card_ids": [int, ...]
}

// Response
{
  "roots": [
    {
      "root_card_id": int,
      "game_source_id": int,
      "card_ids_in_tree": [int, ...]   // subset of input cards belonging here
    },
    ...
  ],
  "unmatched_card_ids": [int, ...]     // input ids not owned or not found
}
```

`unmatched_card_ids` is the load-bearing surface for partial
results: cards owned by another tenant or absent from the database
end up here rather than being silently dropped (per ADR-0002 and
the bulk lift of item 13's per-card 404-not-403 collapse).

Empty `card_ids` is valid input and returns
`{"roots": [], "unmatched_card_ids": []}`.

### `POST /lineage/tree-by-root`

```jsonc
// Request
{
  "root_card_id": int,
  "max_nodes": int  // optional, default 10000, minimum 1
}

// Success response (200)
{
  "root_card_id": int,
  "game_source_id": int,
  "tree": {
    "id": int,
    "children": [ /* recursive */ ]
  }
}

// 404 — root not owned, missing, or not actually a game-source root
{ "detail": "root card <id> not found for this user" }

// 422 — tree exceeds max_nodes
{
  "detail": "tree exceeds max_nodes",
  "actual_size": int,
  "max_nodes": int
}
```

Per the spec, the `tree` payload is structure-only (`id` and
`children` only, no per-card metadata). Per-card data continues
to come from `GET /cards/{id}` so the two read paths stay
independently cacheable.

The 422 body carries the **exact** `actual_size` so a UI can
report "this game has 12,387 nodes; cap is 10,000 — increase or
narrow the query." Per ADR-0002, the backend does not silently
truncate.

## Behavioral notes

### Root semantics

`/lineage/tree-by-root` accepts only **game-source roots** — cards
whose `card_source` row has a non-null `game_source_id`. A
mid-chain card (one that has a parent card) returns 404. If the
frontend wants to render a subtree from an arbitrary anchor, that's
a different question and would be a different endpoint; raise it
as a dispatch if the widget grows that need.

### DAG-vs-tree resolved

The deferred-decisions ledger entry on
`docs/notes/decisions-deferred.md` is closed. The schema
(`card_source.card_id UNIQUE`, with the `check_one_source`
CheckConstraint) admits exactly one parent per card, so the result
of `tree-by-root` is genuinely a tree. Both spec files'
"open questions" sections have been updated to reference the
resolved ledger entry.

### Ordering

`resolve_roots` returns groups in the order each root is first
encountered as input order is walked, and `card_ids_in_tree`
within each group is in input-list order. Neither ordering is
part of the wire contract — the spec leaves it to the
implementation — but the deterministic shape makes the response
stable across repeated calls.

`tree-by-root` does not order children deterministically beyond
what SQLite's row-output order gives (no `ORDER BY` in the
descent CTE). If the frontend needs a particular child ordering
for the visual layout, sort frontend-side. Filing this as a
contract note rather than a contract guarantee.

## Tenancy

Both endpoints are tenant-scoped (the seventh and eighth read
paths on the backend). Cross-tenant inputs:
- `resolve-roots`: appear in `unmatched_card_ids`
- `tree-by-root`: 404

Same JWT-driven flow as every other authenticated endpoint;
your `auth_token` localStorage entry is what gets used.

## What's NOT in scope

- **No multi-root composite endpoint.** If the frontend
  consistently calls `tree-by-root` once per `RootGroup` from
  `resolve-roots`, that's the spec's two-thin-endpoints
  composition. A bulk variant would only be added if profile
  data shows the per-call overhead is dominant — premature for
  v1.
- **No per-card metadata in `tree`.** Use the existing card
  store / `GET /cards/{id}` pattern.
- **No edge-label data (move information).** The spec calls
  this out as a future possibility; revisit when the widget's
  needs are clearer.
- **No streaming or pagination for very large trees.** The 422
  is the v1 answer.

## Implementation references

- Backend implementation worklog:
  `docs/worklog/2026-04-29-card-tree-backend.md`
- Backend code: `backend/api/routes/lineage.py`,
  `backend/domain/lineage.py`,
  `backend/repositories/lineage_repository.py` (the two new
  Port methods and their CTE helpers).
- Test coverage:
  `backend/tests/integration/test_lineage_endpoints.py`
  (9 passing integration tests).

## Closing

The frontend's card-tree spec
(`docs/notes/card-tree-frontend-spec.md`) is the consumer's
contract; the spec's `RootGroup → tree-by-root` composition
matches what the backend now serves. When the widget is
ready, you have what you need.

If anything is missing or shaped wrong for the consumer, raise
a dispatch and we'll iterate. Per the spec's discipline,
spec-shaped questions answer first; implementation cycles
without surfacing back.
