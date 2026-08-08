/**
 * tests/integration/useLearnPath.test.ts
 *
 * "Learn this path" (wiki #8, ledger rows 660/700/706-708/718 — see
 * src/composables/cards/useLearnPath.ts's module header for the full
 * design). This is the pre-registered acceptance test, updated for
 * the ratified rows-706-708/718 semantics: candidates rank by
 * `order` ascending (unit-tested separately in
 * tests/unit/composables/learn-path-policy.test.ts); the best move at
 * each node is a SPINE, descended first, never carded; ranks 2..K are
 * DEVIATIONS, recursively expanded as their own subtree and carded;
 * the walk grows the board's live tree and registers pre-mint markers
 * as it explores; NOTHING is minted until `confirmMint` is called
 * explicitly (row 718 — no auto-mint at walk end); an unanalyzed
 * frontier fails loudly with a partial-result report; an
 * already-minted position is skipped-with-notice at mint time.
 *
 * ── Determinism trick ─────────────────────────────────────────────────
 * `applyGoMove`'s node ids are `Math.random()`-keyed (src/logic.ts), so
 * a node id can't be predicted in the abstract. The "existing-child
 * reuse" branch in `applyGoMove` is the way out: the anchor board
 * fixture below is built by actually PLAYING every position the test
 * needs (spine chains, deviation siblings) from a scratch root first,
 * via `applyGoMove` directly — each sibling branch is built by
 * resetting the cursor to the branch point while grafting on the
 * `nodes` map accumulated so far (so earlier siblings are visible for
 * existing-child reuse) — then the fully-built `nodes` map is spliced
 * onto a fresh, EMPTY-stones root cursor (the "anchor" board the walk
 * actually starts from). When `useLearnPath` independently calls
 * `applyGoMove` for the same moves, `src/logic.ts`'s existing-child-
 * reuse fires and lands on exactly these precomputed node ids — so the
 * ledger can be seeded at known positions and dedup fixtures can reuse
 * the same `serializeActivePath` call the production code uses.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

// Commission ledger row 881 (the walk drives the engine for an
// unanalyzed position): `useLearnPath.ts` now calls
// `analysisService.analyzeActiveNode` for the on-demand path, so the
// engine-query machinery needs a fake here too — same pattern as
// `useReviewSession.test.ts`. `waitForAnalysis` and the `ledger` it
// reads are left REAL (not mocked): tests simulate "the engine
// answered" by having the fake's `analyzeActiveNode` implementation
// write the response into the real ledger, exactly like the real
// wire path would via `onAnalysisUpdate`.
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

import { store, addBoard, closeBoard, mutateBoard } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { applyGoMove } from '../../src/logic';
import { navigateTo } from '../../src/engine/navigator';
import { serializeActivePath } from '../../src/engine/sgf-writer';
import { ledger } from '../../src/state/analysis-ledger';
import { activeAnalysisKeys } from '../../src/state/analysis-config';
import {
  useLearnPath,
  LearnPathError,
  LearnPathPreconditionError,
} from '../../src/composables/cards/useLearnPath';
import { getPendingMintNodeIds } from '../../src/composables/cards/learn-path-pending-markers';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import { fakeAnalysisService, resetFakeAnalysisService, FAKE_QUERY_ID } from '../fakes/analysis-service';
import { recordKnownPosition, purgeKnownPositions } from '../../src/state/known-positions';
import en from '../../src/locales/en.json';
import type { BoardId, BoardState, CardCreatePayload, CardId, CardLineageTree, CardPublicId, ContentHash, GameDisplayOrdinal, NodeId, QueryId, RawAnalysis, ReviewCard } from '../../src/types';

const ANCHOR_CARD_ID = 1000 as CardId;
const EXISTING_Q16_CARD_ID = 1001 as CardId;
// Browse-leak-fix (ledger rows 417/423): resolveRoots/fetchTreeByRoot
// speak per-user display ids, not raw CardId/GameSourceId — see
// useLearnPath.ts's loadExistingDescendantContent for the read path.
const ANCHOR_ROOT_PUBLIC_ID = 'card-pub-1000' as CardPublicId;
const GAME_DISPLAY_ORDINAL = 5000 as GameDisplayOrdinal;

// A yield hook that resolves on a microtask, not a real
// requestAnimationFrame — fast and deterministic for tests, and
// exercises the exact seam `LearnPathParams.yieldStep` exists for
// (never a wall-clock delay).
const microtaskYield = () => Promise.resolve();

function rawWithMoves(moves: readonly { move: string; order: number }[]): RawAnalysis {
  return {
    id: 'synthetic',
    turnNumber: 0,
    isDuringSearch: false,
    moveInfos: moves.map(m => ({ move: m.move, order: m.order, visits: 100, winrate: 0.5, scoreLead: 0, pv: [] })),
    rootInfo: { winrate: 0.5, scoreLead: 0, visits: 100, currentPlayer: 'B' },
  };
}

function stubReviewCard(id: CardId, canonicalContent: string): ReviewCard {
  return {
    id,
    canonicalContent,
    numMoves: 1,
    model: { alpha: 1, beta: 1, t: 1 },
    lastReviewedAt: null,
    numReviews: 0,
    suspended: false,
    defaultVisits: 1000,
  } as ReviewCard;
}

/**
 * The fixture used across this file's tests. Coordinates (see the GTP
 * strings below) are chosen so every branch's stones stay disjoint
 * along its own path — no captures, no illegal-point collisions.
 *
 *              root (B to move)
 *           D4(spine) \  Q16(deviation, dedup-EXISTING)
 *            D4 node (W to move)
 *      C17(spine) \  P9(deviation)
 *       C17 node (B to move)
 *   Q3(spine) \  pass(deviation, unplayable)
 *
 * D4/C17/Q3 form the full-depth spine (never carded). P9 (D4's own
 * deviation) and Q16 (root's own deviation) are the two carded
 * positions. C17's "pass" deviation is unplayable. Neither P9's nor
 * Q16's OWN subtree has recorded analysis — both are frontiers at
 * their respective depths (2 and 1).
 */
