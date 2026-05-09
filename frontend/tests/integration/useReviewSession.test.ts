/**
 * tests/integration/useReviewSession.test.ts
 *
 * Tier-3 (composable integration) tests for `useReviewSession`. The
 * composable orchestrates the spaced-repetition review flow — load a
 * card's SGF, await KataGo analysis on the user's submitted move,
 * post the recall delta back to the backend, advance to the next
 * card. Its dependencies that touch the world (the proxy WebSocket,
 * the backend HTTP boundary, the analysis-bundle persistence
 * boundary) are replaced by spy-backed fakes from `tests/fakes/`;
 * the rest of its dependency chain (the store, the navigator, the
 * SGF loader, the Go rules engine, the i18n catalogs) runs for
 * real. That split — fake the effect surfaces, exercise the pure
 * logic — is the load-bearing test pattern: behaviour is verified
 * in the same shape it ships in, but the test does not need a
 * running KataGo or backend.
 *
 * Coverage in Phase 0:
 *
 *   - `endSession`: per-board state is reset to IDLE and the
 *     `showMoveSuggestions` flag is restored. The simplest path —
 *     synchronous, no service calls.
 *   - `startSession([])`: empty queue short-circuits cleanly to
 *     IDLE without entering the LOADING state. Demonstrates basic
 *     async wiring and state-transition observability.
 *   - `processUserMove` timeout: the user's move is applied, the
 *     analysis service is asked, `waitForAnalysis` rejects with
 *     `AnalysisWaitError('timeout')`, the catch path pushes a
 *     system-message and resets status to IDLE. This is the
 *     resource-ownership-audit-relevant path — the
 *     `pendingAnalysisAborts` Map entry must be cleared on the
 *     timeout-side cleanup so a later `endSession` is a no-op
 *     rather than re-aborting a stale controller.
 *
 * Subsequent PRs add coverage for the success path (mocked
 * `waitForAnalysis` resolves with a packet, `submitReview` is
 * called on `finishCard`), the abort path (`loadCard`/`closeBoard`
 * abort an in-flight wait), and the colour-delta accounting in
 * `processUserMove`.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref } from 'vue';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';

// vi.mock calls are hoisted to the top of the file (above the
// imports below) by Vitest's transform — the factories run before
// any module-level import resolves, so the mocked surfaces are in
// place when the store and the composable load their service
// singletons. The factories use dynamic `import()` of the fakes
// module so the fakes are constructed once and reused across the
// `beforeEach` reset and the test bodies' assertions.

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

// Preserve `AnalysisWaitError` from the real module — the catch
// block in `processUserMove` does `err instanceof AnalysisWaitError`
// and a freshly-defined fake class would fail the check, sending
// the rejection down the unexpected-error throw branch. Only
// `waitForAnalysis` itself is replaced.
vi.mock('../../src/composables/wait-for-analysis', async () => {
  const actual = await vi.importActual<typeof import('../../src/composables/wait-for-analysis')>(
    '../../src/composables/wait-for-analysis',
  );
  return {
    ...actual,
    waitForAnalysis: vi.fn(),
  };
});

// Imports below resolve against the mocked modules. Order is
// load-bearing only in the sense that vi.mock above must be
// registered first; within the import block any order is fine.

import {
  useReviewSession,
} from '../../src/composables/useReviewSession';
import {
  store,
  addBoard,
  closeBoard,
  mutateReviewSession,
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
import {
  fakeAnalysisService,
  resetFakeAnalysisService,
} from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import { ledger } from '../../src/services/analysis-ledger';
import { activeConfigHash } from '../../src/services/analysis-config';
import type {
  BoardId,
  CardId,
  EbisuModel,
  KataAnalysisResponse,
  ReviewCard,
} from '../../src/types';

// ── Test fixtures ────────────────────────────────────────────────────────────

const SENTINEL_EBISU: EbisuModel = { alpha: 4, beta: 4, t: 1 };

function makeReviewCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: 1 as CardId,
    sgf: '(;FF[4]GM[1]SZ[19])',
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

/**
 * Builds a minimal KataAnalysisResponse for processUserMove's
 * success path. The composable reads:
 *   - `extra[colorKey].deltas[colorMoveCount-1]` for the user's
 *     recall-delta score (defaults to 0.5 if absent).
 *   - `moveInfos.find(m => m.order === 0).move` for the engine's
 *     best-move follow-through (only consulted when the card has
 *     more user-moves to play).
 *
 * This factory keeps the test fixtures explicit about which slots
 * are intentionally populated and which are stubbed-but-irrelevant.
 */
