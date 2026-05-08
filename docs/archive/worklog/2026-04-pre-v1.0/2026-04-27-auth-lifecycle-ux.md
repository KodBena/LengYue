# Auth-Lifecycle UX — LoginModal Auto-Open + Workspace Wipe on Logout

- **Status:** Shipped on branch `frontend/auth-lifecycle-ux`,
  2026-04-27. `npm run build` green; manual smoke confirmed by
  user across all six scenarios.
- **Genre:** Worklog entry — closes the two UX gaps surfaced
  during B5 finalization smoke (PR #7) and explicitly deferred
  there for auditability.
- **Date:** 2026-04-27.
- **Origin:** Continuation of the auth UX arc. PR #7 closed the
  data-loss regression but explicitly punted the two
  auth-lifecycle UX items to keep that PR focused.

## Context

PR #7's smoke pass produced two pre-existing UX observations:

1. **LoginModal didn't auto-open after rejection.** When the
   user corrupted the JWT and reloaded, the system warning
   appeared but no modal — the user had to discover that
   clicking the `<UserBadge>` was the way to log back in.
2. **Workspace not wiped on logout.** After Sign Out, auth
   state correctly transitioned to unauthenticated and saves
   were correctly gated (post-B5-finalization), but the
   in-memory store still displayed the prior user's data. The
   user explicitly named family-shared-computer use as the
   motivating scenario where this matters.

Both share a single trigger (auth state transitions); they pair
naturally as one work unit per the user's "no fragmentation"
direction.

## Approach

### `store/index.ts` — `resetWorkspace()` added

Resets user-owned reactive state (boards, activeBoardIndex,
profile, session) to defaults via:

- `[createInitialBoard()]` for boards (always at least one
  fresh empty board).
- `structuredClone(defaultProfile)` and
  `structuredClone(defaultSessionUI)` to avoid aliasing the
  module-scoped default objects.
- `NIL_UUID as SessionId / ProfileId` for session ids,
  matching the store's initial-construction values at
  `store/index.ts:33–34`.
- `boardsVersion.value++` to invalidate any caches.

`store.engine` is intentionally NOT reset; the docstring on
`resetWorkspace` names the deployment-model reasoning explicitly
(local-machine WebSocket URL is not user-keyed, so preserving
the live connection is honest; half-resetting would be an
ADR-0001 violation; full reset becomes correct only when
deployment shifts to user-keyed endpoints — tracked in
`deferred-items.md`).

The user pushed back on an earlier, sloppier doc-comment that
framed the engine preservation as "machine-level vs user-level."
Their critique was right: the user IS in control of
connect/disconnect, so the user-controllability axis blurs that
framing. The actual axis is **whether the WebSocket URL is
user-keyed**, which depends on deployment model. The doc-comment
now reflects that.

### `sync-service.ts` — `onAuthStateChange` triggers reset on identity loss

Added a `wasHydrated` guard around the existing identity-aware
gate logic; calls `resetWorkspace()` when leaving an identity
without arriving at a new one:

```typescript
const wasHydrated = this.hydratedForUserId !== null;
this.hydratedForUserId = null;

if (next.kind === 'authenticated' && next.userId !== undefined) {
  this.hydrate(next.userId);  // updateFromRemote replaces the store
} else if (wasHydrated) {
  resetWorkspace();
}
```

The `wasHydrated` guard avoids a redundant reset on the initial
`unknown` boot state (when the store is already at defaults),
and on transitions through transient states like `authenticating`
that happen before any hydration completes. The hydration branch
on re-login overwrites the reset state via `updateFromRemote`;
no separate reset call is needed there.

### `UserBadge.vue` — auto-open watcher

Added a `watch` on `state.value.kind` that opens the modal
on transitions to `'unauthenticated'` or `'error'`. No
`immediate: true` — the initial `unknown` state during boot is
skipped, so the modal stays closed until the auth subsystem
actually settles into a non-authenticated state. Cold-start
with `tryAutoLogin`'s auto-fill path (state goes
unknown → authenticating → authenticated) doesn't flash the
modal.

