# Perf Fix #4 — Global → per-board watcher conversion (Bug A secondary)

- **Status:** Branch `frontend/perf-fix4-per-board-watchers`;
  awaiting user end-to-end test before PR open.
- **Genre:** Store-level signal addition + two composable
  rewrites + Vitest probe. Four-file change.
- **Date:** 2026-05-27.
- **Diagnostic substrate:**
  `docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md` Bug A
  secondary causes. Fourth of four sequenced perf-arc PRs.

## Context

The audit named two global watchers as Bug A's secondary
offenders, each iterating `store.boards` on every `mutateBoard`:

- `src/composables/useAutoSaveAnalyses.ts:144-183` — reactive
  source iterating boards and reading `dirtyVersionFor(board.id)`
  per board.
- `src/composables/auth-app/useAppBootstrap.ts:305-322` — restore
  watchEffect iterating boards and reading `summaryFor(board.id)`
  per board.

Each contributed O(N) work per nav step on top of Fix #2's
primary cause. The replacement: per-board watchers, one per open
board, each subscribed to that board's specific key in the
underlying reactive Map. `mutateBoard` doesn't fire any of them;
only the actual `markDirty(boardId)` / `summaries.set(boardId)`
mutators do.

## Design — boardsSetVersion signal + composable-side reconcile

The agent's verification sketch proposed explicit hooks: `closeBoard`
calls `tearDownBoardWatchers(boardId)`, `resetWorkspace` calls a
bulk variant. That couples the store to each composable's
lifecycle and requires every future composable that joins the
pattern to register hooks.

Chose a less coupled shape: a new `boardsSetVersion: Ref<number>`
on the store, bumped only on board *set* changes (add / remove /
replace), not on per-board content mutations. Each composable
subscribes to it and reconciles its per-board watcher map via
diff. The store stays ignorant of who's listening; composables
own their own resource lifecycle. The reconcile is O(N) per set
change (rare) and zero per nav step (the headline win).

The audit pair tags (O15 for auto-save, O16 for restore) attach
to the composables' per-board watcher state — the natural
ownership site — rather than to `closeBoard` / `resetWorkspace`
bodies. The audit's three RISKY-CONDITIONAL conditions all hold
under this design:

| Condition | How met |
|-----------|---------|
| Every board-introduction path installs the watcher | Reconcile fires on every `boardsSetVersion` bump (all five mutation sites bump it) plus `immediate: true` for the initial-board literal |
| Every board-removal path tears it down | Same reconcile, diff-based |
| Per-board watcher reads `dirtyVersionFor` reactively | Confirmed by new probe test |

## Shape of the change

### `src/store/index.ts` — `boardsSetVersion` signal

New `Ref<number>` export sibling to `boardsVersion`. Bumped at:

- `addBoard` (after `boardsVersion`)
- `closeBoard` — both code paths (single-board reset AND splice)
- `updateBoardState` — conservative bump per the inline comment
  (SGF-load paths like `useDirtyBoardGuard` and `useReviewSession`
  may replace with a freshly-parsed board whose id differs)
- `resetWorkspace`
- `updateFromRemote`

NOT bumped at `mutateBoard`, `setActiveBoard`, or
`mutateReviewSession` — these are per-board content / per-board
UI state, not set changes. The JSDoc on the export names the
discipline.

### `src/composables/useAutoSaveAnalyses.ts` — rewrite

The per-board state (`lastScheduledVersion`, `pendingTimers`,
`fireSave`, `scheduleSaveIfNeeded`) is preserved bit-equal —
the policy semantics (leading-edge schedule, trailing-edge save,
persistent-error pause, gate transitions) are unchanged. The
global iterating watcher is replaced by:

1. **`setupBoardWatcher(boardId)`** — installs a `watch` on
   `dirtyVersionFor(boardId)` with `immediate: true`. Vue's
   reactive Map fires the per-key dep on the first
   `markDirty(boardId)` for an unseen id (confirmed by probe),
   so the watcher catches the rising edge.
2. **`teardownBoardWatcher(boardId)`** — cancels the per-board
   timer BEFORE disposing the watcher (ordering: a queued
   microtask fire could race the dispose otherwise), removes
   from all three maps.
3. **Reconcile watcher on `boardsSetVersion`** with
   `immediate: true` — diffs `currentIds` against
   `boardWatcherStops.keys()`, tears down absent ids and sets
   up new ones.
4. **Gate watcher** on `isGated()` — preserves the prior
   re-arm-on-gate-on behaviour: when the gate flips on, clears
   per-board errors AND iterates currently-watched boards to
   `scheduleSaveIfNeeded`. Cost is O(N) per gate-flip-on (rare
   user action). When the gate flips off, cancels all pending
   timers.

`stop()` tears down the reconcile + gate watchers and every
remaining per-board watcher / timer.

### `src/composables/auth-app/useAppBootstrap.ts` — restore path

