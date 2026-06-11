/**
 * tests/integration/useFollowMePonder.test.ts
 *
 * Tier-3 (composable integration) tests for `useFollowMePonder` —
 * the "Follow Me" ponder watcher extracted from App.vue (work-status
 * item app-vue-style-and-wiring-extraction). Pins the trigger
 * contract against the real store + the analysis-service fake:
 *
 *   - same-board navigation while pondering → re-issue the ponder
 *     query (`analyzeActiveNode(boardId, 'ponder')`);
 *   - same-board navigation while NOT pondering → no call;
 *   - a board switch (active-tab change) → no call, even while
 *     pondering — re-issuing on a switch would churn the proxy's
 *     canonical query (the contract the watcher's id-comparison
 *     encodes).
 *
 * The watcher is instance-scoped, so the composable runs under
 * `withSetup` (a disposing host component) per tests/CLAUDE.md's
 * composable-lifecycle gotcha.
 *
 * License: Public Domain (The Unlicense)
 */

import { nextTick } from 'vue';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

import { useFollowMePonder } from '../../src/composables/board/useFollowMePonder';
import { withSetup } from './with-setup';
import {
  store,
  addBoard,
  setActiveBoard,
  updateBoardState,
  resetWorkspace,
} from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { applyGoMove } from '../../src/logic';
import { resetFakeBackendService } from '../fakes/backend-service';
import {
  fakeAnalysisService,
  resetFakeAnalysisService,
} from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId } from '../../src/types';

function playMoveOn(boardId: BoardId, x: number, y: number): void {
  const idx = store.boards.findIndex(b => b.id === boardId);
  const next = applyGoMove(store.boards[idx], x, y);
  if (!next) throw new Error('test move was illegal');
  updateBoardState(idx, next);
}

beforeEach(() => {
  resetFakeBackendService();
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
});

describe('useFollowMePonder', () => {
  it('re-issues the ponder query on same-board navigation while pondering', async () => {
    const board = createInitialBoard();
    addBoard(board);
    fakeAnalysisService.isPondering.mockReturnValue(true);

    withSetup(() => useFollowMePonder());

    playMoveOn(board.id, 3, 3);
    await nextTick();

    expect(fakeAnalysisService.analyzeActiveNode).toHaveBeenCalledTimes(1);
    expect(fakeAnalysisService.analyzeActiveNode).toHaveBeenCalledWith(board.id, 'ponder');
  });

  it('does nothing on same-board navigation when the board is not pondering', async () => {
    const board = createInitialBoard();
    addBoard(board);
    // resetFakeAnalysisService re-arms isPondering → false (default).

    withSetup(() => useFollowMePonder());

    playMoveOn(board.id, 3, 3);
    await nextTick();

    expect(fakeAnalysisService.analyzeActiveNode).not.toHaveBeenCalled();
  });

  it('does not re-issue on a board switch, even while pondering', async () => {
    const boardA = createInitialBoard();
    const boardB = createInitialBoard();
    addBoard(boardA);
    addBoard(boardB); // last add wins the active index → B is active
    fakeAnalysisService.isPondering.mockReturnValue(true);

    withSetup(() => useFollowMePonder());

    // Active tab flips B → A: a board switch, not "follow me".
    setActiveBoard(store.boards.findIndex(b => b.id === boardA.id));
    await nextTick();

    expect(fakeAnalysisService.analyzeActiveNode).not.toHaveBeenCalled();
  });
});
