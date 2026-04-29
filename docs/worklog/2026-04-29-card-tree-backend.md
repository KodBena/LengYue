# Card-tree backend endpoints

- **Status:** Shipped on branch (TBD), 2026-04-29. Nine integration
  tests pass against in-memory SQLite covering resolve-roots
  (round-trip, self-root, cross-tenant unmatched, empty input) and
  fetch-tree-by-root (full subtree, cross-tenant 404, non-root 404,
  overflow, exact-cap boundary).
- **Genre:** Worklog entry — backend half of release-scope item 3
  (card-tree widget). Implements the spec at
  `docs/notes/card-tree-backend-spec.md`.
- **Date:** 2026-04-29.
- **Origin:** Backend implementer session per the release-scope
  item-3 trigger that fires the deferred multi-parent question
  (recorded as resolved in `docs/notes/decisions-deferred.md`).

## Context

The backend exposed `/forests/query` (the typed-pipeline result
endpoint), `/cards/{id}` (single card with recall projection), and
`/stats/forests` (per-root aggregate stats), but no endpoint surfaced
the **structural shape of the forest** — the tree of cards rooted at
each game-source. The frontend's card-tree widget needs that shape
to render its progressive-disclosure view of pipeline results in
context.

The spec (authored 2026-04-26) calls for two thin endpoints rather
than one composite, with the auditability and reusability
arguments documented in the spec itself. This worklog is the
implementer side of that contract.

## DAG-vs-tree question (Step 0)

The spec carried an open question — "does `card_source` admit
multi-parent edges?" — formally deferred to implementation start
in `docs/notes/decisions-deferred.md`. Trigger #1 (card-tree
backend implementation begins) fired with this session.

The investigation took one file read.
`backend/db/schema.py:121` declares
`card_source.card_id` with `unique=True`, and the
`check_one_source` CheckConstraint forces exactly one of
`card_source_id` (parent card) or `game_source_id` (game-source
root) to be set. **Each card has exactly one row in `card_source`,
hence exactly one parent.** The schema does not admit multi-parent
edges; the lineage is a forest of trees, not a DAG. The
`is_primary_source` boolean is a vestigial design hint that's
unreachable under the unique constraint — were multi-source ever
to become a domain need, the constraint would have to be relaxed
first, and that schema change would itself be the trigger named
for revisiting this decision.

`fetch_tree_by_root` therefore takes the natural tree shape; no
canonicalization, no DAG return, no rejection branch. The ledger
entry is updated with the outcome (preserving the original
deferral rationale per Rule 6); both spec files have been
updated to reference the resolution rather than continuing to
flag the open question.

## Architectural shape

Per the spec's "extend the existing Port rather than a new
abstraction" guidance, the work is shaped as:

- **Domain** (`domain/lineage.py`, new) — `RootGroup`,
  `RootResolution`, `CardTree`, and `RootedTree` as frozen Pydantic
  value objects. ADR-0001 says value objects keep `frozen=True`;
  these are projection results, not mutable state.
- **Errors** (`domain/errors.py`, extended) — `LineageOverflowError`
  carrying `actual_size` and `max_nodes`, sitting under
  `InvalidInputError` so the route's "InvalidInputError → 422"
  axis-catch composes naturally.
- **Ports** (`repositories/ports.py`) — `LineageRepositoryPort`
  gains `resolve_roots` and `fetch_tree_by_root`, both
  keyword-only `user_id: UserId` per the tenancy convention.
- **Adapter** (`repositories/lineage_repository.py`) — two methods
  matching the Port. `resolve_roots` walks UPWARD via a new
  `_root_walk_cte` helper that filters at base+step (defense in
  depth). `fetch_tree_by_root` reuses the existing
  `_recursive_descent_cte` for the downward walk; root verification
  is a small SELECT before the descent; overflow detection uses
  `LIMIT max_nodes + 1` with a follow-up `COUNT` only on the
  overflow path so the happy case is one query.
- **Router** (`api/routes/lineage.py`, new) — wire shapes (Pydantic
  models) at the top of the file per the backend's "extract a
  schemas module when a second consumer appears" discipline. Two
  POST endpoints. `CardNotFoundError → 404`,
  `LineageOverflowError → 422` with the structured detail body
  the spec specifies.
