# Review — cold-load honest gate (ADR-0019 audit S1)

Target: `worktree-agent-a687e848205ea1fe5` @ `6d83b297`. Spec:
`adr19-audit.md` S1 + build brief (C6/C7/C8/C26). Builder report:
`cold-load-gate-build.md`.

## Findings (WITNESSED unless marked)

1. **Non-persistence of `workspaceLoadState` — WITNESSED, sound.**
   `GlobalStore.workspaceLoadState` (`store/schema.ts`) is set but never
   read by `buildPersistencePayload()` (`store/index.ts:816-829`, returns
   only `schemaVersion/boards/activeBoardIndex/profile/session`) and
   `updateFromRemote` never assigns it either. No path for `'loaded'` to
   round-trip into the persisted blob and defeat the gate on next boot.

2. **Gate coverage — WITNESSED, real residual not named by the build
   report.** `App.vue`'s template gate correctly wraps toolbar, tab rail,
   board/tree/control panel and `SidebarWidget`. But `useUserIORegistry()`
   (called unconditionally at App.vue setup) installs a **global**
   `window` keydown listener independent of the render tree. Its action
   catalog (`keybindings-catalog.ts`) gates each action on
   `activeBoardExists` / `engineConnected` — never on `workspaceLoadState`
   — and the store's default board always satisfies `activeBoardExists`
   during the `'loading'` window. So `ArrowUp/Down/Left/Right/Home/End`
   (tree-cursor navigation) and `m/n/c/d/l` (display-flag toggles) remain
   live and mutate the phantom board/session state while the gate shows a
   spinner. Board-cursor mutations are moot (`updateFromRemote` replaces
   `store.boards` wholesale on hydrate), but `enginePonderToggle` (Space)
   guards only on `engineConnected` and, if a connection happens to exist
   pre-hydrate, fires a real `analysisService` WebSocket query against
   the phantom board id — an effectful side-channel the render gate
   cannot reach. Not a regression S1 introduced (it predates this diff)
   but the fix's own coverage claim ("every surface that offers workspace
   mutation... is now gated", build report line 74) is stated too broadly
   — this residual should be named in the PR, not asserted away.
   No mint/match/play modal is keybinding-reachable (catalog has no such
   entries), so S1's "play a move / close a board" scenario itself is
   closed; the residual is display-toggle/nav/ponder only.

3. **Retry path — WITNESSED, sound.** `hydrate()` bumps
   `hydrationGeneration` synchronously before any `await`; both
   success/catch legs check `gen !== this.hydrationGeneration` and no-op
   if superseded. A double-click on the retry button re-enters `'loading'`
   idempotently and only the last generation's resolution lands. No
   listeners are registered by hydrate/retryHydrate, so no zombie-listener
   risk.

4. **Auth interplay — WITNESSED, sound.** `onAuthStateChange`'s new
   `else` branch sets `'loaded'` for unauthenticated/authenticating/error/
   userId-less-authenticated with `wasHydrated === false`, and
   `resetWorkspace()` (identity-out branch) also resets to `'loaded'`.
   Confirmed by test 5 (never-logs-in case): gate resolves to `'loaded'`,
   not an infinite spinner.

5. **"No offline-first design" claim — spot-verified myself**, not just
   trusted: `sync-service.ts`'s header calls the class a "Stateless
   Persistence Bridge" with no cache-then-reconcile or last-known-good
   language. The plain loading→loaded→error gate (no stale-data banner)
   is the correct reading.

6. **Tests — WITNESSED.** Ran `npm run test:run` myself in the worktree:
   **1106 passed, 4 skipped, 0 failed** (82/85 files), matching the
   report. Did not independently re-run the claimed red-leg revert (took
   the report's word given the diff is otherwise coherent and the
   generation-guard logic checks out under direct reading) — flagged as
   UNEXERCISED by me specifically, though the builder's own account is
   detailed and plausible.

7. **Gates — WITNESSED.** `npm run build` clean, `npx eslint .` clean
   (no output), `npm run test:run` as above.

8. **Merge against current `next` (95e85b0d) — WITNESSED, no textual
   conflict, real semantic-overlap risk named.** `git merge-tree
   $(merge-base) 6d83b297 95e85b0d` auto-merges cleanly (0 conflict
   markers); the only content diff is the generated `docs/doc-graph.json`
   staleness buckets (harmless, will regenerate). However `App.vue` is
   touched by both branches in the **same toolbar region**: `next`'s
   `f645ca42` ("version-count store.session...") converts the
   `sidebarExpanded`/`boardExpanded`/`treeExpanded`/`controlsExpanded`
   inline template toggles into `touchSession()`-wrapped handler
   functions; this branch relocates those same buttons inside the new
   `v-if="workspaceLoadState.kind === 'loaded'"` block. Git's 3-way merge
   resolves it without markers because the edited line ranges don't
   literally overlap, but a human should re-diff `App.vue` post-merge to
   confirm the toggle buttons still call the bumping handlers (not the
   pre-`f645ca42` inline writes) once both land — I did not construct the
   actual merged file to eyeball it, only the tree-merge report.

## Verdict: ACCEPT-WITH-NITS

The core S1 fix — union, non-persistence, gate template, retry, auth
interplay, tests, gates — is solid and witnessed. The nit is Finding 2:
the build report's "every workspace-mutation surface is gated" claim
overstates coverage by one class (global keybindings, notably the
ponder-toggle's live network side effect) — should be named explicitly
in the PR/commission record rather than left implicit, and Finding 8's
merge-overlap should get a human once-over post-merge. Neither blocks
shipping S1 itself.
