/**
 * src/composables/useAutoNavigatePerf.ts
 *
 * Dev-only auto-navigation harness for performance capture: the dev-toolbar
 * toggle wrapper (start / stop / toggle / isRunning) over the shared autonav
 * loop core in `composables/perf/autonav.ts`. The core normalizes the
 * capture scenario (Analysis tab / Basic sub-tab), drives
 * `useNavigation().next()` once per ~16.7 ms frame to the active line's
 * leaf, and emits `autonav:start` / `autonav:step` / `autonav:end` marks
 * (the `step` detail carries the in-flight analysis-queue summary so a
 * profile can be sliced into regime-A / regime-B after the fact).
 *
 * The loop logic lives in the core so the performance-scenario context
 * (`composables/perf/`) can `await` the same walk as its measured pass.
 * This file holds only the toggle/`isRunning` surface the Toolbar button
 * binds to.
 *
 * Gated to dev builds at the call site (the Toolbar button's
 * `v-if="isDevBuild"`); makes no perf *claim* (ADR-0009) — it is the
 * capture harness, not a measured result. See
 * docs/notes/perf-capture-normalization-protocol.md and
 * docs/notes/perf-audit-range-query-nav-2026-05-29.md.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref, readonly, onUnmounted } from 'vue';
import { activeBoard } from '../store';
import { runAutonav, type AutonavHandle } from './perf/autonav';

// Re-exported for back-compat: `useAutoPopoverPerf` reads the queue summary
// for its own marker detail. The definition now lives in the autonav core.
export { summarizeAnalysisQueue, type AutoNavMarkerDetail } from './perf/autonav';

export function useAutoNavigatePerf() {
  const isRunning = ref(false);
  let handle: AutonavHandle | null = null;

  function start(): void {
    if (isRunning.value) return;
    if (!activeBoard.value) {
      console.warn('[autonav] no active board to navigate.');
      return;
    }
    isRunning.value = true;
    handle = runAutonav();
    void handle.done.then(() => {
      isRunning.value = false;
      handle = null;
    });
  }

  function stop(): void {
    if (!isRunning.value) return;
    handle?.cancel();
  }

  function toggle(): void {
    if (isRunning.value) stop();
    else start();
  }

  // The rAF loop and the forced-tab override outlive Vue's reactivity graph;
  // cancelling the core handle releases both if the host unmounts mid-run.
  onUnmounted(() => {
    handle?.cancel();
  });

  return { isRunning: readonly(isRunning), start, stop, toggle };
}
