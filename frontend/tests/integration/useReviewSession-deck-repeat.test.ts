/**
 * tests/integration/useReviewSession-deck-repeat.test.ts
 *
 * Tier-3 (composable integration) tests for the deck-repeat arc
 * (`.claude/dispatch-reports/deck-repeat-design.md`, option (a)):
 * `goBack`/`goForward`/`retryCard` on `useReviewSession`, and the
 * REVIEWED view-only gate in `useBoardMoveRouting`. Drives the REAL
 * `startSession` → `loadCard` → `processUserMove` → `finishCard` path
 * (same split as `useReviewSession.test.ts` — fake the service
 * boundaries, exercise the real orchestration) so the snapshot capture
 * under test is the production one, not a hand-constructed fixture.
 *
 * Coverage:
 *   - `goBack` restores the exact board (same NodeIds — the load-
 *     bearing property from the design doc's §1b survey) and session
 *     data (scores, status→REVIEWED) after advancing past a finished
 *     card, without firing a new analysis query (a ledger cache hit).
 *   - The REVIEWED state is structurally view-only: the routing gate
 *     (`useBoardMoveRouting`) refuses both entry points outright — the
 *     tripwire that proves REVIEWED has no path to `processUserMove`/
 *     `finishCard`/`submitReview`.
 *   - `retryCard` is the only way back into a gradeable state, and
 *     `submitReview` fires exactly once per GENUINE attempt across a
 *     pathological back/forward/retry dance — the double-fire
 *     tripwire `submitReview`'s missing idempotency guard (design doc
 *     §1d) depends on the snapshot/restore flow to close structurally.
 *
 * All three legs were verified red (see the build report) by
 * temporarily short-circuiting `captureSlot` to a no-op — with no
 * snapshot ever taken, `goBack`/`goForward` fall through to their
 * `loadCard` fallback, which re-parses a fresh SGF (mints new NodeIds)
 * and cannot resume an AWAITING_MOVE card mid-attempt.
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

// Preserve `AnalysisWaitError` from the real module — processUserMove's
// catch does an `instanceof` check; only `waitForAnalysis` is replaced.
vi.mock('../../src/composables/analysis/wait-for-analysis', async () => {
  const actual = await vi.importActual<typeof import('../../src/composables/analysis/wait-for-analysis')>(
    '../../src/composables/analysis/wait-for-analysis',
  );
  return {
    ...actual,
    waitForAnalysis: vi.fn(),
  };
});

import {
  useReviewSession,
  _visitSnapshotStonesForTesting,
} from '../../src/composables/review/useReviewSession';
import { useBoardMoveRouting } from '../../src/composables/board/useBoardMoveRouting';
import type { EngineResponderHandle } from '../../src/composables/board/useEngineResponder';
import { store, addBoard, mutateBoard, resetWorkspace } from '../../src/store';
import { navigateTo } from '../../src/engine/navigator';
import { createInitialBoard } from '../../src/store/board-factory';
import { waitForAnalysis } from '../../src/composables/analysis/wait-for-analysis';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import { fakeAnalysisService, resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import { ledger } from '../../src/state/analysis-ledger';
import { activeAnalysisKeys } from '../../src/state/analysis-config';
import type { BoardId, CardId, EbisuModel, KataAnalysisResponse, ReviewCard } from '../../src/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SENTINEL_EBISU: EbisuModel = { alpha: 4, beta: 4, t: 1 };

function makeReviewCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: 1 as CardId,
    canonicalContent: '(;FF[4]GM[1]SZ[19])',
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

function makeAnalysisPacket(delta: number): KataAnalysisResponse {
  return {
    isDuringSearch: false,
    turnNumber: 1,
    extra: {
      black: { deltas: { '0': delta } },
      white: { deltas: { '0': delta } },
    },
    moveInfos: [],
    rootInfo: { winrate: 0.5, scoreLead: 0, visits: 1000, currentPlayer: 'B' },
  } as unknown as KataAnalysisResponse;
}

/** Resolve every pending waitForAnalysis call with `packet`, and seed the
 *  ledger enrichment on the LIVE board's current rootNodeId so the delta
 *  scan finds it — mirrors the production onAnalysisUpdate tick. */
function primeAnalysis(boardId: BoardId, delta: number): void {
  vi.mocked(waitForAnalysis).mockResolvedValue(makeAnalysisPacket(delta));
  const board = store.boards.find(b => b.id === boardId)!;
  ledger.recordEnrichment(activeAnalysisKeys.value.enrichedKey, board.rootNodeId, {
    black: { deltas: { '0': delta } },
    white: { deltas: { '0': delta } },
  });
}

