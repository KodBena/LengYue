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

export const fakeAnalysisService = {
  analyzeRange: vi.fn<(
    boardId: BoardId,
    fullPath: NodeId[],
    startTurn: number,
    endTurn: number,
    visits: number,
    configOverride?: Record<string, unknown>,
  ) => void>(),
  stopBoardAnalysis: vi.fn<(boardId: BoardId) => void>(),
  stopAllBoardAnalyses: vi.fn<() => void>(),
  restartActiveAnalyses: vi.fn<() => void>(),
};

export function resetFakeAnalysisService(): void {
  fakeAnalysisService.analyzeRange.mockReset();
  fakeAnalysisService.stopBoardAnalysis.mockReset();
  fakeAnalysisService.stopAllBoardAnalyses.mockReset();
  fakeAnalysisService.restartActiveAnalyses.mockReset();
}
