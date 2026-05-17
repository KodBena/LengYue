/**
 * src/composables/useFOptimizer.ts
 *
 * Drive an F-optimizer run and persist its result. Wraps the pure
 * `findBestFWithRetry` algorithm (`engine/katago/optimize-f.ts`) with
 * a `LiveOptimizerEngine` (`engine/katago/optimize-f-live-engine.ts`)
 * and the `services/optimize-f-cache.ts` cache. Surfaces reactive
 * state so the UI can render progress, results, and cache contents.
 *
 * The composable owns the connection lifecycle: it constructs a fresh
 * `LiveOptimizerEngine` per `run()` call and disposes it on completion
 * (or on abort / unmount). This keeps the optimizer's WebSocket
 * isolated from the main analysis pipeline's connection and lets the
 * proxy's `clear_cache` actions during the run not bleed into other
 * activity.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, computed, readonly, onUnmounted, type Ref } from 'vue';
import { findBestFWithRetry, type OptimizeResult } from '../engine/katago/optimize-f';
import { LiveOptimizerEngine } from '../engine/katago/optimize-f-live-engine';
import {
  setEntry,
  removeEntry,
  clearAll,
  getEntry,
  cadenceBucketMs,
  recommendedCadenceS,
  entries as cacheEntries,
  type FOptimizerCacheEntry,
} from '../services/optimize-f-cache';
import { store } from '../store';

export type OptimizerStatus =
  | { kind: 'idle' }
  | { kind: 'running'; startedAt: number; model: string; cadenceS: number }
  | { kind: 'done'; result: OptimizeResult; finishedAt: number }
  | { kind: 'aborted'; finishedAt: number }
  | { kind: 'error'; message: string; finishedAt: number };

export interface UseFOptimizer {
  /** Reactive optimizer state machine. */
  readonly status: Ref<OptimizerStatus>;
  /** Append-only log of progress messages from the algorithm. */
  readonly progress: Ref<readonly string[]>;
  /** Whether a run is currently in flight. */
  readonly isRunning: Ref<boolean>;
  /** Reactive cache map view (forwarded from the service). */
  readonly cachedEntries: typeof cacheEntries;
  /** Look up an entry without subscribing to changes. */
  lookup(model: string, cadenceS: number): FOptimizerCacheEntry | null;
  /** Start a run for `(model, cadenceS)`. Resolves when done / aborted / errored. */
  run(model: string, cadenceS: number): Promise<OptimizerStatus>;
  /** Signal the currently-running run to abort at the next opportunity. */
  abort(): void;
  /** Remove the cached entry for the given (model, cadenceS) bucket. */
  forget(model: string, cadenceS: number): void;
  /** Wipe the entire cache. */
  forgetAll(): void;
  /**
   * Recommend a cadence for this model derived from cache history.
   * `null` when the model has no useful entries yet — the caller falls
   * back to the user's current slider value.
   */
  recommendedCadence(model: string | null): number | null;
  /**
   * Set the user's cadence slider to the given value. Convenience for
   * UI "apply recommendation" buttons; the wire reads the slider
   * directly so this is the single mutation that takes effect on the
   * next analyze.
   */
  applyCadence(cadenceS: number): void;
}

export function useFOptimizer(): UseFOptimizer {
  const status = ref<OptimizerStatus>({ kind: 'idle' });
  const progress = ref<readonly string[]>([]);
  const isRunning = computed(() => status.value.kind === 'running');

  // Mutable handles owned by an in-flight run. Cleared back to null on
  // resolution so abort/unmount are safe at any point.
  let liveEngine: LiveOptimizerEngine | null = null;
  let aborted = false;

  function pushProgress(msg: string): void {
    // O(1) by reassigning a new array reference — keeps the reactive
    // diff cheap even as the log grows. We cap at 500 lines so a long
    // run can't unbounded-grow the array.
    const next = progress.value.slice();
    next.push(msg);
    if (next.length > 500) next.shift();
    progress.value = next;
  }

  async function run(
    model: string,
    cadenceS: number,
  ): Promise<OptimizerStatus> {
    if (isRunning.value) {
      throw new Error(
        'useFOptimizer.run: another run is already in flight; call abort() first',
      );
    }
    status.value = {
      kind: 'running',
      startedAt: Date.now(),
      model,
      cadenceS,
    };
    progress.value = [];
    aborted = false;

    // Resolve the WS URL from the same source the main AnalysisService
    // uses: profile.settings.engine.katago.url, with the env-var default
    // as fallback. We don't want to import analysisService directly to
    // avoid coupling the composable to that singleton's lifecycle.
    const settings = store.profile.settings.engine as {
      katago?: { url?: string };
    };
    const wsUrl =
      settings?.katago?.url ||
      (import.meta.env.VITE_KATAGO_WS_URL as string | undefined) ||
      'ws://127.0.0.1:41948';

    try {
      liveEngine = new LiveOptimizerEngine(wsUrl);
      const result = await findBestFWithRetry(liveEngine, model, cadenceS, {
        onProgress: pushProgress,
      });

      if (aborted) {
        status.value = { kind: 'aborted', finishedAt: Date.now() };
        return status.value;
      }

      if (result.bestFS !== null) {
        const entry: FOptimizerCacheEntry = {
          model,
          cadenceBucketMs: cadenceBucketMs(cadenceS),
          fS: result.bestFS,
          expectedDtMs: result.expectedDtMs ?? Number.NaN,
          savingsMs: result.savingsMs ?? Number.NaN,
          controlDtMs: result.controlDtMs ?? Number.NaN,
          bracketLowS: result.bracketS?.[0] ?? null,
          bracketHighS: result.bracketS?.[1] ?? null,
          queriesTotal: result.queriesTotal,
          recordedAt: Date.now(),
          wsUrl,
          kataGoVersion: store.engine.info.version,
        };
        setEntry(entry);
      }

      status.value = { kind: 'done', result, finishedAt: Date.now() };
      return status.value;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      status.value = { kind: 'error', message, finishedAt: Date.now() };
      return status.value;
    } finally {
      liveEngine?.dispose();
      liveEngine = null;
    }
  }

  function abort(): void {
    if (!isRunning.value) return;
    aborted = true;
    // Disposing the engine causes any in-flight measure() to resolve
    // via its timeout, which the algorithm's next iteration sees as a
    // tardy classification — the search winds down deterministically.
    liveEngine?.dispose();
    liveEngine = null;
  }

  // On unmount: abort any in-flight run and release the WS connection.
  // The status transitions to 'aborted' on the next algorithm yield.
  onUnmounted(() => {
    if (isRunning.value) abort();
  });

  function forget(model: string, cadenceS: number): void {
    removeEntry(model, cadenceS);
  }

  function forgetAll(): void {
    clearAll();
  }

  function applyCadence(cadenceS: number): void {
    // The knob substrate normally mediates this leaf, but a direct
    // store assignment is the load-bearing single-source-of-truth
    // update; the registry editor's slider reads the same value and
    // will reflect the change immediately on next render. No claim
    // contention because this is a user-initiated explicit write.
    store.profile.settings.engine.katago.reportDuringSearchEvery = cadenceS;
  }

  return {
    status,
    progress: readonly(progress) as Ref<readonly string[]>,
    isRunning,
    cachedEntries: cacheEntries,
    lookup: getEntry,
    run,
    abort,
    forget,
    forgetAll,
    recommendedCadence: recommendedCadenceS,
    applyCadence,
  };
}
