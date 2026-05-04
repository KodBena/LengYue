# analysis-ledger purgeBoard releases its per-node version refs

- **Status:** Shipped on `frontend/ledger-purgeboard-releases-version-refs`,
  2026-05-04. Build green.
- **Genre:** Bug fix — bounded memory leak; resource-ownership
  audit O1 sub-finding.
- **Date:** 2026-05-04.

## Context

The resource-ownership audit's Pass-1 inventory (filed in PR #118
the same day) named O1 — `closeBoard` not calling
`ledger.purgeBoard(boardId)` — and surfaced a sub-finding while
walking the existing `purgeBoard` implementation: it deleted from
`data` but only **bumped** the corresponding `nodeVersions` ref
rather than deleting it. Per the inventory:

> **Sub-finding:** `purgeBoard` itself is incomplete —
> `analysis-ledger.ts:183-197` deletes from `data` but only bumps
> `nodeVersions`, so `nodeVersions` leaks even after the user clicks
> Purge. Worth a separate sub-commit.

Per the audit's bisect discipline (one fix per commit), this
sub-commit ships the sub-finding fix in isolation. The main O1
fix (wiring `purgeBoard` into `closeBoard`) follows in a
subsequent commit; landing it on top of an unfixed `purgeBoard`
would propagate the leak to the new call site.

## What changed

`frontend/src/services/analysis-ledger.ts`. Two coupled edits:

### 1. `purgeBoard` — bump first, then delete the ref

```ts
const v = nodeVersions.get(key);
if (v) {
  v.value++;
  nodeVersions.delete(key);
}
```

The order matters: the bump fires synchronously and schedules
any subscribed consumer's computed to re-run on the next
microtask. The delete then frees the entry. When the consumer
eventually re-runs (on the bump's notification), it goes through
`getOrCreateVersion` and creates a fresh ref starting at 0,
re-attaching its dependency to the new ref. Future records on
the same nodeId reuse the new ref and the consumer sees them.

If we deleted before bumping, the bump would no-op (the ref is
gone) and the consumer would never get notified that the data
was cleared. If we bumped without deleting (the prior behavior),
the ref persists indefinitely for nodes whose data is gone — the
leak the inventory named.

### 2. `getProjectedSequence` — re-attach via `getOrCreateVersion`

The compute body's prior pattern was:

```ts
for (const id of nodeIds) {
  const v = nodeVersions.get(`${hash}:${id}`);
  if (v) v.value;
}
```

This breaks under the new `purgeBoard` semantics. After a purge:
- The version ref is deleted.
- The compute re-runs (because the bump scheduled it).
- `nodeVersions.get(...)` returns undefined; the `if (v)` guard
  skips. The compute establishes no reactive dependency on a
  new ref.
- A future `record()` creates a fresh ref via
  `getOrCreateVersion` and bumps it.
- The compute has no dep on the new ref → never re-runs → the
  consumer never sees the new data despite it being in the
  `data` map.

The fix routes through `getOrCreateVersion` inside the compute,
mirroring the pattern already in `getRaw`:

```ts
for (const id of nodeIds) {
  getOrCreateVersion(hash, id).value;
}
```

`getOrCreateVersion` either returns the existing ref or creates
one. The compute's reactive dep is now on whatever current ref
exists, regardless of prior deletions.

The construction-time pre-create at the top of
`getProjectedSequence` (`nodeIds.forEach(id => getOrCreateVersion(hash, id))`)
is now functionally redundant but kept per ADR-0004
minimal-touch — a follow-up cleanup PR can remove it once a
consumer or test surfaces the redundancy.

## Why these two edits are coupled

The inventory framed O1's sub-finding as just "purgeBoard leaks
nodeVersions." The naive fix (add `nodeVersions.delete(key)`)
would have shipped a regression: any `getProjectedSequence`
consumer that captured a stable `nodeIds` array (the typical
pattern in `useKernelSeries` and `useEnrichedData` when the
variation path is not changing) would lose its reactive
subscription post-purge and miss every subsequent record for the
same nodeIds.

`getRaw` already used the right pattern (always go through
`getOrCreateVersion`). `getProjectedSequence` was the outlier;
making it consistent is what unlocks the deletion. So the two
edits ship together.

## Why not also remove the construction-time pre-create

ADR-0004 minimal-touch. The pre-create is now redundant given
the compute-side `getOrCreateVersion` call, but removing it is a
"while I'm in here" cleanup that wasn't load-bearing for the
fix. Defer until a consumer or test surfaces it.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- Manual reproduction (pre-fix): after `AnalysisControls`'s
  Purge button, `nodeVersions.size` retained an entry for every
  purged nodeId. Post-fix: `nodeVersions.size` drops to entries
  that still have data.
- Manual reproduction of the coupled regression risk (the
  reason `getProjectedSequence` needed the dep-reattach edit):
  with only the `nodeVersions.delete(key)` change applied,
  `useKernelSeries` consumers stopped updating after a purge
  even when fresh records arrived. With the
  `getOrCreateVersion` edit also applied, they update
  correctly.
- Non-regression: a purge with no consumers running (the
  background-tab case) is identical to the pre-fix path —
  `purgeBoard` runs, no reactive dependents notice.

## Forward notes

The main O1 fix (`closeBoard` calls `ledger.purgeBoard(boardId)`)
ships in a subsequent commit per the audit plan's bisect
discipline. With this sub-finding fix landed first, that commit
will deliver fully-released ledger state on board close — the
two together close O1.

The coupling between deletion-and-reattach is a small cautionary
worked example for the rest of the audit: deleting a singleton
Map entry that has reactive dependents requires the consumers'
compute body to use a getOrCreate pattern, not a bare get. The
analysis-service's per-board maps (relevant to O7) don't have
this concern because they aren't read inside reactive computeds.
But future audit work that touches reactive caches should
remember the pattern.
