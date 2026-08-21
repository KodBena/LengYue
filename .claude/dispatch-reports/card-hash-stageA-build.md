# Build: card-position annotations, Stage A

Status: shipped. Implements Stage A only (fetch + store + mint-dialog
duplicate warning) per the ratified design at
`.claude/dispatch-reports/card-position-annotations-design.md`. Stage B
(tree markers) is explicitly out of scope, per that design's §6.

Author read end-to-end: `frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`,
`backend/README.md`, `backend/CLAUDE.md`, `backend/tests/CLAUDE.md`, and
the design doc itself.

## Wire contract

### `content_hash` on `CardWithRecall`

`Card.content_hash: bytes` (raw SHA-256 digest, matching
`normalized_position.content_hash`'s column type) added to the domain
entity in `backend/domain/card.py`. Projected at the two construction
sites that already project `canonical_content`:
`CardRepository.get_card_by_id` and `LineageRepository._materialize`
(one added `SELECT` column each). Because `CardWithRecall` inherits
`Card`, every existing `CardWithRecall`-shaped response now carries the
field for free: `GET /cards/{id}`, `POST /forests/query`,
`POST /cards/{id}/review`, `PATCH /cards/{id}`.

**Bug found and fixed during testing:** a `@field_serializer` on
`content_hash` (hex-encoding for the wire) also fired during
`project_card`'s internal `CardWithRecall(**card.model_dump(), ...)`
python-mode round-trip, double-encoding the hash (the hex *string* got
re-validated back into `bytes` via UTF-8 encoding). Fixed by scoping the
serializer to `when_used="json"` — see `domain/card.py`'s
`_serialize_content_hash` docstring for the full mechanism.

### `POST /positions/hash`

New stateless endpoint, `backend/api/routes/positions.py` +
`backend/schemas/positions.py`. Request: `{raw_content: str}`. Response:
`{content_hash: str}` (lowercase hex). Calls
`PositionNormalizerPort.normalize()` directly — the same Port
`CardService.create_card` uses — so the returned hash is guaranteed to
match what minting `raw_content` verbatim would produce. No persistence,
no `CardService`, no `user_id` threaded into the Port call (position
identity is normalizer-global). The route DOES require auth
(`get_current_user_id`, unused beyond the dependency) for consistency
with the rest of the authenticated card surface — see the route's
module docstring for the explicit rejection of the no-auth alternative.

Registered in `main.py` and the route-test `conftest.py`'s test-app
builder.

### Tenancy

No new bulk "all my card hashes" endpoint — the design named one as an
*optional* dispatch flag (§3, "dispatch flag #3"); the task's explicit
ask covered only the stateless hash endpoint and the widened DTO, so
this build relies on the SPA's existing tenant-scoped card-fetch paths
(`queryForest`, `fetchCard`, etc.) to populate the known-positions set
incidentally — see the frontend section below. Verified the existing
listing endpoints stay tenant-scoped with the widened DTO: a new
route test (`test_forests_query_content_hash_isolated_across_tenants_sharing_position`)
seeds two tenants sharing the identical normalized-position row (a
`content_hash` collision is expected and correct — `content_hash` is
deliberately a *global*, not tenant-scoped, identity) and asserts
`POST /forests/query` never returns the other tenant's card id.

## Backend test names (`backend/tests/`)

- `tests/integration/routes/test_positions_routes.py`:
  `test_hash_position_same_content_twice_same_hash`,
  `test_hash_position_different_content_different_hash`,
  `test_hash_position_matches_minted_card_content_hash` (the
  "one identity, one home" contract, end to end against a real mint),
  `test_hash_position_malformed_returns_422`,
  `test_hash_position_without_bearer_returns_401`.
- `tests/integration/routes/test_forests_routes.py` (extended):
  `test_forests_query_returns_descendant_pool` now asserts
  `content_hash` presence/value; new
  `test_forests_query_content_hash_isolated_across_tenants_sharing_position`
  (the tenancy check above).
- Existing 693 backend tests still pass unchanged; five test fakes
  (`tests/fakes/card_repository.py`, `tests/fakes/lineage_repository.py`,
  `tests/helpers.py::make_card`, `tests/unit/domain/test_card_projection.py`)
  updated to construct `Card` with the now-required `content_hash` field
  (defaulting to `sha256(canonical_content)` where the exact value
  doesn't matter to the test).

## Frontend state module shape

`frontend/src/state/known-positions.ts` — a reactive
`Ref<Map<ContentHash, CardId>>`. Exports: `recordKnownPosition`,
`lookupKnownPosition`, `isKnownPosition`, `purgeKnownPositions`,
`knownPositionCount`. First-seen-wins on write (a duplicate mint's
second card never overwrites the map's pointer to the original card).
Populated *incidentally*: `BackendService.mapToReviewCard` calls
`recordKnownPosition` for every card it projects, so every existing
card-fetch path (`queryForest`, `fetchCard`, `submitReview`,
`updateCardMetadata`) feeds it with no new fetch loop. Registers a
`workspace-reset` teardown handler (`known-positions:purge`) — per-user
data, purged on identity flip (privacy, not memory hygiene, per the
module's file header).

`frontend/src/composables/cards/useKnownPositions.ts` — thin
fetch/mutation composable: `checkForDuplicate(rawContent)` (hashes via
the ACL, looks up the state module) and `rememberMintedCard(rawContent,
cardId)` (append-on-mint).

New branded type `ContentHash = Brand<string, 'ContentHash'>` in
`src/types/ids.ts`, re-exported from `types.ts`; `ReviewCard.contentHash`
added in `types/cards.ts`.

`serializeActivePath` (`src/engine/sgf-writer.ts`) genericized to accept
an optional `targetNodeId` parameter (default `state.currentNodeId`) —
additive, every existing call site is byte-identical.

`useMinting.ts` exposes `checkDuplicate`, `resetDuplicateCheck`,
`duplicateCheckStatus` (`'idle' | 'checking' | 'checked'`),
`duplicateCardId`. `MintCardModal.open()` fires `checkDuplicate`
without awaiting it (the modal renders instantly with the draft); the
template shows a "checking" notice while in flight and a named-card
warning once resolved — never a hard block (C10 posture).
`commitMint` calls `rememberMintedCard` after a successful mint
(best-effort, non-fatal on failure).

## Frontend test names (`frontend/tests/`)

- `tests/integration/known-positions.test.ts` (state module): record/
  lookup round-trip, multi-position independence, first-seen-wins,
  purge.
- `tests/integration/useMinting-duplicate-check.test.ts` (Tier 3,
  against `fakeBackendService`): duplicate position surfaces
  `duplicateCardId`; novel position leaves it `null`; `'checking'`
  state observed while the hash lookup is in flight (C6); `commitMint`
  remembers the newly-minted card (state-module refresh on mint); a
  second `checkDuplicate` immediately after `commitMint` finds it.
- `tests/integration/teardown-registry-completeness.test.ts` and
  `tests/integration/auth-lifecycle.test.ts` updated: the new
  `known-positions:purge` workspace-reset handler is now part of the
  pinned production registration set and the end-to-end drain-on-401
  assertion.
- `tests/integration/MintCardModal.test.ts` and
  `tests/integration/MintCardModal-komi-calibration.test.ts`: their
  `useMinting` mocks extended with the new exports (inert — neither
  suite exercises the duplicate-check UI).

## Gate tails (all green)

**Backend** (`cd backend && ./venv/bin/python -m pytest tests/ -q`):
```
============ 697 passed, 2 skipped, 1 xfailed, 4 warnings in 18.08s ============
```

**Frontend build** (`npm run build`):
```
✓ 1082 modules transformed.
dist/index.html                     0.84 kB │ gzip:     0.51 kB
dist/assets/index-BE8VbVBJ.css    116.71 kB │ gzip:    16.64 kB
dist/assets/index-DWHhpWar.js   2,922.31 kB │ gzip: 1,032.82 kB
✓ built in 1.65s
```
(Pre-existing >500kB chunk-size warning, unrelated to this change.)

**Frontend eslint** (`npx eslint .`): exit 0, no output.

**Frontend test:run** (`npm run test:run`):
```
 Test Files  83 passed | 3 skipped (86)
      Tests  1112 passed | 4 skipped (1116)
```

## Known gaps / deferred

- `MintCardModal.vue` was already over the ADR-0007 250-line SFC budget
  (502 lines) before this change; it's now 554. Not addressed here —
  out of Stage A scope (a dedicated contraction pass, likely extracting
  the duplicate-notice block into a child component, is the natural
  follow-up alongside Stage B's own TreeWidget-budget concern the
  design already flags).
- No `GET /cards/hashes` bulk endpoint (design's optional dispatch flag
  #3) — known-positions is therefore incomplete until a given card has
  been fetched at least once this session, same caveat the design names
  for its "rely on existing fetch loops" option.
- No card-delete flow exists in this codebase today (checked; neither
  backend nor frontend), so "refreshed after mint/delete" only covers
  mint.

## Files touched

Backend: `domain/card.py`, `repositories/card_repository.py`,
`repositories/lineage_repository.py`, `schemas/positions.py` (new),
`api/routes/positions.py` (new), `main.py`,
`tests/integration/routes/conftest.py`,
`tests/integration/routes/test_positions_routes.py` (new),
`tests/integration/routes/test_forests_routes.py`,
`tests/fakes/card_repository.py`, `tests/fakes/lineage_repository.py`,
`tests/helpers.py`, `tests/unit/domain/test_card_projection.py`.

Frontend: `src/types/ids.ts`, `src/types.ts`, `src/types/cards.ts`,
`src/services/backend-service.ts`, `src/engine/sgf-writer.ts`,
`src/state/known-positions.ts` (new),
`src/composables/cards/useKnownPositions.ts` (new),
`src/composables/review/useMinting.ts`,
`src/components/modals/MintCardModal.vue`, `src/locales/en.json`,
`src/store/teardown-registrations.ts`, `src/types/backend.ts`
(regenerated), `FILES.md`, `IDENTIFIERS.md`,
`tests/integration/known-positions.test.ts` (new),
`tests/integration/useMinting-duplicate-check.test.ts` (new),
`tests/integration/teardown-registry-completeness.test.ts`,
`tests/integration/auth-lifecycle.test.ts`,
`tests/integration/MintCardModal.test.ts`,
`tests/integration/MintCardModal-komi-calibration.test.ts`,
`tests/fakes/backend-service.ts`.

Docs: `docs/wire-schemas.md` gained a new §10 documenting the wire contract above.

License: Public Domain (The Unlicense) — matches the rest of the tree.
