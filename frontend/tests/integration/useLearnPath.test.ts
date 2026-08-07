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

import { store, addBoard, closeBoard } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { applyGoMove } from '../../src/logic';
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
import type { BoardId, BoardState, CardId, CardLineageTree, CardPublicId, GameDisplayOrdinal, NodeId, RawAnalysis, ReviewCard } from '../../src/types';

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

function mockDedupFakes(existingContent: readonly { cardId: CardId; sgf: string }[]) {
  fakeBackendService.resolveRoots.mockResolvedValue({
    roots: [{ rootCardPublicId: ANCHOR_ROOT_PUBLIC_ID, gameSourceDisplayOrdinal: GAME_DISPLAY_ORDINAL, cardIdsInTree: [ANCHOR_CARD_ID] }],
    unmatchedCardIds: [],
  });
  fakeBackendService.fetchTreeByRoot.mockResolvedValue({
    rootCardPublicId: ANCHOR_ROOT_PUBLIC_ID,
    gameSourceDisplayOrdinal: GAME_DISPLAY_ORDINAL,
    tree: { id: ANCHOR_CARD_ID, children: existingContent.map(e => ({ id: e.cardId, children: [] })) },
  } satisfies CardLineageTree);
  fakeBackendService.fetchCard.mockImplementation(async (id: CardId) => {
    const hit = existingContent.find(e => e.cardId === id);
    if (!hit) throw new Error(`unexpected fetchCard(${id})`);
    return stubReviewCard(hit.cardId, hit.sgf);
  });
}

beforeEach(() => {
  resetFakeBackendService();
  ledger.purgeAll();
  store.boards.length = 0;
  store.activeBoardIndex = 0;
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
});

describe('useLearnPath.confirmMint — deferred, explicit, one batch call', () => {
  it('mints exactly the pending-minus-existing set in one pass, clears markers, matches the acceptance shape', async () => {
    const { board, moves, nodeIds, q16Sgf } = buildAnchorBoard();
    board.sourceCardId = ANCHOR_CARD_ID;
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

  it('refuses a board with no sourceCardId (precondition)', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const { explore } = useLearnPath();
    await expect(
      explore({ boardId: board.id as BoardId, depth: 1, topK: 1, tag: 'x' }),
    ).rejects.toThrow(LearnPathPreconditionError);
  });

  it('refuses a board whose cursor is not at the root (precondition)', async () => {
    const base = createInitialBoard();
    base.sourceCardId = ANCHOR_CARD_ID;
    const moved = applyGoMove(base, 3, 3)!;
    moved.sourceCardId = ANCHOR_CARD_ID;
    moved.id = base.id;
    addBoard(moved);
    const { explore } = useLearnPath();
    await expect(
      explore({ boardId: moved.id as BoardId, depth: 1, topK: 1, tag: 'x' }),
    ).rejects.toThrow(LearnPathPreconditionError);
  });
});
