# closeBoard purges the ledger for the closing board

- **Status:** Shipped on `frontend/closeboard-purges-ledger`,
  2026-05-04. Build green.
- **Genre:** Bug fix — bounded memory leak; resource-ownership
  audit O1 main fix (paired with the sub-finding fix shipped
  earlier the same day).
- **Date:** 2026-05-04.

## Context

The resource-ownership audit's Pass-1 inventory (PR #118) named
O1 — `closeBoard` not calling `ledger.purgeBoard(boardId)` —
as the most direct sibling of the prompting case study (PR #115,
which severed the analysis subscription). Without this, every
closed board left its analysis packets and per-node version refs
in `analysisLedger`'s internal Maps indefinitely.

The audit's bisect discipline split O1 into two commits:

  1. **Sub-finding** (PR #119, shipped earlier today): fix
     `purgeBoard` itself so it actually deletes from
     `nodeVersions` rather than only bumping; coupled edit in
     `getProjectedSequence` so consumers retain reactive
     continuity through delete-and-recreate cycles.
  2. **Main fix** (this PR): wire `ledger.purgeBoard` into
     `closeBoard` so the cleanup fires automatically on board
     close.

The ordering matters: shipping the main fix first would have
propagated the sub-finding's leak (`nodeVersions` retained for
nodes whose data was gone) to a new call site. With the
sub-finding fix in place first, this PR delivers fully-released
ledger state on board close.

## What changed

`frontend/src/store/index.ts`. Three edits under full visibility:

### 1. New import: `ledger` from `analysis-ledger`

Adds a second import from the services layer, alongside the
existing `analysisService` import. The static circular
dependency this creates (analysis-ledger imports `store` for
`purgeBoard`'s board lookup) has the same ES module
live-binding shape as the prior closeBoard fix's
`analysisService` cycle — neither side accesses the other's
exports at top-level evaluation time.

### 2. closeBoard's body: paired cleanup calls

The existing single-line `analysisService.stopBoardAnalysis`
call grows to a paired cleanup:

```ts
analysisService.stopBoardAnalysis(boardId);
ledger.purgeBoard(boardId);
```

Order is load-bearing: stop the engine before purging the
ledger so an in-flight packet can't `record()` between the two
calls and re-populate the ledger after we've cleared it. This
mirrors the existing AnalysisControls.vue pattern (`purgeLedger`
also stops first, then purges) — same ordering rationale.

The inline comment is condensed (the ordering rationale + safe-
to-call-unconditionally property) and the function's docstring
carries the depth.

### 3. closeBoard's docstring: enumerated cleanups

The prior docstring described the analysis-subscription cleanup
in detail. The new docstring enumerates both cleanups currently
wired with brief rationale for each, names the ordering
constraint, and points at the audit plan for the broader
discipline. Read as a maintenance prompt: a future contributor
extending closeBoard with a third cleanup (one of the open O2 /
O4 / O5 pairs) will see where to thread it in.

### 4. File-header drift retrofit (ADR-0005 + ADR-0006)

The Pass-1 inventory named a doc-graph drift: the file's header
referenced `resetUserOwnedState`, but the function has been
`resetWorkspace` since at least the v1 arc. The inventory
deferred the retrofit to "whichever Pass-2 commit touches
store/index.ts first." This is that commit. Header now uses
`resetWorkspace` and additionally names `analysis-ledger` as a
second imported service alongside `analysis-service`, mirroring
the new import pair.

## Why land the ADR-0006 retrofit here

ADR-0004 minimal-touch is in tension with ADR-0006's "headers
accumulate naturally as files cycle through normal editing"
when the file is being touched anyway. The Pass-1 inventory
explicitly scheduled the retrofit for "whichever Pass-2 commit
touches store/index.ts first" — naming this case in advance.
With full visibility on the file (re-read at the start of the
edit), the one-token name correction plus the import-name
addition is appropriate scope.

## Verification

- `npm run build` (vue-tsc + vite build) clean. The new static
  circular import compiles and bundles without warnings.
- Manual reproduction (pre-fix): start ponder on a board, close
  the tab. `analysisLedger.data` and `nodeVersions` retained
  entries for the closed board's nodeIds across the configHash
  matrix. Post-fix: those entries are released on close (with
  the PR #119 sub-finding fix in place, both maps drop the
  entries cleanly).
- Non-regression: closing a board that has no recorded packets
  works identically to the pre-fix path; `purgeBoard` short-
  circuits early via the `if (!board) return` guard combined
  with the `hashMap.has(nodeId)` check.

## Forward notes

O1 is closed. The remaining closeBoard-owner pairs in the
inventory:

- **O2** (review-session row in `store.session.reviews[boardId]`)
- **O3** (`store.engine.activeMode[boardId]` tombstone vs delete)
- **O4** (useThumbnailCache board-purge affordance)
- **O5** (useReviewSession.pendingAnalysisAborts entry)
- **O6** (KataGoClient.subscribers verification, likely already
  correct via stopBoardAnalysis)

Any of those is a natural next sweep. O2 and O3 are payload-
bloat fixes for the SyncService persistence shape; they likely
ship in one commit since both touch the same site for the same
reason. O4 is the largest of the remaining (needs a new
affordance on the composable surface) and could ship alongside
or separately from the smaller closeBoard pairs.

The resetWorkspace owner (O7-O11) and component-lifecycle owner
(O12-O14) sweeps are still open. The Pass-1 inventory's
recommended sequencing (O7 first as a free win — reuses the
existing `stopAllBoardAnalyses` — then O12 as another trivial
mirror-the-pattern fix) holds.
