/**
 * tests/integration/useChartNavigation.test.ts
 *
 * Tier-3 (composable integration) tests for `useChartNavigation`.
 * The composable is the centralised handler shared by every
 * analysis-chart panel: ECharts emits a turn-index or
 * (color, color-local-move-index) tuple on click/hover; the
 * composable converts that to a NodeId and either navigates the
 * board (click) or asks the thumbnail cache for an SVG preview
 * (hover).
 *
 * The two correctness invariants the tests pin:
 *
 *   - **Main click navigates to the position AT the clicked turn.**
 *     `handleMainClick(turnIdx)` finds `variationPath[turnIdx]` and
 *     calls `navigateTo` on it. Out-of-bounds clicks are no-ops.
 *   - **Player click navigates to the position BEFORE the move.**
 *     The asymmetry is deliberate (see the composable's docstring):
 *     click reveals the situation the player faced; hover previews
 *     the result. `handlePlayerClick` subtracts one ply from
 *     `colorMoveToPly(moveIdx, color)` to land on the before-move
 *     position.
 *
 * `useThumbnailCache` is mocked because its real implementation
 * renders SVG via the board renderer — out of scope for the
 * integration tier and not where useChartNavigation's logic lives.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref } from 'vue';
import { describe, it, expect, vi, beforeEach } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

// Mock the thumbnail cache — useChartNavigation's hover handlers
// call getThumbnailSvg and store the result on the previewRef. The
// mock returns a deterministic SVG string per call so the hover-
// handler tests can assert on the previewRef value directly.
vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  useThumbnailCache: () => ({
    getThumbnailSvg: vi.fn(async (nodeId: string, _boardId: string, showMarker: boolean) =>
      `<svg data-node="${nodeId}" data-marker="${showMarker}"/>`,
    ),
    getVariationThumbnail: vi.fn(),
    getSync: vi.fn(),
    warmPath: vi.fn(),
  }),
  purgeBoardThumbnails: vi.fn(),
  purgeAllThumbnails: vi.fn(),
}));

// Mock the persistence service to keep resetWorkspace quiet.
vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

// Mock the analysis service for the same reason.
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, mutateBoard, resetWorkspace, store } from '../../src/store';
import { useChartNavigation } from '../../src/composables/analysis/useChartNavigation';
import { useVariationPath } from '../../src/composables/board/useVariationPath';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId, BoardState, ColorMoveIndex, NodeId } from '../../src/types';

beforeEach(() => {
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
});

/**
 * Loads an SGF, adds the resulting board to the store, and returns
 * the board's id plus its variation path. Convenience for the
 * composable-construction step every test in this file repeats.
 */
function setup(source: string): { boardId: BoardId; board: BoardState } {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  return { boardId: board.id, board };
}

describe('useChartNavigation.handleMainClick', () => {
  it('navigates the board to variationPath[turnIdx]', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const variationPath = useVariationPath(() => boardId);
    const { handleMainClick } = useChartNavigation(variationPath, boardId);

    // Click on turn 2 (the second move on the path: W[dp]).
    handleMainClick(2);

    const targetNodeId = variationPath.value[2];
    const board = store.boards.find(b => b.id === boardId)!;
    expect(board.currentNodeId).toBe(targetNodeId);
    // After navigating to W[dp] (index 2), B(pd) and W(dp) are on
    // the board.
    expect(board.stones['15,15']).toBe('B'); // pd
    expect(board.stones['3,3']).toBe('W');   // dp
  });

  it('is a no-op when turnIdx is out of range', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp])');
    const variationPath = useVariationPath(() => boardId);
    const { handleMainClick } = useChartNavigation(variationPath, boardId);

    const before = store.boards.find(b => b.id === boardId)!.currentNodeId;
    handleMainClick(99); // far past the leaf

    const after = store.boards.find(b => b.id === boardId)!.currentNodeId;
    expect(after).toBe(before);
  });

  it('navigates back to the root when turnIdx is 0', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp])');
    const variationPath = useVariationPath(() => boardId);
    const { handleMainClick } = useChartNavigation(variationPath, boardId);

    // Pre-position the cursor at the leaf so we can observe the
    // backwards navigation.
    handleMainClick(2);
    expect(Object.keys(store.boards.find(b => b.id === boardId)!.stones).length).toBe(2);

    handleMainClick(0);
    const board = store.boards.find(b => b.id === boardId)!;
    expect(board.currentNodeId).toBe(board.rootNodeId);
    expect(board.stones).toEqual({});
  });
});