function makeAnalysisPacket(opts: {
  turnNumber: number;
  delta?: number;
  bestMoveGtp?: string;
}): KataAnalysisResponse {
  return {
    isDuringSearch: false,
    turnNumber: opts.turnNumber,
    extra: {
      black: { deltas: opts.delta !== undefined ? { '0': opts.delta } : undefined },
      white: { deltas: opts.delta !== undefined ? { '0': opts.delta } : undefined },
    },
    moveInfos: opts.bestMoveGtp
      ? [{
          move: opts.bestMoveGtp,
          visits: 1000,
          winrate: 0.5,
          scoreLead: 0,
          pv: [],
          order: 0,
        }]
      : [],
    rootInfo: {
      winrate: 0.5,
      scoreLead: 0,
      visits: 1000,
      currentPlayer: 'B',
    },
  } as unknown as KataAnalysisResponse;
}

beforeEach(() => {
  resetFakeBackendService();
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  vi.mocked(waitForAnalysis).mockReset();

  // resetWorkspace() drops boards, reviews, and engine activeMode
  // entries so each test starts from a known-clean store.
  // Mocked services absorb the cleanup-side calls (stopAllBoardAnalyses,
  // forgetAll) without reaching the real network or proxy.
  resetWorkspace();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useReviewSession.endSession', () => {
  it('resets per-board review state to IDLE and restores showMoveSuggestions', () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    // Pre-populate a non-IDLE review-session row so we can observe
    // the reset transitioning every field back to defaults.
    mutateReviewSession(boardId, draft => {
      draft.status = 'AWAITING_MOVE';
      draft.queue = [makeReviewCard()];
      draft.currentIndex = 0;
      draft.userMovesCount = 3;
      draft.userMoveScores = [0.1, 0.2, 0.3];
      draft.visitsOverride = 500;
    });
    store.session.ui.showMoveSuggestions = false;

    const boardIdRef = ref<BoardId | null>(boardId);
    const { endSession } = useReviewSession(boardIdRef);

    endSession();

    const reviewState = store.session.reviews[boardId];
    expect(reviewState.status).toBe('IDLE');
    expect(reviewState.queue).toEqual([]);
    expect(reviewState.currentIndex).toBe(-1);
    expect(reviewState.startingNodeId).toBeNull();
    expect(reviewState.userMovesCount).toBe(0);
    expect(reviewState.userMoveScores).toEqual([]);
    expect(reviewState.visitsOverride).toBeNull();
    expect(store.session.ui.showMoveSuggestions).toBe(true);
  });

  it('is a no-op when boardIdRef.value is null', () => {
    const boardIdRef = ref<BoardId | null>(null);
    const { endSession } = useReviewSession(boardIdRef);

    // Just exercising the early-return path. The contract is "safe
    // to call at any time"; the assertion is that the call doesn't
    // throw and the empty store stays empty.
    expect(() => endSession()).not.toThrow();
    expect(Object.keys(store.session.reviews)).toEqual([]);
  });
});

describe('useReviewSession.startSession', () => {
  it('transitions status to IDLE on an empty queue without entering LOADING', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    const boardIdRef = ref<BoardId | null>(boardId);
    const { startSession, state } = useReviewSession(boardIdRef);

    await startSession([]);
    await flushPromises();

    expect(state.value).toBe('IDLE');
    // The empty-queue branch returns before the LOADING write, so
    // queue/currentIndex stay at their default-init shape.
    const reviewState = store.session.reviews[boardId];
    expect(reviewState.queue).toEqual([]);
    expect(reviewState.currentIndex).toBe(-1);
  });
});

