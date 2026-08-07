# wf8-learn-this-path — fresh-context review

Artifact: branch `worktree-agent-ab7becace83f1a5bc` @ `018135ff`, merge-base `3378806f` (confirmed via
`git merge-base`). Reviewed from that diff, plus a separate diff of `TreeWidget.vue` between
`3378806f`/`origin/next` and the not-yet-merged `bork/feat/card-position-highlight-stageb` branch, per
the dispatch brief's instruction to assess the ring-composition seam concretely rather than take the
brief's framing on faith.

**Correction to the brief's framing, stated up front:** the brief asserts current `next` already carries
the Stage-B known-position ring / review-start ring / "board-delta work". That is not what `next` (verified
as `origin/next`, 5 commits ahead of this branch's merge-base, none of them ring-related) actually
contains. Those rings exist only on the **unmerged** feature branch `bork/feat/card-position-highlight-stageb`
(based on `origin/next`'s tip `95e85b0d`); `bork/feat/delta-view-cycle` (the "board-delta work", also
unmerged, based on the same tip) touches only `nodeFill()`'s dark-theme fix, not rings. Findings below are
against what those branches actually contain, not the brief's paraphrase — the substance of the seam (a
real radius collision) holds regardless, but the compose target is "reconcile against these two specific
unmerged branches when their PRs land," not "current `next`."

## Gate runs (witnessed)

Built a standalone copy via `git archive worktree-agent-ab7becace83f1a5bc | tar -x` into a scratchpad
(this worktree is pinned to a different branch and cannot check out a branch already checked out in a
sibling worktree), `npm ci`, then ran under the mandated memory cap.

- `npm run build` (`NODE_OPTIONS=--max-old-space-size=2048`, `nice -n 19`) — **PASS**, `vue-tsc -b && vite build` completed, 1086 modules, no type errors.
- `npm run test:run` (`NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`, `nice -n 19`) — **PASS**, 1116 passed / 4 skipped across 83 files (3 skipped files), 72.6s.
- `npx eslint .` (`nice -n 19`) — **PASS**, empty output, no findings.

## Red-then-green witness (load-bearing test)

Flipped the sort comparator in `learn-path-policy.ts`'s `rankCandidates` from ascending to descending
(`(a,b)=>(a.info.order-b.info.order)` → `(b.info.order-a.info.order)`):

- **RED**: 8 of 15 tests failed across `learn-path-policy.test.ts` and `useLearnPath.test.ts` — the
  spine-first ordering assertion (`steps` array), rank/role assertions, mint-count assertion, and the
  determinism assertion all failed with concrete diffs (best move now ranked last, spine walked last,
  P9/Q16 mint order swapped).
- Restored the comparator.
- **GREEN**: same 15 tests (2 files) pass.

This confirms the spine-first-by-`order`-ascending semantics (rows 706/707) is genuinely tested, not
just asserted in a docstring.

## Semantics vs. the ratified letter (rows 706/707/708/718)

`frontend/src/composables/cards/learn-path-policy.ts` and `useLearnPath.ts` — read in full.

- **Ranking (row 706)**: ascending by `moveInfos[].order`, ties broken by original array index. Matches
  the letter exactly; unit-tested directly (`learn-path-policy.test.ts`, 5 cases including a tie case and
  a topK-slice case).
