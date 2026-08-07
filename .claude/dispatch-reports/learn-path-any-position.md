# Learn Path — anchor resolution generalized to any board position

Commission (ledger row 832, verbatim): "You see a position in a game and go
'hey, I want to learn this', press 'learn path' and are greeted with a door
slamming shut." The two preconditions in
`frontend/src/composables/cards/useLearnPath.ts` (~line 442: board must have
`sourceCardId`; ~line 449: cursor must be at board root) were REJECTED v1
narrowing — dissolved in this change.

Branch: `worktree-agent-ac06eda9f41b0ccbe` (worktree of the LengYue repo).
Final commit sha: `ab1af2a4` (see the "Commit" section below).

## What changed

- `frontend/src/composables/cards/useLearnPath.ts` — new `resolveAnchor(boardId, tag)`
  replaces the two rejected preconditions. It resolves the board's CURRENT
  CURSOR POSITION (whatever node the cursor is at, on any board) to a
  `CardId`:
  1. **Existing card** — `useKnownPositions.checkForDuplicate(draft.raw_content)`
     hashes the position via the stateless backend endpoint and looks it up
     in the boot-hydrated known-positions map. A hit anchors there, no mint.
  2. **No existing card** — mints a fresh anchor through the REAL mint path
     (`useMinting.prepareDraft` + `commitMint`), tagged with the caller's
     context tag. `commitMint` already calls `rememberMintedCard`
     internally, so the fresh anchor is immediately known-positions-visible.
  The two rejected preconditions (`sourceCardId` required; cursor pinned at
  root) are deleted outright, not softened to a warning.
  `LearnPathPreconditionError` stays in use for the genuinely-impossible
  cases: invalid `depth`/`topK`, empty tag, board not found.
- `frontend/src/locales/en.json` — `learnPath.intro` no longer claims "Requires
  the cursor at this card's own position"; states the generalized behavior
  instead. `ja.json`/`ko.json`/`zh-CN.json` carry no `learnPath.*` keys at
  all (grepped — nothing to change there).
- `frontend/tests/integration/useLearnPath.test.ts` — the two
  precondition-refusal tests are REPLACED (not merely deleted) by a new
  `describe` block with four tests covering the ratified design's outcomes
  (see below). Every pre-existing test that relied on the old
  `board.sourceCardId` fast path was updated to seed a matching
  known-position entry (`seedAnchorKnownPosition`) so the new generalized
  resolution mechanism still finds the same anchor without minting a
  duplicate — this is fixture adaptation to the new mechanism, not an
  assertion change; the fast path's OBSERVABLE behavior is unchanged.

## Why the mechanism is sound (serialization-match argument)

The commission's stated failure mode to design against: a hand-rolled
second serialization of "the current position" that silently diverges from
what a manual mint would produce, so the duplicate-check hash never matches
a hash a manual mint recorded.

`resolveAnchor` does not hand-roll a serialization. It calls
`useMinting.prepareDraft(boardId)` — the exact function a manual mint (the
Mint modal) calls — and uses its returned `draft.raw_content` for BOTH the
duplicate check (`checkForDuplicate(draft.raw_content)`) AND, on a miss, the
mint payload itself (`{...draft, tags: [tag]}` passed to `commitMint`).
`prepareDraft` internally calls `serializeActivePath(board)`, which per its
own documented shape note serializes root→cursor (not root→leaf) — exactly
"the position the user is looking at." Because the SAME call produces both
the hash input and the mint content, there is no seam for the two to
diverge: whatever a manual mint of this exact position would hash to is
byte-identical to what `resolveAnchor` hashes and (on a miss) mints.

**Known-positions staleness reasoned through, not solved.** The
known-positions map (`src/state/known-positions.ts`) is a CLIENT-SIDE cache:
hydrated at boot/re-auth (`hydrateKnownPositions`) plus incidental/mint-time
appends this session. It can be INCOMPLETE (a card minted in another session,
or before this session's hydrate ran) but is never WRONG — every entry it
holds was itself hash-verified by the backend at the write that recorded it;
there is no code path that records a hash without the backend having
computed it from real content. An incomplete map's only failure mode is
therefore a false MISS (a redundant anchor mint), never a false HIT
(anchoring to the wrong card). A false miss is self-correcting within the
session: the resulting mint calls `rememberMintedCard`, so the SAME position
resolves via case 1 on any subsequent call. This is the same accepted-cost
posture `card-position-annotations-design.md` already takes for the
mint-dialog's own duplicate warning.

## Design decisions (rejected alternatives named)

- **Reuse `prepareDraft` wholesale for anchor-mint construction, rather than
  hand-building a payload the way `buildSeedPayload` does for deviations.**
  Rejected alternative: mirror `buildSeedPayload`'s shape (always
  `parent_card_id`, never `game_metadata`) for the anchor too. Rejected
  because the anchor is not always a deviation of something already carded —
  a board with NO `sourceCardId` at all (a fresh SGF upload) needs the XOR
  rule's `game_metadata` branch (a new root game), which `buildSeedPayload`
  cannot produce. Reusing `prepareDraft` gets both branches of the XOR rule
  for free and is, verbatim, "the real mint path" the commission asked for.
