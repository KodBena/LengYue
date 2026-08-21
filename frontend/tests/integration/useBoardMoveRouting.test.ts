/**
 * tests/integration/useBoardMoveRouting.test.ts
 *
 * Tier-3 (composable integration) tests for `useBoardMoveRouting` —
 * the grading-integrity policy extracted from App.vue (work-status
 * item app-vue-style-and-wiring-extraction). The property under test
 * is exactly the one the extraction was commissioned to make
 * testable: **free play must not bypass the review session's N-move
 * discipline and per-move grading.**
 *
 *   - AWAITING_MOVE: a board click routes to the session's graded
 *     single-move handler (analyzeRange fires, the move is counted),
 *     and paste-PV is refused outright — neither entry point can
 *     mutate the board around the grading loop.
 *   - LOADING / ANALYZING (transient SR states): both entry points
 *     refuse board mutation entirely.
 *   - IDLE / FINISHED: free play and paste-PV are allowed (FINISHED
 *     is the intermission study phase), and a free-play move from a
 *     green-ringed game head fires the engine responder.
 *
 * The review session under the routing gate is the REAL
 * `useReviewSession` driven against the service fakes (the same
 * split as useReviewSession.test.ts); the engine responder is a
 * spy-backed handle injected through the composable's parameter —
 * the seam the extraction introduced for exactly this purpose.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref } from 'vue';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';

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

// Preserve `AnalysisWaitError` from the real module (processUserMove's
// catch does an instanceof check); only `waitForAnalysis` is replaced.
vi.mock('../../src/composables/analysis/wait-for-analysis', async () => {
  const actual = await vi.importActual<typeof import('../../src/composables/analysis/wait-for-analysis')>(
    '../../src/composables/analysis/wait-for-analysis',
  );
  return {
    ...actual,
    waitForAnalysis: vi.fn(),
  };
});

import { useBoardMoveRouting } from '../../src/composables/board/useBoardMoveRouting';
import { useReviewSession } from '../../src/composables/review/useReviewSession';
import type { EngineResponderHandle } from '../../src/composables/board/useEngineResponder';
import {
  store,
  addBoard,
  mutateBoard,
  mutateReviewSession,
  resetWorkspace,
} from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import {
  AnalysisWaitError,
  waitForAnalysis,
} from '../../src/composables/analysis/wait-for-analysis';
import { resetFakeBackendService } from '../fakes/backend-service';
import {
  fakeAnalysisService,
  resetFakeAnalysisService,
} from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type {
  BoardId,
  BoardState,
  CardId,
  EbisuModel,
  NodeId,
  ReviewCard,
  ReviewStatus,
} from '../../src/types';
import type { PvMove } from '../../src/composables/board/use-pv-animation';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SENTINEL_EBISU: EbisuModel = { alpha: 4, beta: 4, t: 1 };

function makeReviewCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: 1 as CardId,
    canonicalContent: '(;FF[4]GM[1]SZ[19])',
    numMoves: 5,
    model: SENTINEL_EBISU,
    lastReviewedAt: null,
    numReviews: 0,
    suspended: false,
    defaultVisits: 1000,
    gamma: 1.0,
    ...overrides,
  };
}

function pvMove(x: number, y: number, moveNumber: number): PvMove {
  // `color` is a rendering-only field on PvMove; applyGoMove derives
  // the played colour from board.turn. 'B' is a placeholder.
  return { x, y, color: 'B', moveNumber };
}

/** Mount a board, the real review session over it, and the routing gate. */
function setup() {
  const board = createInitialBoard();
  addBoard(board);
  const boardId: BoardId = board.id;
  const boardIdRef = ref<BoardId | null>(boardId);
  const reviewSession = useReviewSession(boardIdRef);
  const fireAndAdvanceHead =
    vi.fn<EngineResponderHandle['fireAndAdvanceHead']>().mockResolvedValue(undefined);
  const responder: EngineResponderHandle = { fireAndAdvanceHead };
  const routing = useBoardMoveRouting(reviewSession, responder);
  return { board, boardId, reviewSession, routing, fireAndAdvanceHead };
}

function liveBoard(boardId: BoardId): BoardState {
  const found = store.boards.find(b => b.id === boardId);
  if (!found) throw new Error(`test board ${boardId} missing from store`);
  return found;
}