function buildAnchorBoard() {
  const base = createInitialBoard();

  const D4 = { move: 'D4', x: 3, y: 3 };
  const C17 = { move: 'C17', x: 2, y: 16 };
  const Q3 = { move: 'Q3', x: 15, y: 2 };
  const P9 = { move: 'P9', x: 14, y: 8 };
  const Q16 = { move: 'Q16', x: 15, y: 15 };

  const atD4 = applyGoMove(base, D4.x, D4.y)!;
  const atD4C17 = applyGoMove(atD4, C17.x, C17.y)!;
  const atD4C17Q3 = applyGoMove(atD4C17, Q3.x, Q3.y)!;

  // D4's deviation (P9): reset cursor to D4, keep the accumulated
  // `nodes` (which already has D4 -> C17 -> Q3) so C17 stays D4's
  // FIRST child (spine / rank 1) and P9 becomes its second (deviation
  // / rank 2).
  const d4ResetForP9: BoardState = { ...atD4, nodes: atD4C17Q3.nodes };
  const atD4P9 = applyGoMove(d4ResetForP9, P9.x, P9.y)!;

  // Root's deviation (Q16): reset cursor to root, keep everything
  // accumulated so far, so D4 stays root's first child (spine / rank 1)
  // and Q16 becomes its second (deviation / rank 2).
  const rootResetForQ16: BoardState = { ...base, nodes: atD4P9.nodes };
  const atQ16 = applyGoMove(rootResetForQ16, Q16.x, Q16.y)!;

  const board: BoardState = { ...base, nodes: atQ16.nodes, currentNodeId: base.rootNodeId };
  const rootNode = board.nodes[board.rootNodeId];
  const d4NodeId = rootNode.children[0];
  const q16NodeId = rootNode.children[1];
  const d4Node = board.nodes[d4NodeId];
  const c17NodeId = d4Node.children[0];
  const p9NodeId = d4Node.children[1];

  // Q16's canonical content — via the SAME applyGoMove + serializeActivePath
  // calls the composable will make independently; existing-child reuse
  // guarantees byte-identical output.
  const atQ16FromBoard = applyGoMove(board, Q16.x, Q16.y)!;
  const q16Sgf = serializeActivePath(atQ16FromBoard);

  return { board, moves: { D4, C17, Q3, P9, Q16 }, nodeIds: { d4NodeId, c17NodeId, p9NodeId, q16NodeId }, q16Sgf };
}

function mockDedupFakes(
  existingContent: readonly { cardId: CardId; sgf: string }[],
  anchorCardId: CardId = ANCHOR_CARD_ID,
) {
  fakeBackendService.resolveRoots.mockResolvedValue({
    roots: [{ rootCardPublicId: ANCHOR_ROOT_PUBLIC_ID, gameSourceDisplayOrdinal: GAME_DISPLAY_ORDINAL, cardIdsInTree: [anchorCardId] }],
    unmatchedCardIds: [],
  });
  fakeBackendService.fetchTreeByRoot.mockResolvedValue({
    rootCardPublicId: ANCHOR_ROOT_PUBLIC_ID,
    gameSourceDisplayOrdinal: GAME_DISPLAY_ORDINAL,
    tree: { id: anchorCardId, children: existingContent.map(e => ({ id: e.cardId, children: [] })) },
  } satisfies CardLineageTree);
  fakeBackendService.fetchCard.mockImplementation(async (id: CardId) => {
    const hit = existingContent.find(e => e.cardId === id);
    if (!hit) throw new Error(`unexpected fetchCard(${id})`);
    return stubReviewCard(hit.cardId, hit.sgf);
  });
}

/**
 * Anchor-resolution fixture support (commission row 832 generalization):
 * `resolveAnchor` now always runs `useKnownPositions.checkForDuplicate`
 * against `useMinting.prepareDraft`'s `raw_content` for the board's
 * CURRENT cursor position — even the legacy "board loaded from a card,
 * cursor at its root" flow goes through this same generic path (it just
 * happens to serialize to exactly that card's own content). Tests that
 * exercise the legacy fast path record a known-position entry for the
 * anchor board's current-position content so `resolveAnchor` finds
 * `ANCHOR_CARD_ID` and does NOT mint a fresh one — preserving the old
 * byte-identical behavior under the new generalized mechanism.
 *
 * `hashPosition` is faked as content-identity (the raw SGF string cast
 * to `ContentHash`) for this file's tests — a valid simplification for
 * a stateless-hash FAKE (real hashing is exercised elsewhere,
 * `useMinting-duplicate-check.test.ts` and the backend's own hash-route
 * tests); what THIS suite needs is "same content resolves to the same
 * key," which content-identity gives for free without wiring an actual
 * hash function through the fake.
 */
function mockContentIdentityHashing() {
  fakeBackendService.hashPosition.mockImplementation(
    async (raw: string) => raw as unknown as ContentHash,
  );
}

function seedAnchorKnownPosition(board: BoardState, anchorCardId: CardId): void {
  recordKnownPosition(serializeActivePath(board) as unknown as ContentHash, anchorCardId);
}

beforeEach(() => {
  resetFakeBackendService();
  mockContentIdentityHashing();
  purgeKnownPositions();
  ledger.purgeAll();
  store.boards.length = 0;
  store.activeBoardIndex = 0;

  resetFakeAnalysisService();
  // Precondition (commission row 881): `explore()` now refuses upfront
  // when the engine isn't connected. Every pre-existing test in this
  // file predates that check and doesn't care about it, so the default
  // here is 'connected'; the dedicated precondition test below
  // overrides to 'disconnected'.
  store.engine.status = 'connected';
  // Default for every PRE-EXISTING test in this file (written before
  // on-demand analysis existed): a position with no recorded analysis
  // is a synchronous engine REFUSAL, not a stall. This reproduces the
  // old "missing analysis = frontier" behavior exactly (same outcome,
  // same synchronous timing, no real engine round-trip) for every
  // fixture below that never seeded analysis for a given node on
  // purpose. The dedicated on-demand-analysis describe block further
  // down overrides this per-test to exercise the 'ok' / abort paths.
  fakeAnalysisService.analyzeActiveNode.mockImplementation(() => null);
});

function seedLedger(board: BoardState, nodeIds: { d4NodeId: NodeId; c17NodeId: NodeId; p9NodeId: NodeId }, moves: ReturnType<typeof buildAnchorBoard>['moves']) {
  ledger.recordRaw(activeAnalysisKeys.value.rawKey, board.rootNodeId, rawWithMoves([
    { move: moves.D4.move, order: 0 },
    { move: moves.Q16.move, order: 1 },
  ]));
  ledger.recordRaw(activeAnalysisKeys.value.rawKey, nodeIds.d4NodeId, rawWithMoves([
    { move: moves.C17.move, order: 0 },
    { move: moves.P9.move, order: 1 },
  ]));
  ledger.recordRaw(activeAnalysisKeys.value.rawKey, nodeIds.c17NodeId, rawWithMoves([
    { move: moves.Q3.move, order: 0 },
    { move: 'pass', order: 1 },
  ]));
  // Deliberately NOT seeding p9NodeId or the root's Q16-child node — both are frontiers.
}

