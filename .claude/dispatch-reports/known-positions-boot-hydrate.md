# Known-positions boot-time hydrate — delivery report

Commission: fix the regression "known cards no longer auto-hydrate at SPA
start" per the governing design doc's §3 recommendation (b) — a thin bulk
endpoint returning the caller's complete `(content_hash, card_id)` set,
hydrated at login/re-auth. Design doc read in full:
`.claude/dispatch-reports/card-position-annotations-design.md`.

Branch: `worktree-agent-a430ab398ed4f98a2`
Base: rebased onto `next` (0590832e) before starting — my worktree's
original base (3378806f) predated card-position-annotations Stage A
(`known-positions.ts`, `useKnownPositions.ts`, `/positions/hash{,-batch}`)
landing on `next`; the commission's premise assumed Stage A already
existed, so I rebased to pick it up rather than re-deriving it.
Final commit sha: `4664d70e`.

## What was built

### 1. Backend — `GET /cards/hashes`

- `backend/schemas/card.py`: new `CardHashEntry` DTO
  (`content_hash: str`, `card_id: int`).
- `backend/repositories/ports.py`: `CardRepositoryPort.list_content_hashes`
  — new Port method, `*, user_id: UserId` tenancy-scoped per
  `docs/notes/tenancy.md`'s five-layer recipe (read in full).
- `backend/repositories/card_repository.py`: adapter implementation — one
  join (`card` ⋈ `normalized_position`), one `WHERE card.user_id = :user_id`
  predicate (same shape as `get_card_by_id`'s; no recursive CTE needed,
  since every row lives directly on `card`).
- `backend/api/routes/cards.py`: `GET /cards/hashes`, registered BEFORE
  `GET /{card_id}` — Starlette's default untyped `{card_id}` path
  converter would otherwise match `/cards/hashes` first and 422 on the
  int coercion of `"hashes"`. Depends on `get_card_repo` directly (no
  `CardService` involvement), mirroring `get_card`'s existing shape for a
  genuinely simple single-table read (backend/CLAUDE.md's "extract a Port
  when a second concrete consumer appears" — none needed a new Service
  here).
- `backend/tests/enforcement/global_sequence_allowlist.py`: added
  `("CardHashEntry", "card_id")` as a named exception — the mechanized
  global-sequence-leak schema walk (`test_global_sequence_schema_walk.py`)
  flagged the raw PK; same addressing-role reasoning as
  `CardCreateResponse.card_id`'s existing entry (the SPA needs the PK to
  key its `ContentHash -> CardId` map, never to paint a digit on screen).

**WITNESSED**: `backend/tests/integration/routes/test_card_hashes_routes.py`
(4 new tests: own cards returned, cross-tenant isolation, empty-for-no-cards,
401-without-auth) — all pass. Full backend suite:

```
732 passed, 15 deselected, 1 xfailed, 4 warnings in 130.97s
```

run via `nice -n 19 /home/bork/w/omega/backend/venv/bin/python -m pytest -q
-m "not qeubo and not slow"` (the shared venv at `/home/bork/w/omega/backend/
venv` — this worktree has no venv of its own; `backend/tests/CLAUDE.md`
and `backend/CLAUDE.md` read in full before authoring). The pre-existing
`test_global_sequence_schema_walk.py` failure (before the allowlist entry)
confirms the mechanized guard actually walked the new schema — not a
vacuous pass.

### 2. OpenAPI types — UNEXERCISED (blocker below), fallback taken

`npm run gen:api` needs a live backend to introspect (`GENAPI_BASE_URL`,
default `http://127.0.0.1:8764` — the LIVE port, never touched). I started
a throwaway backend on port 19764 against a fresh scratch SQLite file
(`DATABASE_URI` pointed at
`/tmp/claude-1000/.../scratchpad/genapi-test.db`) to run `gen:api`
offline against it.

