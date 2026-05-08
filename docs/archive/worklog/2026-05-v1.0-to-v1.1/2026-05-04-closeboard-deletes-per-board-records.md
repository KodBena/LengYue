# closeBoard deletes per-board workspace dictionary entries (O2 + O3)

- **Status:** Shipped on
  `frontend/closeboard-deletes-per-board-records`, 2026-05-04.
  Build green. Single commit covering both pairs per the
  inventory's "Probably fix as part of O2's commit" disposition.
- **Genre:** Bug fix — bounded payload bloat; resource-ownership
  audit O2 + O3, plus an ADR-0001/0002 type honesty retrofit.
- **Date:** 2026-05-04.

## Context

The Pass-1 inventory's closeBoard owner has two payload-bloat
pairs:

> **O2** | `store.session.reviews[boardId]` review-session row |
> Should `closeBoard` `delete store.session.reviews[boardId]`?
> | Small memory leak; gets round-tripped to backend via
> SyncService (it persists `store.session` deeply), so dead
> entries accumulate in the user's document.

> **O3** | `store.engine.activeMode[boardId]` — set to `'none'`
> by `stopBoardAnalysis` but the key persists in the Record |
> Delete the key, or accept the `'none'` tombstone? | Tombstone
> is read-side benign; persisted via SyncService same as O2.
> Probably fix as part of O2's commit.

Both are SyncService persistence concerns at the same site. The
inventory explicitly named them as a single-commit fix, which
this PR delivers.

## What changed

Three files, one logical unit. Each change is in service of the
delete-on-closeBoard fix.

### `frontend/src/types.ts`

Two type narrowings:

```ts
// before
reviews: Record<BoardId, ReviewSessionData>;
activeMode: Record<BoardId, AnalysisMode>;

// after
reviews: Partial<Record<BoardId, ReviewSessionData>>;
activeMode: Partial<Record<BoardId, AnalysisMode>>;
```

The bare `Record<>` types were lying about indexed reads. After
a delete, `record[key]` returns `undefined` at runtime, but TS
declared `ReviewSessionData` (or `AnalysisMode`) — a type that
disagreed with the runtime contract.

Per ADR-0001, types should reflect runtime reality.
Per ADR-0002, type assertions need justification — bare-Record
indexed reads were unjustified assertions buried in the
language semantics rather than `as` keywords.

`Partial<Record<>>` makes the optionality explicit. Consumers
that index into these dictionaries now see `T | undefined` and
must handle the undefined case — which is what the runtime
already does. Inline comments name the ADRs and the runtime
contract for both fields.

### `frontend/src/store/index.ts`

Five edits, all small:

1. **Import cleanup**: `AnalysisMode` removed from the named
   imports — it was only used inside the now-dropped
   `as Record<BoardId, AnalysisMode>` cast at line 62.
   `noUnusedLocals: true` would otherwise fail the build.

2. **Drop three `as Record<>` casts** at the original-store-
   construction site (line 52, 62), at `resetWorkspace`'s
   session reset (line 195/originally 257), and at
   `updateFromRemote`'s reviews-fallback (line 227/originally
   289). With the type narrowed to `Partial<Record<>>`,
   the casts are no longer needed (`{}` matches
   `Partial<Record<>>` directly) — and they would now be
   misleading widening assertions.

3. **closeBoard body**: two new lines after the existing
   `analysisService.stopBoardAnalysis` and `ledger.purgeBoard`
   calls:

   ```ts
   delete store.session.reviews[boardId];
   delete store.engine.activeMode[boardId];
   ```

   `delete` on a missing key is a no-op, so these are safe
   regardless of the prior state. Order is incidental for the
   deletes (they don't depend on each other or on the cleanup
   calls above), but they're placed after `stopBoardAnalysis`
   so the latter's `activeMode[boardId] = 'none'` write is
   immediately overwritten by the delete rather than leaving a
   tombstone in the dictionary.