describe('useLearnPath.explore — spine-first walk, live growth, no minting', () => {
  it('grows the tree live (spine fully before deviations) and mints NOTHING', async () => {
    const { board, moves, nodeIds, q16Sgf } = buildAnchorBoard();
    board.sourceCardId = ANCHOR_CARD_ID;
    seedAnchorKnownPosition(board, ANCHOR_CARD_ID);
    addBoard(board);
    const boardId = board.id as BoardId;

    seedLedger(board, nodeIds, moves);
    mockDedupFakes([{ cardId: EXISTING_Q16_CARD_ID, sgf: q16Sgf }]);

    const steps: string[] = [];
    const yieldStep = async () => {
      const live = store.boards.find(b => b.id === boardId)!;
      const move = live.nodes[live.currentNodeId].move;
      steps.push(move && move.type === 'place' ? `${move.x},${move.y}` : 'unknown');
      await Promise.resolve();
    };

    const { explore } = useLearnPath();
    const exploration = await explore({ boardId, depth: 3, topK: 2, tag: 'taisha', yieldStep });

    // Spine-first live growth: the FULL D4 -> C17 -> Q3 spine is grown
    // (and awaited) before either deviation (P9, then Q16) appears —
    // "pass" produces no growth step (unplayable, never applied).
    expect(steps).toEqual([
      `${moves.D4.x},${moves.D4.y}`,
      `${moves.C17.x},${moves.C17.y}`,
      `${moves.Q3.x},${moves.Q3.y}`,
      `${moves.P9.x},${moves.P9.y}`,
      `${moves.Q16.x},${moves.Q16.y}`,
    ]);

    // No card minted during explore — row 718: batch mint is a button, not automatic.
    expect(fakeBackendService.createCard).not.toHaveBeenCalled();

    // Summary counts: 2 pending deviations (P9, Q16), 1 already exists (Q16).
    expect(exploration.pendingSeedCount).toBe(2);
    expect(exploration.existingCount).toBe(1);
    expect(exploration.frontierCount).toBe(2);
    expect(exploration.unplayableCount).toBe(1);

    // Pre-mint markers: pending minus existing — only P9's node is marked.
    const markers = getPendingMintNodeIds(boardId);
    expect(markers.size).toBe(1);
    expect(markers.has(nodeIds.p9NodeId)).toBe(true);

    // The user's cursor is restored to the anchor root; the grown tree persists.
    const finalBoard = store.boards.find(b => b.id === boardId)!;
    expect(finalBoard.currentNodeId).toBe(board.rootNodeId);
    expect(finalBoard.nodes[nodeIds.p9NodeId]).toBeDefined();
    expect(finalBoard.nodes[nodeIds.c17NodeId]).toBeDefined();
  });
});

describe('useLearnPath.explore — board-identity safety (fresh-context review BLOCKER)', () => {
  it('closing an unrelated earlier board mid-walk does not corrupt it', async () => {
    // Reviewer's exact scenario: Board A (index 0, unrelated) -> Board B
    // (index 1, the walk's anchor) -> Board C (index 2, unrelated,
    // pre-moved so its currentNodeId/stones are distinguishable from B's
    // root). A `boardIndex` resolved once and threaded across yields
    // would, after A closes and splices the array, write B's data into
    // whatever now occupies A's old slot — which, after the splice, is
    // the board that WAS at index 1 (B itself shifts to index 0; C shifts
    // to index 1). The fix re-resolves by BoardId at every write, so this
    // must be a no-op for both A (gone) and C (untouched).
    const boardA = createInitialBoard();
    const { board: boardB, moves, nodeIds } = buildAnchorBoard();
    boardB.sourceCardId = ANCHOR_CARD_ID;
    seedAnchorKnownPosition(boardB, ANCHOR_CARD_ID);
    const boardCBase = createInitialBoard();
    const boardC = applyGoMove(boardCBase, 10, 10)!; // pre-moved, distinguishable
    boardC.sourceCardId = undefined; // irrelevant to this board; just needs to be untouched

    addBoard(boardA);
    addBoard(boardB);
    addBoard(boardC);
    const boardIdB = boardB.id as BoardId;
    const boardIdC = boardC.id as BoardId;
    const cSnapshotBefore = {
      currentNodeId: boardC.currentNodeId,
      stones: { ...boardC.stones },
    };

    seedLedger(boardB, nodeIds, moves);
    mockDedupFakes([]);

    let calls = 0;
    const yieldStep = async () => {
      calls++;
      if (calls === 1) {
        // Close A (the earlier, unrelated board) on the walk's very
        // first yield checkpoint — exactly the reviewer's repro.
        closeBoard(boardA.id as BoardId);
      }
      await Promise.resolve();
    };

    const { explore } = useLearnPath();
    // Must not throw, and must not corrupt C.
    await explore({ boardId: boardIdB, depth: 3, topK: 2, tag: 'taisha', yieldStep });

    const liveC = store.boards.find(b => b.id === boardIdC)!;
    expect(liveC).toBeDefined();
    expect(liveC.currentNodeId).toBe(cSnapshotBefore.currentNodeId);
    expect(liveC.stones).toEqual(cSnapshotBefore.stones);

    // A is genuinely gone (closeBoard did its job — this isn't testing
    // closeBoard itself, just confirming the premise).
    expect(store.boards.find(b => b.id === (boardA.id as BoardId))).toBeUndefined();
  });

  // Re-review's coverage close (wf8-learn-this-path-rereview.md): the
  // ANCHOR board's own close mid-walk — the abort path itself. The walk
  // must end cleanly (no throw) and must not resurrect the closed board
  // by writing into whatever now occupies its old array slot.
  it('closing the ANCHOR board mid-walk aborts cleanly without resurrecting it', async () => {
    const boardA = createInitialBoard();
    const { board: boardB, moves, nodeIds } = buildAnchorBoard();
    boardB.sourceCardId = ANCHOR_CARD_ID;
    seedAnchorKnownPosition(boardB, ANCHOR_CARD_ID);
    const boardCBase = createInitialBoard();
    const boardC = applyGoMove(boardCBase, 10, 10)!;
    boardC.sourceCardId = undefined;

    addBoard(boardA);
    addBoard(boardB);
    addBoard(boardC);
    const boardIdB = boardB.id as BoardId;
    const boardIdC = boardC.id as BoardId;
    const cSnapshotBefore = {
      currentNodeId: boardC.currentNodeId,
      stones: { ...boardC.stones },
    };

    seedLedger(boardB, nodeIds, moves);
    mockDedupFakes([]);

    let calls = 0;
    const yieldStep = async () => {
      calls++;
      if (calls === 1) {
        closeBoard(boardIdB); // the anchor itself
      }
      await Promise.resolve();
    };

    const { explore } = useLearnPath();
    // Must not throw — the walk aborts at its next BoardId re-resolution.
    await explore({ boardId: boardIdB, depth: 3, topK: 2, tag: 'taisha', yieldStep });

    // The anchor stays closed: no stale-index write resurrects it into
    // another slot, and C (now occupying a shifted index) is untouched.
    expect(store.boards.find(b => b.id === boardIdB)).toBeUndefined();
    const liveC = store.boards.find(b => b.id === boardIdC)!;
    expect(liveC).toBeDefined();
    expect(liveC.currentNodeId).toBe(cSnapshotBefore.currentNodeId);
    expect(liveC.stones).toEqual(cSnapshotBefore.stones);
  });
});

