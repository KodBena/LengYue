# De-branding Round 2 — File Rename, localStorage Compat, Comments, Doc Prose

- **Status:** Shipped on branch `frontend/debranding-round-2`,
  2026-04-27. `npm run build` green; manual smoke pending user
  confirmation.
- **Genre:** Worklog entry — sweeps the heterogeneous remainder
  of frontend-side de-branding into one coherent unit. Closes
  the file-rename, localStorage-rename, source-comment, and
  doc-prose pieces; algorithm-attribution prose preserved per
  the TODO's preservation note.
- **Date:** 2026-04-27.
- **Origin:** Continuation of `docs/TODO.md`'s frontend
  de-branding tier. Round 1 (PR #11) closed the three
  Medium-tier entries that needed schema-versioning machinery.
  This round closes the rest.

## Context

PR #11 (round 1) shipped the schema-migration `1 → 2` covering
theme / cardset / palette identifier renames inside the
persisted blob. Round 2 is the heterogeneous remainder:

1. **File rename** `frontend/src/services/ebisu-service.ts` →
   `backend-service.ts` (class `EbisuService` →
   `BackendService`, const `ebisuService` → `backendService`),
   with all import sites and the JSDoc cross-reference in
   `types.ts` updated.
2. **localStorage auth keys rename** (`'ebisu_jwt_token'` →
   `'auth_token'`, `'ebisu_username'` → `'auth_username'`),
   with a one-shot compat shim that migrates legacy keys at
   module init.
3. **Source-comment de-brands** in `api-client.ts:3` and
   `env.ts:26`.
4. **Doc prose sweep** across `handoff-current.md`, the
   frontend-to-backend dispatch, `frontend/README.md`,
   `frontend/CLAUDE.md`, and ADR-0002.

These pair under the "frontend de-branding round 2" framing —
same theme, mostly-mechanical review surface, one merge point.

## Approach

### A — File rename (`ebisu-service.ts` → `backend-service.ts`)

- Created `frontend/src/services/backend-service.ts` with the
  existing content adapted: header pathname; class
  `EbisuService` → `BackendService`; const `ebisuService` →
  `backendService`; internal error message prefix
  `[EbisuService]` → `[BackendService]`.
- Deleted `frontend/src/services/ebisu-service.ts`.
- Updated 4 consumer files:
  - `useMinting.ts` (1 import + 1 call site).
  - `useReviewSession.ts` (1 import + 2 call sites).
  - `useAppBootstrap.ts` (1 import + 1 call site).
  - `ForestDirectory.vue` (1 import + 3 call sites — **missed
    by the Phase-1 grep, caught at first build**; the explore
    agent's grep didn't traverse `.vue` files in this codebase
    by default. Pattern noted for future explores.).
- Updated `types.ts:216` JSDoc cross-reference
  (`EbisuService::mapToReviewCard` →
  `BackendService::mapToReviewCard`).

`fetchEbisuSession` method name preserved as algorithm
attribution — it returns a session ranked by the `EbisuRecallKey`
ordering (the algorithm primitive). Algorithm-correct.

### B — localStorage auth keys + compat shim

In `api-client.ts`:

- `TOKEN_KEY = 'ebisu_jwt_token'` → `'auth_token'`.
- `USER_KEY = 'ebisu_username'` → `'auth_username'`.
- Added `migrateLegacyAuthKeys()` function plus its single
  invocation at module top-level. Runs once at module init;
  copies legacy values to new keys (preserving any
  already-present new key — collision guard) and always
  removes the legacy key once observed.

Per ADR-0002 documented exception #3 (bounded-and-scheduled-for-
removal compat shim). Filed in `deferred-items.md` as a removal
target for a future cleanup PR.

### C — Source-comment de-brands

- `api-client.ts:3`: `* Pure REST client for Ebisu API v2.` →
  `* Pure REST client for the spaced-repetition backend.`
- `env.ts:26`: `* Base URL for the Ebisu REST backend (...` →
  `* Base URL for the spaced-repetition backend (...`
- New `backend-service.ts` header: pathname updated; tagline:
  `Anti-Corruption Layer for the spaced-repetition backend.`

### D — Doc prose sweep

