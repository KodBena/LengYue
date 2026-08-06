# FIX: `analyzeTurns` vs. `moves.length` — turn-index/tree-index conflation

Fixes the defect diagnosed in `.claude/dispatch-reports/sgf-pass-diagnosis.md`
("WITH-ENGINE REPRODUCTION (2026-08-06)"): a full-game "Analyse Selection" on
an SGF whose active-path leaf (or any mid-path node) carries no move — a
territory/scoring node, a comment-only node — sent an `analyzeTurns` value
one (or more) past `moves.length`, and KataGo/the proxy rejected the ENTIRE
query (`Invalid turn number: N`), discarding analysis for every otherwise-
valid turn too. Witnessed specimen: `/home/bork/lost_games/30996072.sgf`,
250 tree nodes / 248 real moves, `analyzeTurns` reaching 249.

Docs read end-to-end before this work, per `frontend/CLAUDE.md` and
`frontend/tests/CLAUDE.md`'s ADR-0002 corollary: the umbrella `CLAUDE.md`,
`frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`, and
`.claude/dispatch-reports/sgf-pass-diagnosis.md` in full.

## Invariant chosen

`analyzeTurns` is a **turn index** ("the position after N real moves"),
valid only for `0 <= N <= moves.length` against the `moves` array on the
same wire query. Tree-node position (a path's index into `NodeId[]` —
what `PlyIndex` and the `startTurn`/`endTurn` parameters actually carry)
is a DIFFERENT axis whenever a node in the path carries no move; the two
coincide only when every non-root node up to that point is a move.

