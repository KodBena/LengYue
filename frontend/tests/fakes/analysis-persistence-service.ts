/**
 * tests/fakes/analysis-persistence-service.ts
 *
 * Fake substitute for the `analysisPersistenceService` singleton
 * exported from `src/services/analysis-persistence-service.ts`.
 *
 * Two roles:
 *   - The original purpose: keep `useReviewSession` tests routing
 *     through `resetWorkspace` off the real `/analysis-bundles`
 *     HTTP endpoint. All methods are no-op spies returning the
 *     shape the real service would.
 *   - The auto-save policy: the fake carries reactive Maps for
 *     `dirtyVersions` and `autoSaveErrors`, so
 *     `useAutoSaveAnalyses` (which watches `dirtyVersionFor()`
 *     for the rising-edge save trigger) sees the bumps a test
 *     pushes through `markDirty()` exactly as the real service
 *     would propagate them. The save spy stays vi.fn so tests
 *     can assert call counts and configure rejections.
 *
 * License: Public Domain (The Unlicense)
 */

import { vi } from 'vitest';
import { reactive } from 'vue';
import type { BoardId } from '../../src/types';
import type { AnalysisBundleStorageError } from '../../src/services/analysis-bundle';

// Reactive backing — same shape as the real service's private
// Maps. Cleared by resetFakeAnalysisPersistenceService().
const dirtyVersions = reactive(new Map<BoardId, number>());
const autoSaveErrors = reactive(new Map<BoardId, AnalysisBundleStorageError>());

export const fakeAnalysisPersistenceService = {
  discard: vi.fn<(boardId: BoardId) => Promise<void>>().mockResolvedValue(undefined),
  forgetAll: vi.fn<() => void>(),
  refreshSummaries: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  summaryFor: vi.fn<(boardId: BoardId) => null>().mockReturnValue(null),
  save: vi.fn(),
  restore: vi.fn(),

  // ── Auto-save surface (reactive-backed; not pure spies) ───────────────
  markDirty: (boardId: BoardId) => {
    const v = dirtyVersions.get(boardId) ?? 0;
    dirtyVersions.set(boardId, v + 1);
  },
  dirtyVersionFor: (boardId: BoardId): number => dirtyVersions.get(boardId) ?? 0,
  setAutoSaveError: (boardId: BoardId, err: AnalysisBundleStorageError) => {
    autoSaveErrors.set(boardId, err);
  },
  autoSaveErrorFor: (boardId: BoardId): AnalysisBundleStorageError | undefined =>
    autoSaveErrors.get(boardId),
  clearAutoSaveError: (boardId: BoardId) => {
    autoSaveErrors.delete(boardId);
  },
  clearAllAutoSaveErrors: () => {
    autoSaveErrors.clear();
  },
};

export function resetFakeAnalysisPersistenceService(): void {
  fakeAnalysisPersistenceService.discard.mockReset().mockResolvedValue(undefined);
  fakeAnalysisPersistenceService.forgetAll.mockReset();
  fakeAnalysisPersistenceService.refreshSummaries.mockReset().mockResolvedValue(undefined);
  fakeAnalysisPersistenceService.summaryFor.mockReset().mockReturnValue(null);
  fakeAnalysisPersistenceService.save.mockReset();
  fakeAnalysisPersistenceService.restore.mockReset();
  dirtyVersions.clear();
  autoSaveErrors.clear();
}