Project-branding phrases ("the Ebisu backend", "Ebisu API",
file references to `ebisu-service.ts`) → functional descriptors
("the spaced-repetition backend", `backend-service.ts`).
Algorithm-attribution prose preserved verbatim.

Specific edits:

- `docs/handoff-current.md`: lines 97, 133, 155 (file
  references). Line 430 (`EbisuService` in the logging
  inventory list) → `BackendService` since the class itself
  was renamed. Lines 27 ("Ebisu's Bayesian recall model") and
  74 ("Ebisu-based") preserved as algorithm attribution.
- `docs/dispatch/frontend-to-backend-auth-me.md:18`:
  `'ebisu_jwt_token'` → `'auth_token'`.
- `frontend/README.md`: lines 25, 53, 65, 71, 130, 175.
  Line 4 ("Ebisu spaced repetition") preserved — full sentence
  reads as algorithm attribution (the SPA is built on KataGo
  analysis and Ebisu spaced repetition; both are named
  algorithms).
- `frontend/CLAUDE.md:26`: file reference + dropped the
  "subject to renaming; see `docs/TODO.md`" caveat (now
  retired by the rename itself).
- `docs/adr/0002-fail-loudly.md`: lines 10, 221.
- `docs/notes/deferred-items.md`: tags-fetch race entry
  reference updated (`ebisuService.getTags()` →
  `backendService.getTags()`).
- `docs/TODO.md`: the active CardCreatePayload-merge entry's
  reference to `ebisu-service.ts::createCard` updated to
  `backend-service.ts::createCard`. The completed-table
  reference at line 117 (item 30 synopsis "First consumer
  (`ebisu-service.ts`) wired") preserved as historical record
  — it captures what shipped at the time.

### E — `docs/archive/` policy decision

Per the TODO `[docs]` entry, option (a) was already in place:
`docs/archive/README.md` lines 3–8 explain the historical-record
context. No archive content sweep performed. The policy is
implicitly captured by the TODO entry's retirement.

### F — Algorithm-attribution preserved

Confirmed unchanged:
- `EbisuModel` (types.ts:208) — algorithm value object.
- `EbisuRecallKey` discriminator (in defaults.ts:74,
  backend-service.ts:145, types/backend.ts).
- "Ebisu's Bayesian recall model" (handoff-current.md:27).
- "Ebisu-based" in algorithmic context (handoff-current.md:74).
- "Ebisu spaced repetition" (frontend/README.md:4) —
  algorithm name in algorithmic context.
- `fetchEbisuSession()` method — references the
  Ebisu-algorithm recall ordering.

## Mid-execution lesson — `.vue` files in grep traversal

The Phase-1 explore reported the file rename's blast radius as
13 sites across 4 files. The first `npm run build` failed on a
14th site: `ForestDirectory.vue` had 1 import + 3 call sites
(roots fetch, query forest, button click handler). The Phase-1
grep didn't traverse `.vue` files (default behavior of the
explore tool's grep, apparently — it weighted toward `.ts` and
`.js`).

Pattern for future explores when planning a rename: explicitly
include `*.vue` in the search pattern, or note that
`grep -rn ... --include='*.{ts,vue}'` is needed for full
coverage. The build catches the missed sites loudly so this
isn't a correctness risk, but the plan's "X sites" count was
off by 25%.

## Critical files

**Created:**
- `frontend/src/services/backend-service.ts` (137 lines —
  same content as the deleted `ebisu-service.ts` with renamed
  identifiers and updated header).

**Deleted:**
- `frontend/src/services/ebisu-service.ts`.

**Edited (code):**
- `frontend/src/services/api-client.ts` — TOKEN_KEY/USER_KEY
  constants + `migrateLegacyAuthKeys()` function + comment
  update.
- `frontend/src/config/env.ts` — comment update.
- `frontend/src/composables/useMinting.ts` — import + 1 usage.
- `frontend/src/composables/useReviewSession.ts` — import + 2
  usages.
- `frontend/src/composables/useAppBootstrap.ts` — import + 1
  usage.
- `frontend/src/components/ForestDirectory.vue` — import + 3
  usages.
- `frontend/src/types.ts` — JSDoc cross-reference at line 216.