describe('useChartNavigation.handlePlayerClick', () => {
  // Per colorMoveToPly: B's m-th move (0-indexed) is at PlyIndex
  // 2m+1; W's at 2m+2. handlePlayerClick subtracts one to navigate
  // to the BEFORE-move position.
  //   - B move 0 → ply 1; click target ply 0 = root.
  //   - B move 1 → ply 3; click target ply 2 = the W[dp] node.
  //   - W move 0 → ply 2; click target ply 1 = the B[pd] node.

  it('navigates to the position BEFORE the Black move (move 0 → root)', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const variationPath = useVariationPath(() => boardId);
    const { handlePlayerClick } = useChartNavigation(variationPath, boardId);

    handlePlayerClick('B', 0 as ColorMoveIndex);

    const board = store.boards.find(b => b.id === boardId)!;
    expect(board.currentNodeId).toBe(board.rootNodeId);
  });

  it('navigates to the position BEFORE the second Black move (move 1 → W[dp] node)', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const variationPath = useVariationPath(() => boardId);
    const { handlePlayerClick } = useChartNavigation(variationPath, boardId);

    handlePlayerClick('B', 1 as ColorMoveIndex);

    const targetNodeId = variationPath.value[2]; // the W[dp] node
    const board = store.boards.find(b => b.id === boardId)!;
    expect(board.currentNodeId).toBe(targetNodeId);
  });

  it('navigates to the position BEFORE the first White move (move 0 → B[pd] node)', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const variationPath = useVariationPath(() => boardId);
    const { handlePlayerClick } = useChartNavigation(variationPath, boardId);

    handlePlayerClick('W', 0 as ColorMoveIndex);

    const targetNodeId = variationPath.value[1]; // the B[pd] node
    const board = store.boards.find(b => b.id === boardId)!;
    expect(board.currentNodeId).toBe(targetNodeId);
  });
});

describe('useChartNavigation.handleMainHover', () => {
  it('writes the thumbnail SVG (showMarker=false) for the hovered turn into previewRef', async () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp])');
    const variationPath = useVariationPath(() => boardId);
    const { handleMainHover } = useChartNavigation(variationPath, boardId);

    const previewRef = ref('');
    await handleMainHover(2, previewRef);

    const targetNodeId = variationPath.value[2];
    expect(previewRef.value).toBe(`<svg data-node="${targetNodeId}" data-marker="false"/>`);
  });
});

describe('useChartNavigation.handlePlayerHover', () => {
  it('previews the position AT the move (showMarker=true) for the player panel', async () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const variationPath = useVariationPath(() => boardId);
    const { handlePlayerHover } = useChartNavigation(variationPath, boardId);

    const previewRef = ref('');
    await handlePlayerHover('B', 1 as ColorMoveIndex, previewRef);

    // colorMoveToPly(1, 'B') = 3. handlePlayerHover (unlike click)
    // does not subtract one — the preview shows the position AFTER
    // the move.
    const targetNodeId = variationPath.value[3];
    expect(previewRef.value).toBe(`<svg data-node="${targetNodeId}" data-marker="true"/>`);
  });
});

describe('useChartNavigation — integration with useVariationPath', () => {
  // The composable accepts a Ref<NodeId[]> (typically `useVariationPath`'s
  // computed). Whenever the board's mainline changes — e.g. after a
  // mutateBoard call that flips activeChildIndex — the variationPath
  // recomputes and the click handlers see the new path.
  it('reads a freshly-computed variationPath after mutateBoard fires', () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd](;W[dp])(;W[pp]))');
    const variationPath = useVariationPath(() => boardId);
    const { handleMainClick } = useChartNavigation(variationPath, boardId);

    // Initially active variation is the first one (W[dp]).
    expect(variationPath.value).toHaveLength(3); // root, B, W[dp]

    // Switch the active variation under B[pd] to the second sibling.
    mutateBoard(boardId, draft => {
      const branchPoint = draft.nodes[draft.rootNodeId].children[0] as NodeId;
      draft.nodes[branchPoint].activeChildIndex = 1;
    });
    // The path now ends at W[pp] instead of W[dp]; same length.
    expect(variationPath.value).toHaveLength(3);

    // Clicking turn 2 navigates to the new active sibling (W[pp]).
    handleMainClick(2);
    const board = store.boards.find(b => b.id === boardId)!;
    expect(board.stones['15,3']).toBe('W'); // pp present
    expect(board.stones['3,3']).toBeUndefined(); // dp absent
  });
});
