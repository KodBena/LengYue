# Card-metadata inline edit — Arc 2 shipped (PATCH /cards/{card_id})

- **Date:** 2026-05-13
- **From:** backend
- **To:** frontend
- **Type:** shipped-status notification — arc 2 of the
  card-metadata inline-edit arc is implemented on
  `KodBena/feat/card-metadata-inline-edit-arc2` and posted as a
  PR for review. The frontend's inline-edit UI build is
  unblocked once this lands.
- **Status:** shipped to branch; PR pending review on GitHub.

## TL;DR

`PATCH /cards/{card_id}` is wired end-to-end against the
mutable-subset table from the negotiation dispatch
(`backend-to-frontend-card-metadata-inline-edit-status.md`,
Ask 2). The full pipeline lands together — schema, Port,
adapter, service, route, fake, tests — and arrives at a
deterministic wire contract the frontend can build against
once the codegen refresh propagates.

## Wire shape

```http
PATCH /cards/{card_id}
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "tags": ["joseki", "shape"],            // optional
  "num_moves": 8,                          // optional, > 0
  "suspended": false,                       // optional
  "grading_parameter": {                    // optional, merge-into-data
    "data": {
      "gamma": 0.95,                        //   open (0, 1)
      "default_visits": 1500                //   opaque pass-through
    }
  },
  "reset_prior": true                       // optional, default false
}
```

**Response:** `CardWithRecall` (`200 OK`), projected at write
time. The frontend can `ledger.put`-style swap the cached body
without a follow-up GET.

**Errors:**

- `401` — bearer missing or invalid.
- `404` — `card_id` doesn't exist OR belongs to a different
  tenant (404-not-403 collapse, preserved).
- `422` — Pydantic field-level validation failure: `num_moves
  <= 0`, `gamma` outside the open interval (0, 1), an unknown
  top-level key, or an unknown key under `grading_parameter`.

## What changed

### Schema (`schemas/card.py`)

- `GradingParameterData` — `extra="allow"` blob with a typed
  `gamma: Optional[float] = Field(gt=0.0, lt=1.0)`. Opaque
  frontend keys (`analysis_config`, `default_visits`, future
  additions) flow through unchanged.
- `GradingParameterPatch` — `extra="forbid"` wrapper carrying a
  required `data: GradingParameterData`.
- `CardPatch` — `extra="forbid"` request DTO with optional
  fields: `tags`, `num_moves`, `suspended`, `grading_parameter`,
  and the companion `reset_prior: bool = False` flag.

### Domain / Ports / Adapter

- `repositories/ports.py` — `CardWriteRepositoryPort` gains
  `update_card_metadata(card_id, patch, *, user_id) ->
  Optional[Card]`. Port docstring documents the per-field
  semantics, the merge rules, and the 404-not-403 collapse.
- `repositories/card_repository.py::CardRepository.update_card_metadata`
  — five-step adapter: existence/ownership check (returns None
  on cross-tenant or non-existent), column-level updates
  (including the `reset_prior` reset cascade), JSON-merge-patch
  on `grading_parameter.data` at one level, tag full-replace
  via `delete + attach_tags`, re-fetch through
  `get_card_by_id` so the returned `Card` carries the
  arc-1-shipped tags enrichment.

### Service / Route

- `services/card_service.py::CardService.update_card_metadata`
  — thin orchestration seam; translates `None` from the Port
  into `CardNotFoundError`.
- `api/routes/cards.py::PATCH /cards/{card_id}` — captures
  `user_id` from JWT, wraps the service call in
  `async with db.begin():`, projects the returned `Card` to
  `CardWithRecall` at write time, maps `NotFoundError → 404` /
  `InvalidInputError → 422` via the existing handlers.

### Fake

- `tests/fakes/card_repository.py::FakeCardRepository.update_card_metadata`
  — behavioural mirror over in-memory state. Same five-step
  shape; same `None` semantics on cross-tenant; same merge /
  reset / tag-replace behaviour. Used by the service-unit
  tests.

### Tests

**Service unit tests** (`tests/unit/services/test_card_service.py`)
— 13 new tests covering the dispatch axis: cross-tenant,
nonexistent, tags full-replace, tags empty wipes, tags absent
preserves, num_moves overwrite, suspended toggle,
grading_parameter merge (preserve absent keys + overwrite
collisions), null→constructed wrapper, reset_prior alone,
reset_prior + num_moves atomic, empty-patch no-op.

**Route-tier tests** (`tests/integration/routes/test_cards_routes.py`)
— 14 new tests covering the wire contract: the four failure
axes (404 cross-tenant, 404 nonexistent, 401 no-bearer, 422
for `num_moves <= 0` / `gamma` boundary / unknown top-level
key / unknown `grading_parameter` wrapper key / lineage field
rejected), plus six happy-path assertions on the same
semantics as the service tests, hitting the FastAPI app via
httpx + ASGITransport.

Full suite: **572 passed, 1 skipped, 2 xfailed** in 11.22s.

## Frontend hand-off

Once PR #212's successor lands and the frontend session
refreshes codegen:

1. `cd frontend && npm run gen:api` against a backend built
   from this branch. `CardPatch`, `GradingParameterPatch`, and
   `GradingParameterData` appear in `src/types/backend.ts`.
2. **ACL.** `backend-service.ts` gains an `updateCardMetadata`
   method paired to `PATCH /cards/{card_id}`. The reverse-
   projection (ReviewCard / domain card → wire `CardPatch`)
   composes the patch body from changed fields only; for
   `grading_parameter.data`, the ACL sends just the keys the
   user touched, matching the merge contract.
3. **UI.** Per the frontend's reply commitments in the
   negotiation dispatch:
   - Inline-panel surface in `ReviewSessionPanel.vue` and
     the Browse selection panel.
   - Click-to-edit affordance per field; save on blur / Enter;
     optimistic local update + rollback on 422.
   - `reset_prior` rendered as an explicit affordance
     (checkbox or two-button confirmation) when the user
     changes `num_moves`, with the worded prompt the frontend
     committed to ("this card's review history was based on a
     different target moves value…"). Also reachable as a
     standalone affordance.
   - `suspended` as a prominent toggle; suspended cards
     filtered post-fetch from the queue and visually muted in
     Browse.

## Backend-side semantic guarantees

- **Merge depth.** `grading_parameter` merge is one level
  (`data`-key level). Keys present in the patch's `data`
  overwrite stored same-named keys; absent keys are preserved.
  Explicit-null in the patch overwrites a stored value
  (matches "keys present overwrite" verbatim). Non-`data`
  top-level keys in the stored blob survive the merge.
- **`tags` semantics.** Three-way: `null`/absent → leave alone;
  `[]` → wipe; `["..."]` → replace.
- **`reset_prior` scope.** Resets `(α, β, t)` to
  `config.EBISU_DEFAULT_MODEL`, clears `last_reviewed_at`,
  zeroes `num_reviews`. Atomic with any other patch field.
  Default false — never silently triggered.
- **`grading_parameter.data` opacity.** Backend reads exactly
  `data.gamma`. Everything else under `data` is opaque
  pass-through (the Ask 3 contract is unchanged).
- **Idempotence on the no-op patch.** An empty body
  `{}` returns 200 with the current card unchanged; same shape
  as any other PATCH response.

## Reply

No reply requested — the wire shape was settled in the
negotiation dispatch. Reciprocal frontend dispatch
(`frontend-to-backend-card-metadata-inline-edit-arc2-consumed.md`
or similar) when the consumer-side branch is in, so backend
knows the inline-edit UI has settled against this contract.
