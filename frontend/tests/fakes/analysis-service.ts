/**
 * tests/fakes/analysis-service.ts
 *
 * Fake substitute for the `analysisService` singleton exported from
 * `src/services/analysis-service.ts`. Mirror of `fakes/backend-service.ts`
 * — a vi-spy-backed object exposing the subset of the real surface
 * the test subjects in this tree exercise.
 *
 * The real AnalysisService bridges KataGo (over WebSocket) to the
 * local analysis ledger; replacing it with no-op spies isolates
 * composable tests from the proxy and from network timing.
 * `analyzeRange` is the load-bearing call site that
 * `useReviewSession.processUserMove` invokes; the rest are present
 * for the resource-ownership audit cleanup paths
 * (`closeBoard`, `resetWorkspace`) that the test fixtures route
 * through `resetWorkspace()`.
 *
 * License: Public Domain (The Unlicense)
 */

import { vi } from 'vitest';
import type { BoardId, NodeId } from '../../src/types';

/**
 * Sentinel queryId returned by `analyzeRange` after each
 * `resetFakeAnalysisService()` call. The real service mints a
 * `range-${boardId}-${Date.now()}` string at fire time; tests
 * that care about the exact identity override the return per-test
 * via `.mockReturnValueOnce(...)`. Tests that only care that
 * `stopQuery` is invoked with *some* string consume this sentinel
 * indirectly through `expect(stopQuery).toHaveBeenCalledWith(...)`.
 */
export const FAKE_QUERY_ID = 'fake-query-id';

export const fakeAnalysisService = {
  analyzeRange: vi.fn<(
    boardId: BoardId,
    fullPath: NodeId[],
    startTurn: number,
    endTurn: number,
    visits: number,
    configOverride?: Record<string, unknown>,
  ) => string | null>(),
  stopBoardAnalysis: vi.fn<(boardId: BoardId) => void>(),
  stopAllBoardAnalyses: vi.fn<() => void>(),
  restartActiveAnalyses: vi.fn<() => void>(),
  // Per-query release. Called by `useReviewSession.processUserMove`
  // in all three terminal branches (success, timeout, abort) to
  // release the queryId returned from `analyzeRange`. The fake is a
  // no-op spy; tests assert on the call shape, not on any per-query
  // map state.
  stopQuery: vi.fn<(queryId: string) => void>(),
  // Ponder lifecycle. Exercised by useUserIORegistry's space-key
  // handler (the keybindings registry's `engine.ponderToggle`
  // action). The integration tests for the dispatcher need
  // `isPondering` returning false so the toggle branches into
  // `analyzeActiveNode`; the fake's mockReturnValue is re-armed in
  // resetFakeAnalysisService.
  isPondering: vi.fn<(boardId: BoardId) => boolean>(),
  stopPonderOnBoard: vi.fn<(boardId: BoardId) => void>(),
  analyzeActiveNode: vi.fn<(boardId: BoardId, mode: 'ponder' | 'analyze') => void>(),
};

export function resetFakeAnalysisService(): void {
  fakeAnalysisService.analyzeRange.mockReset();
  // Re-arm the default return so production code's
  // `if (reviewQueryId !== null) stopQuery(reviewQueryId)` branch
  // exercises naturally; mockReset clears both calls AND any
  // configured return, so the re-arm is necessary after every reset.
  fakeAnalysisService.analyzeRange.mockReturnValue(FAKE_QUERY_ID);
  fakeAnalysisService.stopBoardAnalysis.mockReset();
  fakeAnalysisService.stopAllBoardAnalyses.mockReset();
  fakeAnalysisService.restartActiveAnalyses.mockReset();
  fakeAnalysisService.stopQuery.mockReset();
  fakeAnalysisService.isPondering.mockReset();
  // Default: not pondering — the keybindings ponderToggle handler
  // branches into `analyzeActiveNode` (start), which matches the
  // common test entry state. Tests that exercise the stop branch
  // override with `.mockReturnValueOnce(true)`.
  fakeAnalysisService.isPondering.mockReturnValue(false);
  fakeAnalysisService.stopPonderOnBoard.mockReset();
  fakeAnalysisService.analyzeActiveNode.mockReset();
}
