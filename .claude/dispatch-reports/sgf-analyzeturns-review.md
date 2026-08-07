# Review: `fix(frontend): derive analyzeTurns from real-move count, not tree index` (worktree-agent-a8a89c92c0fb73521)

**Verdict: REJECT.** Silent misalignment, worse than the crash it replaces (ADR-0002 worst tier).

## WITNESSED: the alignment defect (mid-path moveless node)

Query-assembly side (`analysis-service.ts` `buildMovesAndTurnIndex`/`analyzeRange`) is
correctly bounded — `analyzeTurns` values are now real-move counts, `max <= moves.length`.
But `onAnalysisUpdate` (line 1201, **untouched by this diff**) still does:

```ts
const nodeId = queryInfo.path[response.turnNumber];
```

`queryInfo.path` is the raw, unfiltered tree-node path (`path: fullPath`, set at
`analyzeRange`:673 / `analyzeActiveNode`:900). Before the fix, `analyzeTurns` values WERE
tree indices, so `path[turnNumber]` was correct by construction. After the fix,
`analyzeTurns` values are real-move counts, which diverge from tree index for every
position at/after a mid-path moveless node — but the ingestion line was never updated to
match.

Concrete trace (tree, root incl.): `0:root(–) 1:place(W) 2:moveless 3:place(B) 4:place(W)`.
`turnIndexAtTreeIndex = [0,1,1,2,3]`; sent `analyzeTurns = [0,1,2,3]`.

| turnNumber (wire) | correct target (position after N real moves) | `path[turnNumber]` used by ingestion | result |
|---|---|---|---|
| 0 | node0 | node0 | correct |
| 1 | node1 | node1 | correct (coincidence, first real move) |
| 2 | node3 | **node2** (the moveless node itself) | WRONG — moveless node gets a spurious analysis it shouldn't have |
| 3 | node4 | **node3** | WRONG — node3's result overwritten with turn3's (belongs to node4) |

node4, the true end of the requested range, never receives a result at all. Every tree
position at/after the moveless node is silently mis-keyed by exactly the count of earlier
moveless nodes. This reproduces for `analyzeActiveNode`'s single-turn query too
(`analyzeTurns: [moves.length]`, same `path[turnNumber]` consumer, comment at :835 already
half-acknowledges the two indices differ but the fix never follows through into ingestion).

This is the exact adversarial case the review brief asked to trace on paper, confirmed by
code inspection + a standalone reproduction script (not the shipped code, but its exact
extracted logic) — no live engine needed to see it, since the defect is a pure index-space
mismatch between two co-located but un-reconciled call sites in the same file.

## Test-witness gap (point 3)

Both new tests (`analysis-service-moveless-node.test.ts`) assert only on the **outbound**
`sent.analyzeTurns` bound (`Math.max(...analyzeTurns) <= moves.length`). Neither test
simulates a response packet and checks which `nodeId` the ledger records it under — so the
suite is structurally blind to this defect class; it would pass unchanged with the
misalignment present. This is a witness-construction gap (ADR-0021): the tests observe the
bound symptom that motivated the fix, not the alignment property the fix was actually
commissioned to guarantee.

## Compose check (secondary, not the blocking issue)

Rebasing onto current `next` (range-memory feature, `useAnalysisTimeline.ts` changes):
clean, no conflicts on the touched files (`analysis-service.ts` is untouched by the
range-memory merge). Build/eslint/`test:run` pass on the agent's branch alone (mid-path
misalignment isn't caught by any existing suite, consistent with the gap above). Not
pursued further given the REJECT above.

## Recommendation (original pass)

Do not merge. Return to builder: the fix must also update `onAnalysisUpdate`'s
turn→nodeId lookup to use the same real-move-count index space as the now-corrected
`analyzeTurns` (e.g. an inverse of `turnIndexAtTreeIndex`, or store `moves`-derived
node list alongside `path` on the active-query entry), and the test suite must add a
response-ingestion-level assertion (mock a packet for a post-moveless-node turn, assert
the ledger records it under the correct `nodeId`) before this can be trusted.

---

## RE-REVIEW (2026-08-06) — head `0a7562ba`

**Verdict: ACCEPT.**

**(1) Alignment trace, same adversarial case.** `buildMovesAndTurnIndex` now also returns
`turnToNodeId: Map<number, NodeId>` — turn 0 → prefix root; turn k (real move count) →
the id of the node where the k-th real move was played (a moveless node is never a map
*value*). Minted once, at the same call site as `analyzeTurns`, threaded onto
`activeQueries` (`turnToNodeId` field replaces `path`), consumed exclusively at
`onAnalysisUpdate:1266` (`queryInfo.turnToNodeId.get(response.turnNumber)`). Re-ran my
original 5-node adversarial tree (`0:root 1:place 2:moveless 3:place 4:place`) through
the actual new logic: `turnToNodeId = {0→n0, 1→n1, 2→n3, 3→n4}` — turn2 now correctly
resolves to n3 (not the moveless n2), turn3 to n4 (not n3). The prior mis-keying is gone;
confirmed independently and matches the builder's own ingestion tests (below).

**(2) `analyzeActiveNode` moveless-cursor override — semantically right, not ambiguous.**
Every read-side consumer (`ToolbarEngineMetrics.vue:159`, `BoardWidget.vue:103`) looks up
`ledger.getRaw(rawKey, board.currentNodeId)` — keyed by the cursor's own nodeId,
unconditionally. The wire query for a moveless cursor requests turn `moves.length`,
which is the position after the cursor's most recent real-move ancestor — i.e. exactly
the board state displayed at the cursor (a moveless node inherits its parent's board).
So `turnToNodeId.set(moves.length, board.currentNodeId)` attaching that result to the
cursor's own id, not the ancestor's, is required for the read-side lookup to find it at
all — this also restores the pre-regression behavior (`analyzeTurns: [currentIdx]` /
`path[currentIdx]` always resolved to the cursor itself). Not ambiguous: correct.

**(3) New ingestion tests, red for the right reason.** Reverted only
`analysis-service.ts` to pre-repair (`3664c887`) while keeping the new test file at
`0a7562ba`, reran: both new ingestion tests fail with `expected undefined to be 111` /
`expected undefined to be 333` — the exact "nothing landed on the correct node"
signature, not a generic crash. Green again after restoring the repair. Matches this
review's own red-for-the-right-reason standard.

**(4) `queryInfo.path` deletion.** `grep -rn "\.path\["` across `frontend/src` returns
nothing; `grep -rn "turnNumber"` across `src/` shows no other site indexing a tree path
by wire turn number (telemetry, `wait-for-analysis.ts`, `enriched-accumulator.ts` all key
by `nodeId` already resolved elsewhere, or by `turnNumber` alone for progress/matching,
never as an array index). No stale reader left.

**(5) Gates, this session's own runs.** `vue-tsc --noEmit`: clean. `eslint` on the two
touched files: clean (0 errors). `npx vitest run` (full suite): **1106 passed, 4 skipped,
0 failed**. `npm run build`: succeeds.

**(6) Compose check vs current `next`** (head `5679cfc7`, batch-2 UI merges +
`FILES.md` row): merged clean into a throwaway branch, **no conflicts** — deleted, not
kept. Full suite on the composed tree: **1156 passed, 4 skipped, 0 failed**.

**Recommendation:** merge. All five review obligations from the rejection are
substantively closed: response ingestion uses the same authoritative map as the outbound
query (no second independently-derived index space), the moveless-cursor override is
verified correct against actual read-side call sites (not just asserted), the new tests
are witnessed red-for-the-right-reason, the stale `path` field has no orphaned reader,
and the composed suite is green.
