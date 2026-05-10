/**
 * tests/integration/autonomous-srs.test.ts
 *
 * Tier-3 (composable integration) tests for `runAutonomousDriver`.
 * The driver orchestrates `useReviewSession` across multiple cards
 * with a Policy callback per move and a Recorder for per-event
 * logging. Its dependencies that touch the world (the proxy
 * WebSocket, the backend HTTP boundary, the `waitForAnalysis`
 * primitive) are replaced by spy-backed fakes; the rest of its
 * dependency chain (the store, the session composable, the navigator,
 * the SGF loader, the rules engine) runs for real. Same shape as
 * `useReviewSession.test.ts` — fake the effect surfaces, exercise
 * the pure orchestration logic.
 *
 * Coverage:
 *
 *   - Happy path: N cards × 1 move each, all FINISHED. Pins the
 *     `move` / `card-end` / `run-end` recorder sequence and the
 *     terminal `DriverResult.cardsFinished` count.
 *   - Empty card queue: zero attempted, run-end fires with
 *     `queue-exhausted` reason.
 *   - Policy throws: the offending card is recorded as IDLE with the
 *     thrown message, the driver advances to the next card.
 *   - Session timeout (waitForAnalysis rejects): one move entry with
 *     `recordedScore: null`, card-end IDLE, driver advances.
 *   - Cooperative stop signal mid-run: driver exits between cards
 *     with `stop-signal`.
 *   - Error budget exceeded: driver halts when consecutive IDLE
 *     cards reach the budget.
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

// Preserve the real `AnalysisWaitError` class so the catch in
// processUserMove's instanceof check still matches; only
// waitForAnalysis itself is replaced.
vi.mock('../../src/composables/wait-for-analysis', async () => {
  const actual = await vi.importActual<typeof import('../../src/composables/wait-for-analysis')>(
    '../../src/composables/wait-for-analysis',
  );
  return {
    ...actual,
    waitForAnalysis: vi.fn(),
  };
});

import {
  store,
  addBoard,
  resetWorkspace,
} from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import {
  AnalysisWaitError,
  waitForAnalysis,
} from '../../src/composables/wait-for-analysis';
import {
  fakeBackendService,
  resetFakeBackendService,
} from '../fakes/backend-service';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import {
  runAutonomousDriver,
  type AutonomousMove,
  type Policy,
  type Recorder,
  type RecorderEntry,
} from '../../src/composables/autonomous-srs';
import type {
  CardId,
  EbisuModel,
  KataAnalysisResponse,
  ReviewCard,
} from '../../src/types';

// ── Test fixtures ────────────────────────────────────────────────────────────

const SENTINEL_EBISU: EbisuModel = { alpha: 4, beta: 4, t: 1 };

let nextCardId = 100;
function makeReviewCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: nextCardId++ as CardId,
    sgf: '(;FF[4]GM[1]SZ[19])',
    numMoves: 1,
    model: SENTINEL_EBISU,
    lastReviewedAt: null,
    numReviews: 0,
    suspended: false,
    defaultVisits: 1000,
    gamma: 1.0,
    ...overrides,
  };
}

/**
 * Minimal analysis packet with optional delta. Empty `moveInfos`
 * suppresses the engine's best-move follow-through, so the post-move
 * board state isn't perturbed by a phantom W move — keeps the per-
 * card move count predictable for the policy spy.
 */
function makePacket(opts: { turnNumber: number; delta?: number }): KataAnalysisResponse {
  return {
    isDuringSearch: false,
    turnNumber: opts.turnNumber,
    extra: opts.delta !== undefined
      ? {
          black: { deltas: { '0': opts.delta } },
          white: { deltas: { '0': opts.delta } },
        }
      : undefined,
    moveInfos: [],
    rootInfo: { winrate: 0.5, scoreLead: 0, visits: 1000, currentPlayer: 'B' },
  } as unknown as KataAnalysisResponse;
}

/**
 * Recorder spy. Collects every entry into an array; counts close()
 * calls. Used by every test to verify the driver's per-event
 * sequence + the terminal close.
 */
function makeSpyRecorder() {
  const entries: RecorderEntry[] = [];
  let closeCount = 0;
  const recorder: Recorder = {
    record: async (entry) => { entries.push(entry); },
    close: async () => { closeCount++; },
  };
  return {
    recorder,
    entries,
    moves: () => entries.filter((e): e is Extract<RecorderEntry, { kind: 'move' }> => e.kind === 'move'),
    cardEnds: () => entries.filter((e): e is Extract<RecorderEntry, { kind: 'card-end' }> => e.kind === 'card-end'),
    runEnd: () => entries.find((e): e is Extract<RecorderEntry, { kind: 'run-end' }> => e.kind === 'run-end'),
    closeCount: () => closeCount,
  };
}

/**
 * Counter-based policy that returns successive legal moves down the
 * top row: (0,0), (1,0), (2,0), … on each call. Stateless across
 * cards is fine for the multi-card tests below because each card
 * starts on a fresh empty board (the empty SGF in `makeReviewCard`).
 */
