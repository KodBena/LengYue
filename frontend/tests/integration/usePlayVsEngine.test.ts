/**
 * tests/integration/usePlayVsEngine.test.ts
 *
 * Tier-3 (composable integration) tests for `usePlayVsEngine` — the
 * play-vs-engine game-session wiring extracted from App.vue
 * (work-status item app-vue-style-and-wiring-extraction). Pins the
 * session-lifecycle policy against the real store:
 *
 *   - handleStartGame creates the `BoardState.games` entry at the
 *     cursor and kicks the engine responder exactly when the start
 *     position is the engine's colour's turn.
 *   - handleEndGame deletes the entry.
 *   - activeBoardGameHeadIds projects one green-ring NodeId per
 *     session.
 *
 * The engine responder is a spy-backed handle injected through the
 * composable's parameter (the same seam useBoardMoveRouting uses).
 *
 * License: Public Domain (The Unlicense)
 */

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

import { usePlayVsEngine } from '../../src/composables/board/usePlayVsEngine';
import type { EngineResponderHandle } from '../../src/composables/board/useEngineResponder';
import { store, addBoard, resetWorkspace } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { resetFakeBackendService } from '../fakes/backend-service';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId } from '../../src/types';

function setup() {
  const board = createInitialBoard();
  addBoard(board);
  const boardId: BoardId = board.id;
  const fireAndAdvanceHead =
    vi.fn<EngineResponderHandle['fireAndAdvanceHead']>().mockResolvedValue(undefined);
  const responder: EngineResponderHandle = { fireAndAdvanceHead };
  const playVsEngine = usePlayVsEngine(responder);
  return { board, boardId, playVsEngine, fireAndAdvanceHead };
}

beforeEach(() => {
  resetFakeBackendService();
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
});

describe('usePlayVsEngine.handleStartGame', () => {
  it("creates the game entry and kicks the responder when the start position is the engine's turn", () => {
    const { board, boardId, playVsEngine, fireAndAdvanceHead } = setup();

    // Fresh board: turn is B. User plays W ⇒ engine is B ⇒ it is the
    // engine's turn at the start position ⇒ one synchronous kick.
    playVsEngine.handleStartGame({ userColor: 'W', engineMaxVisits: 64, engineModel: null });

    const session = store.boards.find(b => b.id === boardId)?.games[board.rootNodeId];
    expect(session).toBeDefined();
    expect(session?.config).toEqual({ userColor: 'W', engineMaxVisits: 64, engineModel: null });
    expect(session?.currentHeadNodeId).toBe(board.rootNodeId);
    expect(fireAndAdvanceHead).toHaveBeenCalledTimes(1);
    expect(fireAndAdvanceHead).toHaveBeenCalledWith(boardId, board.rootNodeId);
  });

  it("creates the game entry without a kick when the start position is the user's turn", () => {
    const { board, boardId, playVsEngine, fireAndAdvanceHead } = setup();

    // Fresh board: turn is B. User plays B ⇒ the user moves first;
    // the responder fires later through the board-move routing's
    // head trigger, not here.
    playVsEngine.handleStartGame({ userColor: 'B', engineMaxVisits: 64, engineModel: null });

    expect(store.boards.find(b => b.id === boardId)?.games[board.rootNodeId]).toBeDefined();
    expect(fireAndAdvanceHead).not.toHaveBeenCalled();
  });
});

describe('usePlayVsEngine.handleEndGame + activeBoardGameHeadIds', () => {
  it('the heads set tracks session creation and deletion', () => {
    const { board, boardId, playVsEngine } = setup();

    playVsEngine.handleStartGame({ userColor: 'B', engineMaxVisits: 64, engineModel: null });
    expect(playVsEngine.activeBoardGameHeadIds.value?.has(board.rootNodeId)).toBe(true);

    playVsEngine.handleEndGame(board.rootNodeId);
    expect(store.boards.find(b => b.id === boardId)?.games[board.rootNodeId]).toBeUndefined();
    expect(playVsEngine.activeBoardGameHeadIds.value?.size).toBe(0);
  });
});
