/**
 * tests/integration/useAnalysisProjection.test.ts
 *
 * Tier-3 (composable integration) tests for `useAnalysisProjection`.
 * The composable is the single source of truth for the indices
 * displayed on the analysis chart and the two player panels —
 * `activeMainIndex` (the cursor's position on the variation chart),
 * `activeBlackIndex` and `activeWhiteIndex` (the per-colour move
 * counts driving each player panel's highlighted row).
 *
 * The composable also exposes a derived `mainSeries` that combines
 * kernel data + enriched stone-state series + per-point colouring —
 * tested in a follow-up PR after the kernel and ledger composables
 * pick up their own coverage. Phase 2 covers the index computeds,
 * which are the closed-form derivations over the board state.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

// Mock the persistence + analysis services to keep resetWorkspace
// off the network. The thumbnail cache is also mocked because
// useAnalysisProjection's dependency chain transits through
// composables that may warm thumbnails on path changes.
vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  useThumbnailCache: () => ({
    getThumbnailSvg: vi.fn(async () => ''),
    getVariationThumbnail: vi.fn(),
    getSync: vi.fn(),
    warmPath: vi.fn(),
  }),
  purgeBoardThumbnails: vi.fn(),
  purgeAllThumbnails: vi.fn(),
}));

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, mutateBoard, resetWorkspace, store } from '../../src/store';
import { navigateTo } from '../../src/engine/navigator';
import { useAnalysisProjection } from '../../src/composables/analysis/useAnalysisProjection';
import { withSetup } from './with-setup';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId, BoardState, NodeId } from '../../src/types';

beforeEach(() => {
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
});

function setup(source: string): { boardId: BoardId; board: BoardState } {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  return { boardId: board.id, board };
}

/**
 * Walks the active variation, finds the node at the given path
 * index, and navigates the board's currentNodeId there. Used to
 * position the cursor at known points before reading the index
 * computeds.
 */
function navigateToPathIndex(boardId: BoardId, idx: number): void {
  mutateBoard(boardId, draft => {
    // Walk active children to materialise the path; the navigator
    // does the same as a side-effect, but we also want a stable
    // identity for the target node.
    let curr = draft.nodes[draft.rootNodeId];
    const path: NodeId[] = [curr.id];
    while (curr.children.length > 0) {
      const next = curr.children[curr.activeChildIndex] ?? curr.children[0];
      path.push(next);
      curr = draft.nodes[next];
    }
    navigateTo(draft, path[idx]);
  });
}

describe('useAnalysisProjection.activeMainIndex', () => {
  it('is 0 when the cursor is at the root', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const projection = withSetup(() => useAnalysisProjection(boardId));
    expect(projection.activeMainIndex.value).toBe(0);
  });

  it('matches the path index of the current node after navigation', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const projection = withSetup(() => useAnalysisProjection(boardId));

    navigateToPathIndex(boardId, 2); // W[dp]
    expect(projection.activeMainIndex.value).toBe(2);

    navigateToPathIndex(boardId, 3); // B[pp]
    expect(projection.activeMainIndex.value).toBe(3);
  });

  it("reflects its own board's cursor, not the global active board's (P2: latent scope desync)", () => {
    // Two boards; make A active while projecting B (the non-active board).
    // Pre-fix, activeMainIndex read the ambient `activeBoard` (A) and indexed
    // A's cursor against B's variation path — a cross-board desync. Post-fix
    // it reads board B's own currentNodeId. Latent today (one projection is
    // mounted, for the active board) but the projection's contract is "the
    // indices for THIS boardId", which this pins.
    const a = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const b = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    store.activeBoardIndex = store.boards.findIndex(x => x.id === a.boardId);

    navigateToPathIndex(a.boardId, 1); // A's cursor at index 1
    navigateToPathIndex(b.boardId, 3); // B's cursor at index 3

    const projection = withSetup(() => useAnalysisProjection(b.boardId));
    expect(projection.activeMainIndex.value).toBe(3);
  });
});

describe('useAnalysisProjection.activeBlackIndex / activeWhiteIndex', () => {
  // The composable's getPlayerIndex contract:
  //
  //   1. If the active node IS itself a move of the queried color,
  //      return null. The "this color just moved" state has nothing
  //      to highlight on that color's panel.
  //   2. Otherwise, count how many moves of the queried color have
  //      been played up to and including the active node, and
  //      return that count as a ColorMoveIndex.
  //
  // The root node has no move (move === null), so neither colour's
  // early-return triggers there — both indices are 0.

  it('returns 0 for both colours at the root (no moves played)', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp];W[dd])');
    const projection = withSetup(() => useAnalysisProjection(boardId));

    expect(projection.activeBlackIndex.value).toBe(0);
    expect(projection.activeWhiteIndex.value).toBe(0);
  });

  it('returns null for activeBlackIndex when the active node is itself a Black move', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const projection = withSetup(() => useAnalysisProjection(boardId));

    navigateToPathIndex(boardId, 1); // B[pd] — Black just moved
    expect(projection.activeBlackIndex.value).toBeNull();
    // White hasn't moved yet at this index.
    expect(projection.activeWhiteIndex.value).toBe(0);
  });

  it('returns null for activeWhiteIndex when the active node is itself a White move', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const projection = withSetup(() => useAnalysisProjection(boardId));

    navigateToPathIndex(boardId, 2); // W[dp] — White just moved
    expect(projection.activeWhiteIndex.value).toBeNull();
    // Black has played one move (at index 1) up to here.
    expect(projection.activeBlackIndex.value).toBe(1);
  });

  it('counts the correct cumulative move counts mid-game', () => {
    // 4-move mainline: B(pd), W(dp), B(pp), W(dd). After all four
    // moves are played, sitting on the W(dd) leaf:
    //   - activeWhiteIndex: null (W just moved)
    //   - activeBlackIndex: 2 (two B moves at indices 1 and 3)
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp];W[dd])');
    const projection = withSetup(() => useAnalysisProjection(boardId));

    navigateToPathIndex(boardId, 4);
    expect(projection.activeBlackIndex.value).toBe(2);
    expect(projection.activeWhiteIndex.value).toBeNull();

    // Step back one to B(pp): activeBlackIndex = null, activeWhiteIndex = 1.
    navigateToPathIndex(boardId, 3);
    expect(projection.activeBlackIndex.value).toBeNull();
    expect(projection.activeWhiteIndex.value).toBe(1);
  });
});

describe('useAnalysisProjection — variationPath / pass-throughs', () => {
  it('exposes a variationPath ref that mirrors the board\'s active variation', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp])');
    const projection = withSetup(() => useAnalysisProjection(boardId));

    expect(projection.variationPath.value).toHaveLength(3); // root + 2 moves
  });
});