describe('useLearnPath.confirmMint — deferred, explicit, one batch call', () => {
  it('mints exactly the pending-minus-existing set in one pass, clears markers, matches the acceptance shape', async () => {
    const { board, moves, nodeIds, q16Sgf } = buildAnchorBoard();
    board.sourceCardId = ANCHOR_CARD_ID;
    seedAnchorKnownPosition(board, ANCHOR_CARD_ID);
    addBoard(board);
    const boardId = board.id as BoardId;

    seedLedger(board, nodeIds, moves);
    mockDedupFakes([{ cardId: EXISTING_Q16_CARD_ID, sgf: q16Sgf }]);

    let nextMintedId = 2000;
    fakeBackendService.createCard.mockImplementation(async () => nextMintedId++);

    const { explore, confirmMint } = useLearnPath();
    const exploration = await explore({ boardId, depth: 3, topK: 2, tag: 'taisha', yieldStep: microtaskYield });

    expect(fakeBackendService.createCard).not.toHaveBeenCalled();

    const result = await confirmMint(exploration);

    // Exactly one batch call per pending-and-not-existing seed (P9 only).
    expect(fakeBackendService.createCard).toHaveBeenCalledTimes(1);
    const payload = fakeBackendService.createCard.mock.calls[0][0] as { tags: string[] };
    expect(payload.tags).toEqual(['taisha']);

    expect(result.tag).toBe('taisha');
    expect(result.seeded).toHaveLength(1);
    expect(result.seeded[0]).toMatchObject({ parentCardId: ANCHOR_CARD_ID, plyDepth: 2, rank: 2 });
    const seededP9Id = result.seeded[0].cardId;

    expect(result.skipped).toHaveLength(2);
    expect(result.skipped).toContainEqual(expect.objectContaining({
      reason: 'existing-card', existingCardId: EXISTING_Q16_CARD_ID, parentCardId: ANCHOR_CARD_ID, plyDepth: 1, rank: 2,
    }));
    expect(result.skipped).toContainEqual(expect.objectContaining({
      reason: 'unplayable-move', parentCardId: ANCHOR_CARD_ID, plyDepth: 3, rank: 2,
    }));

    expect(result.frontiers).toHaveLength(2);
    expect(result.frontiers).toContainEqual({ parentCardId: seededP9Id, plyDepth: 2, nodeId: nodeIds.p9NodeId });
    expect(result.frontiers).toContainEqual({ parentCardId: EXISTING_Q16_CARD_ID, plyDepth: 1, nodeId: nodeIds.q16NodeId });

    // Markers clear after mint.
    expect(getPendingMintNodeIds(boardId).size).toBe(0);
  });

  it('discardExploration clears the markers without minting anything', async () => {
    const { board, moves, nodeIds, q16Sgf } = buildAnchorBoard();
    board.sourceCardId = ANCHOR_CARD_ID;
    seedAnchorKnownPosition(board, ANCHOR_CARD_ID);
    addBoard(board);
    const boardId = board.id as BoardId;

    seedLedger(board, nodeIds, moves);
    mockDedupFakes([{ cardId: EXISTING_Q16_CARD_ID, sgf: q16Sgf }]);

    const { explore, discardExploration } = useLearnPath();
    const exploration = await explore({ boardId, depth: 3, topK: 2, tag: 'taisha', yieldStep: microtaskYield });

    expect(getPendingMintNodeIds(boardId).size).toBe(1);
    discardExploration(exploration);
    expect(getPendingMintNodeIds(boardId).size).toBe(0);
    expect(fakeBackendService.createCard).not.toHaveBeenCalled();
  });
});

describe('useLearnPath.runLearnPath — programmatic explore+confirm convenience', () => {
  it('is deterministic — same ledger state + same params produce the same seeded shape twice', async () => {
    const build = () => {
      const { board, moves, nodeIds, q16Sgf } = buildAnchorBoard();
      board.sourceCardId = ANCHOR_CARD_ID;
      seedAnchorKnownPosition(board, ANCHOR_CARD_ID);
      seedLedger(board, nodeIds, moves);
      return { board, q16Sgf };
    };

    let nextMintedId = 3000;
    fakeBackendService.createCard.mockImplementation(async () => nextMintedId++);

    const { runLearnPath } = useLearnPath();
    const shape = (r: Awaited<ReturnType<typeof runLearnPath>>) => ({
      seeded: r.seeded.map(s => ({ plyDepth: s.plyDepth, rank: s.rank, move: s.move })),
      skipped: r.skipped,
      frontierPlyDepths: r.frontiers.map(f => f.plyDepth).sort(),
    });

    const first = build();
    mockDedupFakes([{ cardId: EXISTING_Q16_CARD_ID, sgf: first.q16Sgf }]);
    store.boards.length = 0;
    addBoard(first.board);
    const run1 = await runLearnPath({ boardId: first.board.id as BoardId, depth: 3, topK: 2, tag: 'taisha', yieldStep: microtaskYield });

    ledger.purgeAll();
    resetFakeBackendService();
    mockContentIdentityHashing(); // resetFakeBackendService cleared hashPosition's mockImplementation too
    fakeBackendService.createCard.mockImplementation(async () => nextMintedId++);
    const second = build();
    mockDedupFakes([{ cardId: EXISTING_Q16_CARD_ID, sgf: second.q16Sgf }]);
    store.boards.length = 0;
    addBoard(second.board);
    const run2 = await runLearnPath({ boardId: second.board.id as BoardId, depth: 3, topK: 2, tag: 'taisha', yieldStep: microtaskYield });

    expect(shape(run1)).toEqual(shape(run2));
  });

  it('fails loudly on missing params rather than defaulting silently', async () => {
    const { board } = buildAnchorBoard();
    board.sourceCardId = ANCHOR_CARD_ID;
    addBoard(board);
    const boardId = board.id as BoardId;
    const { explore } = useLearnPath();

    await expect(explore({ boardId, depth: 0, topK: 1, tag: 'x' })).rejects.toThrow(LearnPathError);
    await expect(explore({ boardId, depth: 1, topK: 0, tag: 'x' })).rejects.toThrow(LearnPathError);
    await expect(explore({ boardId, depth: 1, topK: 1, tag: '   ' })).rejects.toThrow(LearnPathError);
  });

});

/**
 * Generalized anchor resolution (commission row 832): the two v1
 * preconditions this describe block used to pin — "requires
 * sourceCardId", "requires cursor at the board root" — are REJECTED
 * narrowing, deleted from `useLearnPath.ts` (not softened to a
 * warning). These four tests are their replacement, covering the
 * ratified design's outcomes: (a) a genuinely new position on a board
 * with NO sourceCardId mints a fresh, root-level anchor and walks from
 * it (isolates the FIRST rejected precondition); (d) a genuinely new
 * position on a board that DOES have sourceCardId — cursor moved off
 * root — mints a fresh, lineage-preserving anchor parented under the
 * original card (isolates the SECOND rejected precondition, and pins
 * `prepareDraft`'s XOR rule as exercised through the anchor-mint path
 * for the first time); (b) a position that already has a card anchors
 * there without minting a duplicate; (c) the legacy "loaded from a
 * card, cursor at its root" flow is byte-identical under the new
 * mechanism (case (a)/(d)'s own resolution just happening to find case
 * (b)'s own card).
 */
