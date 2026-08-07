/**
 * tests/integration/useLearnPath.test.ts
 *
 * "Learn this path" (wiki #8, ledger row 660/700 — see
 * src/composables/cards/useLearnPath.ts's module header for the full
 * design). This is the pre-registered acceptance test: a synthetic
 * ledger produces a deterministic seeded set to a given depth/K/tag,
 * an unanalyzed frontier fails loudly with a partial-result report
 * (not a silent truncation, ADR-0002), and an already-minted position
 * is skipped-with-notice rather than re-minted.
 *
 * Determinism trick: `applyGoMove`'s node ids are `Math.random()`-keyed
 * (src/logic.ts), so a node id can't be predicted in the abstract. The
 * "existing-child reuse" branch in `applyGoMove` is the way out: the
 * anchor board fixture below is built by actually PLAYING the two
 * depth-1 candidate moves from a scratch root first (via `applyGoMove`
 * directly, off the board the test hands the composable), which mints
 * their real child nodes — then the board's `nodes` map (which now
 * contains both children) is spliced onto a fresh, EMPTY-stones root
 * cursor. When `useLearnPath` independently calls `applyGoMove` for the
 * same two moves, `src/logic.ts`'s existing-child-reuse fires and lands
 * on exactly these precomputed node ids — so the ledger can be seeded
 * at known positions and the resulting `canonicalContent` for the
 * "already exists" fixture can be computed with the same
 * `serializeActivePath` call the production code uses, verbatim.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

import { store, addBoard } from '../../src/store';
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
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import type { BoardId, BoardState, CardId, CardLineageTree, GameSourceId, RawAnalysis, ReviewCard } from '../../src/types';

const ANCHOR_CARD_ID = 1000 as CardId;
const EXISTING_D4_CARD_ID = 1001 as CardId;
const GAME_SOURCE_ID = 5000 as GameSourceId;

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
 * Builds the anchor board fixture: root with two already-materialised
 * children (D4, Q16 — the depth-1 candidates), cursor back at the root
 * with EMPTY stones (nothing "played" from the cursor's point of view;
 * only the tree shape is pre-seeded). See the module header for why.
 */
function buildAnchorBoard(): { board: BoardState; d4NodeId: string; q16NodeId: string; d4Sgf: string } {
  const base = createInitialBoard();
  const afterD4 = applyGoMove(base, 3, 3)!; // D4 (col index 3, row index 3)
  expect(afterD4).not.toBeNull();
  const rootWithD4: BoardState = { ...base, nodes: afterD4.nodes };
  const afterQ16 = applyGoMove(rootWithD4, 15, 15)!; // Q16, sibling of D4 under root
  expect(afterQ16).not.toBeNull();

  const board: BoardState = { ...base, nodes: afterQ16.nodes, currentNodeId: base.rootNodeId };
  const rootNode = board.nodes[board.rootNodeId];
  const d4NodeId = rootNode.children[0];
  const q16NodeId = rootNode.children[1];

  // The D4 candidate's canonical content — computed via the SAME
  // applyGoMove + serializeActivePath calls the composable will make
  // independently; existing-child reuse guarantees byte-identical output.
  const atD4 = applyGoMove(board, 3, 3)!;
  const d4Sgf = serializeActivePath(atD4);

  return { board, d4NodeId, q16NodeId, d4Sgf };
}

beforeEach(() => {
  resetFakeBackendService();
  ledger.purgeAll();
  store.boards.length = 0;
  store.activeBoardIndex = 0;
});

