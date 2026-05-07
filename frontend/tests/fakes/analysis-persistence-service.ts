/**
 * tests/fakes/analysis-persistence-service.ts
 *
 * Fake substitute for the `analysisPersistenceService` singleton
 * exported from `src/services/analysis-persistence-service.ts`.
 *
 * `useReviewSession` itself does not call this service, but the
 * store's resource-ownership cleanup paths (`closeBoard`,
 * `resetWorkspace`) do — so tests that route through
 * `resetWorkspace` to reset between cases need the singleton
 * mocked to keep them off the real `/analysis-bundles` HTTP
 * endpoint. All methods are no-op spies returning the shape the
 * real service would.
 *
 * License: Public Domain (The Unlicense)
 */

import { vi } from 'vitest';
import type { BoardId } from '../../src/types';

export const fakeAnalysisPersistenceService = {
  discard: vi.fn<(boardId: BoardId) => Promise<void>>().mockResolvedValue(undefined),
  forgetAll: vi.fn<() => void>(),
  refreshSummaries: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  summaryFor: vi.fn<(boardId: BoardId) => null>().mockReturnValue(null),
  save: vi.fn(),
  restore: vi.fn(),
};

export function resetFakeAnalysisPersistenceService(): void {
  fakeAnalysisPersistenceService.discard.mockReset().mockResolvedValue(undefined);
  fakeAnalysisPersistenceService.forgetAll.mockReset();
  fakeAnalysisPersistenceService.refreshSummaries.mockReset().mockResolvedValue(undefined);
  fakeAnalysisPersistenceService.summaryFor.mockReset().mockReturnValue(null);
  fakeAnalysisPersistenceService.save.mockReset();
  fakeAnalysisPersistenceService.restore.mockReset();
}