describe('useLearnPath.explore — generalized anchor resolution (commission row 832)', () => {
  const NEW_ANCHOR_CARD_ID = 5000 as CardId;

  /** A board with NO sourceCardId (plain SGF-loaded / fresh board), cursor mid-game at D4. */
  function buildMidGameNoCardBoard() {
    const base = createInitialBoard();
    const D4 = { move: 'D4', x: 3, y: 3 };
    const board = applyGoMove(base, D4.x, D4.y)!;
    return { board, D4 };
  }

  it('(a) mints a fresh anchor from a mid-game cursor on a plain SGF-loaded board (no sourceCardId) and walks from it', async () => {
    const { board } = buildMidGameNoCardBoard();
    expect(board.sourceCardId).toBeUndefined();
    addBoard(board);
    const boardId = board.id as BoardId;
    const startingNodeId = board.currentNodeId;

    // Deliberately no `seedAnchorKnownPosition` call — this position is
    // genuinely new, so `checkForDuplicate` must miss.
    ledger.recordRaw(activeAnalysisKeys.value.rawKey, startingNodeId, rawWithMoves([
      { move: 'C17', order: 0 }, // spine — never carded
      { move: 'Q16', order: 1 }, // deviation — pending seed
    ]));

    fakeBackendService.createCard.mockResolvedValueOnce(NEW_ANCHOR_CARD_ID);
    mockDedupFakes([], NEW_ANCHOR_CARD_ID); // fresh anchor has no descendants yet

    const { explore } = useLearnPath();
    const exploration = await explore({ boardId, depth: 1, topK: 2, tag: 'midgame', yieldStep: microtaskYield });

    // Exactly one mint: the anchor itself. Row 718's "no auto-mint of
    // deviations" still holds — Q16 is only a pending seed.
    expect(fakeBackendService.createCard).toHaveBeenCalledTimes(1);
    const anchorPayload = fakeBackendService.createCard.mock.calls[0][0] as { raw_content: string; tags: string[] };
    expect(anchorPayload.tags).toEqual(['midgame']);
    expect(anchorPayload.raw_content).toBe(serializeActivePath(board));

    expect(exploration.anchorCardId).toBe(NEW_ANCHOR_CARD_ID);
    expect(exploration.pendingSeedCount).toBe(1); // Q16
    expect(exploration.existingCount).toBe(0);
    expect(exploration.frontierCount).toBe(0);
    expect(exploration.unplayableCount).toBe(0);

    // Cursor restored to exactly where it started (mid-game, not the tree's own root).
    const finalBoard = store.boards.find(b => b.id === boardId)!;
    expect(finalBoard.currentNodeId).toBe(startingNodeId);
    expect(finalBoard.currentNodeId).not.toBe(board.rootNodeId);
  });

  it('(d) a card-loaded board whose cursor has moved off root to a genuinely new position mints a lineage-preserving anchor', async () => {
    // The OTHER rejected precondition, isolated from (a): this board DOES
    // have `sourceCardId` (it was loaded from ANCHOR_CARD_ID), but the
    // cursor has moved away from that card's own root to a position no
    // card exists at yet — the "I'm mid-review and want to learn from
    // right here" case the commission names. `prepareDraft`'s existing
    // XOR rule (unchanged by this feature) means the fresh anchor mint
    // parents under the ORIGINAL card rather than becoming a new root —
    // pinned explicitly here since nothing else in this suite asserts
    // `parent_card_id` on an anchor mint.
    const base = createInitialBoard();
    base.sourceCardId = ANCHOR_CARD_ID;
    const moved = applyGoMove(base, 3, 3)!; // D4 — a position no card exists at
    expect(moved.sourceCardId).toBe(ANCHOR_CARD_ID); // survives the spread in applyGoMove
    addBoard(moved);
    const boardId = moved.id as BoardId;

    ledger.recordRaw(activeAnalysisKeys.value.rawKey, moved.currentNodeId, rawWithMoves([
      { move: 'C17', order: 0 }, // spine only (topK=1 below) — isolates the anchor-mint assertion
    ]));

    // Deliberately no `seedAnchorKnownPosition` — this mid-game position
    // has never been minted, only the board's ROOT (ANCHOR_CARD_ID) has.
    fakeBackendService.createCard.mockResolvedValueOnce(NEW_ANCHOR_CARD_ID);
    mockDedupFakes([], NEW_ANCHOR_CARD_ID);

    const { explore } = useLearnPath();
    const exploration = await explore({ boardId, depth: 1, topK: 1, tag: 'midgame-from-card', yieldStep: microtaskYield });

    expect(fakeBackendService.createCard).toHaveBeenCalledTimes(1);
    const anchorPayload = fakeBackendService.createCard.mock.calls[0][0] as CardCreatePayload;
    expect(anchorPayload.tags).toEqual(['midgame-from-card']);
    expect(anchorPayload.raw_content).toBe(serializeActivePath(moved));
    // Lineage-preserving XOR: parents under the board's OWN sourceCardId,
    // not a fresh root (`game_metadata` absent) — prepareDraft's existing
    // rule, exercised here through the anchor-mint path for the first time.
    expect(anchorPayload.parent_card_id).toBe(ANCHOR_CARD_ID as unknown as number);
    expect(anchorPayload.game_metadata).toBeUndefined();

    expect(exploration.anchorCardId).toBe(NEW_ANCHOR_CARD_ID);
  });

  it('(b) anchors to an existing card at the current position and mints NO duplicate anchor', async () => {
    const { board } = buildMidGameNoCardBoard();
    addBoard(board);
    const boardId = board.id as BoardId;

    ledger.recordRaw(activeAnalysisKeys.value.rawKey, board.currentNodeId, rawWithMoves([
      { move: 'C17', order: 0 },
    ]));

    // This exact position already has a card — recorded exactly the way
    // a prior mint (this session, or hydrated at boot) would have.
    seedAnchorKnownPosition(board, ANCHOR_CARD_ID);
    mockDedupFakes([], ANCHOR_CARD_ID);

    const { explore } = useLearnPath();
    // topK=1: only the spine (never carded) — no deviation mint call to
    // conflate with an anchor mint call, isolating the assertion below.
    const exploration = await explore({ boardId, depth: 1, topK: 1, tag: 'dup', yieldStep: microtaskYield });

    expect(fakeBackendService.createCard).not.toHaveBeenCalled();
    expect(exploration.anchorCardId).toBe(ANCHOR_CARD_ID);
  });

  it('(c) the legacy card-loaded-at-root flow is byte-identical: anchors to sourceCardId\'s own card, no mint', async () => {
    const { board, moves, nodeIds, q16Sgf } = buildAnchorBoard();
    board.sourceCardId = ANCHOR_CARD_ID;
    // The current position (board's own root, since currentNodeId ===
    // rootNodeId here) already IS anchor card ANCHOR_CARD_ID's content —
    // step 1 of the general resolution finds it without needing the
    // `sourceCardId` field at all.
    seedAnchorKnownPosition(board, ANCHOR_CARD_ID);
    addBoard(board);
    const boardId = board.id as BoardId;

    seedLedger(board, nodeIds, moves);
    mockDedupFakes([{ cardId: EXISTING_Q16_CARD_ID, sgf: q16Sgf }]);

    const { explore } = useLearnPath();
    const exploration = await explore({ boardId, depth: 3, topK: 2, tag: 'taisha', yieldStep: microtaskYield });

    // Byte-identical to the pre-generalization behavior: no anchor mint,
    // anchor resolves to the board's own sourceCardId, same counts as
    // the original spine-first acceptance test.
    expect(fakeBackendService.createCard).not.toHaveBeenCalled();
    expect(exploration.anchorCardId).toBe(ANCHOR_CARD_ID);
    expect(exploration.pendingSeedCount).toBe(2);
    expect(exploration.existingCount).toBe(1);
    expect(exploration.frontierCount).toBe(2);
    expect(exploration.unplayableCount).toBe(1);

    const finalBoard = store.boards.find(b => b.id === boardId)!;
    expect(finalBoard.currentNodeId).toBe(board.rootNodeId);
    expect(finalBoard.nodes[nodeIds.p9NodeId]).toBeDefined();
  });
});