4. **closeBoard docstring**: rewritten from "Two cleanups
   currently fire" to "Four cleanups currently fire", with
   each entry briefly described and the load-bearing ordering
   rationale named. Mentions audit pairs O1, O2, O3 by
   identifier so a reader landing on the docstring without the
   PR context can navigate to the inventory.

### Consumer verification (no edits required)

- `useReviewSession.ts:48`: `id ? store.session.reviews[id] : null`
  — the resulting `ReviewSessionData | undefined` propagates
  through `?.status ?? 'IDLE'` cleanly.
- `useReviewSession.ts:84-85`: `let review = store.session.reviews[boardId]; if (!review) {...}`
  — already null-checks; behaves identically with the new type.
- `App.vue:81`: `if (store.engine.activeMode[curr.id] === 'ponder')`
  — comparison; `undefined === 'ponder'` is false, same as
  `'none' === 'ponder'`. Correct in both pre- and post-fix
  states.
- `useUserIORegistry.ts:58`: same `=== 'ponder'` pattern. Same
  outcome.
- `analysisService.ts:168, 234, 288`: writes (`activeMode[boardId] = 'analyze'`,
  `activeMode[boardId] = mode`, `activeMode[boardId] = 'none'`) —
  all are valid against `Partial<Record<>>`.

## Why one commit, not two

The inventory's disposition for O3 said "Probably fix as part
of O2's commit." The two pairs:

- Touch the same file (`store/index.ts`) at the same function
  (`closeBoard`).
- Share the same concern (SyncService persistence shape bloat
  for keys that no longer have a corresponding board).
- Share the same type-honesty retrofit (the `Partial<Record<>>`
  change is required for *either* fix to be type-clean, and
  serves both equally).

A bisect-isolated split would awkwardly partition a logically
single change. The audit's bisect discipline is "one fix per
commit, even when multiple pairs share an owner" — but the
inventory's explicit one-commit recommendation here recognizes
that O2 and O3 aren't separable in the way O13 / O14 were
(different files, different concerns, just both lifecycle).

The type narrowing is a separate concern from the deletes,
arguably. But it's also a **prerequisite** for the deletes to
be type-honest, and the deletes are the load-bearing fix —
shipping the type change in isolation would be an audit-
unrelated drive-by. Combining keeps the review unit coherent.

## Verification

- `npm run build` (vue-tsc + vite build) clean. The
  `Partial<Record<>>` change propagated through all consumers
  without compilation errors — the existing null-checks at
  read sites were already aligned with the new type.
- Manual reproduction (pre-fix): open a workspace with several
  boards, close them one by one. Pre-fix: SyncService PUTs
  contain `store.session.reviews` with `boardId → IDLE` rows
  for every closed board over the session, and
  `store.engine.activeMode` with `boardId → 'none'` tombstones
  for the same. Post-fix: PUTs contain only the surviving
  boards' entries.
- Non-regression: review-session creation on the surviving
  boards continues to work; `mutateReviewSession` lazily
  initializes the row when needed.

## Forward notes

closeBoard owner status after this PR:

- O1 closed (#119, #120)
- **O2 + O3 closed (this PR)**
- O4 (useThumbnailCache board-purge) — open. Needs a new
  affordance on the composable surface.
- O5 (useReviewSession.pendingAnalysisAborts entry) — open.
  Bounded leak, controllers GC-eligible after waitForAnalysis
  settles.
- O6 (KataGoClient.subscribers verification) — open.
  Verification work; likely confirms current behavior is
  correct.

Identity-flip owner status:

- O7 closed (#121)
- O10 closed (#122)
- O8 / O9 / O11 — open, all bounded memory or doc-the-deferral
  candidates.

Component lifecycle owner: closed (#123, #124).

Engine WS reconnect owner: O15 open.

Eight pairs closed across this session (#118 inventory + 6
fix PRs). Remaining seven pairs are mostly bounded memory
hygiene or verification work — diminishing payoff per pair.

After remaining pairs are addressed, Pass 3 (forward-authoring
discipline) closes the audit.