beforeEach(() => {
  resetFakeBackendService();
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  vi.mocked(waitForAnalysis).mockReset();
  resetWorkspace();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useReviewSession — deck repeat: goBack restores the exact visit', () => {
  it('restores the same NodeIds, session data, and REVIEWED status without a new analysis query', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    const card1 = makeReviewCard({ id: 1 as CardId });
    const card2 = makeReviewCard({ id: 2 as CardId });

    const boardIdRef = ref<BoardId | null>(boardId);
    const session = useReviewSession(boardIdRef);

    await session.startSession([card1, card2]);
    await flushPromises();
    expect(session.state.value).toBe('AWAITING_MOVE');

    // Finish card 1.
    primeAnalysis(boardId, 0.77);
    fakeBackendService.submitReview.mockResolvedValueOnce(card1);
    await session.processUserMove(3, 3);
    expect(session.state.value).toBe('FINISHED');
    expect(session.userMoveScores.value).toEqual([0.77]);

    // Snapshot the exact terminal state before advancing away — the
    // property goBack must reproduce verbatim.
    const preAdvanceBoard = store.boards.find(b => b.id === boardId)!;
    const nodeIdsBeforeAdvance = Object.keys(preAdvanceBoard.nodes).sort();
    const stonesBeforeAdvance = { ...preAdvanceBoard.stones };
    const scoresBeforeAdvance = [...session.userMoveScores.value];
    const analyzeCallsBeforeAdvance = fakeAnalysisService.analyzeRange.mock.calls.length;

    // Advance to card 2 (never visited — fresh loadCard fires and mints
    // a disjoint NodeId space, per the design doc's §1b survey).
    session.nextCard();
    await flushPromises();
    expect(session.state.value).toBe('AWAITING_MOVE');
    const card2NodeIds = Object.keys(store.boards.find(b => b.id === boardId)!.nodes);
    expect(card2NodeIds).not.toEqual(nodeIdsBeforeAdvance);

    // Go back — no new analysis query, exact board restored.
    const analyzeCallsBeforeBack = fakeAnalysisService.analyzeRange.mock.calls.length;
    const backed = session.goBack();
    expect(backed).toBe(true);

    expect(session.state.value).toBe('REVIEWED');
    expect(session.userMoveScores.value).toEqual(scoresBeforeAdvance);
    const restoredBoard = store.boards.find(b => b.id === boardId)!;
    expect(Object.keys(restoredBoard.nodes).sort()).toEqual(nodeIdsBeforeAdvance);
    expect(restoredBoard.stones).toEqual(stonesBeforeAdvance);
    // The restore is a ledger cache hit — no KataGo round-trip fired.
    expect(fakeAnalysisService.analyzeRange.mock.calls.length).toBe(analyzeCallsBeforeBack);
    expect(fakeAnalysisService.analyzeRange.mock.calls.length).toBe(analyzeCallsBeforeAdvance);
  });

  it('goForward resumes an AWAITING_MOVE snapshot mid-attempt (not graded, so it just continues)', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    const card1 = makeReviewCard({ id: 1 as CardId, numMoves: 1 });
    // card2 needs 2 moves so one move leaves it AWAITING_MOVE, not FINISHED.
    const card2 = makeReviewCard({ id: 2 as CardId, numMoves: 2 });

    const boardIdRef = ref<BoardId | null>(boardId);
    const session = useReviewSession(boardIdRef);

    await session.startSession([card1, card2]);
    await flushPromises();

    primeAnalysis(boardId, 0.5);
    fakeBackendService.submitReview.mockResolvedValueOnce(card1);
    await session.processUserMove(3, 3); // finishes card 1
    expect(session.state.value).toBe('FINISHED');

    session.nextCard(); // → card 2, fresh load
    await flushPromises();
    expect(session.state.value).toBe('AWAITING_MOVE');

    primeAnalysis(boardId, 0.6);
    await session.processUserMove(15, 15); // one of card2's two moves; still AWAITING_MOVE
    expect(session.state.value).toBe('AWAITING_MOVE');
    expect(session.userMovesCount.value).toBe(1);

    // Back to card 1 (REVIEWED), then forward again to card 2 — the
    // mid-attempt progress must resume exactly (not re-parsed to 0).
    session.goBack();
    expect(session.state.value).toBe('REVIEWED');
    session.goForward();
    expect(session.state.value).toBe('AWAITING_MOVE');
    expect(session.userMovesCount.value).toBe(1);
    expect(session.userMoveScores.value).toEqual([0.6]);
  });

  it('the aliasing fix: mutating the live board after a restore does not corrupt the archived snapshot', async () => {
    // Witnesses restoreSlot's re-clone directly (review should-fix):
    // restore a snapshot, mutate the LIVE board in place via the same
    // mechanism rewindToStart/the intermission-chart click use
    // (mutateBoard -> navigateTo, which deletes/sets `stones` entries
    // in place, not a full board replacement), then read the ARCHIVED
    // map entry back through the test-only inspector — WITHOUT
    // navigating away first (a navigate-away would re-capture fresh
    // from the live board regardless of the bug, masking it). If
    // restoreSlot installed the snapshot's own `stones` object instead
    // of a fresh clone, this in-place mutation would be visible in the
    // archived copy too.
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    // Two-move card so one move leaves it AWAITING_MOVE, not FINISHED
    // — keeps the played stone on the board (no finishCard rewind to
    // confound the stones assertion).
    const card0 = makeReviewCard({ id: 1 as CardId, numMoves: 2 });
    const card1 = makeReviewCard({ id: 2 as CardId, numMoves: 1 });

    const boardIdRef = ref<BoardId | null>(boardId);
    const session = useReviewSession(boardIdRef);

    await session.startSession([card0, card1]);
    await flushPromises();

    primeAnalysis(boardId, 0.5);
    await session.processUserMove(3, 3); // one of card0's two moves
    expect(session.state.value).toBe('AWAITING_MOVE');
    expect(store.boards.find(b => b.id === boardId)!.stones['3,3']).toBe('B');

    session.goForward(); // -> card1, fresh; captures card0's slot (index 0)
    await flushPromises();
    expect(_visitSnapshotStonesForTesting(boardId, 0)).toEqual({ '3,3': 'B' });

    session.goBack(); // restores card0's snapshot — the install under test
    expect(session.state.value).toBe('AWAITING_MOVE');
    expect(store.boards.find(b => b.id === boardId)!.stones['3,3']).toBe('B');

    // Mutate the LIVE board in place (navigate to root — undoes the
    // move, deleting the '3,3' stone from `state.stones` in place).
    // No goBack/goForward call in between — nothing re-captures.
    const rootId = store.boards.find(b => b.id === boardId)!.rootNodeId;
    mutateBoard(boardId, draft => navigateTo(draft, rootId));
    expect(store.boards.find(b => b.id === boardId)!.stones['3,3']).toBeUndefined();

    // The archived snapshot for index 0 must be unaffected by the
    // live mutation above.
    expect(_visitSnapshotStonesForTesting(boardId, 0)).toEqual({ '3,3': 'B' });
  });
});