/**
 * On-demand analysis (commission ledger row 881): the walk DRIVES the
 * engine for a visited position with no recorded analysis, rather than
 * treating the absence itself as a frontier. This block's fixture is
 * deliberately minimal (a fresh root-anchored board, `depth: 1, topK: 1`
 * — a single spine step, no carding) so each test isolates exactly one
 * on-demand outcome without the multi-branch bookkeeping the acceptance
 * fixture above needs for its own (unrelated) assertions.
 *
 * `analyzeActiveNode`'s single query in every test below targets the
 * board's ROOT (plyDepth 0, `turnNumber` 0 — no moves played yet), so
 * the synthetic `RawAnalysis` fixtures below all use `turnNumber: 0`.
 */
describe('useLearnPath.explore — on-demand analysis (commission row 881)', () => {
  function buildRootOnlyBoard() {
    const board = createInitialBoard();
    board.sourceCardId = ANCHOR_CARD_ID;
    seedAnchorKnownPosition(board, ANCHOR_CARD_ID);
    return board;
  }

  it('(a) requests analysis for an unanalyzed position and proceeds when the result lands', async () => {
    const board = buildRootOnlyBoard();
    addBoard(board);
    const boardId = board.id as BoardId;
    mockDedupFakes([]);

    // The fake IS the "engine": its analyzeActiveNode implementation
    // writes the response into the real ledger — exactly what the
    // production wire path (onAnalysisUpdate) would do — before
    // returning the queryId. Because this happens synchronously and
    // BEFORE `waitForAnalysis`'s own synchronous initial ledger check,
    // the wait resolves immediately without ever needing its watcher —
    // deterministic, no fake timers required.
    fakeAnalysisService.analyzeActiveNode.mockImplementation((bId, mode, visits) => {
      expect(bId).toBe(boardId);
      expect(mode).toBe('analyze');
      // Visit-count governance finding (module header): the on-demand
      // query uses the SAME profile setting every newly-minted card's
      // own `default_visits` is baked from — not the review session's
      // per-card override machinery (there's no card here yet to hold
      // one).
      expect(visits).toBe(store.profile.settings.minting.defaultVisits);
      ledger.recordRaw(activeAnalysisKeys.value.rawKey, board.rootNodeId, rawWithMoves([
        { move: 'D4', order: 0 },
      ]));
      return FAKE_QUERY_ID as QueryId;
    });

    const { explore } = useLearnPath();
    const exploration = await explore({ boardId, depth: 1, topK: 1, tag: 'ondemand', yieldStep: microtaskYield });

    expect(fakeAnalysisService.analyzeActiveNode).toHaveBeenCalledTimes(1);
    // The engine query is released once the wait settles — no orphaned
    // query survives the walk step that issued it.
    expect(fakeAnalysisService.stopQuery).toHaveBeenCalledWith(FAKE_QUERY_ID);

    // The walk proceeded past the on-demand result: D4 is the spine
    // (rank 1), so no card, no frontier, no unplayable — the tree grew
    // by exactly the one move.
    expect(exploration.pendingSeedCount).toBe(0);
    expect(exploration.frontierCount).toBe(0);
    expect(exploration.unplayableCount).toBe(0);

    const finalBoard = store.boards.find(b => b.id === boardId)!;
    // Cursor restored to the anchor root; the D4 child persists.
    expect(finalBoard.currentNodeId).toBe(board.rootNodeId);
    const d4NodeId = finalBoard.nodes[board.rootNodeId].children[0];
    expect(finalBoard.nodes[d4NodeId]).toBeDefined();
    expect(finalBoard.nodes[d4NodeId].move).toMatchObject({ type: 'place', x: 3, y: 3 });
  });

  it('(b) a genuine engine refusal at a position yields a frontier stop, not a mint', async () => {
    const board = buildRootOnlyBoard();
    addBoard(board);
    const boardId = board.id as BoardId;
    mockDedupFakes([]);

    // Global beforeEach default: analyzeActiveNode -> null (a
    // synchronous refusal). Explicit here for readability.
    fakeAnalysisService.analyzeActiveNode.mockImplementation(() => null);

    const { explore } = useLearnPath();
    const exploration = await explore({ boardId, depth: 1, topK: 1, tag: 'refused', yieldStep: microtaskYield });

    expect(fakeAnalysisService.analyzeActiveNode).toHaveBeenCalledTimes(1);
    // A refusal never mints a query to begin with — nothing to release.
    expect(fakeAnalysisService.stopQuery).not.toHaveBeenCalled();

    expect(exploration.frontierCount).toBe(1);
    expect(exploration._pending.frontiers).toEqual([
      { parentRef: { resolved: true, cardId: ANCHOR_CARD_ID }, plyDepth: 0, nodeId: board.rootNodeId },
    ]);
    expect(exploration.pendingSeedCount).toBe(0);
    expect(fakeBackendService.createCard).not.toHaveBeenCalled();

    // The reworded locale string now names the true cause — "the
    // engine refused" — never "no recorded analysis" (that framing
    // implied a gap the walk itself created, which row 881 closes).
    expect((en as Record<string, string>)['learnPath.explore.frontiers']).toMatch(/engine refused/i);
    expect((en as Record<string, string>)['learnPath.result.frontiers']).toMatch(/engine refused/i);
  });

  it('(c) refuses to start when the engine is not connected, before any tree mutation', async () => {
    const board = buildRootOnlyBoard();
    addBoard(board);
    const boardId = board.id as BoardId;
    const boardSnapshotBefore = { ...board };
    mockDedupFakes([]);

    store.engine.status = 'disconnected';

    const { explore } = useLearnPath();
    await expect(explore({ boardId, depth: 1, topK: 1, tag: 'nc', yieldStep: microtaskYield }))
      .rejects.toThrow(LearnPathPreconditionError);

    // No tree mutation, no anchor resolution, no engine query.
    expect(fakeBackendService.createCard).not.toHaveBeenCalled();
    expect(fakeAnalysisService.analyzeActiveNode).not.toHaveBeenCalled();
    const finalBoard = store.boards.find(b => b.id === boardId)!;
    expect(finalBoard.currentNodeId).toBe(boardSnapshotBefore.currentNodeId);
    expect(Object.keys(finalBoard.nodes)).toEqual(Object.keys(boardSnapshotBefore.nodes));
  });

  it('(d) cancellation (board close) mid-query aborts cleanly — no orphaned query, no spurious frontier', async () => {
    const board = buildRootOnlyBoard();
    addBoard(board);
    const boardId = board.id as BoardId;
    mockDedupFakes([]);

    // Simulates the user closing the board WHILE the on-demand query is
    // in flight: the fake never answers (no ledger write), and instead
    // closes the board synchronously from inside the query call —
    // exactly the moment a real close could land between the query
    // firing and its response. `closeBoard` runs the
    // `learn-path:abort-query` teardown handler registered by
    // `useLearnPath.ts`, which aborts the walk's AbortController; by
    // the time `waitForAnalysis` constructs its Promise (immediately
    // after this mock returns), the signal is already aborted, so it
    // rejects deterministically without any timer or watcher ever
    // firing.
    fakeAnalysisService.analyzeActiveNode.mockImplementation(() => {
      closeBoard(boardId);
      return FAKE_QUERY_ID as QueryId;
    });

    const { explore } = useLearnPath();
    // Must not throw and must not hang.
    const exploration = await explore({ boardId, depth: 1, topK: 1, tag: 'cancel', yieldStep: microtaskYield });

    // The in-flight query is still released even though the wait was
    // aborted rather than settled — no orphaned query against the
    // engine.
    expect(fakeAnalysisService.stopQuery).toHaveBeenCalledWith(FAKE_QUERY_ID);

    // An abort is NOT a frontier — the walk stopped because the board
    // is gone, not because the engine refused.
    expect(exploration.frontierCount).toBe(0);
    expect(exploration.pendingSeedCount).toBe(0);

    expect(store.boards.find(b => b.id === boardId)).toBeUndefined();
  });

  it('(e) legacy behavior: every position pre-analyzed never touches the engine — byte-identical to the pre-881 walk', async () => {
    const board = buildRootOnlyBoard();
    addBoard(board);
    const boardId = board.id as BoardId;
    mockDedupFakes([]);

    // Every position the walk will visit already has recorded analysis
    // — this is the pre-881 world exactly. analyzeActiveNode must never
    // be reached.
    ledger.recordRaw(activeAnalysisKeys.value.rawKey, board.rootNodeId, rawWithMoves([
      { move: 'D4', order: 0 },
    ]));
    fakeAnalysisService.analyzeActiveNode.mockImplementation(() => {
      throw new Error('on-demand analysis must not fire when the position is already analyzed');
    });

    const { explore } = useLearnPath();
    const exploration = await explore({ boardId, depth: 1, topK: 1, tag: 'legacy', yieldStep: microtaskYield });

    expect(fakeAnalysisService.analyzeActiveNode).not.toHaveBeenCalled();
    expect(exploration.pendingSeedCount).toBe(0);
    expect(exploration.frontierCount).toBe(0);
    expect(exploration.unplayableCount).toBe(0);

    const finalBoard = store.boards.find(b => b.id === boardId)!;
    const d4NodeId = finalBoard.nodes[board.rootNodeId].children[0];
    expect(finalBoard.nodes[d4NodeId]).toBeDefined();
    expect(finalBoard.currentNodeId).toBe(board.rootNodeId);
  });
});