describe('useReviewSession.processUserMove — timeout path', () => {
  it('cancels the session, surfaces a system-message, and clears the abort entry on KataGo timeout', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    // Construct an AWAITING_MOVE state directly (rather than going
    // through loadCard, which would parse an SGF and navigate).
    // The composable's processUserMove only reads `currentCard`
    // (derived from queue + currentIndex) and the active board's
    // currentNodeId, both of which we supply here.
    const card = makeReviewCard({ numMoves: 5, defaultVisits: 1000 });
    mutateReviewSession(boardId, draft => {
      draft.status = 'AWAITING_MOVE';
      draft.queue = [card];
      draft.currentIndex = 0;
      draft.startingNodeId = board.rootNodeId;
    });

    // Wire the timeout — `vi.mocked` types the spy as a Mock so
    // mockRejectedValueOnce is in scope. The error class comes from
    // the partially-mocked module, which preserves the real
    // `AnalysisWaitError` (see vi.mock above).
    //
    // processUserMove awaits both s_0 and s_1 packets via Promise.all,
    // so the mock is called twice per call. Reject both — Promise.all
    // rejects on the first rejection regardless.
    vi.mocked(waitForAnalysis).mockRejectedValue(new AnalysisWaitError('timeout'));

    const messagesBefore = store.engine.messages.length;

    const boardIdRef = ref<BoardId | null>(boardId);
    const { processUserMove, state } = useReviewSession(boardIdRef);

    await processUserMove(3, 3); // legal first move on an empty board

    // Status reset; user move was counted (the increment happens
    // before the await on waitForAnalysis).
    expect(state.value).toBe('IDLE');
    expect(store.session.reviews[boardId].userMovesCount).toBe(1);

    // analysisService.analyzeRange was called exactly once with the
    // board's id; the precise turn-range arguments are an
    // implementation detail of the path-projection logic, asserted
    // loosely here.
    expect(fakeAnalysisService.analyzeRange).toHaveBeenCalledTimes(1);
    expect(fakeAnalysisService.analyzeRange.mock.calls[0]?.[0]).toBe(boardId);

    // waitForAnalysis was called and rejected; the catch block
    // pushed a system-message warning. The exact text isn't pinned
    // (the i18n key may evolve) — the contract is "a warning is
    // surfaced", which we verify by counting messages. Two calls
    // total because processUserMove awaits both s_0 and s_1 via
    // Promise.all (the s_0 wait fixes a race where the proxy emits
    // the s_1 packet before s_0).
    expect(waitForAnalysis).toHaveBeenCalledTimes(2);
    expect(store.engine.messages.length).toBe(messagesBefore + 1);
    expect(store.engine.messages[0]?.type).toBe('warning');

    // The backend was not asked to record this move — finishCard's
    // submitReview only fires on the success path.
    expect(fakeBackendService.submitReview).not.toHaveBeenCalled();
  });
});

