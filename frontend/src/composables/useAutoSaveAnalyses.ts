/**
 * src/composables/useAutoSaveAnalyses.ts
 *
 * Auto-save policy for the experimental analysis-persistence
 * feature. Watches each open board's `dirtyVersion` counter on
 * `analysisPersistenceService` (incremented by `analysis-service`
 * after every authoritative ledger.record landing), and debounces a
 * `save(boardId)` call on the trailing edge. Gated on
 * `engine.katago.analysisStorageEnabled && engine.katago.analysisAutoSave`;
 * flipping either toggle off cancels any pending timer.
 *
 * Throttle shape: trailing-edge debounce. Each dirty bump
 * (re)schedules the save at `now + AUTO_SAVE_DEBOUNCE_MS`, cancelling
 * any pending fire. During a continuous range query — a dirty bump per
 * authoritative packet — the timer keeps resetting, so NO save fires
 * mid-stream: the bundle is projected / quantized / PUT once, ~2 s after
 * analysis settles, rather than every window throughout. This replaced a
 * leading-edge schedule whose synchronous re-serialize of the float-heavy
 * bundle (ownership + policy across every node) was the dominant
 * main-thread block during a live query — 50-157 ms every ~2 s; see
 * `docs/worklog/2026-05-30-perf-autosave-trailing-debounce.md`. The save
 * still captures the dirty version at fire time, so a bump arriving during
 * the in-flight PUT triggers a follow-up save on the next markDirty.
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
 * ── Per-board watcher pattern (perf Fix #4) ────────────────────
 * A prior shape used a single global watcher whose reactive
 * source iterated `store.boards` and read `dirtyVersionFor()` per
 * board. mutateBoard fires the array's index dep → the global
 * watcher's reactive getter re-ran on every nav step, doing
 * O(N_boards) iteration work for no functional reason (no
 * board's dirtyVersion changed). The replacement: one per-board
 * watcher per open board, each subscribed to that board's
 * specific `dirtyVersionFor` key in the reactive Map; mutateBoard
 * doesn't fire any of them. A reconcile watcher on
 * `boardsSetVersion` (bumped only on add/remove/replace, not on
 * mutateBoard) sets up / tears down per-board watchers as the
 * board set changes. Diagnosed in
 * `docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md` Bug A
 * (secondary causes).
 *
 * Resource ownership: the per-board watcher + its scheduled
 * timer are paired as audit tag O15 (autosave-watcher-timer; a
 * code-minted tag past the archived plan's inventory — the slug,
 * not the number, is the stable handle). Reconcile teardown cancels
 * the timer before disposing the watcher so a queued microtask
 * fire can't race the dispose. The returned `stop()` tears down
 * the reconcile + gate watchers and every remaining per-board
 * watcher / timer. App bootstrap mounts once via
 * `useAppBootstrap`; identity-flip teardowns rely on
 * `resetWorkspace` bumping `boardsSetVersion` to fire the
 * reconcile (which sees zero ids in common with the prior set
 * and tears them all down).
 *
 * License: Public Domain (The Unlicense)
 */

import { watch } from 'vue';
import { store, boardsSetVersion } from '../store';
import { analysisPersistenceService } from '../services/analysis-persistence-service';
import { asStorageError } from '../services/analysis-bundle';
import type { BoardId } from '../types';
// Coalescing window centralised in the timing catalog (auditable surface).
import { AUTO_SAVE_DEBOUNCE_MS } from '../lib/timing';

export interface AutoSaveHandle {
  /** Cancel all pending timers and tear down the watcher. */
  readonly stop: () => void;
}