/**
 * Tree-integrity repro (commission ledger row 911, defect #2 —
 * "VARIATIONS ARE ERADICATED"). `buildAnchorBoard()` above can't exercise
 * this: it pre-builds the WHOLE fixture tree up front, so every
 * `applyGoMove` the walk makes inside it lands on `logic.ts`'s
 * existing-child-reuse branch — which never shrinks `nodes` (the reused
 * child was already present in whatever stale snapshot a sibling write
 * spreads from). The defect only shows when the walk mints GENUINELY NEW
 * nodes across more than one candidate at the same node — exactly what a
 * live exploration into unexplored territory does.
 *
 * Fixture: a board with ONE pre-existing user variation off root
 * (unrelated to anything the engine will suggest — stands in for "the
 * user's own existing branches", which the commission's wording names
 * explicitly as a thing that must survive), then a two-level walk
 * (depth 2, topK 2) into entirely fresh coordinates. Root's ledger entry
 * is seeded directly (its NodeId is known); the deeper node's analysis
 * arrives via the same on-demand path exercised in the "on-demand
 * analysis" block above, since a freshly-minted child's NodeId can't be
 * predicted ahead of time.
 */
describe('useLearnPath.explore — tree integrity (commission row 911, "variations are eradicated")', () => {
  const D4 = { move: 'D4', x: 3, y: 3 };
  const Q16 = { move: 'Q16', x: 15, y: 15 };
  const C17 = { move: 'C17', x: 2, y: 16 };
  const P9 = { move: 'P9', x: 14, y: 8 };
  // The user's own pre-existing variation off root — disjoint from every
  // coordinate the engine will suggest below.
  const USER_VARIATION = { move: 'K10', x: 9, y: 9 };

  function findChildByMove(nodes: BoardState['nodes'], parentId: NodeId, x: number, y: number): NodeId {
    const parent = nodes[parentId];
    const found = parent.children.find(id => {
      const m = nodes[id]?.move;
      return m?.type === 'place' && m.x === x && m.y === y;
    });
    if (!found) throw new Error(`no child of ${parentId} at (${x},${y}) — nodes: ${JSON.stringify(Object.keys(nodes))}`);
    return found;
  }

  it('grows a dense tree: nothing explored, and no pre-existing variation, is ever deleted', async () => {
    const base = createInitialBoard();
    base.sourceCardId = ANCHOR_CARD_ID;
    // The user's own pre-existing branch, played BEFORE explore() ever
    // runs — must still be there afterward, byte-for-byte.
    const board = applyGoMove(base, USER_VARIATION.x, USER_VARIATION.y)!;
    board.currentNodeId = board.rootNodeId; // cursor back at root — explore starts from root
    seedAnchorKnownPosition(board, ANCHOR_CARD_ID);
    addBoard(board);
    const boardId = board.id as BoardId;
    const userVariationNodeId = board.nodes[board.rootNodeId].children[0];

    mockDedupFakes([]);

    // Root: seeded directly — its NodeId (the board's own rootNodeId) is
    // known ahead of time.
    ledger.recordRaw(activeAnalysisKeys.value.rawKey, board.rootNodeId, rawWithMoves([
      { move: D4.move, order: 0 }, // spine
      { move: Q16.move, order: 1 }, // deviation
    ]));

    // D4's own analysis arrives on demand (its NodeId isn't known until
    // the walk mints it) — identified by which move led to the node
    // currently being analyzed. Q16 gets an empty response (a frontier;
    // this test only needs D4's subtree to exercise the multi-candidate
    // sibling-overwrite shape).
    fakeAnalysisService.analyzeActiveNode.mockImplementation((bId: BoardId) => {
      const live = store.boards.find(b => b.id === bId)!;
      const node = live.nodes[live.currentNodeId];
      const atMove = node.move && node.move.type === 'place' ? { x: node.move.x, y: node.move.y } : null;
      // `waitForAnalysis` matches on `(nodeId, turnNumber)` — the raw
      // packet's own `turnNumber` field must equal `countRealMoves`'s
      // result at this node (both D4's and Q16's own positions are one
      // real move from root: `turnNumber` 1) or the wait never resolves
      // and rides the real 30s timeout instead of the deterministic
      // microtask path this test needs.
      const raw = atMove && atMove.x === D4.x && atMove.y === D4.y
        ? rawWithMoves([{ move: C17.move, order: 0 }, { move: P9.move, order: 1 }])
        : rawWithMoves([]); // Q16 (and anything else): frontier, no further growth.
      raw.turnNumber = 1;
      ledger.recordRaw(activeAnalysisKeys.value.rawKey, live.currentNodeId, raw);
      return FAKE_QUERY_ID as QueryId;
    });

    const { explore } = useLearnPath();
    const exploration = await explore({ boardId, depth: 2, topK: 2, tag: 'dense', yieldStep: microtaskYield });

    const finalBoard = store.boards.find(b => b.id === boardId)!;

    // The user's pre-existing variation survives untouched.
    expect(finalBoard.nodes[userVariationNodeId]).toBeDefined();
    expect(finalBoard.nodes[userVariationNodeId].move).toMatchObject({ x: USER_VARIATION.x, y: USER_VARIATION.y });

    // Every explored node survives: D4 (spine), Q16 (deviation, sibling
    // of D4 at root), and D4's own C17 (spine) / P9 (deviation) children.
    // Prior to the fix, Q16's write (the SECOND candidate processed at
    // root) replaced the board's entire `nodes` map with a snapshot
    // spread from root's STALE pre-walk state — deleting D4's whole
    // subtree (D4, C17, P9) even though it had just been grown live.
    const d4NodeId = findChildByMove(finalBoard.nodes, finalBoard.rootNodeId, D4.x, D4.y);
    const q16NodeId = findChildByMove(finalBoard.nodes, finalBoard.rootNodeId, Q16.x, Q16.y);
    const c17NodeId = findChildByMove(finalBoard.nodes, d4NodeId, C17.x, C17.y);
    const p9NodeId = findChildByMove(finalBoard.nodes, d4NodeId, P9.x, P9.y);
    expect(finalBoard.nodes[d4NodeId]).toBeDefined();
    expect(finalBoard.nodes[q16NodeId]).toBeDefined();
    expect(finalBoard.nodes[c17NodeId]).toBeDefined();
    expect(finalBoard.nodes[p9NodeId]).toBeDefined();

    // Root has exactly its three children (user variation, D4, Q16) —
    // "dense", not sparse/deleted.
    expect(finalBoard.nodes[finalBoard.rootNodeId].children).toHaveLength(3);
    expect(finalBoard.nodes[d4NodeId].children).toHaveLength(2);

    // Sanity: the exploration did find the deviations it claims to.
    expect(exploration.pendingSeedCount).toBe(2); // Q16, P9

    // Defect #1 corollary ("you can't check out the variations"): every
    // surviving explored node must still be navigable via the SAME
    // click-to-navigate path App.vue's `handleNodeSelect` uses
    // (`mutateBoard` + `navigateTo`) — this was unreachable before the
    // fix for any node a later sibling's write had already deleted.
    for (const target of [userVariationNodeId, d4NodeId, q16NodeId, c17NodeId, p9NodeId]) {
      expect(() => mutateBoard(boardId, draft => navigateTo(draft, target))).not.toThrow();
      expect(store.boards.find(b => b.id === boardId)!.currentNodeId).toBe(target);
    }
  });
});

