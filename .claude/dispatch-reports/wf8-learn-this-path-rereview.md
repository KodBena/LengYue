# wf8-learn-this-path — fresh-context re-review of the fix round

Artifact: branch `worktree-agent-ab7becace83f1a5bc` @ fix commit `c8407955`
(`fix(frontend): wf8-learn-this-path review fixes — board-id write safety,
ring radius, modal close guard`), on top of merge commit `d3046513`
(`Merge branch 'next' into worktree-agent-ab7becace83f1a5bc`). Reviewed the
prior fresh-context review's verdict (MERGE-WITH-FIXES,
`.claude/dispatch-reports/wf8-learn-this-path-review.md`) as the scope of
this round — the accepted parts (walk/policy/mint semantics) were NOT
re-litigated; this pass verifies only the three fix items plus the merge's
blast radius.

Working setup: this agent's own isolated worktree
(`.claude/worktrees/agent-aa9d85bcc84962453`), which had no working tree for
the review branch — created a local branch `wf8-rereview` at `c8407955`
(same commit the target branch points at; git objects are shared across
worktrees of one repo, so this is a byte-identical checkout, not an
approximation) and ran `npm ci` fresh (333 packages).

## Gate runs (witnessed, memory-capped: `nice -n 19`,
`NODE_OPTIONS=--max-old-space-size=2048`, `VITEST_MAX_THREADS=2
VITEST_MAX_FORKS=2` for the test run)

- `npm run build` — **exit 0**. `vue-tsc -b && vite build`, 1142 modules
  transformed, no type errors. Matches the build commit message's claimed
  module count exactly.
- `npm run test:run` — **exit 0**. 138 test files passed / 3 skipped (141),
  1724 tests passed / 4 skipped (1728). Matches the build commit's claimed
  "1724 passed / 4 skipped, up from 1116 pre-merge" exactly.
- `npx eslint .` — **exit 0**, no output.

All three exit codes verified directly (not grepped from prose).

## 1. BLOCKER fix — board-id write safety

Read `frontend/src/composables/cards/useLearnPath.ts` in full (706 lines,
including the new "Board-identity safety" module-header section).

**Write-site inventory.** Grepped every `updateBoardState`/`findIndex` call
site in the file — there are exactly two:

- `writeLiveBoard(boardId, nextState)` (line 345-350): re-resolves
  `store.boards.findIndex(b => b.id === boardId)` fresh on every call,
  returns `false` without writing if the board is gone. This is the ONLY
  site inside the per-candidate loop (called at line 526, once per
  live-tree step, right after the move is computed and right before the
  `await yieldStep()` checkpoint — so no index is ever carried across an
  `await`).
- The final cursor-restore write (lines 573-577): `finalIndex` is resolved
  immediately after `await walk(...)` returns, with no intervening `await`
  before it's used — not carried across a yield either, and is a no-op
  (`finalIndex !== -1` guard) if the board is gone by the time the walk
  finishes.

No other write path exists — `learn-path-pending-markers.ts`'s
`addPendingMintMarker`/`clearPendingMintMarkers` were already keyed by
`BoardId` (confirmed by the prior review and unchanged here), and
`confirmMint`/`discardExploration` never touch `store.boards` directly
(they only call `commitMint`, which is out of scope for this bug class —
it mints a card by `CardId`, not a board write).

**Abort semantics.** `walk()` checks `aborted` at its own entry and at the
top of its per-candidate loop; `writeLiveBoard` returning `false` sets
`aborted = true` and `break`s the current loop. Recursion is depth-first
and awaited (`await walk(nextState, ...)` at line 561), so a `break` in an
inner frame returns control to the awaiting outer frame, whose own loop
next checks `if (aborted) break` — the abort propagates up through every
active stack frame on the next loop iteration. `explore()` itself never
throws on abort; it returns whatever partial `LearnPathExploration` had
already been collected, the same partial-progress posture as a frontier.
Witnessed directly (see below) — no throw, `exploration` is defined,
`pendingSeedCount`/`frontierCount` reflect whatever the walk collected
before the board disappeared.

**Delivered regression test** (`useLearnPath.test.ts`, "board-identity
safety" describe block): closes an *earlier, unrelated* board (A) on the
walk's first yield checkpoint while the anchor is B and a third board C
sits after B — reproduces the original reviewer's exact scenario (a splice
before the anchor shifting every later index). Asserts C's
`currentNodeId`/`stones` are byte-identical to their pre-walk snapshot.
Ran this file in isolation: **passed** (9/9 tests in the file, including
this one).