export function useAutoSaveAnalyses(): AutoSaveHandle {
  // Per-board "last-version-we-scheduled-a-save-against" tracker.
  // Local to this composable instance (not on the service) because
  // it's policy state — the question "what does THIS auto-save
  // policy consider already-handled" is the composable's concern,
  // not the persistence service's. A fresh per-board watcher syncs
  // by reading `dirtyVersionFor()` at its immediate-fire so
  // already-bumped boards don't immediately fire a save against
  // state the user hadn't touched yet during the previous app
  // session.
  const lastScheduledVersion = new Map<BoardId, number>();
  const pendingTimers = new Map<BoardId, ReturnType<typeof setTimeout>>();
  // Per-board dirtyVersion watcher stops. Reconcile against
  // `boardsSetVersion` sets up / tears down watchers as boards
  // enter / leave the workspace. Paired with the per-board timer
  // above — teardown cancels the timer BEFORE disposing the
  // watcher so a queued microtask fire can't race the dispose.
  // Audit tag O15 (autosave-watcher-timer).
  const boardWatcherStops = new Map<BoardId, () => void>();
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
      // The real service rethrows the ALREADY-PARSED structural union
      // (rethrowAsStorageError → throws the AnalysisBundleStorageError
      // POJO, not the raw ApiError), so the recogniser used here must
      // accept that shape — `parseStorageError` alone rejects it at its
      // `instanceof ApiError` gate and the pause path would never fire
      // against the real seam (the autosave-pause-unreachable defect).
      // `asStorageError` recognises both the structural union and a raw
      // ApiError, so the catch is shape-agnostic.
      const parsed = asStorageError(err);
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

    // Trailing-edge debounce: a fresh dirty bump pushes the save out to
    // now + AUTO_SAVE_DEBOUNCE_MS, cancelling any pending fire. During a
    // continuous range query (a dirty bump per authoritative packet) the
    // timer keeps resetting, so no save fires mid-stream — the float-heavy
    // bundle is projected / quantized / PUT once, ~2 s after analysis
    // settles, instead of every window throughout. The prior leading-edge
    // schedule (fire-every-2 s) was the dominant main-thread block during a
    // live query (50-157 ms each); see the worklog cited in the header.
    const existing = pendingTimers.get(boardId);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(() => fireSave(boardId, currentVersion), AUTO_SAVE_DEBOUNCE_MS);
    pendingTimers.set(boardId, timer);
  }

  function setupBoardWatcher(boardId: BoardId): void {
    // Idempotent — early-return if a watcher is already installed
    // for this id. The reconcile diff should preserve this
    // invariant, but the guard makes the function safe to call
    // unconditionally.
    if (boardWatcherStops.has(boardId)) return;
    const stop = watch(
      // Reactive source: this board's dirty counter. Vue 3's
      // reactive Map fires the per-key dep on every `set(boardId, X)`
      // — including the first set when the key was previously
      // absent — so the watcher catches the rising edge of the
      // initial markDirty after restore (or on first authoritative
      // packet for a fresh board).
      () => analysisPersistenceService.dirtyVersionFor(boardId),
      () => {
        if (!isGated()) return;
        scheduleSaveIfNeeded(boardId);
      },
      // immediate so the initial sync of `lastScheduledVersion`
      // happens on watcher setup (matching the prior global
      // watcher's behaviour of touching every board at startup).
      { immediate: true },
    );
    boardWatcherStops.set(boardId, stop);
  }

  function teardownBoardWatcher(boardId: BoardId): void {
    // Ordering: cancel the pending timer BEFORE disposing the
    // watcher. Without this ordering, a setTimeout fire that
    // raced the dispose could call into the captured boardId
    // against state that's no longer current (fireSave re-reads
    // isGated() and the autoSaveError slot, but lastScheduledVersion
    // would still get updated against a dead board id, polluting
    // the policy state if the same id is later reused). Audit
    // tag O15 (autosave-watcher-timer) — the timer and the watcher
    // are paired resources; both released here.
    const timer = pendingTimers.get(boardId);
    if (timer !== undefined) {
      clearTimeout(timer);
      pendingTimers.delete(boardId);
    }
    boardWatcherStops.get(boardId)?.();
    boardWatcherStops.delete(boardId);
    lastScheduledVersion.delete(boardId);
  }

  // Reconcile per-board watchers against the current board set.
  // Fires immediately to set up initial watchers, then on every
  // board-set change (add/remove/replace via the store's mutation
  // sites that bump `boardsSetVersion`). The diff loop is O(N) on
  // each set change but does NOT fire on per-board content
  // mutations (mutateBoard), which is the headline perf win over
  // the prior global watcher.
  const stopReconcile = watch(
    boardsSetVersion,
    () => {
      const currentIds = new Set<BoardId>();
      for (const board of store.boards) currentIds.add(board.id);

      // Tear down watchers for boards no longer in the set.
      // Snapshot keys before iterating because teardown mutates
      // the map.
      for (const boardId of [...boardWatcherStops.keys()]) {
        if (!currentIds.has(boardId)) teardownBoardWatcher(boardId);
      }
      // Set up watchers for boards new to the set.
      for (const id of currentIds) {
        if (!boardWatcherStops.has(id)) setupBoardWatcher(id);
      }
    },
    { immediate: true },
  );

  // Gate transition watcher. Separate from the per-board
  // reconcile because gate transitions are global, not per-board.
  // On gate-on, clear any board-level errors AND re-evaluate all
  // currently-watched boards for pending saves (the prior global
  // watcher provided this implicitly via its per-fire iteration).
  // On gate-off, cancel all pending timers so a save doesn't fire
  // after the user has turned auto-save off.
  const stopGateWatch = watch(
    () => isGated(),
    (gated) => {
      if (lastGateState !== null && lastGateState !== gated) {
        if (gated) {
          analysisPersistenceService.clearAllAutoSaveErrors();
          // Re-arm: cost is O(N_boards) per gate flip-on (rare
          // user action). Preserves the prior watcher's "re-arm
          // and check" behaviour on gate transition.
          for (const boardId of boardWatcherStops.keys()) {
            scheduleSaveIfNeeded(boardId);
          }
        } else {
          cancelAllTimers();
        }
      }
      lastGateState = gated;
    },
    { immediate: true },
  );

  return {
    stop: () => {
      stopReconcile();
      stopGateWatch();
      // Tear down every remaining per-board watcher (and its
      // pending timer). Snapshot keys because teardown mutates
      // the map.
      for (const boardId of [...boardWatcherStops.keys()]) {
        teardownBoardWatcher(boardId);
      }
    },
  };
}