/**
 * Fresh-context review MEDIUM finding, fixed (commission's "also in
 * scope"): `rawKey` used to be captured once at `explore()`'s start;
 * `analysisService.analyzeActiveNode` derives its own key from LIVE
 * settings at the moment it fires. A mid-walk model change used to strand
 * the SECOND on-demand wait on the stale key the fake never writes under
 * — this test drives exactly that sequence and pins that the walk still
 * proceeds instead of riding the 30s timeout.
 */
describe('useLearnPath.explore — rawKey re-derived per query (fresh-context review MEDIUM)', () => {
  it('a model change between two on-demand queries does not strand the second wait on a stale key', async () => {
    const board = createInitialBoard();
    board.sourceCardId = ANCHOR_CARD_ID;
    seedAnchorKnownPosition(board, ANCHOR_CARD_ID);
    addBoard(board);
    const boardId = board.id as BoardId;
    mockDedupFakes([]);
    store.engine.selectedModel = 'model-a';

    let queryCount = 0;
    // The fake IS the engine: it always records under whatever `rawKey`
    // is CURRENT at the moment it fires — exactly like the real wire path
    // (`onAnalysisUpdate`) would, since the outgoing query itself carries
    // the live model. If the walk asks `waitForAnalysis` to watch a
    // STALE key, this write lands in a bucket nothing is watching and the
    // wait times out instead of resolving.
    fakeAnalysisService.analyzeActiveNode.mockImplementation((bId: BoardId) => {
      queryCount++;
      const live = store.boards.find(b => b.id === bId)!;
      // `waitForAnalysis` matches on `(nodeId, turnNumber)` — the root
      // query is 0 real moves in (turnNumber 0, `rawWithMoves`'s
      // default); the second query is at D4, one real move in.
      const raw = queryCount === 1
        ? rawWithMoves([{ move: 'D4', order: 0 }]) // root: single spine step
        : { ...rawWithMoves([]), turnNumber: 1 }; // D4's own position: frontier, ends the walk
      ledger.recordRaw(activeAnalysisKeys.value.rawKey, live.currentNodeId, raw);
      return FAKE_QUERY_ID as QueryId;
    });

    // Mid-walk settings change: fires between the root query settling
    // (which grows the D4 child and yields) and the D4-position query
    // being issued — the exact window the review named.
    const yieldStep = async () => {
      if (queryCount === 1) store.engine.selectedModel = 'model-b';
      await Promise.resolve();
    };

    const { explore } = useLearnPath();
    const exploration = await explore({ boardId, depth: 2, topK: 1, tag: 'keydrift', yieldStep });

    // Both queries fired and both were released — neither stranded on a
    // timeout (a timeout still resolves `walk()`, but only after riding
    // the real `KATAGO_ANALYSIS_TIMEOUT_MS` clock, which this test does
    // not fake — a hang here would time out the test itself).
    expect(queryCount).toBe(2);
    expect(fakeAnalysisService.stopQuery).toHaveBeenCalledTimes(2);

    // D4's position resolved as a genuine frontier (the engine answered
    // with no candidates), not a stale-key timeout being misreported as
    // a refusal at the WRONG node — the tree still grew past root.
    expect(exploration.frontierCount).toBe(1);
    const finalBoard = store.boards.find(b => b.id === boardId)!;
    const d4NodeId = finalBoard.nodes[board.rootNodeId].children[0];
    expect(finalBoard.nodes[d4NodeId]).toBeDefined();
    expect(exploration._pending.frontiers[0].nodeId).toBe(d4NodeId);
  });
});
