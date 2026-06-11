/**
 * tests/integration/useAutoSaveAnalyses.test.ts
 *
 * Tier-3 (composable integration) tests for the auto-save policy
 * driving `analysisPersistenceService.save()` on per-board dirty
 * bumps. The composable orchestrates: a reactive `watch` over the
 * service's per-board dirty counter (plus the two gating leaves
 * on `store.profile.settings.engine.katago`), a trailing-edge
 * debounce that (re)schedules a save 2 s after the LAST bump in a
 * quiet period, and a persistent-error pause that writes to the
 * service's `autoSaveError` slot when `save()` rejects with a
 * typed `AnalysisBundleStorageError`.
 *
 * Test shape per the tier guide: real store, real composable,
 * fake persistence service. The fake carries reactive Maps for
 * dirty counters and error slots — the composable's watch
 * subscribes via Vue's Map reactivity, so a `markDirty()` call
 * propagates exactly as it would in production.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { flushPromises } from '@vue/test-utils';

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

// Avoid the real analysis-service mounting WebSocket plumbing
// when its module loads transitively (the composable doesn't
// touch it directly, but other store cleanups do).
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

import { useAutoSaveAnalyses } from '../../src/composables/useAutoSaveAnalyses';
import {
  store,
  addBoard,
  resetWorkspace,
} from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import {
  fakeAnalysisPersistenceService,
  realServiceStorageThrow,
  resetFakeAnalysisPersistenceService,
} from '../fakes/analysis-persistence-service';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import type { BoardId } from '../../src/types';

const DEBOUNCE_MS = 2000;

function enableAutoSave(): void {
  store.profile.settings.engine.katago.analysisStorageEnabled = true;
  store.profile.settings.engine.katago.analysisAutoSave = true;
}

function disableAutoSave(): void {
  store.profile.settings.engine.katago.analysisAutoSave = false;
}

async function addBoardAndGetId(): Promise<BoardId> {
  addBoard(createInitialBoard());
  await flushPromises();
  return store.boards[store.boards.length - 1].id;
}

// Mount the auto-save composable with failure-safe teardown.
// `onTestFinished` runs on pass AND fail — unlike an in-body
// `handle.stop()`, which a thrown assertion skips, leaking the
// composable's per-board watcher into the next test. That leak is what
// made the `bundle_too_large` failure masquerade as unrelated to the
// (real) `coalesces` timing bug; registering teardown here defuses the
// whole class.
function mountAutoSave(): void {
  const h = useAutoSaveAnalyses();
  onTestFinished(() => h.stop());
}

describe('useAutoSaveAnalyses', () => {
  beforeEach(() => {
    resetWorkspace();
    resetFakeAnalysisPersistenceService();
    resetFakeAnalysisService();
    fakeAnalysisPersistenceService.save.mockResolvedValue({
      boardId: 'fake' as BoardId,
      recordCount: 0,
      storedScheme: 'json',
      storedByteSize: 0,
      updatedAt: '2026-05-25T00:00:00Z',
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire when analysisAutoSave is off', async () => {
    store.profile.settings.engine.katago.analysisStorageEnabled = true;
    store.profile.settings.engine.katago.analysisAutoSave = false;
    mountAutoSave();
    const boardId = await addBoardAndGetId();

    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    await flushPromises();

    expect(fakeAnalysisPersistenceService.save).not.toHaveBeenCalled();  });

  it('does not fire when analysisStorageEnabled is off (even if analysisAutoSave is on)', async () => {
    store.profile.settings.engine.katago.analysisStorageEnabled = false;
    store.profile.settings.engine.katago.analysisAutoSave = true;
    mountAutoSave();
    const boardId = await addBoardAndGetId();

    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    await flushPromises();

    expect(fakeAnalysisPersistenceService.save).not.toHaveBeenCalled();  });

  it('fires save once after a dirty bump + debounce window', async () => {
    enableAutoSave();
    mountAutoSave();
    const boardId = await addBoardAndGetId();

    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();

    // Within the window: no save yet.
    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    await flushPromises();
    expect(fakeAnalysisPersistenceService.save).not.toHaveBeenCalled();

    // Cross the window: save fires.
    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(fakeAnalysisPersistenceService.save).toHaveBeenCalledTimes(1);
    expect(fakeAnalysisPersistenceService.save).toHaveBeenCalledWith(boardId);  });

  it('coalesces multiple bumps within the window into one save', async () => {
    enableAutoSave();
    mountAutoSave();
    const boardId = await addBoardAndGetId();

    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();
    vi.advanceTimersByTime(500);
    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();
    vi.advanceTimersByTime(500);
    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();

    // Nothing yet: trailing-edge debounce — each bump reset the timer, so the
    // single live timer is scheduled 2000 ms after the LAST bump (t=1000),
    // i.e. at t=3000. (This test predated the leading-edge → trailing-edge
    // refactor; see the composable header / the 2026-05-30 worklog.)
    expect(fakeAnalysisPersistenceService.save).not.toHaveBeenCalled();

    // Cross the debounce window measured from the last bump.
    vi.advanceTimersByTime(DEBOUNCE_MS);
    await flushPromises();
    expect(fakeAnalysisPersistenceService.save).toHaveBeenCalledTimes(1);  });

  it('pauses auto-save for a board on bundle_too_large error', async () => {
    enableAutoSave();
    // Reject with what the REAL service throws — the already-parsed
    // structural union (rethrowAsStorageError throws the
    // AnalysisBundleStorageError POJO, not the raw ApiError). Routing
    // the same wire body through `realServiceStorageThrow` keeps this
    // test exercising the production seam; a raw ApiError here passed
    // spuriously while the real pause path was unreachable (the
    // autosave-pause-unreachable defect).
    fakeAnalysisPersistenceService.save.mockRejectedValueOnce(
      realServiceStorageThrow(
        413,
        '{"detail":{"kind":"bundle_too_large","request_bytes":1000000,"cap_bytes":500000,"detail":"bundle exceeds cap"}}',
      ),
    );
    mountAutoSave();
    const boardId = await addBoardAndGetId();

    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    await flushPromises();
    expect(fakeAnalysisPersistenceService.save).toHaveBeenCalledTimes(1);

    // Auto-save error slot is populated; further dirty bumps don't fire.
    expect(fakeAnalysisPersistenceService.autoSaveErrorFor(boardId)).toBeDefined();
    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    await flushPromises();
    expect(fakeAnalysisPersistenceService.save).toHaveBeenCalledTimes(1);  });

  it('re-arms paused boards on analysisAutoSave false → true transition', async () => {
    enableAutoSave();
    mountAutoSave();
    const boardId = await addBoardAndGetId();

    // Pre-populate an error slot (as if a prior save failed) so we
    // can observe the rising-edge clear without driving the failure
    // through save() itself.
    fakeAnalysisPersistenceService.setAutoSaveError(boardId, {
      kind: 'user_quota_exceeded',
      status: 413,
      currentBytes: 100,
      quotaBytes: 50,
      detail: 'quota exceeded',
    });

    disableAutoSave();
    await flushPromises();
    enableAutoSave();
    await flushPromises();

    expect(fakeAnalysisPersistenceService.autoSaveErrorFor(boardId)).toBeUndefined();  });

  it('cancels pending timers when analysisAutoSave flips off mid-window', async () => {
    enableAutoSave();
    mountAutoSave();
    const boardId = await addBoardAndGetId();

    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();
    vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    disableAutoSave();
    await flushPromises();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    await flushPromises();

    expect(fakeAnalysisPersistenceService.save).not.toHaveBeenCalled();  });
});