/** Put the per-board review row into a given status with one queued card. */
function setReviewStatus(boardId: BoardId, status: ReviewStatus, board: BoardState): void {
  mutateReviewSession(boardId, draft => {
    draft.status = status;
    draft.queue = [makeReviewCard()];
    draft.currentIndex = 0;
    draft.startingNodeId = board.rootNodeId;
  });
}

beforeEach(() => {
  resetFakeBackendService();
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  vi.mocked(waitForAnalysis).mockReset();
  resetWorkspace();
});

// ── AWAITING_MOVE: the graded path, never free play ─────────────────────────

describe('useBoardMoveRouting — handlePass mirrors handleBoardMove\'s gating', () => {
  it('AWAITING_MOVE: a pass routes to the review session\'s graded pass handler', async () => {
    const { board, boardId, routing, fireAndAdvanceHead } = setup();
    setReviewStatus(boardId, 'AWAITING_MOVE', board);

    vi.mocked(waitForAnalysis).mockRejectedValue(new AnalysisWaitError('timeout'));

    routing.handlePass();
    await flushPromises();

    expect(fakeAnalysisService.analyzeRange).toHaveBeenCalledTimes(1);
    expect(store.session.reviews[boardId]?.userMovesCount).toBe(1);
    const passNode = liveBoard(boardId).nodes[liveBoard(boardId).currentNodeId];
    expect(passNode.move?.type).toBe('pass');
    expect(fireAndAdvanceHead).not.toHaveBeenCalled();
  });

  it.each(['LOADING', 'ANALYZING'] as const)('%s: handlePass is a no-op', status => {
    const { board, boardId, routing } = setup();
    setReviewStatus(boardId, status, board);
    const nodeBefore = liveBoard(boardId).currentNodeId;

    routing.handlePass();

    expect(liveBoard(boardId).currentNodeId).toBe(nodeBefore);
    expect(fakeAnalysisService.analyzeRange).not.toHaveBeenCalled();
  });

  it('REVIEWED: handlePass is a no-op (restored snapshot is view-only)', () => {
    const { board, boardId, routing } = setup();
    setReviewStatus(boardId, 'REVIEWED', board);
    const nodeBefore = liveBoard(boardId).currentNodeId;

    routing.handlePass();

    expect(liveBoard(boardId).currentNodeId).toBe(nodeBefore);
  });

  it('IDLE: a pass plays freely, turn flips, and no stone is placed', () => {
    const { boardId, routing } = setup();
    const before = liveBoard(boardId);
    expect(before.turn).toBe('B');

    routing.handlePass();

    const after = liveBoard(boardId);
    expect(after.turn).toBe('W');
    expect(Object.keys(after.stones)).toHaveLength(0);
    expect(after.nodes[after.currentNodeId].move).toEqual({ x: 0, y: 0, color: 'B', type: 'pass' });
  });

  // Item 4 (commissioner ruling, ledger row 2540): a go GUI permits
  // unlimited passing — pass interpretation ("game ended") is a
  // game-server concern, and this SPA is not one. `getGameEndStatus` /
  // `GameStatus` (formerly `src/engine/util.ts`) and the StatusBar
  // "Game ended — two consecutive passes" badge are REMOVED outright,
  // not merely unwired — see that file's own removal comment. This
  // pins the behavioural half of the removal at the routing layer:
  // `handlePass` itself never consulted the removed status (confirmed
  // by reading its full body before this change), so N consecutive
  // passes must leave the board exactly as playable as after one.
  it('IDLE: N consecutive passes never lock the board — every pass keeps flipping the turn and stays playable, no end state', () => {
    const { boardId, routing } = setup();
    const N = 5;
    for (let i = 0; i < N; i++) {
      routing.handlePass();
    }

    const after = liveBoard(boardId);
    // 5 passes starting from Black: B,W,B,W,B — turn 5 is done, next to
    // move is White. No stones are ever placed by a pass.
    expect(after.turn).toBe('W');
    expect(Object.keys(after.stones)).toHaveLength(0);
    // The board is still fully playable: one more pass is accepted
    // exactly like the first (never refused, never a no-op past some
    // pass count).
    const beforeSixth = liveBoard(boardId).nodes[liveBoard(boardId).currentNodeId].move;
    routing.handlePass();
    const afterSixth = liveBoard(boardId);
    expect(afterSixth.nodes[afterSixth.currentNodeId].move).not.toEqual(beforeSixth);
    expect(afterSixth.turn).toBe('B');
    // And a genuine move still applies normally after any number of
    // passes — passing never transitions the board into a state that
    // refuses further mutation.
    routing.handleBoardMove(3, 3);
    const afterMove = liveBoard(boardId);
    expect(afterMove.nodes[afterMove.currentNodeId].move).toMatchObject({ type: 'place', x: 3, y: 3 });
  });

  it('FINISHED: a pass is allowed (intermission exploration) and is not counted as a review move', () => {
    const { board, boardId, routing } = setup();
    setReviewStatus(boardId, 'FINISHED', board);

    routing.handlePass();

    expect(liveBoard(boardId).nodes[liveBoard(boardId).currentNodeId].move?.type).toBe('pass');
    expect(store.session.reviews[boardId]?.userMovesCount).toBe(0);
  });

  it('a free-play pass FROM a game head fires the engine responder — passing off a head is still a move', () => {
    const { board, boardId, routing, fireAndAdvanceHead } = setup();
    const startNodeId: NodeId = board.rootNodeId;
    mutateBoard(boardId, draft => {
      draft.games[startNodeId] = {
        config: { userColor: 'B', engineMaxVisits: 100, engineModel: null },
        currentHeadNodeId: startNodeId,
      };
    });

    routing.handlePass();

    expect(fireAndAdvanceHead).toHaveBeenCalledTimes(1);
    expect(fireAndAdvanceHead).toHaveBeenCalledWith(boardId, startNodeId);
  });
});

