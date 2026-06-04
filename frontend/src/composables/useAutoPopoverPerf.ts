/**
 * src/composables/useAutoPopoverPerf.ts
 *
 * Dev-only popover-stress harness for performance capture — the autonav
 * analog for toolbar popovers. Instead of physically hovering a popover
 * open/closed while a range query streams, this drives a target popover's
 * `open` state (via the DEV hook in useHoverPopover) on a fixed cadence,
 * emitting markers so a captured Firefox profile can be sliced by toggle.
 *
 * Each open emits `performance.mark('popover:open', { detail })` whose detail
 * records the cycle index, the target popover, and the live analysis-queue
 * state (so opens can be partitioned into "while a query streams" vs idle —
 * the comparison the popover-sluggishness claim needs). `popover:close`
 * bookends each cycle; `popover:stress-start` / `popover:stress-end` bracket
 * the run.
 *
 * Post-hoc (profiler-cli): count component re-renders between each
 * open/close pair (does Toolbar / the popover re-render per toggle?), read
 * the per-toggle frame cost of the open frame, and group by the detail's
 * queue fields. Counts cross-run, within-run wall-clock relative — same
 * discipline as the nav harness.
 *
 * Gated to dev builds at the call site (the Toolbar button's
 * `v-if="isDevBuild"`); makes no perf *claim* (ADR-0009) — it is the capture
 * harness. See docs/notes/perf-capture-normalization-protocol.md.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref, readonly, onUnmounted } from 'vue';
import { activeBoard } from '../store';
import { useQueryTelemetry } from './useQueryTelemetry';
import { summarizeAnalysisQueue } from './useAutoNavigatePerf';
import { __devForcePopoverOpen } from './chrome/useHoverPopover';
import { POPOVER_STRESS_HALF_PERIOD_MS } from '../lib/timing';

export function useAutoPopoverPerf() {
  const telemetry = useQueryTelemetry();

  const isRunning = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let targetId = '';
  let openPhase = false;
  let cycle = 0;

  function tick(): void {
    if (!isRunning.value) return;
    openPhase = !openPhase;
    if (openPhase) {
      const b = activeBoard.value;
      performance.mark('popover:open', {
        detail: {
          cycle,
          target: targetId,
          ...(b
            ? summarizeAnalysisQueue(telemetry.inFlight.value, b.id)
            : { activeQueryCount: 0 }),
        },
      });
      __devForcePopoverOpen(targetId);
    } else {
      performance.mark('popover:close', { detail: { cycle } });
      __devForcePopoverOpen(null);
      cycle += 1;
    }
    timer = setTimeout(tick, POPOVER_STRESS_HALF_PERIOD_MS);
  }

  function start(id: string): void {
    if (isRunning.value) return;
    targetId = id;
    openPhase = false;
    cycle = 0;
    isRunning.value = true;
    performance.mark('popover:stress-start', { detail: { target: id } });
    timer = setTimeout(tick, POPOVER_STRESS_HALF_PERIOD_MS);
  }

  function stop(): void {
    if (!isRunning.value) return;
    isRunning.value = false;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    // Release the forced-open popover so it returns to hover control.
    __devForcePopoverOpen(null);
    performance.mark('popover:stress-end', { detail: { cycles: cycle } });
  }

  function toggle(id: string): void {
    if (isRunning.value) stop();
    else start(id);
  }

  // The timer + the forced-open override outlive Vue's reactivity graph;
  // release both if the host component unmounts mid-run.
  onUnmounted(() => {
    if (timer !== null) clearTimeout(timer);
    if (isRunning.value) __devForcePopoverOpen(null);
  });

  return { isRunning: readonly(isRunning), start, stop, toggle };
}
