/**
 * tests/integration/useAutoSaveAnalyses.test.ts
 *
 * Tier-3 (composable integration) tests for the auto-save policy
 * driving `analysisPersistenceService.save()` on per-board dirty
 * bumps. The composable orchestrates: a reactive `watch` over the
 * service's per-board dirty counter (plus the two gating leaves
 * on `store.profile.settings.engine.katago`), a leading-edge
 * throttle that schedules a save 2 s after the first bump in a
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  resetFakeAnalysisPersistenceService,
} from '../fakes/analysis-persistence-service';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import type { BoardId } from '../../src/types';
import { ApiError } from '../../src/services/api-client';

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
    const handle = useAutoSaveAnalyses();
    const boardId = await addBoardAndGetId();

    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    await flushPromises();

    expect(fakeAnalysisPersistenceService.save).not.toHaveBeenCalled();
    handle.stop();
  });

  it('does not fire when analysisStorageEnabled is off (even if analysisAutoSave is on)', async () => {
    store.profile.settings.engine.katago.analysisStorageEnabled = false;
    store.profile.settings.engine.katago.analysisAutoSave = true;
    const handle = useAutoSaveAnalyses();
    const boardId = await addBoardAndGetId();

    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    await flushPromises();

    expect(fakeAnalysisPersistenceService.save).not.toHaveBeenCalled();
    handle.stop();
  });

  it('fires save once after a dirty bump + debounce window', async () => {
    enableAutoSave();
    const handle = useAutoSaveAnalyses();
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
    expect(fakeAnalysisPersistenceService.save).toHaveBeenCalledWith(boardId);
    handle.stop();
  });

  it('coalesces multiple bumps within the window into one save', async () => {
    enableAutoSave();
    const handle = useAutoSaveAnalyses();
    const boardId = await addBoardAndGetId();

    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();
    vi.advanceTimersByTime(500);
    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();
    vi.advanceTimersByTime(500);
    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();

    // Total elapsed: 1000 ms — still within window from the first bump.
    expect(fakeAnalysisPersistenceService.save).not.toHaveBeenCalled();

    // Cross from first-bump-at-zero: total 2000 ms.
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(fakeAnalysisPersistenceService.save).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it('pauses auto-save for a board on bundle_too_large error', async () => {
    enableAutoSave();
    fakeAnalysisPersistenceService.save.mockRejectedValueOnce(
      new ApiError(413, '{"detail":{"kind":"bundle_too_large","request_bytes":1000000,"cap_bytes":500000,"detail":"bundle exceeds cap"}}'),
    );
    const handle = useAutoSaveAnalyses();
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
    expect(fakeAnalysisPersistenceService.save).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it('re-arms paused boards on analysisAutoSave false → true transition', async () => {
    enableAutoSave();
    const handle = useAutoSaveAnalyses();
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

    expect(fakeAnalysisPersistenceService.autoSaveErrorFor(boardId)).toBeUndefined();
    handle.stop();
  });

  it('cancels pending timers when analysisAutoSave flips off mid-window', async () => {
    enableAutoSave();
    const handle = useAutoSaveAnalyses();
    const boardId = await addBoardAndGetId();

    fakeAnalysisPersistenceService.markDirty(boardId);
    await flushPromises();
    vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    disableAutoSave();
    await flushPromises();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    await flushPromises();

    expect(fakeAnalysisPersistenceService.save).not.toHaveBeenCalled();
    handle.stop();
  });
});
