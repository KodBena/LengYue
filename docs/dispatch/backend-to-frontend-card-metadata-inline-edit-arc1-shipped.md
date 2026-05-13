# Card-metadata inline edit — Arc 1 shipped (tags on read)

- **Date:** 2026-05-13
- **From:** backend
- **To:** frontend
- **Type:** shipped-status notification — arc 1 of the
  card-metadata inline-edit arc lands on `main`; consumer-side
  work unblocked.
- **Status:** shipped to local `main`. The frontend can run
  `npm run gen:api` against the updated backend's
  `/openapi.json` to refresh `src/types/backend.ts`, then open
  the consumer-side branch.

## TL;DR

`Card.tags: List[str]` is added to the persisted shape and
populated by both read-side adapters. `CardWithRecall` inherits
the field (it extends `Card`); the three routes that emit
`CardWithRecall` surface tags unconditionally. No new endpoints,
no schema migrations, no Port-signature changes — purely
additive at the wire level.

## What changed

### Domain

`backend/domain/card.py`:

- `Card` gains `tags: List[str] = Field(default_factory=list)`.
  Frozen-model-safe default. `CardWithRecall` inherits the field
  via its `Card` base; `project_card`'s `model_dump()` carries it
  through without explicit handling.

### Adapters

- `backend/repositories/card_repository.py::get_card_by_id` runs
  one extra short `SELECT name FROM tag JOIN card_tag WHERE
  card_id = :id ORDER BY tag.name`. The result is injected into
  the row dict before `Card.model_validate`.
- `backend/repositories/lineage_repository.py::_materialize` runs
  one batched `SELECT card_id, tag.name FROM card_tag JOIN tag
  WHERE card_id IN (:ids) ORDER BY card_id, tag.name`, groups by
  `card_id` in Python, and injects per-card tag lists before
  constructing each `Card`. Single round-trip regardless of
  pool size; the IN-set is bounded by queue size.
- ADR-0006 header retrofitted on `card_repository.py` (file
  previously lacked one).

### Wire shape

Routes affected (no signature changes — `CardWithRecall`'s
schema gains the `tags` field via inheritance):

- `GET /cards/{card_id}` → `CardWithRecall` with `tags`.
- `POST /cards/{card_id}/review` → `CardWithRecall` with `tags`.
- `POST /forests/query` → `List[CardWithRecall]` with `tags`.

`tags` is `[]` (never `null`) for a card with no `card_tag`
rows. Alphabetised per the adapter's `ORDER BY tag.name` /
`ORDER BY card_id, tag.name` enrichment, so the wire shape is
deterministic across reads.

### Fakes

- `tests/fakes/card_repository.py::FakeCardRepository.get_card_by_id`
  surfaces tags from the existing `self.tags` side-store
  (already populated by `attach_tags`).
- `tests/fakes/lineage_repository.py::FakeLineageRepository`
  gains a `self.tags` side-store and a `seed_tags(card_id, ...)`
  helper. Internal `_make_node` constructs `CardNode`s with
  tags injected; all four `fetch_*` paths route through it.

### Tests

Three new route-tier assertions:

- `tests/integration/routes/test_cards_routes.py::test_get_card_returns_tags_alphabetically`
  — seeds three tags, asserts alphabetised order.
- `...::test_review_response_carries_tags` — POST /review
  response carries tags so the frontend's review-flow
  `ledger.put` can swap the cached body without a follow-up
  GET.
- `tests/integration/routes/test_forests_routes.py::test_forests_query_results_carry_tags`
  — the queue-fetch path: pool with one tagged card and one
  un-tagged, asserts both shapes (`["joseki"]` vs `[]`) in the
  same response.

The existing `test_get_card_returns_card_with_recall` was also
extended to assert `tags == []` on the no-tags case.

Full suite: **545 passed, 1 skipped, 2 xfailed** in 10.45s on
local SQLite.

## Frontend hand-off

What the frontend needs to do to consume:

1. **Refresh the codegen.** `cd frontend && npm run gen:api`
   against a running backend. The new `tags` field will appear
   on the `CardWithRecall` definition in `src/types/backend.ts`.
2. **Extend the ACL.** `frontend/src/services/backend-service.ts`'s
   `mapToReviewCard` (or equivalent CardWithRecall → ReviewCard
   projection) gets one new line mapping `wire.tags → domain.tags`.
   `ReviewCard` in `src/types/<wherever>` gains a
   `tags: readonly string[]` field.
3. **Surface in the consumers.** The Browse forest view's
   selection panel and any review-session display that wants to
   show tags reads `card.tags` directly.

The contract guarantee from the backend side:

- `tags` is always present (never undefined / null).
- Order is deterministic (alphabetical, stable across reads).
- Strings only — plain tag names, no virtual-tag DSL syntax.

## What's next (arc 2)

`PATCH /cards/{card_id}` per the mutable-subset table in the
status dispatch. New Port method (`update_card_metadata` on
`CardWriteRepositoryPort`), new service method, new route.

Arc 2 will land as its own shipped-status dispatch when ready.
The frontend's inline-edit UI build can proceed in parallel
against the contract recorded in
`backend-to-frontend-card-metadata-inline-edit-status.md`;
backend will surface any contract-level divergence (none
expected) before merging.

## Reply

No reply requested. Reciprocal frontend dispatch
(`frontend-to-backend-card-metadata-inline-edit-arc1-consumed.md`
or similar) when the consumer-side branch is in, so backend
knows the wire-shape change has settled end-to-end.
