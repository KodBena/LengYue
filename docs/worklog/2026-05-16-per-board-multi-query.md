# Per-board multi-query model — range + ponder coexistence on a board

- **Status:** Implemented 2026-05-16 across the migration steps
  recorded in
  [`docs/notes/per-board-multi-query-model-plan.md`](../notes/per-board-multi-query-model-plan.md);
  build green (`vue-tsc -b && vite build`), full frontend suite
  green at 521 / 3 / 0 (passed / skipped / xfailed) at the
  arc's tip. Plan-note status transitions to `design-note:
  implemented` in the same closure pass per ADR-0005 Rule 8.
- **Genre:** Refactor — lifts the one-active-query-per-board
  invariant that lived in `AnalysisService` from the
  pre-umbrella `gogui` repo onwards. The headline user-visible
  effect is that starting a ponder no longer kills an in-flight
  range query on the same board (and vice versa).
- **Date:** 2026-05-16.

## Context

The originating symptom was the user's observation that running
a range analysis and then firing a ponder query on the same
board interrupted the range. Investigation traced the cause to
the SPA layer: both `analyzeRange` and `analyzeActiveNode`
opened with `this.stopBoardAnalysis(boardId)`, which sent a
`terminate` to the proxy for the prior query and cleared the
per-board entries. The proxy and the ledger were already
multi-query-capable; the SPA's per-board single-slot maps were
the bottleneck.

The pattern was inherited from the pre-umbrella `gogui` repo —
present in the umbrella's first commit (`e5c857b initial`,
2026-04-26). The pre-umbrella history was deliberately not
preserved per `docs/playbooks/monorepo/monorepo-plan.md` §461-
463, so the originating commit's rationale is not reachable
from this repository. The plausible reconstruction: the pattern
emerged in the single-board-UX era when "ponder while looking
at this position" was the primary case and a single-slot map
was the simplest data shape; the multi-query concept was
already implicit in the ledger's `(configHash, nodeId)` keying.

A sibling rationale-archaeology point worth recording: the
ownership-overlay restart (`restartActiveAnalyses` fired from a
`deep: true` watcher on `overlayLayers`) was the user's prior
encounter with the same over-constraint class. That watcher
shipped in commit `31a786e` (2026-04-30, v1.0.0 wrap-up) and
was removed in commit `6a22369` (2026-05-08) with the framing
that "a config-toggle that auto-fires an expensive engine
query is the costly-and-unexpected side-effect class ADR-0002
is shaped to make explicit." This arc inherits that framing
and applies it to the analyze-method clobber.

The plan note records the design negotiation, the
review-session audit findings (a real resource-cleanup
regression in the timeout branch identified during the audit),
and the three open questions the user closed on 2026-05-16
(per-kind cancel surfaces, keep-`activeMode`-as-derived, audit
`useReviewSession`).

## What changed

### Data shape (`src/services/analysis-service.ts`)

The four per-board maps in `AnalysisService` are restructured.
`activeQueries` gains a `boardId` field and a `mode: 'analyze'
| 'ponder'` discriminator. `activeSubscriptions` and
`restartCallbacks` re-key from `BoardId` to `QueryId`. A new
`boardToQueries: Map<BoardId, Set<QueryId>>` index supports the
"stop everything on this board" path. `activeQueryIds` (which
held the old single-slot boardId → queryId map) is removed
entirely; consumers read `activeQueries` directly via the
`boardId` field, or `boardToQueries` for per-board iteration.

### Primitive surface

- `stopQuery(queryId)` is the per-query release primitive
  (made public for the review-session call sites). Idempotent
  on a queryId not in `activeQueries`.
- `stopBoardAnalysis(boardId)` is repurposed as the bulk-stop
  path — iterates the board's `Set<QueryId>` and routes each
  through `stopQuery`. Used by `closeBoard`, `resetWorkspace`,
  HMR dispose, the purge button, and the engine-disconnect
  sweep.
- `stopPonderOnBoard(boardId)` is the per-kind release path
  consumed by the spacebar's ponder-toggle. Walks the board's
  queries, releases only the ponder.
- `isPondering(boardId): boolean` is the per-board predicate
  consumed by the spacebar gate and the "Follow Me" watcher.
  Replaces the two reads of `store.engine.activeMode[id] ===
  'ponder'`.

### Behaviour change at the analyze methods

`analyzeRange` and `analyzeActiveNode` no longer call
`stopBoardAnalysis(boardId)` at their head. `analyzeActiveNode`
with `mode === 'ponder'` calls `stopPonderOnBoard(boardId)`
instead — the mode-scoped implicit cleanup that preserves the
"one ponder per board is a semantic invariant, not an
arbitrary one" framing from the plan note. `analyzeRange` and
`analyzeActiveNode(mode === 'analyze')` perform no implicit
cleanup; concurrent range / analyze queries coexist freely.

Both methods now return the minted `queryId` (or `null` on
early-return), enabling callers like `useReviewSession` to
drive query lifecycle explicitly.

### Telemetry per-row cancel

`telemetry.registerQuery`'s `cancel` thunk in both analyze
methods is now `() => this.stopQuery(queryId)`. The tooltip's
per-row cancel button cancels exactly the row it's attached
to; sibling queries on the same board are untouched.

### Restart thunks are self-stopping

Each query's restart-callback now opens with `stopQuery(thisId)`
before re-firing the analyze method. Without this,
`restartActiveAnalyses` would accumulate stale entries on each
fire — the implicit `stopBoardAnalysis`-at-the-head pattern
previously did this cleanup for free; the multi-query model
makes it explicit. The chain is self-renewing across repeated
restart fires (the re-fired analyze method mints a fresh
queryId and a fresh thunk).

### Review-session lifecycle (`src/composables/review/useReviewSession.ts`)

The audit recorded in the plan note's "Review-session audit"
section identified a real resource-cleanup regression. The
fix: `processUserMove` captures the queryId returned by
`analyzeRange` and calls `analysisService.stopQuery(queryId)`
in all three terminal branches of the wait — success, timeout,
abort. The timeout branch is the most consequential of the
three; without explicit release, a hung query would consume
KataGo compute indefinitely (the previous implicit cleanup
relied on the next `analyzeRange` clobber).

### `store.engine.activeMode` as derived state

`recomputeActiveMode(boardId)` is the projection function;
called after every mutation that adds or removes a query
(via `indexQueryOnBoard` for adds, via `stopQuery` /
`stopBoardAnalysis` for removes). Priority: `analyze` >
`ponder` > `none`. No current reader actually consumes the
field — both ex-readers (`useUserIORegistry`, `App.vue`) now
consume the `isPondering` predicate directly — but the writes
are kept honest so persisted store snapshots stay coherent
with runtime state.

### Documentation sweep

Per ADR-0005 Rules 3 and 8:

- Inline comments at `analysis-service.ts:467-470` (framing
  read), `:678-685` (telemetry cancel rationale), `:797-815`
  (`restartActiveAnalyses` docstring) rewritten to describe
  the multi-query relations rather than the old per-board
  one-slot relations.
- `useUserIORegistry.ts:85-100` stale comment block referencing
  the removed `useAppBootstrap` overlay-toggle watcher
  rewritten to describe the no-auto-restart posture (the
  posture has been in place since commit `6a22369`, 2026-05-08;
  this is the doc-drift cleanup deferred from that earlier
  arc).
- `store/index.ts::closeBoard` docstring item 1 reworded to
  describe `stopBoardAnalysis` as the bulk-stop path
  (releasing every in-flight subscription the board owns)
  rather than the single-slot path.
- `FILES.md` band tags spot-checked; no changes needed
  (`analysis-service.ts` is still `[B3]`, `useUserIORegistry`
  is still `[B2]`, `useReviewSession` is still `[B3]`).
- `FEATURES.md` spot-checked; no engine-mode descriptions in
  single-slot terms.

### Test fake update (`tests/fakes/analysis-service.ts`)

`fakeAnalysisService` gains a `stopQuery` spy and a `FAKE_QUERY_ID`
sentinel that `analyzeRange` returns by default after each
`resetFakeAnalysisService()` call. The default re-arm is necessary
because `mockReset` clears the configured return value alongside
the calls; the `useReviewSession` happy-path tests need a non-null
return from `analyzeRange` to exercise the new
`if (reviewQueryId !== null) stopQuery(reviewQueryId)` cleanup
branch.

## What the user-visible change is

1. **Spacebar during a range query:** starts ponder *alongside*
   the range. The range continues. Pressing space again stops
   only the ponder; the range still continues.
2. **Range fire during a ponder:** range starts alongside the
   ponder. Both run to completion (or until the user cancels
   per-row in the tooltip).
3. **Follow Me navigation while pondering:** the watcher fires
   `analyzeActiveNode(boardId, 'ponder')` on each nav tick.
   The mode-scoped implicit cleanup
   (`stopPonderOnBoard(boardId)` inside `analyzeActiveNode`)
   releases the prior ponder; the new ponder fires at the new
   node. A concurrent range on the same board is unaffected.
4. **Telemetry tooltip per-row cancel:** cancels only the row.
5. **Purge button:** unchanged — bulk stop is what "Purge"
   honestly promises.
6. **Board close / engine disconnect / HMR dispose:** unchanged.
   All routed through the renamed-but-semantically-equivalent
   `stopBoardAnalysis(boardId)` bulk path.

No wire-protocol change. No proxy-side change. No backend
change.

## Verification

- `npm run build` (`vue-tsc -b && vite build`): green.
- `npm run test:run`: 521 / 3 / 0 (passed / skipped / xfailed).
- Manual smoke (queued for user testing): start a range, press
  space → range should continue alongside the new ponder;
  press space → ponder stops, range continues; reverse order
  works symmetrically; per-row cancel cancels only its row;
  close-board terminates everything cleanly.

## Open follow-ups

None blocking. Possible future arcs the plan note flags:

- Dropping `store.engine.activeMode` entirely once a confidence
  pass confirms no reader (component-level or persisted-blob
  consumer) actually needs it. Schema-version-bump via the
  rolling-archive discipline.
- An explicit dashboard-level Stop button per kind, if the
  per-kind UX needs more affordance than the telemetry
  tooltip provides. Not currently requested.
