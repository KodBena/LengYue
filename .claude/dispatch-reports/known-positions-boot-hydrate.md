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
Final commit sha: `4664d70e` (original delivery); revised after adversarial
review, new final sha recorded at the bottom of this report.

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
- `useAppBootstrap.ts` (the app bootstrap layer, read in full before
  wiring — `ForestDirectory.vue`'s `watch(auth.isAuthenticated, ...,
  { immediate: true })` is the auth-readiness-gating *pattern* precedent,
  though that watcher itself lives on a tab component, not the App
  bootstrap layer): the edge-detection logic is now a **named export**,
  `installKnownPositionsHydrateWatcher(auth: Pick<UseAuth, 'state'>):
  WatchStopHandle` — `watch(() => auth.state.value, (next, prev) => {
  if (isAuth && !wasAuth) void hydrateKnownPositions(); })` — same
  edge-detection shape as the existing qEUBO-bootstrap and
  analysis-persistence-hydrate watchers in the same file, so it fires once
  per genuine unauth→authenticated transition (cold-start auto-login AND
  any later re-authentication), never on an unrelated `auth.state`
  mutation. `useAppBootstrap` itself just calls
  `installKnownPositionsHydrateWatcher(auth)` at setup time. Placed at
  the App-bootstrap composable, not inside a tab component, per the
  brief's explicit instruction (a tab component may never mount).
  **Extracted as a named export in response to the adversarial review's
  Finding 1** — see "Response to adversarial review" below.
- The identity-flip purge already registered in `known-positions.ts`
  (the `known-positions:purge` workspace-reset handler, pre-existing from
  Stage A) is untouched and still fires on logout/identity-switch; the new
  watcher's edge-detection guarantees a subsequent re-authentication
  re-fires the hydrate against the now-empty map. WITNESSED by the new
  test's "re-hydrates on re-authentication after a workspace reset purged
  the map" case (see below).

### 5. Frontend tests

`frontend/tests/integration/known-positions-boot-hydrate.test.ts` (new,
6 tests):

- `hydrateKnownPositions` populates the map from a fake bulk fetch.
- A rejected fetch is swallowed (logged via a `console.error` spy, not
  thrown) — boot stays alive.
- Calling hydrate twice is additive/first-seen-wins-safe.
- The auth-flip **wiring contract** — drives the REAL production export
  `installKnownPositionsHydrateWatcher` (see "Response to adversarial
  review" below for why this isn't a hand-copy) against a fake `auth`
  object: hydrates on a genuine flip-in, does NOT re-fire on an
  authenticated→authenticated mutation (no edge), and re-hydrates on
  re-authentication after a simulated workspace-reset purge.

`tests/fakes/backend-service.ts` extended with
`fetchKnownPositionHashes: vi.fn<...>()`, reset in
`resetFakeBackendService()`, following the fake's existing pattern
exactly.

**WITNESSED** (post-review-fix, full suite re-run after the mutation-check
revert):

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

## Response to adversarial review

The delivery went through an adversarial review that returned
ACCEPT-WITH-NITS with one blocking finding. Both findings are fixed in
this revision.

### Finding 1 (significant, blocking) — test hand-copied the watcher logic

**Reviewer's point, confirmed correct**: the original
`known-positions-boot-hydrate.test.ts` reproduced the auth-flip
edge-detection condition as a local function inside the test file
rather than calling real production code. Mutation-falsifying the real
watcher (inverting its edge condition) left the frontend suite green —
the test was measuring its own copy, not the shipped behavior. The
cited precedents (`keybindings-catalog.test.ts`, `knobs.test.ts`) do
call real exported functions, so the original test's own justification
didn't hold up.

**Fix**: extracted the watcher-installing logic out of
`useAppBootstrap`'s body into a new named export,
`installKnownPositionsHydrateWatcher(auth: Pick<UseAuth, 'state'>):
WatchStopHandle`, in `useAppBootstrap.ts`. `useAppBootstrap` itself now
just calls `installKnownPositionsHydrateWatcher(auth)` — the production
wiring is unchanged in behavior, only relocated to a directly-testable
named export. The test now imports this real export and drives it
against a fake `auth` object (`{ state: ref<AuthState>(...) }`,
satisfying the narrow `Pick<UseAuth, 'state'>` parameter type — no need
to stub `tryAutoLogin`/`login`/`register`/`logout`). This does not
invoke the full `useAppBootstrap` composable (which also constructs a
`SyncService`, runs the keybindings/knob validators, and bootstraps
qEUBO — side effects irrelevant to this watcher and not worth faking
just to observe it), matching the same "call the real underlying
function, not the composable" shape `keybindings-catalog.test.ts` and
`knobs.test.ts` actually use.

**Mutation check performed, per the acceptance criterion, exactly as
requested**: in the working tree, changed
`useAppBootstrap.ts`'s real condition from `if (isAuth && !wasAuth)` to
`if (!isAuth && !wasAuth)` — inverting the edge condition, reproducing
the exact class of bug ("hydrate never fires on the real auth
transition") this delivery exists to prevent — then ran
`npx vitest run --silent=true tests/integration/known-positions-boot-hydrate.test.ts`.
Observed result: **2 of 6 tests went red**:

```
 ❯ tests/integration/known-positions-boot-hydrate.test.ts (6 tests | 2 failed) 2062ms
     × hydrates once the auth state flips into authenticated 1034ms
     × re-hydrates on re-authentication after a workspace reset purged the map 1002ms

 FAIL  ... > hydrates once the auth state flips into authenticated
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ tests/integration/known-positions-boot-hydrate.test.ts:160:59

 FAIL  ... > re-hydrates on re-authentication after a workspace reset purged the map
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ tests/integration/known-positions-boot-hydrate.test.ts:187:59

 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