function makeCounterPolicy(): { policy: Policy; calls: { board: unknown; card: ReviewCard }[] } {
  let i = 0;
  const calls: { board: unknown; card: ReviewCard }[] = [];
  const policy: Policy = async (board, card) => {
    calls.push({ board, card });
    const move: AutonomousMove = { x: i, y: 0, gtp: `coord-${i}` };
    i++;
    return move;
  };
  return { policy, calls };
}

beforeEach(() => {
  resetFakeBackendService();
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  vi.mocked(waitForAnalysis).mockReset();
  resetWorkspace();
  nextCardId = 100;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runAutonomousDriver — happy path', () => {
  it('runs N cards × 1 move each through finished, recording move + card-end + run-end', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId = board.id;

    const cards = [
      makeReviewCard({ numMoves: 1 }),
      makeReviewCard({ numMoves: 1 }),
      makeReviewCard({ numMoves: 1 }),
    ];

    // Each processUserMove awaits two waitForAnalysis calls (s_0 and
    // s_1); both resolve to a packet carrying the per-move delta.
    vi.mocked(waitForAnalysis).mockResolvedValue(makePacket({ turnNumber: 1, delta: 0.7 }));

    const { policy, calls: policyCalls } = makeCounterPolicy();
    const spy = makeSpyRecorder();

    const result = await runAutonomousDriver({
      boardId,
      cards,
      policy,
      recorder: spy.recorder,
    });

    expect(result.cardsAttempted).toBe(3);
    expect(result.cardsFinished).toBe(3);
    expect(result.stopReason).toBe('queue-exhausted');

    expect(spy.moves()).toHaveLength(3);
    expect(spy.cardEnds()).toHaveLength(3);
    expect(spy.runEnd()).toBeDefined();
    expect(spy.closeCount()).toBe(1);

    // Each card-end is a clean 'finished' with 1 move played and
    // mean score 0.7.
    for (const ce of spy.cardEnds()) {
      expect(ce.status).toBe('finished');
      expect(ce.movesPlayed).toBe(1);
      expect(ce.meanScore).toBeCloseTo(0.7, 6);
    }

    // The policy was called once per card.
    expect(policyCalls).toHaveLength(3);

    // Backend submitReview fires once per card on finishCard.
    expect(fakeBackendService.submitReview).toHaveBeenCalledTimes(3);

    // run-end is the final entry in recorder order.
    expect(spy.entries[spy.entries.length - 1]?.kind).toBe('run-end');
  });

  it('records the per-move recordedScore from the driver`s read of session.userMoveScores', async () => {
    const board = createInitialBoard();
    addBoard(board);

    vi.mocked(waitForAnalysis).mockResolvedValue(makePacket({ turnNumber: 1, delta: 0.42 }));

    const { policy } = makeCounterPolicy();
    const spy = makeSpyRecorder();

    await runAutonomousDriver({
      boardId: board.id,
      cards: [makeReviewCard({ numMoves: 1 })],
      policy,
      recorder: spy.recorder,
    });

    const moveEntries = spy.moves();
    expect(moveEntries).toHaveLength(1);
    expect(moveEntries[0].recordedScore).toBeCloseTo(0.42, 6);
    expect(moveEntries[0].userMoveGtp).toBe('coord-0');
  });
});

describe('runAutonomousDriver — empty queue', () => {
  it('records a single run-end and closes the recorder when there are no cards', async () => {
    const board = createInitialBoard();
    addBoard(board);

    const spy = makeSpyRecorder();
    const { policy } = makeCounterPolicy();

    const result = await runAutonomousDriver({
      boardId: board.id,
      cards: [],
      policy,
      recorder: spy.recorder,
    });

    expect(result.cardsAttempted).toBe(0);
    expect(result.cardsFinished).toBe(0);
    expect(result.stopReason).toBe('queue-exhausted');
    expect(spy.entries).toHaveLength(1);
    expect(spy.entries[0].kind).toBe('run-end');
    expect(spy.closeCount()).toBe(1);
  });
});

describe('runAutonomousDriver — policy failure', () => {
  it('records the failing card as IDLE with the thrown message and advances to the next', async () => {
    const board = createInitialBoard();
    addBoard(board);

    vi.mocked(waitForAnalysis).mockResolvedValue(makePacket({ turnNumber: 1, delta: 0.5 }));

    // Policy throws on card 0, succeeds on card 1.
    let callCount = 0;
    const policy: Policy = async () => {
      callCount++;
      if (callCount === 1) throw new Error('synthetic policy failure');
      return { x: 0, y: 0, gtp: 'A19' };
    };

    const spy = makeSpyRecorder();
    const result = await runAutonomousDriver({
      boardId: board.id,
      cards: [
        makeReviewCard({ numMoves: 1 }),
        makeReviewCard({ numMoves: 1 }),
      ],
      policy,
      recorder: spy.recorder,
    });

    expect(result.cardsAttempted).toBe(2);
    expect(result.cardsFinished).toBe(1);

    const cardEnds = spy.cardEnds();
    expect(cardEnds).toHaveLength(2);
    expect(cardEnds[0].status).toBe('idle');
    expect(cardEnds[0].failureMessage).toContain('policy error');
    expect(cardEnds[0].failureMessage).toContain('synthetic policy failure');
    expect(cardEnds[0].movesPlayed).toBe(1); // moveOrdinal is incremented before the policy call
    expect(cardEnds[1].status).toBe('finished');
    expect(cardEnds[1].movesPlayed).toBe(1);

    // No move entry for the failing card (the policy threw before
    // processUserMove was called); one move entry for the successful
    // card.
    expect(spy.moves()).toHaveLength(1);
  });
});

