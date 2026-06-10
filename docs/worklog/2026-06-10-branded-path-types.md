# Worklog — Branded variation-path types + the deferred call-site audit (2026-06-10)

> Audit trail for work-status item `branded-path-types`, executing
> §3.4 of the 2026-06-10 history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`);
> branch `bork/refactor/branded-path-types`. This arc executes the
> match postmortem's §5b
> (`docs/notes/postmortem/postmortem-match-pre-existing-variation-2026-05.md`):
> the call-site audit it deferred as "the deliverable", plus the
> "optional intensification" — branded `RootToLeafPath` /
> `RootToCurrentPath` — whose recorded N=3 deferral threshold the
> audit argued met (three shipped fixes in the May match arc, a
> fourth audit-found instance, a documented latent twin). Precedent:
> `dd3b85e`, the prior zero-runtime brand retrofit (brands erase at
> runtime; cited as precedent only, no perf claims per ADR-0009).

## The brands

`src/types/game.ts:75-88`, next to `NodeId` per the item description
("mint brands next to NodeId in the identifier vocabulary, NOT
engine/"):

- **`RootToLeafPath`** = `Brand<NodeId[], 'RootToLeafPath'>` — root →
  the active variation's leaf. Sole producer
  `getActiveVariationPath` (`engine/util.ts:90` mint), plus two
  justified vacuous empty-path mints in `useVariationPath.ts`.
- **`RootToCurrentPath`** = `Brand<NodeId[], 'RootToCurrentPath'>` —
  root → an explicitly-named position. Producers `getPath`
  (`engine/navigator.ts:31` mint) and the new named prefix
  conversion `rootToCurrentPrefix(path, indexInclusive)`
  (`engine/navigator.ts:47` mint) — array ops (slice/concat/map)
  erase the brands, so the named conversion is the sanctioned
  re-brand for prefixes; an inline `as` at a call site is not.
- **`RootedPath`** = the named union, for the one consumer that
  genuinely accepts either shape (`analyzeRange`, which takes
  explicit `startTurn`/`endTurn`) — the explicit alternative to
  silently widening a parameter back to `NodeId[]`.

The brands are on the **array**, not the elements; either brand
remains assignable to plain `NodeId[]` (consumers that merely iterate
keep compiling), while the two brands are mutually unassignable.
Tree-positional (B2 within the `[B3]`-tagged game module), not
Go-bound — a fork that keeps a tree skeleton keeps these shapes.

### Placement note (deviation record, ADR-0002)

Two wrinkles in the commissioning text are resolved here, loudly:

1. The commission's parenthetical mapped *getPath → RootToLeafPath;
   getActiveVariationPath → RootToCurrentPath*. That is **reversed**
   relative to the postmortem's §4 semantics (and the audit appendix
   p2's own evidence rows): `getActiveVariationPath` walks to the
   **leaf**; `getPath` walks root → an explicit **target**. The
   semantically-correct mapping is implemented; the brand names would
   otherwise be lies.
2. The commission gestured at `types/ids.ts` territory ("path brands
   over agnostic tree positions are agnostic") with the module header
   as the tiebreaker. The headers decide **`types/game.ts`**: `ids.ts`
   declares itself the home of brands that *survive a domain fork*
   and explicitly sends game-coupled brands to `game.ts`; a brand
   over `NodeId[]` cannot outlive `NodeId` (declared `game.ts:21`),
   and homing it in `ids.ts` would invert the module DAG (`ids.ts`
   importing `game.ts`) and break the fork story the split was made
   for. The item description's own words — "next to `NodeId`" —
   agree.

## Per-site audit table (the §5b deliverable)

Every file referencing `getActiveVariationPath` at HEAD (16 under
`src/` including the producer and two comment-only mentions, plus 2
test files). "Shape needed" names what the consumer actually wants,
per the postmortem's two questions: *"what does the active line as a
whole look like?"* (root→leaf) vs *"what moves has the engine seen /
what position index is this?"* (root→current).

| # | File : site | Shape needed | Action taken |
|---|---|---|---|
| 1 | `engine/util.ts` — `getActiveVariationPath` (producer) | — | Returns `RootToLeafPath`; mint cast + justification at `:90`; docstring names the sibling and the confusion class. |
| 2 | `engine/navigator.ts:153` — `findPlacementOnActivePath` | root→leaf | Correct as-is (searches **forward** past the cursor for later placements). Brand flows; no change. |
| 3 | `services/analysis-service.ts` — `analyzeFullGame` | root→leaf | Correct ("full game" = whole line). Redundant `as NodeId[]` retired; shape comment added. |
| 4 | `services/analysis-service.ts` — `analyzeRange` (param) | **either** | Param retyped `NodeId[]` → `RootedPath` (the named-union acceptor); internal prefix slice now `rootToCurrentPrefix(fullPath, endTurn)`; `activeQueries.path` field retyped `RootedPath` with an indexing note. |
| 5 | `services/analysis-service.ts` — `analyzeActiveNode` | root→leaf **and** root→current | Keeps root→leaf for the turn-index mapping (`analyzeTurns: [currentIdx]`, packet→node lookup); the wire move-list prefix now goes through `rootToCurrentPrefix(fullPath, currentIdx)`. Redundant `as NodeId[]` / `as NodeId` ×2 retired. |
| 6 | `components/ReviewSessionPanel.vue:114` — intermission-chart click | root→leaf | Correct (targets are **forward** of the post-rewind cursor: `startIdx + 2(k-1)`). No change. |
| 7 | `composables/review/useReviewSession.ts` — `loadCard` | root→leaf | Correct (fast-forward to the card SGF's mainline end — the card-load leaf). Redundant `as NodeId` retired; shape comment added. |
| 8 | `composables/review/useReviewSession.ts` — `processUserMove` s_0 index | **root→current** | **Replaced**: `getActiveVariationPath(board).indexOf(current)` → `getPath(board.nodes, board.currentNodeId).length - 1` (equivalent value, honest shape). Redundant `as NodeId` ×2 retired. |
| 9 | `composables/review/useReviewSession.ts` — `processUserMove` `newPath` | **root→current** | **Replaced**: `getActiveVariationPath(nextBoard)` → `getPath(nextBoard.nodes, nextBoard.currentNodeId)`. Identical in the universal review case (a fresh user move makes s_1 the leaf); diverges only if `applyGoMove` dedups into a pre-existing child with deeper variation, where the old shape sent trailing future moves the analyzed `[s_0, s_1]` range never asked about — the latent Bug-B-shaped residue, now closed. Feeds `analyzeRange` (`RootedPath` ✓) and the scoring seam. |
| 10 | `engine/analysis/review-scoring.ts` — `scorePerMoveDelta` (param) | **root→current** | Param retyped `readonly NodeId[]` → `RootToCurrentPath` (s_1 is the current position; a root→leaf line would scan past the analyzed range). This is the per-move-scoring leaf the brands are confined to — the review **state machine** itself stores no path-typed state (only `startingNodeId`), so its surface stays path-type-free per the item's reshape. |
| 11 | `composables/board/useVariationPath.ts` | root→leaf | Return retyped `ComputedRef<NodeId[]>` → `ComputedRef<RootToLeafPath>`; two justified empty-path mints. Downstream chart-substrate params retyped to match (see below). |
| 12 | `composables/board/usePlayFromPosition.ts:333` — `playEngineMoves` stop condition | root→leaf | Correct by documented contract (`untilPathLength` counts the **active path**, pre-existing forward nodes included — contrast the match's per-iteration `numMoves`, postmortem Bug A). Shape comment added. |
| 13 | `composables/board/usePlayFromPosition.ts` — `currentTurnNumber` | **root→current** | **Replaced** with `getPath(...).length - 1`: "what turn is the current position at?" was answered with the *leaf's* depth. Divergence was cosmetic-only (the value labels query-id strings), but it was the brand-class confusion. |
| 14 | `composables/library/useLibraryPreview.ts:143` | root→leaf | Correct (the scrubber spans the whole game). Redundant `as NodeId` ×2 retired. The exposed `variationPath` ref deliberately stays `readonly NodeId[]` (its empty-state writes would need mints); the shape is recorded at the fill site. |
| 15 | `composables/perf/scenarioContext.ts:163` | root→leaf | Correct (perf scenarios span the line; explicit bounds otherwise). Redundant `as NodeId[]` retired. |
| 16 | `composables/perf/useJankTest.ts:286,429` | root→leaf | Correct (forward jumps along the line; total-ply sanity count). Redundant `as NodeId` retired. |
| 17 | `composables/cards/useCardThumbnail.ts:54` | root→leaf | Correct (thumbnail renders the final position). Redundant `as NodeId` retired. |
| 18 | `composables/sgf/useSgfLoader.ts:56` | root→leaf | Correct (opt-in "load at last node"). No change. |
| 19 | `composables/sgf/loadIntoBoard.ts:63` | root→leaf | Correct (walk cursor to the loaded line's leaf). Redundant `as NodeId` retired. |
| 20 | `composables/useNavigation.ts:41,52` — `home` / `end` | root→leaf | Correct (`end` is the leaf by definition; `home` reads `path[0]` = root — `draft.rootNodeId` would be cheaper, left alone per ADR-0004). No change. |
| 21 | `composables/analysis/useAnalysisProjection.ts:23` | — | Comment-only mention; no call. No change. |
| 21b | `engine/sgf-writer.ts` — `serializeActivePath` | **root→current** | **Found by the adversarial pass (appendix), not the caller-based worklist** — a hand-rolled root→current walk whose NAME says "active path" (root→leaf vocabulary): the exact confusion class, latent in a producer. The implementation shape is correct for its load-bearing consumer (`useMinting.prepareDraft` mints a card from the position the user is looking at, excluding forward variation); the construction now goes through the branded `getPath`, which also replaces the old walk's silent `break`-on-missing-node (a truncated-SGF silent-corruption path on a corrupt tree) with getPath's fail-loud throw (ADR-0002). The misleading **name** is left for the maintainer: the symbol is exposed on the `window.Writer` console-debug surface (`main.ts:26`), and renaming an operator-facing handle inside a refactor PR is a sign-off matter. |
| 22 | `tests/e2e/review-session-harness.test.ts:299` | root→leaf | Correct (snapshots the post-move line for per-path delta diagnostics). Redundant `as NodeId[]` retired. |
| 23 | `tests/unit/composables/perf-fixtures.test.ts:32` | root→leaf | Correct (replays the fixture to its leaf). No change. |

**Producer-side completeness check** (added after the adversarial
pass): the caller-based worklist (files referencing
`getActiveVariationPath`) cannot see *hand-rolled* path walks. An
independent enumeration (`rg "unshift"` + `.parent`-loop sweep) found
exactly four root-anchored path constructions in `src/`: the two
branded producers, the importer-less `useActivePath.ts` (recorded in
IDENTIFIERS.md erosion (a)), and `sgf-writer.ts::serializeActivePath`
(row 21b — taken). The remaining `.parent` loops (`BoardWidget`
`currentMoveNumber` / `moveNumbersByCoord`, `StatusBar.moveNumber`,
`PlayEngineModal.getMoveNumber`, `useTreeExpansion`'s ancestor
auto-expand) are cursor-anchored counters/walks whose root→current
intent is explicit in their docs and which never materialize a path a
consumer could mis-shape — audited, no change.

**The explicit-position rule** (the half the brands alone cannot
catch): every replaced site (8, 9, 13) now derives its answer from
`getPath(nodes, <explicit node>)` — the position is a parameter, not
a read of cursor state buried inside a leaf-walk. `getPath` and
`rootToCurrentPrefix` both take the position explicitly by signature.
No audited site was found reading the *global* cursor
(`store.activeBoard`) where it should take a position parameter — the
one standing offender, `useActivePath.ts` (reads `activeBoard`,
hand-rolls `getPath`'s walk as `string[]`), has **no importers under
`src/`** and was deliberately left untouched; its IDENTIFIERS.md
erosion-(a) entry now records both axes honestly.

### Downstream threading (beyond the 16-file worklist)

`useVariationPath`'s brand made six chart-substrate params honest in
the same stroke — all are fed exclusively by it: `useAnalysisTimeline`,
`useChartNavigation`, `useEnrichedData`, `useStabilityMetrics`,
`useStabilityCrossCorrelations` (`Ref<NodeId[]>` → `Ref<RootToLeafPath>`)
and `useTriangularHeatmap` (`Ref<string[]>` → `Ref<RootToLeafPath>`,
which also retired its per-element `as NodeId` re-cast). The review
state-machine surface (`useReviewSession`'s store schema,
`ReviewSessionData`, `analyzeRange`'s caller signature) carries no
new path types — the brands stop at the card-load and per-move-scoring
leaves per the commission.

## The fixture (the ec4cb3d gap)

`tests/unit/engine/path-shapes.test.ts` (tier-1, 4 tests): loads an
SGF whose tree extends 5 plies past the cursor (with a sibling
variation so `activeChildIndex` is exercised), navigates to the leaf,
then **back** — the `current != leaf` state no prior fixture ever
constructed (postmortem §2: "current == leaf is universally true at
the start of every e2e fixture"). Pins: the immediate divergence at
load; exact coincidence at the leaf; strict-prefix divergence after
backward navigation; and `rootToCurrentPrefix(line, i) ≡
getPath(nodes, line[i])` for every index.

## Known residue (checked, recorded, not fixed)

**The `playEngineMoves` latent twin** (cursor-conflation; the item
description's "deep-clone only in `playEngineMatch`"). Verified real
at HEAD: `usePlayFromPosition.start` passes the reactive store board
into `playEngineMoves`, which does **not** deep-clone it, and the
product consumer mirrors each applied board back wholesale via
`updateBoardState` (`store/index.ts:513-526` replaces
`store.boards[index]` with the loop's own object) — so the loop's
cursor shares object identity with the store and user navigation
mid-run moves where the next query is built from. **Not taken**: the
brand threading does not make this fix trivial. A clone at the top
alone is undone by the first wholesale mirror (the store and the loop
re-converge on the same object graph); the real fix is the match's
`MatchMoveApplied` delta-emission contract (2026-05-16 arc) applied
to `playEngineMoves`, which changes the consumer contract — its own
arc. Recorded in a `KNOWN LATENT TWIN` block on `playEngineMoves`'
docstring so the site itself warns, and here against the item's note.
The per-move queries themselves are unaffected by the path-shape
class (`buildAnalyzeQuery` was already root→current, PR #244).

## What this arc does NOT close

- The `playEngineMoves` cursor-conflation twin (above) — recorded,
  not fixed; no work-status item exists for it yet (it rides the
  `branded-path-types` item's note).
- `useActivePath.ts` — importer-less unbranded root→current
  duplicate; erosion (a) updated, file untouched.
- `useLibraryPreview`'s exposed `variationPath` ref stays plain
  `readonly NodeId[]` (empty-state writes); shape recorded at the
  fill site.
- Rigor-proportionality (postmortem §5c) — out of scope here, as it
  was for the audit item.
- The `serializeActivePath` **rename** (row 21b) — the construction
  fix shipped; the name still says "active path" while meaning
  root→current. Declined here with a concrete cost, not a mood: the
  symbol is an operator-facing handle on the `window.Writer`
  console-debug surface (`main.ts:26`), and renaming that inside a
  refactor PR bypasses the sign-off such surfaces get. Maintainer
  decision; mechanical once made (4 reference sites).

## Verification

`npm run build` (vue-tsc -b + vite) clean; `npx eslint .` exit 0;
`npm run test:run` 882 passed / 4 skipped (the 4 new path-shape tests
included). No runtime behaviour change outside the three named sites:
the two divergence-only derivation switches (table rows 9 and 13,
argued above) and row 21b's corrupt-tree posture change
(silent-truncate → fail-loud, ADR-0002-aligned, unreachable on
well-formed state). Brands erase at runtime (ADR-0009: no perf
claims — `dd3b85e` cited as retrofit precedent only).

## Cross-references

- `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` §3.4 —
  the commissioning recommendation (fork **R**).
- `docs/notes/postmortem/postmortem-match-pre-existing-variation-2026-05.md`
  §4/§5b — the bug-class record and the deferred audit this executes.
- `docs/worklog/2026-05-15-match-pre-existing-variation-fixes.md` —
  the original fix arc whose "What's deferred" this discharges.
- `docs/worklog/2026-05-16-match-cursor-independence.md` — the
  deep-clone / delta-emission arc whose `playEngineMoves` residue is
  re-recorded above.
- `docs/worklog/2026-06-10-review-scoring-named-seam.md` — the seam
  (PR #383) this arc threads `RootToCurrentPath` into.
- `frontend/IDENTIFIERS.md` — the new "Branded path shapes" group;
  erosion (a) updated.

## Appendix — hack-rationalization-detector run (verbatim record)

Recorded per the standing verbatim-appendix discipline. **Frame
caveat, stated loudly (ADR-0002):** this run could not be executed by
a separate agent — the executing environment has no subagent-spawn
tool — so it ran in the skill's weaker sanctioned mode
(*justification-as-object-of-suspicion*), by the diff's own author.
The deterministic halves (the tells scanner and the independent
producer enumeration) are script outputs and bite regardless of
frame; the judge half is correspondingly discounted. A true
out-of-frame re-run is the maintainer's to commission if wanted —
this caveat exists so nobody mistakes the below for one.

### Commission (the skill arguments, verbatim)

> Review the uncommitted diff on branch
> bork/refactor/branded-path-types in
> /home/bork/w/omega/.claude/worktrees/agent-a70022c64f85274a0
> (frontend sub-project). The change mints branded path types
> RootToLeafPath/RootToCurrentPath/RootedPath in src/types/game.ts,
> threads them through producers getActiveVariationPath/getPath and
> ~20 call sites, replaces three derivations with getPath
> (useReviewSession s_0_idx + newPath; usePlayFromPosition
> currentTurnNumber), adds a rootToCurrentPrefix conversion, retypes
> six chart-composable params, and adds a tier-1 divergence test. Two
> behavior-relevant claims to distrust: (1) the useReviewSession
> newPath switch from getActiveVariationPath(nextBoard) to
> getPath(nextBoard.nodes, nextBoard.currentNodeId) is claimed
> identical in the universal review case and a correctness tightening
> in the dedup case; (2) the playEngineMoves cursor-conflation twin
> was recorded-not-fixed with the claim that a clone is insufficient
> because updateBoardState re-converges object identity. Also
> distrust: the stop-at-the-seam scoping (review state machine left
> path-type-free), the empty-path double-cast mints in
> useVariationPath, and whether any of the 16 audited call sites was
> mis-shaped in the table.

### Artifact (verbatim)

```
## Hack-rationalization review: branded-path-types (uncommitted, bork/refactor/branded-path-types)