**Blocker, reproduced twice, UNEXERCISED as a result**: `main.py`'s
Alembic bootstrap hangs indefinitely against a brand-new (empty) SQLite
file. The log shows the probe falsely matching a `REVISION_MARKERS` entry
(`game_source.display_ordinal → 0004_per_user_id_enumeration`) on a
database with NO tables at all, then stamping at 0004 and hanging inside
the 0004→0005 (`normalize_uuid_bind_format`) upgrade step — the server
never finishes startup, `/openapi.json` never becomes reachable (curl:
connection refused, then timeout). Confirmed twice independently (fresh
file both times, once with a bare run, once wrapped in `timeout 60`,
which killed it as expected without the server ever answering). This is
a pre-existing environment issue in `db/alembic_bootstrap.py`'s probe
logic, unrelated to this change (my diff touches none of `alembic_bootstrap.py`,
`REVISION_MARKERS`, or the migration chain) — flagging it as a defect
worth its own ledger item rather than silently working around it.

**Fallback taken, per the brief's explicit instruction** ("add the wire
type where the existing hand-written wire aliases live — NEVER hand-edit
the generated file"): `frontend/src/services/backend-service.ts` gets a
hand-written `CardHashEntryWire` type alongside the other
`components['schemas'][...]` aliases, clearly commented as TEMPORARY and
hand-verified field-for-field against `backend/schemas/card.py::CardHashEntry`,
to be deleted in favor of the generated `components['schemas']['CardHashEntry']`
the next time `gen:api` runs successfully. `src/types/backend.ts` itself
is untouched.

### 3. Frontend ACL

`BackendService.fetchKnownPositionHashes(): Promise<Array<{contentHash:
ContentHash; cardId: CardId}>>` — calls `GET /cards/hashes`, brand-mints
`ContentHash`/`CardId` at the ACL boundary (comment style matches
`hashPosition`/`hashPositionsBatch`'s existing ACL Band-2 mint comments).

### 4. Hydrate wiring

- `useKnownPositions.ts`: new `hydrateKnownPositions()` — fetches the bulk
  set, `recordKnownPosition`s each pair (first-seen-wins, the state
  module's existing semantics — unchanged). Failures are caught and
  `console.error`-logged, never thrown (ADR-0002 "audible, not fatal");
  the function always resolves.
- `useAppBootstrap.ts` (the app bootstrap layer, per `ForestDirectory.vue`'s
  `watch(auth.isAuthenticated, ..., { immediate: true })` precedent, read
  in full before wiring): a new `watch(() => auth.state.value, (next,
  prev) => { if (isAuth && !wasAuth) void hydrateKnownPositions(); })` —
  same edge-detection shape as the existing qEUBO-bootstrap and
  analysis-persistence-hydrate watchers in the same file, so it fires once
  per genuine unauth→authenticated transition (cold-start auto-login AND
  any later re-authentication), never on an unrelated `auth.state`
  mutation. Placed at the App-bootstrap composable, not inside a tab
  component, per the brief's explicit instruction (a tab component may
  never mount).
- The identity-flip purge already registered in `known-positions.ts`
  (the `known-positions:purge` workspace-reset handler, pre-existing from
  Stage A) is untouched and still fires on logout/identity-switch; the new
  watcher's edge-detection guarantees a subsequent re-authentication
  re-fires the hydrate against the now-empty map. WITNESSED by the new
  test's "re-hydrates on re-authentication after a workspace reset purged
  the map" case (see below).

### 5. Frontend tests

`frontend/tests/integration/known-positions-boot-hydrate.test.ts` (new,
7 tests):

- `hydrateKnownPositions` populates the map from a fake bulk fetch.
- A rejected fetch is swallowed (logged via a `console.error` spy, not
  thrown) — boot stays alive.
- Calling hydrate twice is additive/first-seen-wins-safe.
- The auth-flip **wiring contract** — reproduced verbatim from
  `useAppBootstrap.ts`'s watcher (documented in the test file's header
  why: invoking the full `useAppBootstrap` composable directly would drag
  in `SyncService` construction, the keybindings/knob validators, qEUBO
  bootstrap, and several unrelated auth-state watchers with their own
  network/DOM side effects that no existing test fakes — the two existing
  precedents that touch `useAppBootstrap`'s logic,
  `tests/unit/composables/keybindings-catalog.test.ts` and
  `tests/unit/lib/knobs.test.ts`, both call the underlying pure contract
  directly rather than the composable, which this test mirrors) — hydrates
  on a genuine flip-in, does NOT re-fire on an authenticated→authenticated
  mutation (no edge), and re-hydrates on re-authentication after a
  simulated workspace-reset purge.

