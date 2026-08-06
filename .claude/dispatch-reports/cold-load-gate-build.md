# Build report — ADR-0019 audit Finding S1 (cold-load honest gate)

Spec: `.claude/dispatch-reports/adr19-audit.md`, Finding S1 (paired critical
section "Verdict"). Branch: this worktree (`agent-a687e848205ea1fe5`), no push.

## Reading

Read end to end before implementing: `frontend/CLAUDE.md`,
`frontend/tests/CLAUDE.md`, umbrella `CLAUDE.md`, `adr19-audit.md` in full
(all 17 findings + methodology, not just S1, since S1 references the
methodology section's route-gating verification technique).

## Boot-path survey

- `src/composables/auth-app/useAppBootstrap.ts` — owns `SyncService`
  instantiation and the `onMounted` cold-start sequence (`auth.tryAutoLogin()`
  → `sync.connect()`).
- `src/services/sync-service.ts` — `SyncService.connect()` watches
  `auth.state`; on `authenticated` with a known `userId` it fires
  `hydrate(userId)`, an un-awaited `GET /documents/{key}` that replaces the
  store via `updateFromRemote` on success.
- `src/store/index.ts` / `src/store/schema.ts` — `store` is a `reactive<GlobalStore>`
  seeded with `createInitialBoard()` (one default board) at **module init**,
  before any auth or network activity. `App.vue` mounts and renders
  immediately against this default — this is the audit's "wrong 37 boards"
  window (here, the default single board), painted with no loading
  indication and every control live.

**Reading on "is cached-local-first deliberate?"** — checked
`sync-service.ts`'s header and `resetWorkspace`'s docstring for an
offline-tolerance intent before assuming this was a bug rather than a
design the honest form should preserve. The header calls the class a
"Stateless Persistence Bridge"; there is no cache-then-reconcile language,
no `localStorage` fallback read, no "last known good" concept anywhere in
the class. The store's pre-hydration content is simply its **compile-time
default**, not a cached prior fetch — nothing to legitimately label
"showing local copy, syncing…". Concluded this is the bug the audit named,
not a deliberate offline mode; implemented the plain gate (loading → loaded
→ error), not a stale-data banner.

## Interfaces

`WorkspaceLoadState` (new discriminated union, `src/types/app.ts`, mirrors
`AuthState`'s existing shape and lives beside it):

```ts
export type WorkspaceLoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded' }
  | { readonly kind: 'error'; readonly message: string };
```

Added as `GlobalStore.workspaceLoadState` (`src/store/schema.ts`) —
**non-persisted**, same pattern as the existing `knownTags` field (excluded
from `buildPersistencePayload`, untouched by `updateFromRemote`). Default
`{ kind: 'loading' }` at store construction (`src/store/index.ts`).

## Wiring

- `SyncService.hydrate()` sets `store.workspaceLoadState = { kind: 'loading' }`
  before the `await`, `{ kind: 'loaded' }` on success, `{ kind: 'error', message }`
  on failure (message from the caught `Error`/`ApiError`).
- `SyncService.onAuthStateChange()`: the non-authenticated branches (no
  identity to hydrate for — unauthenticated / authenticating / error / the
  userId-less authenticated edge case) explicitly set `{ kind: 'loaded' }`
  when nothing was previously hydrated, so the gate doesn't spin forever on
  a fetch that will never happen (the never-logged-in case). `resetWorkspace()`
  also resets it to `'loaded'` as part of its own "back to honest default"
  contract, covering the identity-out reset branch and the perf-scenario
  harness's direct `resetWorkspace()` calls.
- New `SyncService.retryHydrate()` — re-fires `hydrate()` for the current
  authenticated identity; wired to the error state's retry button (C8).
- `App.vue`: the entire `top-nav-bar` + `SystemLogPanel` + `#split-workspace`
  block (board column, tree panel, resizer, control panel — the *render-tree*
  surfaces that offer workspace mutation) is now wrapped
  `v-if="store.workspaceLoadState.kind === 'loaded'"`, with `v-else-if`
  loading (pulsing-dot spinner + text, `role="status"` `aria-busy="true"`)
  and `v-else-if` error (`role="alert"` + retry button using the existing
  `.action-btn-large` class). `SidebarWidget` (load/save SGF — a mutation
  entry point) gets the same `v-if`. Modals stay outside the gate: they are
  inert until a (now-gated-away) toolbar button opens one, so gating them
  separately would be redundant per-widget sprinkling.
- New locale keys `app.workspace.loading` / `loadFailed` / `retry` added to
  all four catalogs (`en`/`ko`/`ja`/`zh-CN`).
- **Correction (post-review, nit 1):** the original cut of this report
  claimed "every surface that offers workspace mutation" is gated —
  overstated by one class. `useUserIORegistry()`'s global `window`
  keydown listener is independent of the render tree; its catalog
  (`keybindings-catalog.ts`) gates each action on `activeBoardExists` /
  `engineConnected`, both of which the store's *default* board already
  satisfies during `'loading'` — so nav/display-toggle hotkeys, and
  notably the Space ponder-toggle (a real `analysisService` WebSocket
  query, not just a store write), stayed live through the render gate.
  Fixed by adding `if (store.workspaceLoadState.kind !== 'loaded') return;`
  as an early return in `useUserIORegistry.ts`'s `handleKeyDown`, ahead of
  the per-action `enabledWhen` checks — one seam, not per-action
  threading. Left a note at that seam for the next merge against `next`
  (which lands a sibling `anyModalOpen.value` early-return at the same
  spot via the just-merged modal-keyboard arc) to compose the two
  cleanly rather than collide.

No existing skeleton/spinner component existed to reuse; found one prior
idiom (`PboPopover.vue`'s `.busy-dot` `@keyframes pulse`) and followed its
minimal spirit (a small CSS spinner, not a content-shaped skeleton) — C26
only requires a busy indication within ~1s, not layout-matching placeholder
content.

## Tests

`frontend/tests/integration/workspace-load-gate.test.ts` — tier-3, drives
the real `SyncService` + real `store` + real `useAuth` against a stubbed
global `fetch` (same idiom as `auth-lifecycle.test.ts`), not a mounted
`App.vue`: per `tests/CLAUDE.md`'s posture, component/template tests are
out of scope for this codebase, and the gate is a pure `v-if` over
`workspaceLoadState` with no logic of its own — exercising the state
machine IS exercising the gate. `vue-tsc` typechecks the template's
`.kind === '...'` comparisons against the union at build time, so a renamed
variant fails the build, not just this suite.

Five cases: (1) module-init default is `'loading'`; (2) a never-resolving
`GET /documents/{key}` leaves `workspaceLoadState` at `'loading'`
indefinitely, with the store still holding only the one default board (the
phantom-workspace window, honestly marked instead of painted as final);
(3) a resolving GET flips to `'loaded'` with the fetched boards applied;
(4) a failing GET (500) flips to `'error'` with a message and the C8
system-log surfacing, and `retryHydrate()` (after fixing the router)
recovers to `'loaded'`; (5) never logging in resolves to `'loaded'` rather
than spinning forever.

**Red-leg verification (not shipped, done then reverted):** temporarily
stripped the three `store.workspaceLoadState = ...` writes from
`hydrate()` (simulating "gate removed") and reran — cases 2–4 failed with
clear mismatches (`'loaded'` where `'loading'`/`'error'` was expected),
confirming the tests are load-bearing. Restored via the saved backup
before running gates for real; the diff is verified clean (only the
intended files are modified).

## Gates

- `npm run build` (`vue-tsc -b && vite build`) — clean.
- `npx eslint .` — clean.
- `npm run test:run` — **1106 passed, 4 skipped, 0 failed** (82 files
  passed, 3 skipped), including the 5 new cases. No regressions in the
  existing 1101.

`node_modules` was not present in this worktree; ran `npm ci` first
(standard dependency install, not a source change).

## Scope notes

- `App.vue` was already ~503 lines before this change (ADR-0007's ≤250
  target), now ~564. The task's own minimal-touch instruction directed
  gating at App.vue's top-level regions rather than splitting the file;
  did not attempt a file-size remediation as part of this focused fix —
  flagging so it isn't mistaken for an oversight. A future pass extracting
  `#split-workspace` into its own component would also shrink this, but is
  out of scope here.
- The audit's "Adjacent, unproven" note (a `PUT /documents/user_workspace_01`
  possibly firing during the phantom window and reverting durable closes)
  is a separate, unproven finding the audit explicitly did not claim as
  established; not investigated here — this build addresses the *painting*
  defect (S1's actual claim), not the adjacent unproven persistence
  question.

## Files touched

- `frontend/src/types/app.ts` — new `WorkspaceLoadState` union.
- `frontend/src/types.ts` — re-export.
- `frontend/src/store/schema.ts` — `GlobalStore.workspaceLoadState` field.
- `frontend/src/store/index.ts` — default value; `resetWorkspace()` reset.
- `frontend/src/services/sync-service.ts` — state transitions + `retryHydrate()`.
- `frontend/src/App.vue` — the gate (template + CSS).
- `frontend/src/locales/{en,ko,ja,zh-CN}.json` — new strings.
- `frontend/tests/integration/workspace-load-gate.test.ts` — new test file.

No new files under `frontend/src/`, so `FILES.md` needs no entry.
