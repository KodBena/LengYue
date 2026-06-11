/**
 * tests/fakes/analysis-persistence-service.ts
 *
 * Fake substitute for the `analysisPersistenceService` singleton
 * exported from `src/services/analysis-persistence-service.ts`.
 *
 * Roles:
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
 *   - The board-keyed drain: the fake mirrors all THREE board-keyed
 *     Maps (`summaries` / `dirtyVersions` / `autoSaveErrors`) and the
 *     per-board release verb (`forgetBoard`, called by `discard`), so
 *     a test exercising `closeBoard` observes the same three-Map drain
 *     production performs. The drain seam's fidelity is pinned by
 *     `analysis-persistence-fake-fidelity.test.ts` (it drives the real
 *     service and asserts the fake matches), so the fake cannot
 *     silently diverge from production the way the original
 *     summaries-only fake did (`persistence-board-keyed-drain`).
 *
 * License: Public Domain (The Unlicense)
 */

import { vi } from 'vitest';
import { reactive } from 'vue';
import type { BoardId } from '../../src/types';
import { parseStorageError } from '../../src/services/analysis-bundle';
import type {
  AnalysisBundleStorageError,
  AnalysisBundleSummary,
} from '../../src/services/analysis-bundle';
import { ApiError } from '../../src/services/api-client';

// Reactive backing — same three board-keyed Maps the real service
// holds (`summaries` / `dirtyVersions` / `autoSaveErrors`). Cleared
// by resetFakeAnalysisPersistenceService(). The fake mirrors all
// three so a test can observe the real per-board drain
// (`forgetBoard`, called by `discard`) — the audit found the fake
// previously mirrored only the *summaries* delete and so missed the
// two undrained siblings (`persistence-board-keyed-drain`).
const summaries = reactive(new Map<BoardId, AnalysisBundleSummary>());
const dirtyVersions = reactive(new Map<BoardId, number>());
const autoSaveErrors = reactive(new Map<BoardId, AnalysisBundleStorageError>());

// ── Fake-fidelity: the real per-board release verb ───────────────────────────
//
// The real `AnalysisPersistenceService.forgetBoard()` drains ALL THREE
// board-keyed Maps; `discard()` calls it (adding the server-side DELETE the
// fake has no need to perform). Mirroring that here is the point of this fake's
// existence after the audit: a test exercising `closeBoard` (which calls
// `discard`) can assert the board's dirty-version and auto-save-error entries
// are gone, not just its summary.
function forgetBoardImpl(boardId: BoardId): void {
  summaries.delete(boardId);
  dirtyVersions.delete(boardId);
  autoSaveErrors.delete(boardId);
}

// forgetAll is defined as forgetBoard over every board the fake holds —
// mirroring the real service, where forgetAll iterates forgetBoard over the
// keyset so the three-Map set is named in one place only.
function forgetAllImpl(): void {
  const boards = new Set<BoardId>([
    ...summaries.keys(),
    ...dirtyVersions.keys(),
    ...autoSaveErrors.keys(),
  ]);
  for (const boardId of boards) forgetBoardImpl(boardId);
}

// ── Fake-fidelity: reproduce the real service's storage-error throw ──────────
//
// The real `AnalysisPersistenceService.save()` does NOT reject with the raw
// `ApiError` the api-client throws — it routes that error through
// `rethrowAsStorageError`, which calls `parseStorageError(apiError)` and
// throws the ALREADY-PARSED structural union (`AnalysisBundleStorageError`,
// a plain `{kind,status,…}` POJO, deliberately not an Error subclass).
//
// A fake that rejected with a raw `ApiError` would diverge from that real
// seam: the autosave composable's catch recognised only the parsed union, so
// the integration test passed against a shape production never produced (the
// `autosave-pause-unreachable` defect — tests-outside-typecheck / fake-
// fidelity class). To keep the fake honest, `realServiceStorageThrow` derives
// the rejection value by the SAME production parse the real service uses, from
// the SAME wire inputs the backend would send. The pin test
// (`analysis-persistence-fake-fidelity.test.ts`) asserts this stays equal to
// what the real `save()` throws so the seam cannot silently diverge again.
export function realServiceStorageThrow(
  status: number,
  wireBody: string,
): AnalysisBundleStorageError {
  const parsed = parseStorageError(new ApiError(status, wireBody));
  if (!parsed) {
    throw new Error(
      'fake-fidelity: realServiceStorageThrow given a body the real ' +
      'parseStorageError does not recognise as a storage error; the fake ' +
      'must only reject with shapes the real service actually throws. ' +
      `status=${status} body=${wireBody}`,
    );
  }
  return parsed;
}

export const fakeAnalysisPersistenceService = {
  // `discard` stays a spy (tests assert call counts / configure
  // rejections) AND mirrors the real local drain: it routes through
  // forgetBoard, dropping all three board-keyed entries — the seam
  // the audit found the fake previously skipping for two of them.
  discard: vi
    .fn<(boardId: BoardId) => Promise<void>>()
    .mockImplementation((boardId: BoardId) => {
      forgetBoardImpl(boardId);
      return Promise.resolve();
    }),
  // Per-board release verb — drains all three Maps, mirroring the real
  // service. A spy so a test can assert it was invoked, with the drain
  // as its implementation.
  forgetBoard: vi
    .fn<(boardId: BoardId) => void>()
    .mockImplementation(forgetBoardImpl),
  forgetAll: vi.fn<() => void>().mockImplementation(forgetAllImpl),
  refreshSummaries: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  summaryFor: (boardId: BoardId): AnalysisBundleSummary | undefined =>
    summaries.get(boardId),
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

// Test seam: populate a board's summary so `summaryFor` returns it and
// `forgetBoard` / `discard` have a summary entry to drain. Not on the real
// service (the real summary lands via save/restore/refreshSummaries from the
// wire) — this is the fake's direct injection point for the three-Map drain
// tests.
export function seedFakeSummary(boardId: BoardId, summary: AnalysisBundleSummary): void {
  summaries.set(boardId, summary);
}

export function resetFakeAnalysisPersistenceService(): void {
  fakeAnalysisPersistenceService.discard
    .mockReset()
    .mockImplementation((boardId: BoardId) => {
      forgetBoardImpl(boardId);
      return Promise.resolve();
    });
  fakeAnalysisPersistenceService.forgetBoard.mockReset().mockImplementation(forgetBoardImpl);
  fakeAnalysisPersistenceService.forgetAll.mockReset().mockImplementation(forgetAllImpl);
  fakeAnalysisPersistenceService.refreshSummaries.mockReset().mockResolvedValue(undefined);
  fakeAnalysisPersistenceService.save.mockReset();
  fakeAnalysisPersistenceService.restore.mockReset();
  summaries.clear();
  dirtyVersions.clear();
  autoSaveErrors.clear();
}