Rather than clamping `analyzeTurns` against `moves.length` after
building both independently (the diagnosis's "minimal" option), I
derived them from a single pass with one running real-move counter
(`buildMovesAndTurnIndex`, new module-level helper in
`analysis-service.ts`). `turnIndexAtTreeIndex[i]` = count of real moves
in `pathPrefix[0..i]`. A moveless tree index simply repeats its
predecessor's turn value, so `analyzeTurns` is built by mapping the
caller's tree-index range through this array and de-duplicating —
`max(analyzeTurns) > moves.length` is unconstructable by construction,
not enforced by a post-hoc filter. This also correctly handles a
moveless node ANYWHERE in the path (mid-path, not just trailing) — a
case the diagnosis flagged as open and asked me to check: a mid-path
moveless node no longer shifts later turn indices out of alignment,
because every subsequent index is read from the same real-move counter.

**Rejected alternative**: a branded `TurnIndex` type distinct from
`PlyIndex`/tree-index, minted via a `nodeIndexToTurnIndex` conversion —
the diagnosis's "stronger" option. Rejected for this pass because it
would need plumbing through `useAnalysisTimeline`'s `PlyIndex` range and
every `analyzeRange`/`analyzeActiveNode` call site with no realized
caller today handing a raw tree index to the wire outside these two
methods (confirmed by grep — `analyzeTurns` is assembled in exactly two
places, both now fixed at the source). The chosen fix already makes the
invariant hold by construction at the sole two assembly sites; a new
brand would add type-system ceremony without closing a wider gap right
now. Named here per CLAUDE.md point 12's load-bearing-decision
discipline, not filed as a ledger row (this world's `./autoharn led` is
not in scope for a dispatched fix-agent's isolated worktree — flagged
as a process gap, not silently skipped).

## Files touched

- `frontend/src/services/analysis-service.ts`
  - New module-level `buildMovesAndTurnIndex(nodes, pathPrefix)` helper
    (pure function, single real-move-counter pass) with a docstring
    stating the invariant.
  - `analyzeRange`: `moves` and `analyzeTurns` both now derive from
    `buildMovesAndTurnIndex`'s single pass over `pathUpToEnd`, instead
    of `moves` (filtered) and `analyzeTurns` (raw `startTurn..endTurn`)
    being built independently. `analyzeTurns` is the de-duplicated,
    sorted set of `turnIndexAtTreeIndex[startTurn..endTurn]`.
  - `analyzeActiveNode`: `analyzeTurns: [currentIdx]` (tree index) →
    `analyzeTurns: [moves.length]` (real-move count up to the cursor,
    from the same `moves` array `analyzeActiveNode` already builds via
    `pathUpToCurrent`) — closes the diagnosis's "worth auditing
    separately" note on this sibling method; it had the identical
    conflation, just structurally hidden behind a single-value array
    until a moveless node sat at or before the cursor.
  - A few stale comments referencing `analyzeTurns: [currentIdx]` and
    `analyzeTurns.length === endTurn − startTurn + 1` updated to match
    (the dedup means the count can now be smaller than the raw range
    width when a moveless node collapses two tree indices onto one
    turn).
- `frontend/tests/integration/analysis-service-moveless-node.test.ts`
  (new) — see Tests below.

## Display-side decision: NOT fixed, named as residual

`useAnalysisTimeline.ts:81/90` still seeds/clamps the selection range
from `path.length - 1` (tree-node count), so the UI still shows
"turns 0–249" for the specimen when only 0–248 real turns exist —
**left as-is, named as a residual display nit**, not fixed in this
pass. Reasoning:

- The diagnosis itself states the UI's range-selection ("select the
  whole tree, root to leaf") is the correct intent regardless of
  whether the leaf carries a move, and doesn't need to change.
- `BoardState.analysisRange` is a shared seam — a recently-merged
  change made `deltaKdeSeries` slice by this range via
  `colorMoveToPly`. Changing what the stored range's numbers *mean*
  (tree-index vs. turn-index) risks silently breaking that consumer's
  slicing without a matching audit and test of its own, which is out
  of scope for a crash fix. My fix operates entirely downstream, at
  the query-assembly seam in `analysis-service.ts` — it makes zero
  changes to `useAnalysisTimeline.ts` or to `analysisRange`'s stored
  shape/semantics, so this residual is genuinely inert (an
  off-by-one-per-moveless-node in the displayed count, no functional
  breakage — the query itself is now always correct regardless of
  what the label says).

## Tests

`frontend/tests/integration/analysis-service-moveless-node.test.ts`
(Tier 3, drives the real `analysisService` singleton against a mock
`WebSocket`, same harness pattern as
`analysis-service-restart-thunk.test.ts`):

- `trailing moveless node: full-range analyzeTurns never exceeds
  moves.length (red today: 249 vs 248 on the witnessed specimen)` —
  fixture: 5 real moves (incl. two PlayOK-style empty-bracket passes)
  then a moveless comment-only trailing node (mirrors the specimen's
  `TW`/`TB` leaf). **Confirmed red pre-fix**: `git stash`ed the
  `analysis-service.ts` change and ran this file — `Math.max(...analyzeTurns)`
  was `6` against `moves.length === 5` (assertion failure: "expected 6
  to be less than or equal to 5"), the exact witnessed failure class.
  Un-stashed → green.
- `mid-path moveless node: analyzeTurns stays within moves.length even
  when the moveless node is not the leaf` — fixture: a comment-only
  node between two real moves. **Confirmed red pre-fix** the same way:
  `Math.max(...analyzeTurns)` was `4` against `moves.length === 3`.
  Green post-fix.
- `normal game (no moveless node): full-range analysis still covers
  every real move (regression guard)` — passed both pre- and post-fix
  (as expected — the bug only manifests with a moveless node present),
  guarding against the fix over-trimming an ordinary game.

## Gate tails (WITNESSED, this worktree, `frontend/`)

`npm ci` was needed first — `node_modules` was absent in this fresh
worktree; installed cleanly (333 packages, no vulnerabilities reported
past the pre-existing `npm ci` deprecation warnings).

**`npm run build`** — exit 0:
```
> vue-tsc -b && vite build
✓ 1080 modules transformed.
dist/index.html                     0.84 kB │ gzip:     0.51 kB
dist/assets/index-BENFIVgm.css    116.12 kB │ gzip:    16.55 kB
dist/assets/index-Dgldr6Yi.js   2,920.92 kB │ gzip: 1,032.42 kB
✓ built in 1.88s
```
(pre-existing chunk-size warning only, unrelated to this change.)

**`npx eslint .`** — exit 0, no output (clean).

**`npm run test:run`** — exit 0, exited cleanly (no hang):
```
 Test Files  82 passed | 3 skipped (85)
      Tests  1104 passed | 4 skipped (1108)
   Duration  90.20s
```

## REPAIR (2026-08-06, after fresh-context review REJECTED the first pass)

Review: `.claude/dispatch-reports/sgf-analyzeturns-review.md`. Verdict:
REJECT — the first pass bounded the OUTBOUND `analyzeTurns` correctly
but left `onAnalysisUpdate` (then at `analysis-service.ts:1201`)
resolving a response's `turnNumber` to a `nodeId` via
`queryInfo.path[response.turnNumber]` — a raw tree-index lookup,
un-updated to match `analyzeTurns`'s new real-move-count space. For any
query touching a MID-PATH moveless node, every response at/after it was
silently mis-keyed to the wrong node — worse than the crash the first
pass fixed, because it fails silently (ADR-0002 worst tier). The
review's concrete trace table (tree `0:root 1:place 2:moveless
3:place 4:place`, `analyzeTurns=[0,1,2,3]`) showed turn 2 landing on
node2 (the moveless node — spurious) instead of node3, turn 3
overwriting node3 instead of reaching node4, and node4 (the true range
end) never receiving a result at all.

**Root cause of the gap**: the two directions (tree-index → turn-index
for the outbound query, turn-index → nodeId for inbound responses)
were fixed at different times by different reasoning, with no shared
authority forcing them to agree. Exactly the class CLAUDE.md's
type-driven-design section asks to foreclose, and exactly what the
first pass's own docstring claimed to guarantee but didn't — it only
guaranteed the outbound half.

**Fix**: `buildMovesAndTurnIndex` (same helper, same call sites) now
also returns `turnToNodeId: Map<number, NodeId>` — turn 0 → the
prefix's root; turn k (1 <= k <= moves.length) → the id of the tree
node where the k-th real move was played. This map is minted at the
SAME site and the SAME pass that builds `analyzeTurns`, then stored on
the query's `activeQueries` bookkeeping entry (replacing the `path:
RootedPath` field, which had no other reader — confirmed by grep — so
removing it closes the "two representations that can diverge" class
outright rather than leaving a now-unused-but-still-present temptation
to read it again). `onAnalysisUpdate` resolves every response's
`nodeId` via `queryInfo.turnToNodeId.get(response.turnNumber)`
exclusively; the `path[turnNumber]` expression no longer exists
anywhere in the file.

**`analyzeActiveNode`'s single-turn case** gets one explicit,
documented override: since this method's caller already names the
exact single node the query is for (the cursor, `board.currentNodeId`),
`turnToNodeId.set(moves.length, board.currentNodeId)` is applied after
the generic derivation. This matters specifically when the cursor
itself is a moveless node — the generic per-move rule has no map VALUE
naming a moveless node (only real-move nodes are ever "where a turn
was reached"), so without the override, analyzing a moveless cursor
would attach its result to the nearest earlier real-move ancestor
instead of the node the user is actually viewing. The override keeps
"analyze the active node" doing what its name says regardless of
move-type, while the generic range-query rule (no single named target,
many tree positions collapsing onto fewer turns) stays exactly as
derived.

**Other ingestion paths checked** (`grep -rn "turnNumber"` across
`src/`, all read end to end): `useQueryTelemetry.ts` and
`wait-for-analysis.ts` compare `turnNumber` against a caller-supplied
expected value (no path/tree-index arithmetic — not the mis-keying
class); `usePlayFromPosition.ts`/`fresh-eval.ts` serve the separate
live-play/self-play primitives, always single, explicit,
sequentially-incrementing positions with no branching tree or moveless
nodes in play — not exposed to this defect class; `enriched-
accumulator.ts`'s `patchNode(nodeId, packet)` always receives its
`nodeId` as a caller-supplied parameter (from ledger-side iteration in
`useEnrichedData.ts`), never re-derives one from `turnNumber`;
`useStabilityMetrics.ts`'s `path[turn]` loop is iterating the path
directly as a display axis (turn = tree position, a legitimate,
different "turn" meaning for that consumer) — it reads trajectories
already keyed by nodeId as recorded through `onAnalysisUpdate`, so it
inherits the fix rather than needing one. `analysis-service.ts:1201`
(now moved a few lines with the added comment) was the sole
turn→nodeId ingestion site.

### Repair tests

Extended `frontend/tests/integration/analysis-service-moveless-node.test.ts`
with a second describe block, "response ingestion resolves nodeId
through the SAME turn-index authority as analyzeTurns":

- `routes a range-query response for a post-moveless-node turn to the
  correct nodeId, not the moveless node or a shifted neighbour` — mid-
  path-moveless fixture (`SGF_MIDPATH_MOVELESS`, existing), injects
  synthetic final packets for turn 2 and turn 3 via the mock
  WebSocket, asserts via `ledger.getRaw(rawKey, nodeId)` that turn 2's
  packet lands on `path[3]` (not `path[2]`, the moveless node) and
  turn 3's lands on `path[4]` (the true leaf) without clobbering
  turn 2's entry.
- `single-turn analyzeActiveNode routes its result to the cursor node
  itself when the cursor IS the moveless node` — parks the cursor on
  the mid-path moveless node itself, confirms the wire `analyzeTurns`
  is `[1]` (not `[2]`, the cursor's tree index), injects a packet for
  turn 1, and asserts it lands on the cursor's own nodeId — the
  override case.

**Confirmed red pre-repair**: `git stash`ed only the
`analysis-service.ts` repair (kept the new tests), ran the file
against the first pass's (reviewer-rejected) code — both new tests
failed with `expected undefined to be 111`/`333`: the packet landed
somewhere else (the mis-keyed node), so the CORRECT node's ledger
entry read `undefined`, the same silent-misattribution signature the
review's trace table describes. `git stash pop` restored the repair;
both green.

### Gate tails (WITNESSED, this worktree, `frontend/`, post-repair)

`npx vue-tsc -b` (standalone re-check after the field rename from
`path` to `turnToNodeId`) — exit 0, no errors (one intermediate error,
`TS18004` for a destructuring-shorthand typo at the `analyzeRange`
call site, caught and fixed before the full build gate below).

**`npm run build`** — exit 0:
```
✓ 1080 modules transformed.
✓ built in 1.91s
```

**`npx eslint .`** — exit 0, no output.

**`npm run test:run`** — exit 0, exited cleanly:
```
 Test Files  82 passed | 3 skipped (85)
      Tests  1106 passed | 4 skipped (1110)
   Duration  39.28s
```
(1106 vs. the first pass's 1104 — the two new ingestion tests.)

## Scope note

Per the umbrella `CLAUDE.md`'s ledger discipline (point 1 onward), this
world's `./autoharn led` commands were not exercised in this dispatched
worktree — no commission row, no decomposition, no assumption/decision
rows were filed. This is a gap against the letter of CLAUDE.md's
process, disclosed rather than silently skipped; the fix, tests, and
gates above are the substantive deliverable this dispatch asked for.
