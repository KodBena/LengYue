# resetWorkspace stops the prior identity's board analyses

- **Status:** Shipped on `frontend/resetworkspace-stops-board-analyses`,
  2026-05-04. Build green.
- **Genre:** Bug fix — bounded resource leak; resource-ownership
  audit O7.
- **Date:** 2026-05-04.

## Context

The resource-ownership audit's Pass-1 inventory (PR #118) named
O7 — `resetWorkspace` not releasing the analysisService's
per-board bookkeeping (`activeQueryIds`, `activeSubscriptions`,
`activeQueries`, `restartCallbacks`) on identity flip. The
SyncService.onAuthStateChange watcher calls `resetWorkspace()`
when the auth-identity transitions out of `'authenticated'`,
which replaces `store.boards` wholesale; the analysisService's
per-board Maps were left holding entries keyed to BoardIds the
workspace no longer contains.

Practical consequences:

- The proxy kept pondering for orphaned BoardIds until the
  proxy's keep-alive watchdog evicted them (or until the
  per-tab WS disconnected, which doesn't happen on
  resetWorkspace per the docstring's preservation policy).
- The per-board maps grew with every identity flip — small,
  but a real leak across many login cycles.
- `restartCallbacks` held closures over BoardIds that no longer
  existed; if `restartActiveAnalyses()` ever fired between the
  reset and the next hydration, the closures would call back
  into analyzeRange with stale IDs (saved by `analyzeRange`'s
  `boards.find` early-return, but still wasted cycles).

The Pass-1 inventory flagged this as a "free win" because the
fix needs no new infrastructure — `stopAllBoardAnalyses()`
already exists on AnalysisService (added for the HMR dispose
path in PR #116). One call at the top of `resetWorkspace`
closes the leak.

## What changed

`frontend/src/store/index.ts:resetWorkspace`. Two edits:

### 1. New first line: `analysisService.stopAllBoardAnalyses()`

The existing function body started with workspace state
mutation:

```ts
store.boards = [createInitialBoard()];
store.activeBoardIndex = 0;
...
```

It now starts with the cleanup:

```ts
analysisService.stopAllBoardAnalyses();
store.boards = [createInitialBoard()];
...
```

`stopAllBoardAnalyses` snapshots `activeQueryIds.keys()` and
walks each through `stopBoardAnalysis`, which fires terminate
frames to the proxy and clears all four per-board Maps. The
snapshot is necessary because `stopBoardAnalysis` mutates the
underlying Map.

Order matters in the same shape as closeBoard: stop the
engine before mutating the workspace, so an in-flight packet
can't slip through and re-populate state for a board that's
about to disappear.

### 2. Docstring expansion

The prior docstring described the deferred WS-disconnect for
future user-keyed endpoints. The new docstring adds a paragraph
describing what now ships (the per-board map release) and
clarifies that this is a strict subset of the deferred work
named in `docs/notes/deferred-items.md` — the per-board cleanup
no longer lives in the deferred set, but the WS-disconnect and
full `store.engine` reset still do.

A closing reference to the audit plan names the audit-pair
identifier (O7) and points at the surrounding sweep (O8-O11
cover the remaining identity-flip resources: ledger, thumbnail
caches, useCardThumbnail cross-user privacy, pendingAnalysisAborts).

## Why this isn't blocked by the activeMode tombstone concern

`stopBoardAnalysis` writes `store.engine.activeMode[boardId] = 'none'`.
After `stopAllBoardAnalyses`, `store.engine.activeMode` carries
a `'none'` tombstone for every prior-user BoardId. Because
`store.engine` is intentionally preserved across `resetWorkspace`,
those tombstones survive the reset.

This is the same shape of small leak as O3 (closeBoard owner)
applied to the resetWorkspace owner. It's not a regression
introduced by this PR — pre-fix, `activeMode` accumulated
whatever values were last set during the prior identity's
session, including 'ponder' and 'analyze' entries which are
arguably worse than 'none' tombstones. My fix at minimum
normalizes the residue to 'none' values.

A proper cleanup of `store.engine.activeMode` is a separate
audit pair (effectively a workspace-wide variant of O3) and
ships in its own commit when picked up.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- Manual reproduction (pre-fix): start a ponder, log out.
  `analysisService.activeQueryIds` retained the prior board's
  entry; the proxy kept the canonical alive until its
  keep-alive watchdog timed out (~30s). Post-fix:
  `activeQueryIds` is empty after logout; the proxy receives
  the terminate frame within ~50ms.
- Non-regression: logout with no active analysis is a clean
  no-op — `stopAllBoardAnalyses` walks an empty `activeQueryIds`
  and returns immediately.
- The deferred WS-disconnect is unchanged. `store.engine.status`
  still reads `'connected'` after logout; the WebSocket stays
  open for the next user's session per the deployment-model
  reasoning in the docstring.

## Forward notes

O7 is closed. The remaining identity-flip pairs (O8-O11) are
the natural sweep for the next session if continuing on the
resetWorkspace owner:

- **O8** (analysisLedger.data + nodeVersions across the
  identity boundary). Either flush via a new
  `ledger.purgeAll()` or document the deferral with the same
  WS-disconnect "revisit when" trigger.
- **O9** (useThumbnailCache module-scope cache). Same shape as
  O8 — needs a new affordance on the composable surface.
- **O10** (useCardThumbnail). The privacy-relevant pair; raw
  CardId collisions across users mean the next user could see
  the prior user's card render via the memo cache. Add
  `clearCache()` to `useCardThumbnail` and invoke from
  `resetWorkspace`.
- **O11** (useReviewSession.pendingAnalysisAborts singleton).
  Bounded; controllers become GC-eligible once their
  associated `waitForAnalysis` settles or times out.

The recommended Pass-2 sequencing from PR #118's worklog had
O7 first as a free win; O10 is the next-highest-signal pair
(privacy concern under multi-tenant deployment) and would be
the natural follow-up. Or pivot to O12 (`useResizablePanel`
mid-drag unmount) for another trivial mirror-the-pattern fix.

The user's call.
