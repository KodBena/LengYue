/**
 * src/composables/useAutoSaveAnalyses.ts
 *
 * Auto-save policy for the experimental analysis-persistence
 * feature. Watches each open board's `dirtyVersion` counter on
 * `analysisPersistenceService` (incremented by `analysis-service`
 * after every authoritative ledger.record landing), and on a
 * rising edge schedules a throttled `save(boardId)` call. Gated on
 * `engine.katago.analysisStorageEnabled && engine.katago.analysisAutoSave`;
 * flipping either toggle off cancels any pending timer.
 *
 * Throttle shape: leading-edge schedule with trailing-edge save.
 * The first dirty bump in a quiet period schedules a save at
 * `now + AUTO_SAVE_DEBOUNCE_MS`; further bumps within the window
 * are absorbed (no reschedule, no extra timer). The save call
 * captures the dirty version at fire time, so any post-window
 * bumps that arrive during the in-flight PUT will trigger a
 * follow-up save on the next markDirty after the PUT completes.
 *
 * Persistent-error pause: when `save()` throws an
 * `AnalysisBundleStorageError` (quota exceeded, bundle over cap,
 * unknown scheme), the composable writes the error to the
 * service's per-board `autoSaveError` slot and stops firing for
 * that board until either (a) a successful save() clears the
 * slot, or (b) the user toggles `analysisAutoSave` off→on (the
 * rising edge re-arms every paused board). Generic / transient
 * failures (network 500s, parser errors) are NOT pause triggers —
 * the next markDirty naturally retries. This matches the user-
 * memory calibration that fail-loud should hard-refuse on
 * expensive operations that would re-fire into the same wall,
 * while still allowing the cheaper retries that transient
 * failures might benefit from.
 *
 * Resource ownership: the returned `stop()` cleans the watcher
 * and clears every pending timer. App bootstrap mounts once via
 * `useAppBootstrap`; identity-flip teardowns call stop() before
 * re-mounting against the new identity so timers don't leak
 * across the boundary.
 *
 * License: Public Domain (The Unlicense)
 */

import { watch } from 'vue';
import { store } from '../store';
import { analysisPersistenceService } from '../services/analysis-persistence-service';
import { parseStorageError } from '../services/analysis-bundle';
import type { BoardId } from '../types';

/**
 * Debounce window for the leading-edge schedule.
 *
 * magic-literal: 2000 ms is the trailing edge of the analyze-
 * burst pattern. A typical analyze-range completing N final
 * packets at ~10-50 ms intervals settles within a few hundred
 * milliseconds; setting the window to 2 s absorbs the typical
 * burst while keeping the user-visible "Saved … just now"
 * subtitle responsive on the persist-box. Larger windows would
 * coalesce more aggressively but feel laggy; smaller windows
 * would PUT-spam mid-burst.
 */
const AUTO_SAVE_DEBOUNCE_MS = 2000;

export interface AutoSaveHandle {
  /** Cancel all pending timers and tear down the watcher. */
  readonly stop: () => void;
}

export function useAutoSaveAnalyses(): AutoSaveHandle {
  // Per-board "last-version-we-scheduled-a-save-against" tracker.
  // Local to this composable instance (not on the service) because
  // it's policy state — the question "what does THIS auto-save
  // policy consider already-handled" is the composable's concern,
  // not the persistence service's. A fresh mount syncs by reading
  // `dirtyVersionFor()` at startup so already-bumped boards don't
  // immediately fire a save against state the user hadn't touched
  // yet during the previous app session.
  const lastScheduledVersion = new Map<BoardId, number>();
  const pendingTimers = new Map<BoardId, ReturnType<typeof setTimeout>>();
  let lastGateState: boolean | null = null;

  function isGated(): boolean {
    const k = store.profile.settings.engine.katago;
    return k.analysisStorageEnabled && k.analysisAutoSave;
  }

  function cancelAllTimers(): void {
    for (const timer of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
  }

  async function fireSave(boardId: BoardId, scheduledAtVersion: number): Promise<void> {
    pendingTimers.delete(boardId);
    // Re-check gate at fire time — the user may have toggled
    // analysisAutoSave off during the 2 s wait. If so, abort
    // silently (cancelAllTimers would also have been called from
    // the gate watcher, but a race where the timer was already
    // queued past the cancel still lands here).
    if (!isGated()) return;
    // Auto-save errors set during the window: skip — the board is
    // paused.
    if (analysisPersistenceService.autoSaveErrorFor(boardId)) return;

    lastScheduledVersion.set(boardId, scheduledAtVersion);
    try {
      await analysisPersistenceService.save(boardId);
    } catch (err) {
      const parsed = parseStorageError(err);
      if (parsed) {
        // Persistent failure: pause this board until manual recovery.
        // The error surfaces via the service's autoSaveError slot
        // which AnalysisControls.vue reads for the inline notice.
        analysisPersistenceService.setAutoSaveError(boardId, parsed);
      }
      // Generic / transient failures fall through silently — the
      // api-client already pushed a system-log message; the next
      // markDirty triggers another attempt. Per ADR-0002, we do
      // NOT swallow the typed-error case (handled by the parsed
      // branch above); the silent path here is the "let the next
      // attempt speak for itself" case for genuinely transient
      // conditions.
    }
  }

  function scheduleSaveIfNeeded(boardId: BoardId): void {
    if (pendingTimers.has(boardId)) return;  // already scheduled this window
    if (analysisPersistenceService.autoSaveErrorFor(boardId)) return;  // paused

    const currentVersion = analysisPersistenceService.dirtyVersionFor(boardId);
    const seenVersion = lastScheduledVersion.get(boardId) ?? currentVersion;
    if (currentVersion <= seenVersion) {
      // Sync the "seen" version on first observation so a fresh
      // mount doesn't fire a save against state we just hydrated
      // a summary for. Set rather than left undefined so the
      // first real bump after mount fires (currentVersion + 1 >
      // currentVersion).
      lastScheduledVersion.set(boardId, currentVersion);
      return;
    }

    const timer = setTimeout(() => fireSave(boardId, currentVersion), AUTO_SAVE_DEBOUNCE_MS);
    pendingTimers.set(boardId, timer);
  }

  const stopWatch = watch(
    // Reactive source: gather every (boardId, dirtyVersion) plus the
    // gate state. Reading inside this getter subscribes us to: the
    // store.boards list (membership changes trigger re-run), each
    // board's dirty counter (via the service's reactive Map), and
    // the two gating leaves (via store reactivity).
    () => {
      const gated = isGated();
      const entries: { boardId: BoardId; version: number }[] = [];
      for (const board of store.boards) {
        entries.push({
          boardId: board.id,
          version: analysisPersistenceService.dirtyVersionFor(board.id),
        });
      }
      return { gated, entries };
    },
    ({ gated, entries }) => {
      // Gate transition handling. False → true: re-arm all paused
      // boards (the user actively re-enabling the feature is the
      // gesture that says "try again"). True → false: cancel any
      // pending timers so a save doesn't fire after the user has
      // turned auto-save off.
      if (lastGateState !== null && lastGateState !== gated) {
        if (gated) {
          analysisPersistenceService.clearAllAutoSaveErrors();
        } else {
          cancelAllTimers();
        }
      }
      lastGateState = gated;

      if (!gated) return;

      for (const { boardId } of entries) {
        scheduleSaveIfNeeded(boardId);
      }
    },
    { immediate: true, deep: false },
  );

  return {
    stop: () => {
      stopWatch();
      cancelAllTimers();
    },
  };
}
