# B5 Finalization — Identity-Aware SyncService

- **Status:** Shipped on branch `frontend/sync-identity-aware`,
  2026-04-27. `npm run build` green; manual smoke confirmed by
  user — the regression is closed.
- **Genre:** Worklog entry — structural fix for an
  ADR-0002-class data-loss bug surfaced during the B5 stale-
  token-drift smoke pass.
- **Date:** 2026-04-27.
- **Origin:** Continuation of the auth UX arc closed by the prior
  frontend session as B1–B5 (per
  `docs/dispatch/frontend-to-frontend-auth-ux-and-dirty-board-handoff.md`).
  B5 was defined as "JWT identity verification and recovery from
  stale-token drift"; this fix is the structural completion of
  that recovery — the prior session shipped the in-memory state
  reconciliation, but the cross-identity persistence path
  remained vulnerable.

## Context

The user's manual smoke of Scenario 2 (corrupted JWT in
localStorage, page reload, explicit re-login as the real user)
surfaced silent data loss: after the rejection-and-relogin flow,
the SPA was overwriting the real user's backend document with
state hydrated for a different identity (`local_user`).

### Trace (verified before designing)

1. Boot. Token corrupt.
2. `useAuth.tryAutoLogin` → `/auth/me` 401 → `clearToken()` →
   state = `unauthenticated`. ✓ (B5's in-memory recovery worked.)
3. `useAppBootstrap.onMounted` calls `sync.connect()` (fire-and-
   forget). Inside `sync-service.ts:46`, **`api.ensureAuthenticated()`
   silently auto-logs-in as `local_user`** (the auto-fill path at
   api-client.ts:175–190, intended for cold-start UX).
4. SyncService hydrates `local_user`'s document, sets
   `isInitialHydrated = true`, installs the watcher.
5. User logs in via LoginModal as the real user. Token replaced;
   `auth.state` flips. Store still holds `local_user`'s data.
6. Any reactive change (the bootstrap's `store.profile.knownTags`
   write, an SR session start, anything) fires the watcher;
   debounce elapses; `sendSync()` PUTs to
   `/documents/user_workspace_01`. JWT now resolves to the real
   user — **the real user's document is overwritten with
   `local_user`'s state.**

Worst tier of ADR-0002's loudness hierarchy: silent. No system
message. No error. Data gone.

### Why the obvious patches were wrong

The user proposed gating local mutations on backend validation
plus a version counter as paranoid guardrail. We talked through
why that's the right instinct (defense in depth) at the wrong
layer (multi-writer concurrency, not identity ownership) — the
codebase already documents an explicit deferred decision on
ETag-based optimistic concurrency at `sync-service.ts:132–144`,
and adopting that machinery now would be hijacking a multi-tab
tool to patch an identity bug.

The right layer is identity-correlated state ownership. Once
SyncService knows whose data it's holding, the bug becomes
impossible by construction. That's the fix.

## Approach

### `sync-service.ts` — substantive rework

Two compounding causes; both addressed:

**Cause 1 — `ensureAuthenticated`'s silent auto-fill from
`sync.connect`.** Removed. Auth identity is now an *input* to
SyncService, observed via `auth.state`, not something the
service self-bootstraps. The cold-start auto-fill that
`ensureAuthenticated` provides lives in `useAuth.tryAutoLogin`
(its sole legitimate caller after this fix), where it runs
before `sync.connect` per `useAppBootstrap`'s order — preserving
the cold-start UX exactly.

**Cause 2 — single-shot `isInitialHydrated: boolean` flag.**
Replaced with two fields:

- `hydratedForUserId: number | null` — per-identity gate.
- `hydrationGeneration: number` — monotonic counter; only the
  latest in-flight hydrate gets to commit. Handles the
  fast-auth-flip race where `hydrate(A)` is in flight when state
  flips to B and triggers `hydrate(B)`.

`SyncService.connect()` now installs a `watch` on `auth.state`
with `immediate: true`; on every transition the handler:

- Cancels any pending debounced save (the data it would persist
  belongs to the prior identity).
- Resets `hydratedForUserId = null`.
- If new state is `authenticated` AND has a `userId`: kicks off
  `hydrate(state.userId)`.
- Otherwise: leaves the gate closed.

`scheduleSync()` gates on `state.kind === 'authenticated'`,
`state.userId !== undefined`, and `hydratedForUserId === state.userId`.

`sendSync()` carries a defense-in-depth assertion of the same
invariant — it should be unreachable past `scheduleSync`'s gate;
if it ever fires it surfaces loudly per ADR-0002 and refuses to
PUT. This is the user's "paranoid guardrail" instinct,
repositioned from "every mutation" (wrong layer) to "the actual
save site" (right layer).

The `kind: 'authenticated'` branch with `userId === undefined`
(the non-401 verify-error path in useAuth) is treated as
unsafe-for-sync: gate stays closed; SPA continues in read-only-
persistence mode until auth resolves to a known identity.

### `api-client.ts` — small addition

Added `setCachedUsername(name: string): void`, preserving the
documented "only api-client touches USER_KEY" invariant
(api-client.ts:122–128). Called from `useAuth` to reconcile
the cache after `/auth/me` succeeds.

### `useAuth.ts` — fold in the cache-writeback fix

In `_setAuthenticatedAfterVerify`'s 200 branch, after `setState`,
the cache is now written back via `api.setCachedUsername(me.username)`.
Closes the small bug surfaced in Scenario 1 of the smoke pass:
previously the localStorage cache stayed stale after `/auth/me`
corrected the in-memory state, leading to a brief flash of the
wrong name on next reload. The non-401 verify-error branch
(degraded "trust the cache" path) deliberately does NOT write
back — by that branch's own reasoning, the identity isn't
trusted to canonical-truth level.

### `useAppBootstrap.ts` — wire `auth` into SyncService

One-line constructor call update:

```typescript
const sync = new SyncService('user_workspace_01', auth);
```

Bootstrap's `onMounted` body and ordering unchanged.

## Critical files

- **Edited:** `frontend/src/services/sync-service.ts` (substantive
  rework — constructor, state shape, `connect`, new private
  `hydrate` and `cancelPending`, `scheduleSync` gate, `sendSync`
  assertion).
- **Edited:** `frontend/src/services/api-client.ts`
  (`setCachedUsername` added; `ensureAuthenticated` and
  `cachedUsername` unchanged).
- **Edited:** `frontend/src/composables/useAuth.ts` (cache
  writeback in `_setAuthenticatedAfterVerify`'s 200 branch).
- **Edited:** `frontend/src/composables/useAppBootstrap.ts`
  (`SyncService` constructor call passes `auth`).
- **Read for verification only:** `frontend/src/types.ts`
  (verified `AuthState['authenticated'].userId` is optional;
  fix accommodates this) and `frontend/src/types/backend.ts`
  (verified `AuthMeResponse.id` is required).

## Reused existing surface

- `auth.state` (`Readonly<Ref<AuthState>>`) — already exposed by
  `useAuth`'s public surface (line 280–281).
- `pushSystemMessage`, `updateFromRemote` — already imported and
  used by sync-service.
- `api.request` — calling pattern unchanged.
- The existing single-watcher / single-debounce-slot design
  preserved verbatim; only the gate is identity-aware now.

No new types beyond a `type AuthApi = ReturnType<typeof useAuth>`
local alias for the constructor signature.

## Verification

1. **Static check.** `npm run build` ran clean: `vue-tsc -b &&
   vite build`, 2.04s, 841 modules transformed. No errors, no
   new warnings.

2. **Manual end-to-end** in the live dev server (HMR-applied);
   user-confirmed:

   - **Cold start** — `localStorage.clear(); reload;` →
     auto-fill as `local_user` via `tryAutoLogin`, workspace
     loads, activity persists. Cold-start UX preserved. ✓
   - **Normal auth (warm restart)** — reload with valid token →
     hydrate completes, saves resume. ✓
   - **Drift (Scenario 1 redux)** — set bogus
     `ebisu_username`, reload → status bar shows real name; cache
     writeback corrected the localStorage value. ✓
   - **Rejection-then-login (the regression)** — corrupt JWT,
     reload → /auth/me 401 + system warning; user logs in as real
     user → real user's data hydrates intact, no overwrite. ✓
     **The bug this fix exists to close is closed.**
   - **Logout** — sign out → auth state flips to unauthenticated;
     subsequent reactive changes produce zero PUTs. ✓

3. **Defense-in-depth assertion in `sendSync`** — did not fire
   in any scenario. Good (it's defense in depth; firing would
   indicate a `scheduleSync` gate bug).

## Adjacent UX gaps surfaced during smoke (queued for follow-up)

The smoke also surfaced two pre-existing UX issues, intentionally
NOT bundled into this PR for auditability — auth-lifecycle-UX is
a distinct concern from identity-aware persistence, and shipping
the regression fix in isolation keeps review focused.

- **LoginModal does not auto-open after rejection.**
  `UserBadge.vue:53` owns `isModalOpen` as ephemeral local state;
  modal only opens on badge click. Pre-existing; not introduced
  by this fix. Auto-open on `authenticated → unauthenticated|error`
  would be a small `watch` addition in UserBadge.vue.

- **Workspace not wiped on logout.** After logout the auth state
  is unauthenticated and saves are correctly gated, but the
  in-memory store still displays the prior user's data until next
  hydration. For shared-computer scenarios (family use) this is a
  privacy leak. The fix belongs in `SyncService.onAuthStateChange`
  (where auth transitions are already observed): on transition to
  any non-authenticated state, reset the store to defaults. Needs
  a small `resetToDefaults()` helper on the store side if not
  already exposed.

Both will be addressed in a follow-up PR
(`frontend/auth-lifecycle-ux`) — they share the triggering signal
(auth state transitions) and pair naturally as one work unit.

## Out of scope (explicitly)

- **ETag-based optimistic concurrency.** Per
  sync-service.ts:132–144's documented decision, deferred until
  multi-tab becomes a real workflow.
- **Tags-fetch hydration race.** Pre-existing in
  `useAppBootstrap`: `ebisuService.getTags()` writes
  `store.profile.knownTags` concurrently with hydration; if
  tags-fetch wins, hydration overwrites. Existed forever, benign
  in practice (knownTags is re-fetchable). New entry filed in
  `docs/notes/deferred-items.md`.
- **Top-level error boundary** (auditor recommendation #5). Once
  it lands, the `sendSync` defense-in-depth assertion can be
  upgraded from `console.error + pushSystemMessage` to a thrown
  exception. Not today.
- **Auth-lifecycle UX** (auto-open, workspace-wipe) — see above.

## Lessons

The version-counter conversation with the user is worth
preserving. The user's instinct — defense in depth via gating
mutations on backend validation plus a version counter — was
right in spirit but mis-targeted. The right diagnosis is layer-
identification:

> When debugging a sync/identity bug, ask first: is this a
> *concurrency* problem (multiple writers, conflict detection)
> or an *ownership* problem (whose data is in my reactive
> store)? Concurrency wants ETags; ownership wants identity-
> keyed state. Conflating the two leads to over-engineered
> patches that don't actually close the failure mode.

Worth citing in any future ADR-0002 audit pass as a worked
example of "diagnose at the right layer."

The generation-counter pattern (used here for `hydrate`'s race
against fast-flipping auth states) is itself a small worked
example of failing-loudly via discard rather than via lock or
debounce. The discarded resolutions log a debug-level diagnostic
but don't surface to users — they're not failures, just
supersessions.

## Documentation follow-up

- This worklog entry.
- `docs/notes/deferred-items.md` — entry added for the tags-fetch
  hydration race.
- The two UX gaps (auto-open, workspace-wipe) are NOT filed in
  deferred-items; they're queued for the immediate-next PR.
  Filing them as deferred would imply they're not actively
  scheduled; they are.
- No ADR amendment triggered. The fix is a concrete application
  of ADR-0002 (three loud-failure surfaces: identity-aware gate,
  generation counter, defense-in-depth assertion); cite at next
  ADR-0002 audit.

## Branch + PR workflow

Branched off main (post-C2.3 merge `2910369`). Ships as a single
PR to main. Worklog entry inside the PR.