describe('useReviewSession.processUserMove — happy path', () => {
  it('records the analysis delta on a non-final move and returns to AWAITING_MOVE', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    const card = makeReviewCard({ numMoves: 5, defaultVisits: 1000 });
    mutateReviewSession(boardId, draft => {
      draft.status = 'AWAITING_MOVE';
      draft.queue = [card];
      draft.currentIndex = 0;
      draft.startingNodeId = board.rootNodeId;
    });

    // Engine's best-move follow-through plays Q16 = (15, 15) on
    // 19×19. The engine plays for whoever's turn is next after the
    // user's move; here the user plays B, so the engine plays W.
    const packet = makeAnalysisPacket({
      turnNumber: 1,
      delta: 0.85,
      bestMoveGtp: 'Q16',
    });
    // processUserMove awaits BOTH s_0 and s_1 packets via Promise.all
    // (the s_0 wait was added to fix a race where the proxy emits
    // the s_1 packet before the s_0 packet under cache hits, leaving
    // the path-scan looking at a not-yet-present packet). Use
    // `mockResolvedValue` so both waits resolve with this packet.
    // The s_1 path's fast-path delta lookup finds 0.85 on it.
    vi.mocked(waitForAnalysis).mockResolvedValue(packet);

    const boardIdRef = ref<BoardId | null>(boardId);
    const { processUserMove, state, userMoveScores } = useReviewSession(boardIdRef);

    await processUserMove(3, 3); // legal first move

    // The delta from the packet is appended to the per-board score
    // list, and the composable transitions back to AWAITING_MOVE
    // (the card has more moves to play).
    expect(userMoveScores.value).toEqual([0.85]);
    expect(state.value).toBe('AWAITING_MOVE');

    // The engine's best-move follow-through fired: Q16 = (15, 15)
    // is now on the board with W as the colour (alternation after
    // the user's B move).
    const updatedBoard = store.boards.find(b => b.id === boardId)!;
    expect(updatedBoard.stones['15,15']).toBe('W');

    // Backend was NOT asked to record yet — submitReview only
    // fires on the FINAL move.
    expect(fakeBackendService.submitReview).not.toHaveBeenCalled();
  });

  it('finds the delta on the s_0 packet via the path-scan when s_1 lacks it', async () => {
    // The proxy attaches each `extra[color].deltas` entry to whatever
    // packet on the analyzed range it chose — most commonly the s_0
    // packet (the position the move was played FROM, since that's
    // where the engine evaluated alternatives). The prior
    // implementation read ONLY `s_1_packet.extra[colorKey].deltas[n]`
    // and silently substituted 0.5 when the proxy chose s_0; the
    // current code mirrors `useEnrichedData.ts`'s pattern and scans
    // every packet on the active path. This test pins the path-scan:
    // s_1 carries no deltas, the ledger has an s_0 packet with the
    // delta, and the score is recorded correctly.
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    const card = makeReviewCard({ numMoves: 5 });
    mutateReviewSession(boardId, draft => {
      draft.status = 'AWAITING_MOVE';
      draft.queue = [card];
      draft.currentIndex = 0;
      draft.startingNodeId = board.rootNodeId;
    });

    // Pre-populate the ledger: the s_0 packet (root nodeId, the
    // position the user is about to play from) carries the delta
    // for black move index 0. The card has no `gradingParameter`,
    // so processUserMove uses `activeConfigHash.value` as the hash;
    // we mirror that here.
    ledger.record(activeConfigHash.value, board.rootNodeId, {
      isDuringSearch: false,
      turnNumber: 0,
      extra: {
        black: { deltas: { '0': 0.42 } },
      },
      moveInfos: [],
      rootInfo: { winrate: 0.5, scoreLead: 0, visits: 1000, currentPlayer: 'B' },
    } as unknown as KataAnalysisResponse);

    // The s_1 packet carries no deltas — exactly the case where the
    // prior implementation silently fell back to 0.5. Empty
    // moveInfos also disables the engine follow-through branch so
    // the post-move board state isn't perturbed by a phantom W move.
    // processUserMove awaits both s_0 and s_1 via Promise.all; resolve
    // both with the same empty packet (the delta lookup will fall
    // through to the path-scan, which finds the delta in the ledger).
    const s1Packet = makeAnalysisPacket({ turnNumber: 1 });
    vi.mocked(waitForAnalysis).mockResolvedValue(s1Packet);

    const boardIdRef = ref<BoardId | null>(boardId);
    const { processUserMove, state, userMoveScores } = useReviewSession(boardIdRef);

    await processUserMove(3, 3);

    expect(userMoveScores.value).toEqual([0.42]);
    expect(state.value).toBe('AWAITING_MOVE');
    expect(fakeBackendService.submitReview).not.toHaveBeenCalled();
  });

  it('cancels the session and surfaces a warning when the packet lacks a per-colour deltas entry', async () => {
    // Inversion of the prior `delta=0.5 fallback` test. The composable
    // used to silently substitute 0.5 when the proxy's enrichment was
    // missing; per ADR-0002 (and the shipped fix that removed the
    // sentinel), a missing per-move delta is a contract failure that
    // must surface — not a quietly-recorded "neutral" review. The
    // assertions below pin the loud-failure shape: no score recorded,
    // status reset to IDLE, system-message warning pushed.
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    const card = makeReviewCard({ numMoves: 5 });
    mutateReviewSession(boardId, draft => {
      draft.status = 'AWAITING_MOVE';
      draft.queue = [card];
      draft.currentIndex = 0;
      draft.startingNodeId = board.rootNodeId;
    });

    // No deltas, no moveInfos — pure "analysis came back but
    // didn't include enrichment" shape. Both s_0 and s_1 waits
    // resolve with this empty packet; the path-scan finds nothing
    // in the ledger either, so the loud-failure branch fires.
    const packet = makeAnalysisPacket({ turnNumber: 1 });
    vi.mocked(waitForAnalysis).mockResolvedValue(packet);

    const messagesBefore = store.engine.messages.length;

    const boardIdRef = ref<BoardId | null>(boardId);
    const { processUserMove, state, userMoveScores } = useReviewSession(boardIdRef);

    await processUserMove(3, 3);

    expect(userMoveScores.value).toEqual([]);
    expect(state.value).toBe('IDLE');
    expect(store.engine.messages.length).toBe(messagesBefore + 1);
    // pushSystemMessage `unshift`s — newest message is at index 0,
    // not at `messagesBefore`. Mirrors the assertion shape in the
    // sibling timeout test above.
    expect(store.engine.messages[0]?.type).toBe('warning');
    // Pin the message text against either the i18n catalog rendering
    // (en is the active locale in tests) or the key-fallback path that
    // vue-i18n emits when a catalog entry is absent. Either form
    // satisfies the loudness contract.
    expect(store.engine.messages[0]?.text).toMatch(
      /missingPerMoveDelta|carried no per-move/,
    );
    // submitReview was NOT called — the session cancelled before the
    // final-move branch could fire.
    expect(fakeBackendService.submitReview).not.toHaveBeenCalled();
  });

  it('fires submitReview and transitions to FINISHED on the final move', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    // numMoves=1 → the first user move is the last; finishCard
    // fires immediately after the wait resolves.
    const card = makeReviewCard({ id: 42 as CardId, numMoves: 1 });
    mutateReviewSession(boardId, draft => {
      draft.status = 'AWAITING_MOVE';
      draft.queue = [card];
      draft.currentIndex = 0;
      draft.startingNodeId = board.rootNodeId;
    });

    const packet = makeAnalysisPacket({ turnNumber: 1, delta: 0.92 });
    // Both s_0 and s_1 waits resolve with this packet (Promise.all).
    vi.mocked(waitForAnalysis).mockResolvedValue(packet);
    fakeBackendService.submitReview.mockResolvedValueOnce(card);

    const boardIdRef = ref<BoardId | null>(boardId);
    const { processUserMove, state, userMoveScores } = useReviewSession(boardIdRef);

    await processUserMove(3, 3);

    // Final-move branch: status is FINISHED, submitReview was
    // called with the card id and the recorded score.
    expect(state.value).toBe('FINISHED');
    expect(userMoveScores.value).toEqual([0.92]);
    expect(fakeBackendService.submitReview).toHaveBeenCalledTimes(1);
    expect(fakeBackendService.submitReview).toHaveBeenCalledWith(42, [0.92]);
    // Move-suggestions visibility was restored by finishCard.
    expect(store.session.ui.showMoveSuggestions).toBe(true);
  });
});