FRAME CHECK: NOT out-of-frame — no subagent tool exists in this
environment; ran in the skill's second sanctioned mode
(implementer's justification treated as the object of suspicion).
Judge-half discounted accordingly; script halves unaffected.

GENERAL FIX:   Every root-anchored NodeId path in the SPA is
constructed by a branded producer (getActiveVariationPath →
RootToLeafPath; getPath / rootToCurrentPrefix → RootToCurrentPath),
so shape confusion is a compile error at every consumer and no
hand-rolled walk can carry a name/shape lie.
PATCH SHIPPED: Brands minted at the two producers + named prefix
conversion + named union; 16-file caller worklist audited and
threaded; three derivations switched to getPath; six chart params
retyped; tier-1 divergence fixture added. After the producer
enumeration (below): serializeActivePath's hand-rolled walk replaced
with getPath. NOT shipped: useActivePath (importer-less duplicate,
recorded); playEngineMoves cursor-conflation twin (recorded);
serializeActivePath rename (recorded, maintainer surface).
DOWNGRADE:     (a) worklist was CALLER-based ("16 files calling
getActiveVariationPath") — a methodology inherited from the audit
item's own text; it structurally cannot see hand-rolled producers.
Discharged by re-deriving producers from code (unshift + .parent
sweep) and taking the one real finding. (b) playEngineMoves twin:
"brand threading doesn't make it trivial" — verified concrete:
updateBoardState (store/index.ts:513-526) re-converges object
identity after the first wholesale mirror, so a clone is
insufficient and the real fix is the match's delta-emission
consumer contract — a contract change, genuinely a separate arc.
(c) serializeActivePath rename: window.Writer debug-surface handle;
sign-off cost named, not a mood. (d) review state machine left
path-type-free: commission-mandated reshape, not implementer
discretion.
VERDICT:       narrower-but-justified
WRITER DELTA:  claimed 2 producers (getActiveVariationPath, getPath)
vs enumerated 4 root-anchored path constructions (those two +
useActivePath.ts:14-25 [importer-less, recorded in IDENTIFIERS
erosion (a)] + sgf-writer.ts:73-85 serializeActivePath [MISSED by
the caller-based table; name says root→leaf vocabulary, walk is
root→current — the exact confusion class, latent in a producer;
construction now fixed through getPath, name left to maintainer]).
Cursor-anchored counting walks (BoardWidget ×2, StatusBar,
PlayEngineModal, useTreeExpansion) inspected and excluded — they
never materialize a consumable path.
RUNTIME:       Partially verified. The brand legs are compile-time
(vue-tsc + 882 tests green; the new tier-1 fixture reproduces the
current != leaf state and pins the divergence at runtime). The two
derivation switches were verified equivalent by construction
argument + the fixture's prefix-equivalence pin, NOT by a live
review-session repro of the dedup case — no test constructs
applyGoMove-dedup-into-deeper-variation inside a review session.
The playEngineMoves twin is recorded as LATENT, not "fixed": no
repro was run; the claim rests on code reading of updateBoardState.

TELLS (Step 1): 1 co-occurrence hit (diff line ~85): the
IDENTIFIERS.md erosion-(a) text naming useActivePath as an unbranded
root→current producer "left untouched". Downgrade demanded:
discharged — the file has zero importers under src/ (rg-verified),
and IDENTIFIERS.md's own preamble forbids refactoring off the map's
back ("maintainer-directed work"). Cost is real (unsanctioned
deletion of a file), not a discipline-word. Worklog scan: 0
co-occurrence tells.

VERDICT: narrower-but-justified
WHY: The named-general fix (all construction through branded
producers) was not silently downgraded — the producer-enumeration
gap it found was closed in-arc (serializeActivePath), and each
remaining narrowing carries a concrete, checkable cost (importer-less
file + map discipline; consumer-contract change; operator-facing
rename surface). No per-writer gate was introduced anywhere; the fix
is one invariant over producers, not N patches over callers.

FINDINGS BEYOND VERDICT:
  - Nothing prevents the NEXT hand-rolled path walk from recurring:
    the brands make confusion a compile error only for paths that
    flow through the branded producers. A lint (e.g. flag
    `unshift`-collecting `.parent` loops outside engine/navigator.ts
    / engine/util.ts) would mechanize the producer-side invariant;
    candidate rider for the open cast-hygiene-lint item. Recorded
    here, not filed (todo DB is read-only for this worker).
  - The review-session dedup divergence (table row 9) has no
    runtime repro: no test drives applyGoMove into a pre-existing
    deeper child DURING a review session. The tier-1 fixture pins the
    path-API divergence, not the review-flow consequence. If the
    maintainer wants the row-9 claim runtime-proven, that test does
    not yet exist.
  - The empty-path double-casts in useVariationPath
    (`[] as NodeId[] as RootToLeafPath`, ×2) are justified-commented
    but are still two open-coded mints outside any producer; a
    third occurrence would warrant an EMPTY_PATH constant next to
    the brands' producers.
  - useMinting depends on serializeActivePath's root→current shape
    for card content; before this arc that dependency was carried by
    an unbranded hand-rolled walk with a silent-truncate failure
    mode. The fix shipped, but the episode shows the audit item's
    own worklist definition ("16 files call getActiveVariationPath")
    under-specified the class — worth knowing when reading the
    audit's other caller-counted items.
```

License: Public Domain (The Unlicense).