The logout flow produces a deliberate close-and-reopen flash:
the user clicks Sign Out, modal closes (via `@close` from
LoginModal), the watch fires on `authenticated → unauthenticated`,
modal reopens at the empty login form. Documented in the plan
as a deliberate cost — for the family-shared-computer scenario
the user named, "next person signs in" is the dominant
follow-up action and having the modal pre-open is the right
default. The user can dismiss manually if they want to leave
the SPA idle.

## Critical files

- **Edited:** `frontend/src/store/index.ts` (`NIL_UUID` added
  to import; `resetWorkspace` function added).
- **Edited:** `frontend/src/services/sync-service.ts`
  (`resetWorkspace` added to import; `onAuthStateChange`
  extended with the `wasHydrated` guard and the reset call).
- **Edited:** `frontend/src/components/UserBadge.vue` (`watch`
  added to `vue` import; auto-open watcher block added near
  the bottom of `<script setup>`).
- **Edited:** `docs/notes/deferred-items.md` — new entry filed
  for engine connection lifecycle on logout.

## Reused existing surface

- `createInitialBoard`, `defaultProfile`, `defaultSessionUI`,
  `NIL_UUID`, `boardsVersion` — all already exported from the
  store module / its defaults.
- The post-B5-finalization `onAuthStateChange` flow's
  cancel-pending and hydration-on-identity logic was kept
  intact and extended.
- `state` from `useAuth()` was already destructured in
  UserBadge; no new import needed.

No new types. No new services.

## Verification

1. **Static check.** `npm run build` ran clean (`vue-tsc -b &&
   vite build`, 2.00s, 841 modules).

2. **Manual end-to-end** in the live dev server (HMR-applied);
   user-confirmed:

   - Auto-open on rejection (corrupt JWT) → modal opens
     automatically; log in as real user → workspace
     hydrates. ✓
   - Auto-open + workspace wipe on logout → workspace
     visibly resets to defaults; modal reopens at the
     login form. ✓
   - Cold start (`localStorage.clear()`) → no modal flash;
     auto-fill as `local_user` proceeds. ✓
   - No spurious reset on cold start (`wasHydrated` guard
     verified). ✓
   - Pre-logout test data (boards, settings, moves)
     visibly wipes on Sign Out. ✓
   - **Re-login restores data** — the critical regression
     test, proves the wipe doesn't accidentally PUT default
     state over the saved document. ✓
   - Engine state (KataGo connection, status, metrics,
     messages) preserved across all transitions. ✓

## Adjacent concern surfaced and deferred

The user pushed back on an earlier draft of this plan that
casually preserved `store.engine` under the "machine-level vs
user-level" framing. Their critique surfaced a real adjacent
concern: in a user-keyed-endpoint deployment (cloud-compute,
rented per-user KataGo), preserving the live WebSocket across
identity change is wrong. Today's deployment model doesn't have
that property (URL is local-machine, not user-keyed) so
preservation is locally honest, but the right behavior flips
when deployment changes.

Filed in `docs/notes/deferred-items.md` with the
deployment-shift trigger named explicitly. The doc-comment on
`resetWorkspace` names the same reasoning so a future contributor
finding the function understands why engine state is exempt.

## Out of scope (explicitly)

- **Engine connection lifecycle on logout** — see
  deferred-items entry; deployment-model-dependent.
- **System-message log clear on logout** — `engine.messages`
  preserved; messages are generic and don't carry user-
  specific data.
- **Tags-fetch hydration race** — pre-existing, filed in B5
  finalization PR's deferred-items addition; unchanged here.
- **Close-and-reopen flash on Sign Out** — distinguishing
  "switch user" from "leave idle" requires explicit UX that
  doesn't exist today; default behavior (auto-open) is right
  for the named use case.

## Documentation follow-up

- This worklog entry.
- `docs/notes/deferred-items.md` — engine connection lifecycle
  entry added.
- No ADR amendment triggered. The auth-lifecycle UX policy is
  a small, localized design call.
- The user's "engine settings" question is captured both in
  this worklog (the "Adjacent concern" section) and in the
  deferred-items entry. No separate dispatch needed.

## Branch + PR workflow

Branched off main post-PR-#7 merge (`76e58f5`). Single PR with
both UX items as one work unit. The B5 arc closes here as a
conceptual unit: data-loss closure (PR #7) + auth-lifecycle UX
(this PR).