describe('useBoardMoveRouting — AWAITING_MOVE routes to the graded handler', () => {
  it('a board click engages grading (analyzeRange + move count) and never the free-play head trigger', async () => {
    const { board, boardId, routing, fireAndAdvanceHead } = setup();
    setReviewStatus(boardId, 'AWAITING_MOVE', board);

    // A game head at the cursor — the strongest version of the
    // property: even with a green-ringed head right under the cursor,
    // a review-mode move must take the graded path, not the free-play
    // branch that would fire the engine responder.
    mutateBoard(boardId, draft => {
      draft.games[draft.rootNodeId] = {
        config: { userColor: 'B', engineMaxVisits: 100, engineModel: null },
        currentHeadNodeId: draft.rootNodeId,
      };
    });

    // Deterministic settle for the graded path: the wait times out,
    // which still proves the move went THROUGH the session (the
    // grading query fired and the move was counted before the wait).
    vi.mocked(waitForAnalysis).mockRejectedValue(new AnalysisWaitError('timeout'));

    routing.handleBoardMove(3, 3);
    await flushPromises();

    // Grading engaged: the analysis query fired for this board and the
    // N-move discipline counted the move.
    expect(fakeAnalysisService.analyzeRange).toHaveBeenCalledTimes(1);
    expect(fakeAnalysisService.analyzeRange.mock.calls[0]?.[0]).toBe(boardId);
    expect(store.session.reviews[boardId]?.userMovesCount).toBe(1);
    // The stone landed via the session's applyGoMove, not a second
    // free-play application.
    expect(liveBoard(boardId).stones['3,3']).toBe('B');
    // The free-play branch never ran: no engine-responder fire.
    expect(fireAndAdvanceHead).not.toHaveBeenCalled();
  });

  it('paste-PV is refused — a whole line cannot bypass the single-move discipline', () => {
    const { board, boardId, routing } = setup();
    setReviewStatus(boardId, 'AWAITING_MOVE', board);
    const nodeBefore = liveBoard(boardId).currentNodeId;

    routing.handlePastePv([pvMove(3, 3, 1), pvMove(15, 15, 2)]);

    expect(liveBoard(boardId).stones['3,3']).toBeUndefined();
    expect(liveBoard(boardId).currentNodeId).toBe(nodeBefore);
    // No grading query either: the paste was refused outright rather
    // than routed anywhere.
    expect(fakeAnalysisService.analyzeRange).not.toHaveBeenCalled();
  });
});

// ── Transient SR states: board mutation refused at both entry points ────────

describe.each(['LOADING', 'ANALYZING'] as const)(
  'useBoardMoveRouting — %s refuses board mutation',
  status => {
    it('handleBoardMove is a no-op', () => {
      const { board, boardId, routing, fireAndAdvanceHead } = setup();
      setReviewStatus(boardId, status, board);
      const nodeBefore = liveBoard(boardId).currentNodeId;

      routing.handleBoardMove(3, 3);

      expect(liveBoard(boardId).stones['3,3']).toBeUndefined();
      expect(liveBoard(boardId).currentNodeId).toBe(nodeBefore);
      expect(fakeAnalysisService.analyzeRange).not.toHaveBeenCalled();
      expect(store.session.reviews[boardId]?.userMovesCount).toBe(0);
      expect(fireAndAdvanceHead).not.toHaveBeenCalled();
    });

    it('handlePastePv is a no-op', () => {
      const { board, boardId, routing } = setup();
      setReviewStatus(boardId, status, board);
      const nodeBefore = liveBoard(boardId).currentNodeId;

      routing.handlePastePv([pvMove(3, 3, 1)]);

      expect(liveBoard(boardId).stones['3,3']).toBeUndefined();
      expect(liveBoard(boardId).currentNodeId).toBe(nodeBefore);
    });
  },
);