**Gap found and closed by this re-review, not by the delivered suite:** the
delivered test only covers closing an *earlier, unrelated* board — not the
ANCHOR board's own close (the abort path itself), which the brief
specifically asked to be exercised. I authored and ran a reviewer-only test
(temporarily inserted into the same file, never committed, reverted via
`git show HEAD:frontend/tests/integration/useLearnPath.test.ts >
frontend/tests/integration/useLearnPath.test.ts` after use — no stash
touched): closes board B (the anchor itself) on the walk's first yield.
Result: **did not throw**, `exploration` is defined, and
`store.boards.find(b => b.id === boardIdB)` is `undefined` afterward (the
board stays genuinely closed — no stale-index write resurrects it into
whatever now occupies its old slot). Passed on first run.

**Red-then-green witness (load-bearing, both regression tests).**
Temporarily reverted `writeLiveBoard`'s call site to the pre-fix shape — a
`REVERT_staleBoardIndex` resolved once via `store.boards.findIndex(...)`
right after `loadExistingDescendantContent`, then written unconditionally
via `updateBoardState(REVERT_staleBoardIndex, nextState)` at the live-tree
write site (no re-resolution, no abort check) — leaving everything else
(the anchor board close, the final cursor-restore re-resolution, the
markers module) untouched:

- **RED**: 2 of 9 tests in `useLearnPath.test.ts` failed — the delivered
  "closing an unrelated earlier board mid-walk does not corrupt it" test
  (C's `currentNodeId` came back as B's data, matching the original
  review's witnessed symptom) AND my anchor-close test (the board was
  found again in `store.boards` after being closed — the stale index wrote
  a new board object back into a slot the splice had already vacated,
  effectively resurrecting the anchor board's identity under whatever took
  its place).
- Restored `writeLiveBoard` exactly as delivered.
- **GREEN**: same 9 tests pass.

This confirms both regression tests are load-bearing against the exact
mechanism the BLOCKER named, not merely coincidentally green.

**Verdict on fix 1: holds.** No remaining index-captured write survives an
`await` anywhere in the file — cursor restore, marker registry calls (never
index-based to begin with), and the one live-tree write site are all
covered. The anchor-board-close abort path (not covered by the delivered
suite) was independently verified to behave correctly.

## 2. Ring radius fix

Read the merged `frontend/src/components/tree/TreeWidget.vue`'s relevant
`<script>` and `<template>` sections in full (the `nodeList` computed and
the per-item `<g v-for>` block).

Confirmed the full concentric stack exactly as claimed:

| Ring | Radius | Style |
|---|---|---|
| active-ring | `NODE_R+3` | solid |
| game-head-ring | `NODE_R+5` | solid |
| review-start-ring | `NODE_R+7` | solid |
| known-position-ring | `NODE_R+9` | dashed |
| pending-mint-ring | `NODE_R+11` | dashed |

No two rings share a radius; the prior REQUIRED finding's collision
(`pending-mint-ring` originally at the same `NODE_R+7` as
`review-start-ring`) is resolved. `known-position` (orange
`--accent-secondary`) and `pending-mint` (blue `--accent-primary`) stay on
distinct color tokens as before, so no color regression either.