describe('useLearnPath — synthetic-ledger acceptance', () => {
  it('seeds the deterministic set to depth 2/K 2, skips the existing card, and reports the unanalyzed frontier', async () => {
    const { board, d4NodeId, q16NodeId, d4Sgf } = buildAnchorBoard();
    board.sourceCardId = ANCHOR_CARD_ID;
    addBoard(board);
    const boardId = board.id as BoardId;

    // Root: D4 (rank 1 / order 0) already exists as a card; Q16 (rank 2 /
    // order 1) does not.
    ledger.recordRaw(activeAnalysisKeys.value.rawKey, board.rootNodeId, rawWithMoves([
      { move: 'D4', order: 0 },
      { move: 'Q16', order: 1 },
    ]));
    // Under D4 (depth 1): Q16 is a legal continuation (rank 1); "pass"
    // (rank 2) is unplayable and must be recorded as a skip, not silently
    // dropped. Q16 under D4 is NOT recorded — the walk under the OTHER
    // depth-1 branch (Q16-at-root) has no analysis at all, so that branch
    // is the frontier; this one continues to depth 2.
    ledger.recordRaw(activeAnalysisKeys.value.rawKey, d4NodeId, rawWithMoves([
      { move: 'Q16', order: 0 },
      { move: 'pass', order: 1 },
    ]));
    // Deliberately NOT seeding analysis at q16NodeId — the frontier case.

    // Dedup-coverage fakes: the anchor resolves to a one-card-deep tree
    // whose only descendant is the D4 position, already minted.
    fakeBackendService.resolveRoots.mockResolvedValue({
      roots: [{ rootCardId: ANCHOR_CARD_ID, gameSourceId: GAME_SOURCE_ID, cardIdsInTree: [ANCHOR_CARD_ID] }],
      unmatchedCardIds: [],
    });
    fakeBackendService.fetchTreeByRoot.mockResolvedValue({
      rootCardId: ANCHOR_CARD_ID,
      gameSourceId: GAME_SOURCE_ID,
      tree: { id: ANCHOR_CARD_ID, children: [{ id: EXISTING_D4_CARD_ID, children: [] }] },
    } satisfies CardLineageTree);
    fakeBackendService.fetchCard.mockResolvedValue(stubReviewCard(EXISTING_D4_CARD_ID, d4Sgf));

    let nextMintedId = 2000;
    fakeBackendService.createCard.mockImplementation(async () => nextMintedId++);

    const { runLearnPath } = useLearnPath();
    const result = await runLearnPath({ boardId, depth: 2, topK: 2, tag: 'taisha' });

    expect(result.tag).toBe('taisha');

    // Seeded: Q16-at-root (depth1, rank2) and Q16-under-D4 (depth2, rank1).
    expect(result.seeded).toHaveLength(2);
    const seededByDepth = [...result.seeded].sort((a, b) => a.plyDepth - b.plyDepth);
    expect(seededByDepth[0]).toMatchObject({ parentCardId: ANCHOR_CARD_ID, plyDepth: 1, rank: 2 });
    expect(seededByDepth[1]).toMatchObject({ parentCardId: EXISTING_D4_CARD_ID, plyDepth: 2, rank: 1 });
    // Every seeded card carries the mint through the real createCard spy
    // (existing mint path, constraint 3), tagged with the user's context tag.
    for (const call of fakeBackendService.createCard.mock.calls) {
      expect((call[0] as { tags: string[] }).tags).toEqual(['taisha']);
    }
    expect(fakeBackendService.createCard).toHaveBeenCalledTimes(2);

    // Skipped: D4-at-root as existing-card, pass-under-D4 as unplayable-move.
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped).toContainEqual(expect.objectContaining({
      reason: 'existing-card', existingCardId: EXISTING_D4_CARD_ID, parentCardId: ANCHOR_CARD_ID, plyDepth: 1, rank: 1,
    }));
    expect(result.skipped).toContainEqual(expect.objectContaining({
      reason: 'unplayable-move', parentCardId: EXISTING_D4_CARD_ID, plyDepth: 2, rank: 2,
    }));

    // Frontier: the Q16-at-root branch has no recorded analysis at its
    // own (newly seeded) position — reported, not silently truncated.
    expect(result.frontiers).toHaveLength(1);
    expect(result.frontiers[0]).toMatchObject({ parentCardId: seededByDepth[0].cardId, plyDepth: 1, nodeId: q16NodeId });
  });

  it('is deterministic — same ledger state + same params produce the same seeded set twice', async () => {
    const build = () => {
      const { board, d4NodeId } = buildAnchorBoard();
      board.sourceCardId = ANCHOR_CARD_ID;
      ledger.recordRaw(activeAnalysisKeys.value.rawKey, board.rootNodeId, rawWithMoves([
        { move: 'D4', order: 0 },
        { move: 'Q16', order: 1 },
      ]));
      ledger.recordRaw(activeAnalysisKeys.value.rawKey, d4NodeId, rawWithMoves([{ move: 'Q16', order: 0 }]));
      return board;
    };

    fakeBackendService.resolveRoots.mockResolvedValue({
      roots: [{ rootCardId: ANCHOR_CARD_ID, gameSourceId: GAME_SOURCE_ID, cardIdsInTree: [ANCHOR_CARD_ID] }],
      unmatchedCardIds: [],
    });
    fakeBackendService.fetchTreeByRoot.mockResolvedValue({
      rootCardId: ANCHOR_CARD_ID,
      gameSourceId: GAME_SOURCE_ID,
      tree: { id: ANCHOR_CARD_ID, children: [] },
    } satisfies CardLineageTree);
    let nextMintedId = 3000;
    fakeBackendService.createCard.mockImplementation(async () => nextMintedId++);

    const { runLearnPath } = useLearnPath();

    store.boards.length = 0;
    addBoard(build());
    const run1 = await runLearnPath({ boardId: store.boards[0].id as BoardId, depth: 2, topK: 1, tag: 'taisha' });

    ledger.purgeAll();
    store.boards.length = 0;
    addBoard(build());
    const run2 = await runLearnPath({ boardId: store.boards[0].id as BoardId, depth: 2, topK: 1, tag: 'taisha' });

    const shape = (r: typeof run1) => ({
      seeded: r.seeded.map(s => ({ plyDepth: s.plyDepth, rank: s.rank, move: s.move })),
      skipped: r.skipped,
      frontierPlyDepths: r.frontiers.map(f => f.plyDepth),
    });
    expect(shape(run1)).toEqual(shape(run2));
  });

  it('fails loudly on missing params rather than defaulting silently', async () => {
    const { board } = buildAnchorBoard();
    board.sourceCardId = ANCHOR_CARD_ID;
    addBoard(board);
    const boardId = board.id as BoardId;
    const { runLearnPath } = useLearnPath();

    await expect(runLearnPath({ boardId, depth: 0, topK: 1, tag: 'x' })).rejects.toThrow(LearnPathError);
    await expect(runLearnPath({ boardId, depth: 1, topK: 0, tag: 'x' })).rejects.toThrow(LearnPathError);
    await expect(runLearnPath({ boardId, depth: 1, topK: 1, tag: '   ' })).rejects.toThrow(LearnPathError);
  });

  it('refuses a board with no sourceCardId (precondition)', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const { runLearnPath } = useLearnPath();
    await expect(
      runLearnPath({ boardId: board.id as BoardId, depth: 1, topK: 1, tag: 'x' }),
    ).rejects.toThrow(LearnPathPreconditionError);
  });

  it('refuses a board whose cursor is not at the root (precondition)', async () => {
    const base = createInitialBoard();
    base.sourceCardId = ANCHOR_CARD_ID;
    const moved = applyGoMove(base, 3, 3)!;
    moved.sourceCardId = ANCHOR_CARD_ID;
    moved.id = base.id;
    addBoard(moved);
    const { runLearnPath } = useLearnPath();
    await expect(
      runLearnPath({ boardId: moved.id as BoardId, depth: 1, topK: 1, tag: 'x' }),
    ).rejects.toThrow(LearnPathPreconditionError);
  });
});