The existing auth watcher gains an else-branch on identity-out
that calls `restoredBoards.clear()` (previously handled by the
watchEffect's early-return; moved into the auth watcher so
identity transitions are the explicit trigger). The
`watchEffect` block is replaced by the same reconcile-plus-
per-board pattern as `useAutoSaveAnalyses`:

- `setupRestoreWatcher(boardId)` — watches
  `summaryFor(boardId)` with `immediate: true`. Triggers
  `restore(boardId)` (with dedup) when summary is present and
  auth is good.
- `teardownRestoreWatcher(boardId)` — disposes the watcher;
  does NOT clear `restoredBoards[boardId]` (dedup is wanted
  across the session if the same id reappears).
- Reconcile watcher on `boardsSetVersion` matching the
  auto-save shape exactly.

Imports trimmed (drop `watchEffect`, add `boardsSetVersion`).

### `tests/integration/analysis-persistence-watch-contract.test.ts` — probe

Four new tests closing the audit's open gap:

1. **Pure Vue probe:** `watch(() => map.get(key) ?? 0)` on a
   `reactive(new Map())` fires on the first `set()` for that
   key.
2. **Pure Vue probe:** `watch(() => map.get(key))` sees
   `undefined → present` as a change.
3. **Production probe:** `analysisPersistenceService.markDirty`
   for a previously-unseen boardId fires the corresponding
   `watch(() => svc.dirtyVersionFor(boardId), ...)`.
4. **Production probe:** per-board watchers for different
   boardIds fire independently.

Each test uses unique random boardIds so it can run alongside
the existing singleton-state tests without collision.

## Multi-tasking preservation

Verified by the audit's per-fix evaluation (RISKY-CONDITIONAL
with three conditions, all met above) and reinforced by:

- The reconcile fires on every introduction path (all five
  mutation sites bump `boardsSetVersion`), so background boards
  added via SGF load, library open, review session start, or
  `updateFromRemote` hydrate get their auto-save / restore
  watchers installed.
- The per-board dirtyVersion watcher fires on `markDirty(boardId)`
  for ANY board, active or not — `analysis-service::onAnalysisUpdate`
  routes via `queryInfo.boardId` (confirmed in the audit's
  packet-receive-path verification). Background-board analyses
  continue to trigger auto-saves.
- The per-board restore watcher fires on `summaries.set(boardId)`
  for ANY board — `refreshSummaries` and `save` both populate
  summaries regardless of active state.
- The activity indicator (`useActivityDecay` reading
  `board.lastActivity`) is independent of this fix's surface;
  it's powered by `analysis-service` writing
  `board.lastActivity = Date.now()` per packet, and continues
  unchanged.

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics.
- `npm run test:run` — **658** frontend tests pass, 3 skipped
  (+4 new probe tests; previous baseline 654).
- Existing `tests/integration/useAutoSaveAnalyses.test.ts`
  passes unchanged — the behavior contract (gate semantics,
  save semantics, persistent-error pause, throttle window) is
  preserved bit-equal under the rewrite.

User-side validation remains the gate. Recommended cross-checks:

1. Open multiple boards (≥ 5), run analyses on several
   simultaneously, confirm auto-save fires for each (the
   "Saved … just now" indicator on each board's AnalysisControls).
2. Range query / ponder on background board, switch to another
   board — background board's analysis continues, auto-save
   for it fires when packets land.
3. Hydrate flow: log out, log back in — restore fires for boards
   with persisted summaries, exactly once per board per session.
4. Identity flip (logout/login as different user) — restore
   dedup resets cleanly; new user's boards restore independently.
5. Toggle `analysisAutoSave` off mid-burst — pending saves
   cancel; toggle back on → pending dirty boards reschedule.
6. SGF load via `useDirtyBoardGuard` (potential board-id change
   via `updateBoardState`) — auto-save / restore watchers
   reconcile correctly for the new id.
7. Heavy nav (hold ArrowDown) with many boards open — the
   composite of Fix #1 (rAF coalesce), Fix #2 (boardsById
   O(1)), and Fix #4 (per-board watchers eliminating two
   O(N)-per-step sources) should compound into the headline
   smoother-fast-nav user experience.

## What stays

The `boardsSetVersion` signal is now available to any future
composable that needs a "fires on board set change but not on
content mutations" trigger — same authoring pattern. The
reconcile-against-`boardsSetVersion` shape is the established
pattern for per-board watcher maps; documented in the JSDoc on
the store export so a future contributor sees it.

## What follows

This closes the four-fix perf-arc from the audit. Open follow-ups
(named in the audit's "Incidental finds" section, not blocking
this arc):

- `mutateBoard`'s dual trigger paths (shallow spread + `boardsVersion++`).
- "Follow Me" watcher's lack of throttle.
- `MoveSuggestions.vue`'s inline `pointerEvents` style
  re-evaluation per packet.
- `use-pv-animation`'s `scheduleWindow` cycle-timer reset
  mid-window.
- No `requestIdleCallback` / work-chunking in packet receive
  path.

Each is independent of the four shipped fixes. Pickup is
user-prioritised.

License: Public Domain (The Unlicense)