// ── IDLE / FINISHED: free play and exploration ───────────────────────────────

describe('useBoardMoveRouting — free play in IDLE and FINISHED', () => {
  it('IDLE: a click plays a free move without touching the grading machinery', () => {
    const { boardId, routing } = setup();
    // No review row constructed — state projects to IDLE.

    routing.handleBoardMove(3, 3);

    expect(liveBoard(boardId).stones['3,3']).toBe('B');
    expect(fakeAnalysisService.analyzeRange).not.toHaveBeenCalled();
  });

  it('FINISHED (intermission): exploration is allowed', () => {
    const { board, boardId, routing } = setup();
    setReviewStatus(boardId, 'FINISHED', board);

    routing.handleBoardMove(3, 3);

    expect(liveBoard(boardId).stones['3,3']).toBe('B');
    expect(fakeAnalysisService.analyzeRange).not.toHaveBeenCalled();
    // The intermission move is NOT counted as a review move.
    expect(store.session.reviews[boardId]?.userMovesCount).toBe(0);
  });

  it('IDLE: paste-PV applies the whole line and advances the cursor to the leaf', () => {
    const { board, boardId, routing } = setup();

    routing.handlePastePv([pvMove(3, 3, 1), pvMove(15, 15, 2)]);

    const after = liveBoard(boardId);
    expect(after.stones['3,3']).toBe('B');
    expect(after.stones['15,15']).toBe('W');
    expect(after.currentNodeId).not.toBe(board.rootNodeId);
  });

  it('IDLE: an illegal PV move keeps the legal prefix and surfaces a warning (ADR-0002)', () => {
    const { boardId, routing } = setup();
    const messagesBefore = store.engine.messages.length;

    // Second move replays the occupied point — applyGoMove returns null.
    routing.handlePastePv([pvMove(3, 3, 1), pvMove(3, 3, 2)]);

    const after = liveBoard(boardId);
    expect(after.stones['3,3']).toBe('B');
    expect(store.engine.messages.length).toBe(messagesBefore + 1);
    expect(store.engine.messages[0]?.type).toBe('warning');
  });
});

// ── The play-vs-engine head trigger (free-play branch only) ─────────────────

describe('useBoardMoveRouting — green-ringed head trigger', () => {
  it('a free-play move FROM a game head fires the responder with the game key', () => {
    const { board, boardId, routing, fireAndAdvanceHead } = setup();
    const startNodeId: NodeId = board.rootNodeId;
    mutateBoard(boardId, draft => {
      draft.games[startNodeId] = {
        config: { userColor: 'B', engineMaxVisits: 100, engineModel: null },
        currentHeadNodeId: startNodeId,
      };
    });

    routing.handleBoardMove(3, 3);

    expect(liveBoard(boardId).stones['3,3']).toBe('B');
    expect(fireAndAdvanceHead).toHaveBeenCalledTimes(1);
    expect(fireAndAdvanceHead).toHaveBeenCalledWith(boardId, startNodeId);
  });

  it('a move from a non-head position does not fire the responder', () => {
    const { board, boardId, routing, fireAndAdvanceHead } = setup();
    const startNodeId: NodeId = board.rootNodeId;
    mutateBoard(boardId, draft => {
      draft.games[startNodeId] = {
        config: { userColor: 'B', engineMaxVisits: 100, engineModel: null },
        currentHeadNodeId: startNodeId,
      };
    });

    // First move IS from the head (fires; the fake does not advance
    // the head, so the head stays at root while the cursor moves on).
    routing.handleBoardMove(3, 3);
    fireAndAdvanceHead.mockClear();

    // Second move is from the post-move cursor — not the head.
    routing.handleBoardMove(15, 15);

    expect(liveBoard(boardId).stones['15,15']).toBe('W');
    expect(fireAndAdvanceHead).not.toHaveBeenCalled();
  });
});