describe('useReviewSession — abort cleanup', () => {
  // The composable manages a module-scope per-board map of pending
  // AbortControllers (`pendingAnalysisAborts`). The abort must fire
  // when:
  //   - loadCard is called (user transitions to a different card)
  //   - closeBoard is called (the entire board is being torn down)
  //   - resetWorkspace is called (identity flip)
  //
  // The tests below mock waitForAnalysis to install an
  // abort-listener and resolve the test promise when the abort
  // fires. This both pins the cleanup behaviour and verifies that
  // the composable's per-board map is keyed correctly (a wrong key
  // would mean the cleanup misses its target controller).

  /**
   * Build a mock waitForAnalysis that exposes a flag indicating
   * whether the AbortSignal was triggered. The returned promise
   * rejects with AnalysisWaitError('aborted') when the signal
   * fires; processUserMove's catch silent-returns on that.
   */
  function abortableMock(): { aborted: () => boolean } {
    let abortFired = false;
    const impl = (_h: unknown, _n: unknown, _t: unknown, options: { signal?: AbortSignal }) => {
      return new Promise<never>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          abortFired = true;
          reject(new AnalysisWaitError('aborted'));
        });
      });
    };
    // processUserMove awaits both s_0 and s_1 via Promise.all, so each
    // invocation consumes two queued implementations. The
    // resetWorkspace test creates two abortableMock()s for different
    // boards; using `mockImplementationOnce` (×2 per helper) keeps
    // each helper's flag bound to its own board's waits without one
    // helper's mockImplementation clobbering the other's.
    vi.mocked(waitForAnalysis).mockImplementationOnce(impl).mockImplementationOnce(impl);
    return { aborted: () => abortFired };
  }

  it('nextCard (which calls loadCard internally) aborts the in-flight wait on the active board', async () => {
    // loadCard is intentionally not surfaced on the composable's
    // public return — it's invoked through nextCard / startSession.
    // For the abort-on-card-transition path, the test uses nextCard
    // against a two-card queue; nextCard delegates to
    // loadCard(currentIndex + 1) when the queue has more cards.
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    const card1 = makeReviewCard({ id: 1 as CardId, numMoves: 5 });
    const card2 = makeReviewCard({ id: 2 as CardId, numMoves: 5 });
    mutateReviewSession(boardId, draft => {
      draft.status = 'AWAITING_MOVE';
      draft.queue = [card1, card2];
      draft.currentIndex = 0;
      draft.startingNodeId = board.rootNodeId;
    });

    const wait = abortableMock();
    const boardIdRef = ref<BoardId | null>(boardId);
    const composable = useReviewSession(boardIdRef);

    // Kick off processUserMove without awaiting — the wait promise
    // is pending against the abort signal.
    const movePromise = composable.processUserMove(3, 3);

    // Advance to the next card. nextCard invokes
    // loadCard(currentIndex + 1) which begins by aborting the
    // pending wait via `pendingAnalysisAborts.get(bId)?.abort()`.
    composable.nextCard();
    await movePromise;

    expect(wait.aborted()).toBe(true);
  });

  it('closeBoard fires AbortController.abort() on the closing board\'s pending wait', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    const card = makeReviewCard({ numMoves: 5 });
    mutateReviewSession(boardId, draft => {
      draft.status = 'AWAITING_MOVE';
      draft.queue = [card];
      draft.currentIndex = 0;
      draft.startingNodeId = board.rootNodeId;
    });

    const wait = abortableMock();
    const boardIdRef = ref<BoardId | null>(boardId);
    const composable = useReviewSession(boardIdRef);

    const movePromise = composable.processUserMove(3, 3);

    // closeBoard's resource-ownership cleanup chain calls
    // abortBoardReview(boardId) which fires the controller. (The
    // analysisService and ledger calls in closeBoard are absorbed
    // by the fakes / pure module-scope state respectively.)
    closeBoard(boardId);
    await movePromise;

    expect(wait.aborted()).toBe(true);
  });

  it('resetWorkspace fires AbortController.abort() on every pending wait', async () => {
    // Two boards, two pending waits — resetWorkspace's
    // abortAllReviews must fire both.
    const boardA = createInitialBoard();
    const boardB = createInitialBoard();
    addBoard(boardA);
    addBoard(boardB);

    const card = makeReviewCard({ numMoves: 5 });
    for (const board of [boardA, boardB]) {
      mutateReviewSession(board.id, draft => {
        draft.status = 'AWAITING_MOVE';
        draft.queue = [card];
        draft.currentIndex = 0;
        draft.startingNodeId = board.rootNodeId;
      });
    }

    const waitA = abortableMock();
    const waitB = abortableMock();

    // Drive each board's processUserMove. The composable reads
    // `boardIdRef.value` to find the active board; we point each
    // composable instance at its own board.
    const refA = ref<BoardId | null>(boardA.id);
    const refB = ref<BoardId | null>(boardB.id);
    const compA = useReviewSession(refA);
    const compB = useReviewSession(refB);

    // boardB is the active board (last addBoard call wins
    // `store.activeBoardIndex`); processUserMove on compA mutates
    // store via activeBoardIndex which is currently boardB. Move
    // the cursor explicitly to keep each composable's call
    // self-consistent.
    store.activeBoardIndex = store.boards.findIndex(b => b.id === boardA.id);
    const moveA = compA.processUserMove(3, 3);
    store.activeBoardIndex = store.boards.findIndex(b => b.id === boardB.id);
    const moveB = compB.processUserMove(3, 3);

    resetWorkspace();
    await Promise.all([moveA, moveB]);

    expect(waitA.aborted()).toBe(true);
    expect(waitB.aborted()).toBe(true);
  });
});