`tests/fakes/backend-service.ts` extended with
`fetchKnownPositionHashes: vi.fn<...>()`, reset in
`resetFakeBackendService()`, following the fake's existing pattern
exactly.

**WITNESSED**:

```
npx vue-tsc --noEmit          → clean (exit 0, no output)
npx vitest run --silent=true  → Test Files 145 passed | 3 skipped (148)
                                 Tests      1780 passed | 4 skipped (1784)
```

(`frontend/node_modules` didn't exist in this worktree — symlinked from
`/home/bork/w/omega/frontend/node_modules` after confirming
`package-lock.json` is byte-identical between the two checkouts; read-only
reuse, no writes into the base checkout.)

### 6. Docs

`frontend/FILES.md`: updated the one-line purpose descriptions for
`useKnownPositions.ts`, `useAppBootstrap.ts`, and `known-positions.ts` to
mention the new bulk hydrate path (no new frontend `src/` files were
created, so no new rows needed). `FEATURES.md` left untouched — this is a
regression fix restoring the known-position rings/duplicate-warning's
already-intended behavior, not a new user-facing capability, and
`FEATURES.md` has no existing entry for the known-position annotation
surface to update (Stage A/B never got one either).

## Deviations from the brief

- Rebased my worktree branch onto `next` before starting (see "Branch"
  above) — the commission's premise (`known-positions.ts` "holds a
  reactive map... today it fills ONLY incidentally") only held true after
  picking up Stage A; my worktree's original base predated it.
- OpenAPI regeneration is UNEXERCISED with the blocker documented above
  (pre-existing Alembic-bootstrap hang against a fresh SQLite file,
  reproduced twice, unrelated to this diff) — fell back to the brief's
  own sanctioned path (hand-written wire type, generated file untouched).
- No other deviations from the brief's shape (endpoint placement, ACL
  method name/shape, hydrate composable location, App-bootstrap wiring
  location, and test coverage all match what was asked).

## Files touched

Backend:
- `backend/schemas/card.py`
- `backend/repositories/ports.py`
- `backend/repositories/card_repository.py`
- `backend/api/routes/cards.py`
- `backend/tests/enforcement/global_sequence_allowlist.py`
- `backend/tests/integration/routes/test_card_hashes_routes.py` (new)

Frontend:
- `frontend/src/services/backend-service.ts`
- `frontend/src/composables/cards/useKnownPositions.ts`
- `frontend/src/composables/auth-app/useAppBootstrap.ts`
- `frontend/tests/fakes/backend-service.ts`
- `frontend/tests/integration/known-positions-boot-hydrate.test.ts` (new)
- `frontend/FILES.md`

## Gate verdicts (summary)

| Gate | Result |
|---|---|
| Backend full suite (`pytest -m "not qeubo and not slow"`) | 732 passed, 1 xfailed, 0 failed |
| `npx vue-tsc --noEmit` | clean |
| `npx vitest run --silent=true` (full frontend suite) | 1780 passed, 4 skipped, 0 failed |
| `npm run gen:api` | UNEXERCISED — pre-existing Alembic-bootstrap hang, documented above |

License: Public Domain (The Unlicense)