- **Wiring** (`main.py`) — `app.include_router(lineage.router)`.

## Spec deviation: `RootedTree`

The spec declares the Port's `fetch_tree_by_root` return as
`CardTree` and the wire response shape as
`{root_card_id, game_source_id, tree}`. The two are
internally inconsistent: the wire needs `game_source_id`, the Port
return doesn't carry it. Letting the route fetch the
`game_source_id` independently after the descent is one extra
round trip per request — wasteful, since the Port's root-
verification step has the value in hand and is just dropping it.

The implementation wraps `CardTree` in a small `RootedTree`
(carrying `root_card_id`, `game_source_id`, and the inner
`tree`) and the Port returns that. The route projects directly
to the wire shape with no extra lookup. This is a faithful
reading of the spec's intent (the wire contract is unchanged) and
of ADR-0003's "extract when a second consumer appears" — `RootedTree`
exists because the route is the consumer that needs the bundled
shape, not speculatively for some future caller.

## Tenancy

Both methods are tenant-scoped (the seventh and eighth read paths
on the backend per the card-tree backend spec's reckoning). Both
Port methods take keyword-only `user_id: UserId`. Both CTEs apply
the user-id filter at base AND step — `_root_walk_cte` directly,
`_recursive_descent_cte` via its existing belt-and-braces filter.
Cross-tenant inputs:
- `resolve_roots`: surfaces them in `unmatched_card_ids` (the bulk
  lift of item 13's per-card 404-not-403 collapse).
- `fetch_tree_by_root`: raises `CardNotFoundError`, mapped to 404
  by the route — the single-resource posture from item 13 applies.

Filed under "Item — card-tree (tenancy)" code-comment
annotations on the two route handlers, matching the convention
items 13–25 established.

## Tests

Nine integration tests in `tests/integration/test_lineage_endpoints.py`
exercise the adapter directly against an in-memory SQLite session.
Coverage:

- `resolve_roots`: groups input by tree across two trees of the
  same tenant; self-root input resolves to itself; cross-tenant +
  nonexistent inputs go to `unmatched`; empty input
  short-circuits.
- `fetch_tree_by_root`: full-subtree round trip (5 nodes,
  branching); cross-tenant root → `CardNotFoundError`; mid-chain
  card (not a game-source root) → `CardNotFoundError`; overflow
  reports exact `actual_size`; tree at exactly `max_nodes`
  succeeds (boundary check on the `LIMIT max_nodes + 1`
  detection).

The tests inline-seed the database rather than reuse the
`TreeBuilder` helper in `tests/helpers.py` — that helper predates
the item-34a column rename (`pos_hash` → `content_hash`,
`normalized_sgf` → `canonical_content`) and currently fails at
`INSERT` time with `Unconsumed column names`. Fixing it is
out of scope for this work; the handoff doc and the umbrella
TODO both name the test rewrite as a separate post-release arc.

## Files touched

```
backend/api/routes/lineage.py             (new)
backend/domain/lineage.py                 (new)
backend/domain/errors.py                  (extended; ADR-0006 retrofit)
backend/main.py                           (router wiring)
backend/repositories/lineage_repository.py (extended; ADR-0006 retrofit)
backend/repositories/ports.py             (extended; ADR-0006 retrofit)
backend/tests/integration/test_lineage_endpoints.py (new)

docs/dispatch/backend-to-frontend-card-tree-status.md  (new)
docs/notes/card-tree-backend-spec.md       (open question → resolved)
docs/notes/card-tree-frontend-spec.md      (open question → resolved)
docs/notes/decisions-deferred.md           (outcome on the multi-parent entry)
docs/notes/tenancy.md                      (passing reference to new endpoints)
docs/release-scope.md                      (item 3 backend half done)
docs/TODO.md                               (Backend Completed entry)
```

## Related

- `docs/notes/card-tree-backend-spec.md` — the contract this
  implementation satisfies.
- `docs/notes/card-tree-frontend-spec.md` — the consuming widget
  spec.
- `docs/notes/decisions-deferred.md` — DAG-vs-tree resolution.
- `docs/dispatch/backend-to-frontend-card-tree-status.md` —
  status dispatch with wire shapes summarized.