- **Anchor resolution is unconditional — it runs even when the legacy
  fast-path conditions (`sourceCardId` set, cursor at root) hold**, rather
  than keeping a short-circuit branch for that case. Rejected alternative: a
  cheap `if (board.sourceCardId !== undefined && board.currentNodeId ===
  board.rootNodeId) return board.sourceCardId;` fast path ahead of the
  general mechanism, avoiding a network round trip in the common case.
  Rejected because it reintroduces exactly the two-path structure the
  commission's point 3 asked to collapse ("it becomes the case where step 1
  finds sourceCardId's own card" — i.e., ONE mechanism, not one mechanism
  plus a bypass). The cost is one extra `hashPosition` round trip on the
  legacy path; accepted as the price of a single code path with one
  soundness argument instead of two.
- **No attempt to close the "board closes during `resolveAnchor`'s awaits"
  race** (a fresh anchor can get minted for a board that closes before
  `walk()` gets to write anything under it). Rejected alternative: re-check
  `store.boards.findIndex` before minting and abort if the board is already
  gone. Rejected for this change because it's a narrow, pre-existing class
  of race (the same family `writeLiveBoard`'s abort signal already handles
  for the walk phase), the anchor mint failure mode is a harmless orphaned
  card (not corruption of another board), and closing this fully would mean
  either accepting a discarded-but-already-committed mint or inventing a
  card-deletion path that doesn't exist elsewhere in this file. Documented
  in the module header's "Board-identity safety" section instead of silently
  left unmentioned.

## Tests

Four tests replace the two precondition-refusal tests, in
`describe('useLearnPath.explore — generalized anchor resolution (commission row 832)', ...)`:

- **(a)** WITNESSED — plain SGF-loaded board (no `sourceCardId`) at a
  mid-game cursor: asserts exactly one `createCard` call (the anchor),
  its `raw_content` equals `serializeActivePath(board)` at the mid-game
  node, its `tags` equal `[tag]`, and the walk proceeds from that anchor
  (`pendingSeedCount`/`existingCount`/`frontierCount`/`unplayableCount`
  match the ledger fixture). Cursor is restored to the mid-game start
  position, explicitly asserted `!== board.rootNodeId`.
- **(d)** WITNESSED — a card-loaded board (`sourceCardId` set) whose cursor
  has moved OFF root to a position with no existing card: isolates the
  SECOND rejected precondition independently of the first. Asserts the
  fresh anchor mint's payload has `parent_card_id === sourceCardId` (the
  original card) and `game_metadata === undefined` — the lineage-preserving
  branch of `prepareDraft`'s XOR rule, now exercised through the anchor-mint
  path for the first time in this suite (added after an independent
  hack-rationalization audit flagged this as an untested corner — see
  "Independent review" below).
- **(b)** WITNESSED — a position that already has a card
  (`seedAnchorKnownPosition`) anchors there; asserts zero `createCard`
  calls and `exploration.anchorCardId` equals the pre-existing card.
- **(c)** WITNESSED — the legacy card-loaded-at-root flow reproduces the
  original acceptance test's exact counts
  (`pendingSeedCount`/`existingCount`/`frontierCount`/`unplayableCount`)
  and asserts zero `createCard` calls — byte-identical behavior under the
  new mechanism, reached via case 1 (known-position hit) rather than a
  dedicated `sourceCardId` branch.

All pre-existing tests in the file (spine-first walk, board-identity-safety
×2, confirmMint ×2, runLearnPath determinism, missing-params) — WITNESSED
green, with fixtures updated to seed a matching known-position entry so
the legacy fast path still resolves to the same anchor without minting a
duplicate under them.

## Independent review (hack-rationalization-detector, out-of-frame)