```

The third wiring-contract test ("does not re-hydrate on an
authenticated → authenticated mutation") stayed green under the
mutation, as expected — it asserts *absence* of a call, and the
inverted condition still doesn't fire on that particular transition
(both `wasAuth` and `isAuth` are `true`, so `!isAuth && !wasAuth` is
`false` either way), so that assertion is insensitive to this
particular mutation by construction; the other two tests (which assert
the hydrate call *does* happen) are exactly the ones that caught it.
The mutation was then reverted (`diff` against a pre-mutation copy of
the file confirmed byte-identical revert) and the suite re-run to
confirm 6/6 green again — WITNESSED below under "Frontend tests".

### Finding 2 (minor) — stale/incorrect docstring citations

**(a)** `useKnownPositions.ts`'s docstring cited "App.vue's
`watch(() => auth.isAuthenticated, ..., { immediate: true })`" as the
wiring precedent — no such watch exists in `App.vue`; the real
`ForestDirectory.vue` watch of that shape lives on a tab component, for
a different (component-mount-gated) reason. Fixed: the docstring now
names the actual wiring site (`useAppBootstrap.ts`'s
`installKnownPositionsHydrateWatcher`) and correctly attributes
`ForestDirectory.vue`'s watch as a *pattern* precedent only, noting it
lives on a tab component rather than the App-bootstrap layer.

**(b)** `src/state/known-positions.ts`'s file header still said "There
is no bulk 'all my card hashes' endpoint... This module needs no
dedicated 'hydrate on login' step" — false since this delivery added
exactly that endpoint and step. Fixed: the "Population" section now
describes both paths — the bulk hydrate (completeness guarantee, fires
per auth-flip) and the pre-existing incidental fill via
`mapToReviewCard` (still active, covers cards minted/fetched between
hydrates).

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
- `frontend/src/composables/cards/useKnownPositions.ts` (also touched in
  the review-response pass — docstring citation fix, Finding 2a)
- `frontend/src/composables/auth-app/useAppBootstrap.ts` (also touched in
  the review-response pass — `installKnownPositionsHydrateWatcher`
  extraction, Finding 1)
- `frontend/src/state/known-positions.ts` (touched only in the
  review-response pass — file-header fix, Finding 2b)
- `frontend/tests/fakes/backend-service.ts`
- `frontend/tests/integration/known-positions-boot-hydrate.test.ts` (new;
  also revised in the review-response pass to drive the real export,
  Finding 1)
- `frontend/FILES.md`

## Gate verdicts (summary, post-review-fix)

| Gate | Result |
|---|---|
| Backend full suite (`pytest -m "not qeubo and not slow"`) | 732 passed, 1 xfailed, 0 failed (unchanged by the review-response pass — no backend files touched) |
| `npx vue-tsc --noEmit` | clean |
| `npx vitest run --silent=true` (full frontend suite) | 1780 passed, 4 skipped, 0 failed |
| `npm run gen:api` | UNEXERCISED — pre-existing Alembic-bootstrap hang, documented above (unchanged) |
| Mutation check (Finding 1 acceptance criterion) | inverted edge condition → 2/6 tests in the new file went red (transcript above); reverted, confirmed byte-identical, suite re-confirmed green |

Final commit sha (review-response revision): `9c8ef361`.

License: Public Domain (The Unlicense)