The `v-memo` key array on the `<g v-for="item in nodeList">` (line 436)
reads:
`[item.isGameHead, item.isKnownPosition, item.isReviewStart,
item.isPendingMint, item.move?.color, item.move?.type, item.isBranching,
item.isExpanded, item.px, item.py]` — all five ring-driving booleans
(`isGameHead`/`isKnownPosition`/`isReviewStart`/`isPendingMint`, plus the
active ring which is imperatively driven off the memo path by design, per
the file's own render-locality comment) are present; the `nodeList`
computed populates each from its own props (`gameHeadIds`,
`knownPositionNodeIds`, `reviewStartNodeId`, `pendingMintIds`) with no
omission. Confirmed by reading the full `items.push({...})` object literal
at line 344-354 — every field the template reads for ring visibility has a
matching memo key.

**Verdict on fix 2: holds**, checked directly against the actual merged
file (not inferred from the commit message).

## 3. Modal close guard

Read `frontend/src/components/modals/LearnPathModal.vue` in full (280
lines). `close()` is the SINGLE close function; there is no separate
Escape-key handler anywhere in this component (grepped for
`keydown`/`keyup`/`Escape` — none), so the "backdrop AND Escape AND any
other close path" concern collapses to: every close-triggering UI element
routes through this one function. Confirmed three call sites, all calling
the same guarded `close()`:

- Header `×` button (line 147).
- Backdrop `@mousedown.self="close"` (line 143) — this was the gap the
  original review flagged (no phase check at all, unlike the footer
  button's own `:disabled`).
- Footer "Close" button (line 197) — already had its own `:disabled`
  independently; now redundantly also protected by `close()`'s own guard
  (harmless double coverage, not a regression).

The guard itself (line 68):
`if (phase.value === 'exploring' || phase.value === 'minting') return;` —
placed before any teardown, so a call during either in-flight phase is a
true no-op (matches the footer button's own `:disabled` semantics exactly,
closing the asymmetry the original review found).

**Discard path after a completed exploration still reachable**: `close()`
still calls `discardExploration(exploration.value)` when
`phase.value === 'explored'` (line 74), and the dedicated "Discard" footer
button (`runDiscard`, line 108) is unaffected by this guard (only visible
when `phase === 'explored'`, i.e. never during exploring/minting anyway).
No path was closed off by the fix beyond the in-flight window it targets.

**Delivered component tests**
(`tests/integration/LearnPathModal-backdrop-guard.test.ts`, 2 tests). Ran
in isolation: **2/2 passed**.

- Test 1: mounts the modal with `useLearnPath` mocked (a manually-resolved
  `explore()` promise), triggers Explore, fires a backdrop `mousedown`
  while `explore()` is still pending — asserts `discardExploration` was
  NOT called and the modal is still open (the guard absorbed the click).
  Then resolves the walk and fires a SECOND backdrop click, now in
  `'explored'` phase — asserts `discardExploration` WAS called and the
  modal closed, proving the guard is scoped to the in-flight window only,
  not a permanent lockout.
- Test 2: confirms the footer Close button's own `:disabled` is still true
  during `'exploring'` — the existing affordance is untouched by the new
  guard.

**Verdict on fix 3: holds.**

## 4. Merge blast-radius check (`d3046513..c8407955`)

```
 .../dispatch-reports/wf8-learn-this-path-build.md  |  10 +--
 frontend/src/components/modals/LearnPathModal.vue  |  15 ++++
 frontend/src/composables/cards/useLearnPath.ts     |  74 ++++++++++++---
 frontend/tests/fakes/backend-service.ts            |   5 +-
 .../LearnPathModal-backdrop-guard.test.ts          | 100 +++++++++++++++++++
 frontend/tests/integration/useLearnPath.test.ts    |  73 +++++++++++++--
 6 files changed, 254 insertions(+), 23 deletions(-)
```

Exactly the three fixes' own files, their tests, the build-log dispatch
note, and one fake-service update — no file outside that blast radius.
The fake-service change
(`tests/fakes/backend-service.ts`) is the claimed "merge-induced typecheck
fix": `fetchTreeByRoot`'s fake signature was retyped from
`(rootCardId: CardId, ...)` to `(rootCardPublicId: CardPublicId, ...)`,
matching next's browse-leak-fix rename verbatim against the real
`backendService.fetchTreeByRoot` signature in
`src/services/backend-service.ts` (`rootCardPublicId: CardPublicId`, wire
field `root_card_public_id`) — read both signatures directly, not inferred.
`useLearnPath.ts`'s `loadExistingDescendantContent` was updated to call
`fetchTreeByRoot(group.rootCardPublicId)` and to destructure
`ResolveRootsResult`'s `rootCardPublicId` field, matching the real ACL. No
other file in the merge's diff touches unrelated `next`-side features (the
merge itself, `d3046513`, is a separate commit from the fix commit and
carries the Stage-B rings / App.vue restructure / etc., but the FIX commit
on top of it — the object of this re-review — stays scoped to the three
named items).

## Verdict: MERGE

All three fix items hold under direct re-reading of the merged files (not
taken from the commit message), the delivered regression/component tests
pass in isolation, the full gate suite is green with exit codes matching
the builder's claims exactly, and the one gap in test coverage found during
this pass (the anchor-board-close abort path) was independently exercised
and confirmed correct — not merely asserted. The red-then-green witness
against a reintroduced stale-index write confirms the BLOCKER fix's
regression tests are load-bearing, not coincidentally green. The merge's
diff stays inside the three fixes' declared blast radius.
