/**
 * src/composables/useThrottledSnapshot.ts
 *
 * The shared rate-limiter behind the app's "subscriber-projection" redraw
 * throttles — the views that subscribe to the live engine/analysis data and
 * project it at a human-comfortable refresh cadence (the queue tooltip,
 * ToolbarEngineMetrics, BoardTab's rugplot, BaseChart, the analysis timeline,
 * DistributionChart, HeatmapChart). Each of those previously hand-rolled the
 * identical leading+trailing `setTimeout` boilerplate; this is the one
 * implementation they now share.
 *
 * Two surfaces:
 *   - `createTrailingThrottle(fn, ms)` — the pure timer primitive. The first
 *     `schedule()` after an idle period runs `fn` ~immediately (leading edge);
 *     further `schedule()`s within `ms` coalesce to one trailing fire. Not
 *     reactive — pair it with a `watch()` that calls `schedule()` and a
 *     `cancel()` in `onUnmounted`. Use this for the callback-shape consumers
 *     (BaseChart's `updateOptions`, the chart `renderChart`s, gated redraws).
 *   - `useThrottledSnapshot(source, ms)` — sugar for the common snapshot
 *     shape: returns a ref that mirrors `source` at most once per `ms`, seeded
 *     synchronously for first paint, with the trailing timer released on
 *     unmount automatically.
 *
 * INDEPENDENT TIMERS BY DESIGN: each consumer gets its own throttle instance,
 * so their fires stay phase-offset and the redraw load stays distributed. A
 * single shared timer/clock would phase-align every projection into one
 * synchronised burst per window — the cross-component analogue of an
 * O(N)-burst — which is the opposite of what coalescing is for. The shared
 * thing here is the mechanism (and, via lib/timing.ts, the default cadence),
 * not the clock.
 *
 * Domain band (ADR-0003): truly agnostic. A throttle over a reactive value;
 * no game-tree or Go vocabulary.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, watch, onUnmounted, type Ref } from 'vue';

export interface TrailingThrottle {
  /**
   * Request a run. Fires `fn` on the leading edge when idle, otherwise
   * coalesces to a single trailing fire at most one interval after the last
   * run. Idempotent while a fire is already pending.
   */
  schedule(): void;
  /** Release the pending trailing timer. Call on teardown. */
  cancel(): void;
}

/**
 * Leading+trailing throttle primitive. `lastRunAt` is seeded to "now" so the
 * first `schedule()` waits a full interval — the snapshot consumers seed their
 * value synchronously, so there is nothing to redraw promptly; callback
 * consumers do their own initial draw on mount for the same reason.
 */
export function createTrailingThrottle(fn: () => void, intervalMs: number): TrailingThrottle {
  let pendingTimer: number | null = null;
  let lastRunAt = performance.now();
  return {
    schedule(): void {
      if (pendingTimer !== null) return;
      const wait = Math.max(0, intervalMs - (performance.now() - lastRunAt));
      pendingTimer = window.setTimeout(() => {
        pendingTimer = null;
        lastRunAt = performance.now();
        fn();
      }, wait);
    },
    cancel(): void {
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    },
  };
}

/**
 * Throttled snapshot of a reactive source. Returns a ref that mirrors
 * `source.value` at most once per `intervalMs` (leading+trailing). Seeded
 * synchronously so first paint has the current value; re-snapshots on every
 * `source` change (coalesced); releases the trailing timer on unmount.
 *
 * For a derived projection (a formatted row list, a metrics object), pass a
 * `computed` that builds it — the throttle then governs how often the derived
 * value is published to the template.
 */
export function useThrottledSnapshot<T>(source: Ref<T>, intervalMs: number): Ref<T> {
  // `ref(value)` is typed `Ref<UnwrapRef<T>>`; for the value shapes used here
  // (arrays / objects of primitives) UnwrapRef<T> is T. The cast states that
  // structurally-true equivalence Vue's type can't infer generically.
  const snapshot = ref(source.value) as Ref<T>;
  const throttle = createTrailingThrottle(() => {
    snapshot.value = source.value;
  }, intervalMs);
  watch(source, throttle.schedule);
  onUnmounted(throttle.cancel);
  return snapshot;
}
