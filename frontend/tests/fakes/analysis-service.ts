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
import type { BoardId, NodeId, QueryId } from '../../src/types';

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
  // Return type widened to the real `QueryId | null` (commission ledger
  // row 881 — `useLearnPath.ts`'s on-demand-analysis path is the first
  // consumer that reads this return value; every prior caller
  // (ponder toggles) ignored it, which is why the declared type had
  // drifted to `void`). `visits` and the two override params are on
  // the real signature too but no fake consumer passes the latter two
  // yet, so they're omitted here per "keep the fake's surface strictly
  // to what's actually exercised" (tests/CLAUDE.md).
  analyzeActiveNode: vi.fn<(boardId: BoardId, mode: 'ponder' | 'analyze', visits?: number) => QueryId | null>(),
  // Connection lifecycle. Exercised by `useEngineControls` (the
  // toolbar CONNECT/DISCONNECT button) and by
  // `useEngineUriEditor` (the toolbar URI editor's reconnect-on-
  // commit path) — both call the singleton directly, so the fake's
  // spies are what those composables' tests assert against.
  connect: vi.fn<(urlOverride?: string) => void>(),
  disconnect: vi.fn<() => void>(),
  // NN-cache-context feature (services/nncache-session.ts). The
  // driver registers a disconnect hook and sends cache_* actions
  // through this surface at MODULE LOAD time (top-level
  // `analysisService.registerDisconnectHook(...)` call) — every test
  // file that transitively imports `useReviewSession` (which imports
  // the driver) exercises this call, so the fake must implement it
  // even though no test in this tree currently asserts on it.
  registerDisconnectHook: vi.fn<(hook: () => void) => void>(),
  hasActiveQueries: vi.fn<() => boolean>(),
  sendActionCommand: vi.fn<(query: unknown) => Promise<unknown>>(),
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
  // Re-arm the default return (mockReset clears it) — mirrors
  // analyzeRange's own re-arm above. Ponder callers ignore the return
  // value entirely; `useLearnPath`'s on-demand path treats `null` as a
  // synchronous engine refusal, so a non-null default lets the common
  // "engine answers" case exercise naturally. Tests that want a
  // refusal override with `.mockReturnValueOnce(null)`.
  fakeAnalysisService.analyzeActiveNode.mockReturnValue(FAKE_QUERY_ID as QueryId);
  fakeAnalysisService.connect.mockReset();
  fakeAnalysisService.disconnect.mockReset();
  fakeAnalysisService.registerDisconnectHook.mockReset();
  fakeAnalysisService.hasActiveQueries.mockReset();
  fakeAnalysisService.hasActiveQueries.mockReturnValue(false);
  fakeAnalysisService.sendActionCommand.mockReset();
}