- **Spine (row 707)**: rank 1 is `role: 'spine'`, descended first and awaited before any deviation
  recurses (`for (const candidate of ranked)` iterates rank-ascending; the walk's `await
  walk(nextState, ...)` for the spine entry happens in the loop's first iteration). Witnessed directly —
  `useLearnPath.test.ts`'s `steps` array asserts the full D4→C17→Q3 spine is grown and awaited before
  either deviation (P9, Q16) appears.
- **Deviations recurse as subtrees, not leaf stubs (row 708)**: `policy.shouldRecurse(role, ...)` is
  called uniformly for spine and deviation roles, and `walk()` recurses into a deviation's `nextState`
  exactly like a spine step — confirmed by the fixture (P9, a deviation of D4, itself has an unseeded
  frontier reported one ply further in, i.e. the walk did attempt to recurse past it).
- **Unanalyzed frontier fails loud, not silent (row 660 constraint 1)**: `walk()` checks
  `!raw || !raw.moveInfos || raw.moveInfos.length === 0` and pushes a `PendingFrontier` rather than
  throwing or dropping — this is "stop this branch, report it" as specified, and is distinct from
  "silently truncate" (the frontier is enumerated in the returned `LearnPathExploration.frontierCount`
  and in the final `LearnPathResult.frontiers`). Witnessed: the P9/Q16 frontiers appear in
  `exploration.frontierCount === 2` and `result.frontiers` in the acceptance test.
- **Live growth, frame/microtask pacing, no wall-clock sleep**: `defaultYieldStep` is
  `requestAnimationFrame`-based; `LearnPathParams.yieldStep` is injectable and every test supplies a
  microtask (`() => Promise.resolve()`) — no `setTimeout` anywhere in the delivered files (grepped).
  Compliant with the brief's "REQUIRED if setTimeout" condition — it's not present, so no finding here.
- **Deferred batch mint, button-only (row 708/718)**: `explore()` never calls `commitMint`/`createCard`;
  only `confirmMint()` does, and only `LearnPathModal.vue`'s `runMintAll()` (triggered by the "Mint All"
  button click) calls `confirmMint`. Witnessed with a spy: `expect(fakeBackendService.createCard).not
  .toHaveBeenCalled()` after `explore()` resolves, then `toHaveBeenCalledTimes(1)` after `confirmMint()`
  — one batch call, not per-seed.
- **Dedup skip-with-notice**: `confirmMint` checks `existingContent.get(candidateSgf)` per seed and
  routes to `skipped` with `reason: 'existing-card'` instead of minting — witnessed (Q16 skip in the
  acceptance test).
- **Pre-mint markers, blue-circle family, clear on mint or discard**: `addPendingMintMarker` is called
  only for eligible, non-existing candidates during the walk; `clearPendingMintMarkers` runs in
  `confirmMint`'s `finally` (both success and failure paths) and in `discardExploration`. Witnessed: the
  acceptance test shows exactly 1 marker (P9; Q16 is excluded because it's already-existing) that
  disappears after both `confirmMint` and, in a separate test, `discardExploration`.
- **Determinism**: `runLearnPath` invoked twice against independently-rebuilt-but-identical ledger state
  produces an identical seeded/skipped/frontier shape — witnessed directly in
  `useLearnPath.test.ts`'s determinism test (passed in the gate run above).
- **Policy seam purity**: `learn-path-policy.ts` imports only `KataMoveInfo` (a type) — no store, no
  ledger, no Vue reactivity import. `spineFirstPolicy` is a plain object of pure functions. Confirmed by
  reading the full file; no `store`/`ledger`/`backendService` import present.

No letter-vs-spirit divergence found in the walk/mint semantics themselves. This half of the delivery is
solid.

## BLOCKER — stale `boardIndex` under a concurrent board close corrupts an unrelated board

`useLearnPath.ts`'s `explore()` resolves `boardIndex` **once**, up front
(`store.boards.findIndex(b => b.id === params.boardId)`), then threads that raw array index through every
`updateBoardState(boardIndex, ...)` call across the walk's `await yieldStep()` checkpoints — including the
final cursor-restore write after the walk completes. `updateBoardState(index, newState)`
(`src/store/index.ts`) writes unconditionally to `store.boards[index]`, with no identity check against the
board it's supposed to be writing. `closeBoard` (`src/store/index.ts`) removes a board via
`store.boards.splice(idx, 1)`, which shifts the array index of every board positioned **after** the closed
one.

Consequence: if the user closes a board that sits **before** the walk's anchor board in `store.boards`
while a "Learn this path" walk is in flight (any yield-checkpoint gap — `requestAnimationFrame` in
production, easily hit by a user click during a multi-second walk), every subsequent
`updateBoardState(boardIndex, ...)` call — including the final cursor-restore — writes into whatever board
now occupies the stale index. This is silent cross-board data corruption: a board the walk was never
supposed to touch gets its `stones`/`currentNodeId`/etc. overwritten with the walk's board's data, with no
error, no log, nothing (a direct violation of ADR-0002's fail-loudly posture — this fails silently, not
loudly).

**Witnessed** with a reviewer-authored test (not part of the delivery; not committed anywhere, run only
against the scratchpad copy for this review):

```
Board A (index 0, unrelated) → Board B (index 1, learn-path anchor) → Board C (index 2, unrelated,
pre-moved so its currentNodeId/stones are distinguishable from B's root).
explore({ boardId: B }) with a yieldStep that closes board A on its first invocation.
```

Result: `liveC!.currentNodeId` became B's `rootNodeId` (`"root-eok1wrt"` in one run) instead of C's own
pre-existing node id (`"node-bvns0"`) — i.e. board C's cursor was silently overwritten by the walk meant
for board B, and the assigned `currentNodeId` does not even exist in board C's own `nodes` map (a
dangling reference a subsequent render of board C would choke on). Reproducible by re-running the scenario
above against `useLearnPath.explore`.

This is exactly the "resurrection-race" class the dispatch brief flagged by name, just one level removed
from the sibling case it named (this bug fires from **any** board close during the walk, not only the
anchor board's own close — an even wider blast radius). It is untested by the delivered suite (grepped
`useLearnPath.test.ts` and the whole diff — no test calls `closeBoard` during an in-flight `explore()`).

**Required fix** (not a radius/CSS reconciliation — a correctness fix, blocking on its own merits): thread
the board's stable `BoardId`, not a raw array index, through the walk, and re-resolve the live index (or
just find-by-id) at each write site — mirroring how `learn-path-pending-markers.ts` itself is correctly
keyed by `BoardId`, not index. A `registerBoardCloseHandler` guard that aborts the walk (checked at each
`yieldStep` boundary) when its own target board disappears would also close the anchor-board-closed case,
but the id-not-index fix is required regardless since the corruption isn't limited to the anchor board.

## REQUIRED — TreeWidget ring-radius collision at merge time (compose against `bork/feat/card-position-highlight-stageb`)

Diffed `TreeWidget.vue` on `bork/feat/card-position-highlight-stageb` (based on `origin/next`) against
`origin/next` itself to get the concrete ring inventory this branch's `pendingMintIds` ring must compose
with:

| Ring | Branch | Radius | Style | Color token |
|---|---|---|---|---|
| active-ring | (existing) | `NODE_R+3` | solid | `--accent-primary` (cyan `#4aaef0`) |
| game-head-ring | (existing) | `NODE_R+5` | solid | `--state-success` |
| review-start-ring | stageb | `NODE_R+7` | **solid** | `--accent-secondary` (orange `#f0a04a`) |
| known-position-ring | stageb | `NODE_R+9` | dashed | `--accent-secondary` |
| **pending-mint-ring** | **this branch** | **`NODE_R+7`** | **dashed** | `--accent-primary` (cyan) |

Color-wise, this branch is fine: `--accent-primary` (cyan/blue) is a distinct token from
`--accent-secondary` (orange), so the brief's "blue must not read as the known-position marker" concern is
satisfied — known-position is orange, pending-mint is blue, no color collision.

The actual collision is **radius**: `pendingMintIds`'s ring and stageb's `review-start-ring` both draw at
`NODE_R+7`. A node that is simultaneously a review session's start AND a pending-mint candidate (plausible
— exploring a path from a card that also happens to be a review-start node) gets two `<circle>` elements
at the exact same `cx/cy/r`: a solid orange circle and a dashed blue circle drawn directly on top of each
other. This is precisely the class of collision stageb's own header comment on `known-position-ring`
documents having already hit once (its `NODE_R+7` first draft collided with `review-start-ring`, resolved
by moving to `+9`) — the same mistake recurs here because this branch was authored against a base that
didn't have `review-start-ring` at all.

**Required compose step**: move `pending-mint-ring`'s radius off `NODE_R+7` — `NODE_R+11` (one past
`known-position-ring`'s `+9`) keeps the full concentric stack unambiguous: active `+3` → game-head `+5` →
review-start `+7` → known-position `+9` → pending-mint `+11`. Also union at merge:

- The `props` interface block — `pendingMintIds` (this branch) alongside `knownPositionNodeIds` /
  `reviewStartNodeId` (stageb) — no semantic conflict, straightforward textual union.
- The `nodeList` computed's per-item object literal — `isPendingMint` (this branch) alongside
  `isKnownPosition` / `isReviewStart` (stageb) — straightforward union.
- The `v-memo` key array on the `<g v-for>` — **must** include all five booleans
  (`isGameHead, isKnownPosition, isReviewStart, isPendingMint, item.move?.color, ...`); each branch only
  added its own key(s) to the array independently, so a naive line-level merge could silently drop one
  side's key depending on merge-driver behavior — worth an explicit check at merge time, not just
  compile-success.
- `.pending-mint-ring` and `.known-position-ring`/`.review-start-ring` CSS classes are additive, no name
  collision.

`bork/feat/delta-view-cycle` (also unmerged, the brief's likely referent for "board-delta work") only
touches `nodeFill()`'s dark-theme literal-to-`var()` swap and an added unscoped `<style>` block — no ring
work, no collision with this branch. Mention only for completeness; nothing to reconcile there beyond a
plain three-way text merge.

## ADVISORY

- `LearnPathModal.vue`'s `close()` only calls `discardExploration` when `phase.value === 'explored'`. The
  modal backdrop's `@mousedown.self="close"` has **no** phase guard (unlike the footer's "Close" button,
  which is `:disabled` during `'exploring'`/`'minting'`), so a backdrop click during `'exploring'` calls
  `close()` while `exploration.value` is still `null` (the walk hasn't resolved yet) — the discard branch
  is skipped, `isOpen` goes false, but the in-flight `explore()` promise keeps running in the background
  (unaffected by `isOpen`), continuing to call `addPendingMintMarker` and grow the tree on a modal the user
  believes they closed. When that orphaned walk eventually resolves, it still sets `phase.value =
  'explored'` and `exploration.value = ...` on refs the now-hidden modal owns — reopening the modal later
  (`open()`) unconditionally resets `phase`/`exploration` to `'form'`/`null` without touching the leftover
  markers `learn-path-pending-markers.ts` is still holding for that board, i.e. those markers become
  unreachable through the UI (no live `exploration` object left to `discardExploration` or `confirmMint`
  against) until the board itself is closed. Related to, but distinct from, the BLOCKER above — worth a
  phase guard on the backdrop `close()` the same way the footer button already has one, plus (once the
  BLOCKER fix threads by-id rather than by-index) a cooperative-cancellation check so an orphaned walk
  stops appending markers once its modal is gone, rather than merely being harmless-to-the-board.
- Minor: `explore()`'s precondition checks (depth/topK/tag/board-exists/sourceCardId/cursor-at-root) all
  run before the `await loadExistingDescendantContent(...)`, so a malformed call fails fast without a
  network round-trip — good, no finding, noted only because it was checked as part of the fail-loud review
  and is worth confirming stays true if this file is touched again.

## Verdict: MERGE-WITH-FIXES

The walk/policy/mint semantics are correct against the ratified letter (rows 706-708, 718), well-tested
(15 targeted tests, red-then-green witnessed on the load-bearing ranking test), and clean on all three
gates. Two things block a straight merge:

1. **BLOCKER** (fix before merge, not compose-time): the stale-`boardIndex` cross-board corruption. This
   is a correctness bug independent of any other branch's state — it fires today, on this branch alone,
   against `next` as it exists now, with no rings or stageb branch involved. Fix: key the walk's write
   sites by `BoardId`, not array index.
2. **REQUIRED at compose time**: when this branch's PR lands alongside (or after)
   `bork/feat/card-position-highlight-stageb`, move `pending-mint-ring` off `NODE_R+7` to `NODE_R+11` and
   verify the `v-memo` key array carries the full five-boolean union, not just one side's addition.