**Edited (docs):**
- `docs/handoff-current.md` (4 lines).
- `docs/dispatch/frontend-to-backend-auth-me.md` (1 line).
- `frontend/README.md` (6 lines).
- `frontend/CLAUDE.md` (1 line + caveat-dropping).
- `docs/adr/0002-fail-loudly.md` (2 lines).
- `docs/notes/deferred-items.md` (1 line for tags-fetch entry
  + new entry for compat-shim removal).
- `docs/TODO.md` (4 entries retired, 1 entry's reference
  updated, 1 new Completed Frontend table entry).

## Reused existing surface

- `api-client.ts`'s class structure unchanged — only constant
  values + the new private helper function.
- The auth-state callback bridge from PR #9 unchanged (it
  reads through `cachedUsername()` and the api-client setters,
  which now operate on the new keys after migration).
- The schema-versioning framework from PR #10 unchanged —
  this PR doesn't add a migration, just renames literal
  identifiers in source.

No new types, no new services. The one new function
(`migrateLegacyAuthKeys`) is a private helper.

## Verification

1. **Static check.** `npm run build` green
   (`vue-tsc -b && vite build`, 2.10s, 842 modules — same as
   PR #11; the file rename is name-only, no module count
   change).

2. **Manual end-to-end** in the live dev server (HMR-applied);
   user-confirmed (verification protocol):

   - **Existing user (legacy auth keys present)**: pre-reload
     console snapshot showed legacy keys; after reload, legacy
     keys cleared, new keys carry the migrated values; auth
     state stays authenticated, no re-login required.
   - **New user / cold start**: `localStorage.clear() + reload`
     auto-fills as `local_user`; new keys (`auth_token`,
     `auth_username`) populate; no legacy keys appear.
   - **Card-load flow**: works — composables reach the renamed
     `backendService` import without errors.
   - **Save flow** (Force Persistence): unchanged.
   - **Auth lifecycle** (logout / login): clear + repopulate
     work on the new key names.

3. **Doc-sweep visual check**: edited docs no longer contain
   project-branded `ebisu-service.ts`, `ebisu_jwt_token`,
   `ebisu_username`, "the Ebisu backend", or "Ebisu API" in
   prose. Algorithm-attribution phrases ("Ebisu's Bayesian
   recall model", "Ebisu-based" in algorithm context, "Ebisu
   spaced repetition" at README.md:4) intact.

4. **Final grep** confirmed: remaining `ebisu*` references
   are intentional (the compat shim's literal references; the
   completed-table item-30 historical record; the round-1
   worklog's record of what came before; archive content
   under the option-(a) policy).

## Outcomes

- The `frontend/CLAUDE.md:26`'s "subject to renaming" caveat
  is now retired — the rename happened.
- The full frontend-side de-branding tier is closed except for
  out-of-scope backend entries
  (`X-Ebisu-Token`, `.ebisu_secret_key`, `ebisu.db`).
- The legacy-auth-keys compat shim is filed as a future
  removal target in `deferred-items.md`.
- One worked example of `.vue`-file grep coverage in the
  explore tool added to the worklog's lessons.

## Out of scope (explicitly)

- **Backend-side de-branding** (TODO Medium-tier `[backend]`
  entries — `X-Ebisu-Token` rename, `.ebisu_secret_key`
  rename, `ebisu.db` rename). Sub-project boundary.
- **`docs/archive/` content sweep.** Option (a) policy in
  place (preface at `archive/README.md`); archive content is
  historical record.
- **Removal of the legacy auth-key compat shim.** Filed in
  `deferred-items.md`.
- **EbisuModel / EbisuRecallKey / fetchEbisuSession renames.**
  Algorithm-correct domain references; preserved per the
  TODO's preservation note.

## Documentation follow-up

- This worklog entry.
- `docs/TODO.md` — four entries retired (file rename,
  localStorage rename, source-comment de-brand, doc prose
  sweep, archive policy decision); one Completed Frontend
  table entry added.
- `docs/notes/deferred-items.md` — new entry for the legacy
  auth-key compat-shim removal; tags-fetch race entry's
  reference updated.
- No ADR amendment.

## Branch + PR workflow

Branched off main post-PR-#11 merge (`4cb755a`). Single PR.