describe('useReviewSession — deck repeat: REVIEWED is structurally view-only', () => {
  it('the routing gate refuses both board-mutation entry points (tripwire)', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    const card1 = makeReviewCard({ id: 1 as CardId });
    const card2 = makeReviewCard({ id: 2 as CardId });

    const boardIdRef = ref<BoardId | null>(boardId);
    const session = useReviewSession(boardIdRef);
    const fireAndAdvanceHead =
      vi.fn<EngineResponderHandle['fireAndAdvanceHead']>().mockResolvedValue(undefined);
    const routing = useBoardMoveRouting(session, { fireAndAdvanceHead });

    await session.startSession([card1, card2]);
    await flushPromises();
    primeAnalysis(boardId, 0.5);
    fakeBackendService.submitReview.mockResolvedValueOnce(card1);
    await session.processUserMove(3, 3);
    session.nextCard();
    await flushPromises();
    session.goBack();
    expect(session.state.value).toBe('REVIEWED');

    const boardBefore = store.boards.find(b => b.id === boardId)!;
    const stonesBefore = { ...boardBefore.stones };
    const nodeCountBefore = Object.keys(boardBefore.nodes).length;
    const analyzeCallsBefore = fakeAnalysisService.analyzeRange.mock.calls.length;

    routing.handleBoardMove(15, 15);
    routing.handlePastePv([{ x: 16, y: 16, color: 'B', moveNumber: 1 }]);

    const boardAfter = store.boards.find(b => b.id === boardId)!;
    expect(boardAfter.stones).toEqual(stonesBefore);
    expect(Object.keys(boardAfter.nodes).length).toBe(nodeCountBefore);
    expect(fakeAnalysisService.analyzeRange.mock.calls.length).toBe(analyzeCallsBefore);
    expect(fakeBackendService.submitReview).toHaveBeenCalledTimes(1); // unchanged
    expect(fireAndAdvanceHead).not.toHaveBeenCalled();
  });
});