Per the standing rule that a self-review of one's own diff is theater, an
independent subagent (no visibility into this session's reasoning) audited
the diff against the commission using the `hack-rationalization-detector`
skill. Full artifact:

```
FRAME CHECK: Out-of-frame — did not write the diff, no access to implementer
  reasoning; in-code comments treated as the object of suspicion.

GENERAL FIX: Anchor explore() to the board's current cursor position via a
  single content-hash-keyed resolution (existing card -> reuse; no card ->
  mint through the real mint path), independent of sourceCardId or
  currentNodeId === rootNodeId.

PATCH SHIPPED: resolveAnchor(boardId, tag) calls useMinting.prepareDraft
  (serializes root->cursor via serializeActivePath, same call site a manual
  mint uses), checks useKnownPositions.checkForDuplicate(draft.raw_content),
  returns the existing CardId or mints a fresh one via
  commitMint({...draft, tags:[tag]}). Both rejected preconditions deleted
  from explore(); LearnPathPreconditionError reserved for
  depth/topK/tag/board-not-found. Traced by hand: serializeActivePath is
  root -> currentNodeId (not root-only, not root->leaf); walk() reads
  state.currentNodeId throughout, never rootNodeId; no UI call site gates
  the button on sourceCardId or cursor position. Genuinely general,
  single-invariant mechanism, confirmed by code reading not by trusting the
  module-header prose.

DOWNGRADE: None identifiable — no narrower fix named and set aside; tell
  scanner found 0 co-occurrence hits.

WRITER DELTA: Not the load-bearing axis (not a per-writer gate).
  sourceCardId has exactly 2 write sites (useDirtyBoardGuard.ts:130,
  useReviewSession.ts:526), both pre-existing and untouched; the new
  mechanism doesn't read sourceCardId for anchoring at all — only
  prepareDraft reads it, unconditionally and unchanged, for parent_card_id.

RUNTIME: Reproduced + verified. Ran the test file directly: 10/10 tests
  passed at audit time (now 11/11 after test (d) was added in response to
  this audit's own finding below). Real payload assertions, not mocked
  around.

TELLS (Step 1): None — 0 co-occurrence hits.

VERDICT: general

WHY: Both rejected preconditions are structurally gone, replaced by a
  single content-hash invariant applied uniformly to every cursor position
  on every board, verified by tracing actual root->cursor semantics rather
  than trusting header prose. Test coverage exercises real payload
  assertions against a running suite.

FINDINGS BEYOND VERDICT (required):
  - Test coverage gap: none of the three original new tests exercised a
    board WITH sourceCardId set whose cursor moved OFF root to a genuinely
    new position — arguably the more natural reading of the commissioner's
    complaint. In that case prepareDraft sets parent_card_id =
    board.sourceCardId on the fresh anchor, silently making it a child of
    the original card — correct and desirable, but unasserted anywhere.
    [Closed in this delivery: test (d), described above.]
  - resolveAnchor's `if (!draft) throw` branch is explicitly documented as
    unreachable and, as expected, uncovered by any test — honestly labeled
    dead defensive code, not a masked gap.
  - The module-header's "board close during resolveAnchor's awaits" note
    documents an accepted-cost race (orphaned anchor, no descendants) that
    is reasoned about, not fixed, and "not observed in practice" — a real,
    if narrow, residual failure mode with no test reproducing it.
```

The two non-closed findings above (the unreachable defensive branch, and the
board-close-during-anchor-resolution race) are accepted as documented,
narrow residuals per the "Design decisions" section — not silently dropped.

## Gate exits (WITNESSED)

- `npx vue-tsc --noEmit` — exit 0, no output, run twice (before and after
  adding test (d)).
- `npx vitest run --silent=true` (full suite, memory-capped per the standing
  rules: `nice -n 19`, `NODE_OPTIONS=--max-old-space-size=2048`,
  `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`) — **1829 passed, 4 skipped
  (pre-existing skips, unrelated to this change), 0 failed.** Run twice
  (before and after adding test (d); the second run's pass count is one
  higher, matching the added test).
- No live ports touched (4173/5173/5174/8764/19080/19081) — the suite runs
  entirely in jsdom against fakes.
- No `git stash` used. No wall-clock sleeps introduced (`microtaskYield`
  throughout, matching the existing file's convention).

## Deviations from the brief

- Worktree was stale at session start (`HEAD` at `3378806f`, `next` at
  `8d8ed48f`) — fast-forwarded (`git merge --ff-only next`) before reading
  any code, per the brief's first-action instruction. Disclosed here.
- `npm install` was required before any gate could run (no `node_modules` in
  this fresh worktree) — not a brief deviation, just a precondition the
  brief didn't mention explicitly.
- One test beyond the brief's named three (a/b/c) was added — test (d) —
  in response to the independent audit's finding, per the standing
  "deliver the full commissioned scope" rule: the finding named a real,
  closeable gap in coverage of the SECOND rejected precondition
  specifically, so it was closed rather than left as a report-only note.

## Commit

`ab1af2a4` — `fix(frontend): learn-path anchors to any cursor position, not
just a card's own root`, on branch `worktree-agent-ac06eda9f41b0ccbe`
(worktree of the LengYue repo, based on `next` at `8d8ed48f`). 4 files
changed: `frontend/src/composables/cards/useLearnPath.ts`,
`frontend/src/locales/en.json`, `frontend/tests/integration/useLearnPath.test.ts`,
and this report.