describe('runAutonomousDriver — session timeout', () => {
  it('records the move with null score, card-end IDLE, and advances to the next card', async () => {
    const board = createInitialBoard();
    addBoard(board);

    // Card 0: waitForAnalysis rejects (timeout). Card 1: succeeds.
    let cardCount = 0;
    vi.mocked(waitForAnalysis).mockImplementation(async () => {
      // Each processUserMove calls waitForAnalysis twice (s_0 and s_1).
      // We want the FIRST card's pair to reject, the SECOND card's pair
      // to resolve. Switch on the call's call-count, not on the card
      // index directly.
      const callIndex = vi.mocked(waitForAnalysis).mock.calls.length;
      if (callIndex <= 2) throw new AnalysisWaitError('timeout');
      return makePacket({ turnNumber: 1, delta: 0.6 });
    });

    const { policy } = makeCounterPolicy();
    const spy = makeSpyRecorder();

    const result = await runAutonomousDriver({
      boardId: board.id,
      cards: [
        makeReviewCard({ numMoves: 1 }),
        makeReviewCard({ numMoves: 1 }),
      ],
      policy,
      recorder: spy.recorder,
    });
    void cardCount;

    expect(result.cardsAttempted).toBe(2);
    expect(result.cardsFinished).toBe(1);

    const cardEnds = spy.cardEnds();
    expect(cardEnds[0].status).toBe('idle');
    expect(cardEnds[0].failureMessage).toBeDefined(); // session pushes a system message
    expect(cardEnds[1].status).toBe('finished');

    // The timed-out move IS recorded (the driver records before
    // checking session state); recordedScore is null because no score
    // was appended to userMoveScores.
    const moves = spy.moves();
    expect(moves[0].recordedScore).toBeNull();
    expect(moves[1].recordedScore).toBeCloseTo(0.6, 6);
  });
});

describe('runAutonomousDriver — cooperative stop', () => {
  it('exits with stop-signal between cards when shouldStop returns true', async () => {
    const board = createInitialBoard();
    addBoard(board);

    vi.mocked(waitForAnalysis).mockResolvedValue(makePacket({ turnNumber: 1, delta: 0.5 }));

    let cardsCompleted = 0;
    let stop = false;
    const spy = makeSpyRecorder();

    const result = await runAutonomousDriver({
      boardId: board.id,
      cards: [
        makeReviewCard({ numMoves: 1 }),
        makeReviewCard({ numMoves: 1 }),
        makeReviewCard({ numMoves: 1 }),
      ],
      policy: async () => {
        return { x: cardsCompleted, y: 0, gtp: `m-${cardsCompleted}` };
      },
      recorder: {
        record: async (entry) => {
          spy.entries.push(entry);
          if (entry.kind === 'card-end') {
            cardsCompleted++;
            // Trip the stop after the first card finishes; the driver
            // checks shouldStop at the top of the per-card loop, so
            // the second card never starts.
            if (cardsCompleted === 1) stop = true;
          }
        },
        close: spy.recorder.close,
      },
      shouldStop: () => stop,
    });

    expect(result.cardsAttempted).toBe(1);
    expect(result.cardsFinished).toBe(1);
    expect(result.stopReason).toBe('stop-signal');

    expect(spy.runEnd()?.stopReason).toBe('stop-signal');
  });
});

describe('runAutonomousDriver — error budget', () => {
  it('halts with error-budget when consecutive policy failures reach the configured cap', async () => {
    const board = createInitialBoard();
    addBoard(board);

    vi.mocked(waitForAnalysis).mockResolvedValue(makePacket({ turnNumber: 1, delta: 0.5 }));

    // Every card's policy throws → every card-end is IDLE. With
    // errorBudget=2, the driver halts after the second IDLE card-end
    // (the third card never starts).
    const policy: Policy = async () => {
      throw new Error('always fails');
    };

    const spy = makeSpyRecorder();
    const result = await runAutonomousDriver({
      boardId: board.id,
      cards: [
        makeReviewCard({ numMoves: 1 }),
        makeReviewCard({ numMoves: 1 }),
        makeReviewCard({ numMoves: 1 }),
        makeReviewCard({ numMoves: 1 }),
      ],
      policy,
      recorder: spy.recorder,
      errorBudget: 2,
    });

    expect(result.cardsAttempted).toBe(2);
    expect(result.cardsFinished).toBe(0);
    expect(result.stopReason).toBe('error-budget');
    expect(spy.cardEnds()).toHaveLength(2);
    for (const ce of spy.cardEnds()) {
      expect(ce.status).toBe('idle');
    }
  });
});