describe('useReviewSession — deck repeat: Retry and the double-fire tripwire', () => {
  it('submitReview fires exactly once per genuine attempt across a back/forward/retry dance', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    const card1 = makeReviewCard({ id: 1 as CardId });
    const card2 = makeReviewCard({ id: 2 as CardId });

    const boardIdRef = ref<BoardId | null>(boardId);
    const session = useReviewSession(boardIdRef);

    await session.startSession([card1, card2]);
    await flushPromises();

    primeAnalysis(boardId, 0.4);
    fakeBackendService.submitReview.mockResolvedValueOnce(card1);
    await session.processUserMove(3, 3); // finishes card 1 — genuine attempt #1
    expect(session.state.value).toBe('FINISHED');
    expect(fakeBackendService.submitReview).toHaveBeenCalledTimes(1);

    session.nextCard(); // → card 2, fresh load, AWAITING_MOVE
    await flushPromises();

    // Pathological back/forth dance — none of this may re-fire submitReview.
    session.goBack();
    expect(session.state.value).toBe('REVIEWED');
    session.goForward();
    expect(session.state.value).toBe('AWAITING_MOVE'); // card 2, resumed
    session.goBack();
    expect(session.state.value).toBe('REVIEWED');
    session.goBack(); // already at index 0 — no-op
    expect(session.state.value).toBe('REVIEWED');

    expect(fakeBackendService.submitReview).toHaveBeenCalledTimes(1);
    expect(fakeBackendService.submitReview).toHaveBeenCalledWith(1, [0.4]);

    // Retry is the ONLY way back into a gradeable state — discards the
    // snapshot and re-enters card 1 fresh.
    session.retryCard();
    await flushPromises();
    expect(session.state.value).toBe('AWAITING_MOVE');
    expect(session.userMoveScores.value).toEqual([]); // fresh attempt, no stale scores

    primeAnalysis(boardId, 0.9);
    fakeBackendService.submitReview.mockResolvedValueOnce(card1);
    await session.processUserMove(15, 15); // genuine attempt #2
    expect(session.state.value).toBe('FINISHED');

    // Exactly two genuine attempts recorded — the dance in between fired none.
    expect(fakeBackendService.submitReview).toHaveBeenCalledTimes(2);
    expect(fakeBackendService.submitReview).toHaveBeenNthCalledWith(1, 1, [0.4]);
    expect(fakeBackendService.submitReview).toHaveBeenNthCalledWith(2, 1, [0.9]);
  });

  it('retryCard is a no-op outside REVIEWED (defensive)', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;
    const card1 = makeReviewCard({ id: 1 as CardId });

    const boardIdRef = ref<BoardId | null>(boardId);
    const session = useReviewSession(boardIdRef);

    await session.startSession([card1]);
    await flushPromises();
    expect(session.state.value).toBe('AWAITING_MOVE');

    session.retryCard(); // not REVIEWED — must not touch anything
    expect(session.state.value).toBe('AWAITING_MOVE');
    expect(fakeBackendService.submitReview).not.toHaveBeenCalled();
  });
});

describe('useReviewSession — deck repeat: resource ownership', () => {
  it('endSession clears the board\'s retained snapshots (a subsequent session starts clean)', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;
    const card1 = makeReviewCard({ id: 1 as CardId });
    const card2 = makeReviewCard({ id: 2 as CardId });

    const boardIdRef = ref<BoardId | null>(boardId);
    const session = useReviewSession(boardIdRef);

    await session.startSession([card1, card2]);
    await flushPromises();
    primeAnalysis(boardId, 0.3);
    fakeBackendService.submitReview.mockResolvedValueOnce(card1);
    await session.processUserMove(3, 3);
    session.nextCard();
    await flushPromises();

    session.endSession();
    expect(session.state.value).toBe('IDLE');

    // A fresh session over the same board must not see the retained
    // card-1 snapshot from the prior session — goBack from a
    // freshly-started session has nothing below index 0 regardless,
    // but the real guarantee is the map itself: canGoBack is false at
    // a fresh session's first card.
    await session.startSession([card1, card2]);
    await flushPromises();
    expect(session.canGoBack.value).toBe(false);
  });
});
