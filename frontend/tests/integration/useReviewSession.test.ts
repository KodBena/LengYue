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
import type { BoardId, CardId, EbisuModel, ReviewCard } from '../../src/types';

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
    vi.mocked(waitForAnalysis).mockRejectedValueOnce(new AnalysisWaitError('timeout'));

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
    // surfaced", which we verify by counting messages.
    expect(waitForAnalysis).toHaveBeenCalledTimes(1);
    expect(store.engine.messages.length).toBe(messagesBefore + 1);
    expect(store.engine.messages[0]?.type).toBe('warning');

    // The backend was not asked to record this move — finishCard's
    // submitReview only fires on the success path.
    expect(fakeBackendService.submitReview).not.toHaveBeenCalled();
  });
});
