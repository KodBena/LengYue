/**
 * src/composables/useAutoNavigatePerf.ts
 *
 * Dev-only auto-navigation harness for performance capture. On start it
 * normalizes the capture scenario (Analysis tab / Basic sub-tab), then
 * drives `useNavigation().next()` once per ~16.7 ms frame (≈ the 60 Hz
 * cadence the manual `xset r rate 195 62` hold-key protocol produced after
 * the dispatcher's rAF coalescing) until the active line's last node.
 *
 * Each step emits a `performance.mark('autonav:step', { detail })` whose
 * detail records whether an analysis query is in flight on the current
 * board, on another board, or nowhere — so a captured Firefox profile can
 * be sliced into the regime-A / regime-B / analysis-on-another-board cases
 * after the fact (the `step` index is the keydown-index analog the
 * normalization protocol clips fixed windows on). `autonav:start` /
 * `autonav:end` bracket the run.
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
import { store, activeBoard } from '../store';
import { useNavigation } from './useNavigation';
import { useQueryTelemetry, type QueryKind, type InFlightQuery } from './useQueryTelemetry';
import { __devForceActiveAnalysisTab } from './analysis/useAnalysisTabs';
import type { BoardId } from '../types';

// magic-literal: App.vue `controlTabs` id for the Analysis pane; selecting
// it mounts AnalysisControls → AnalysisDashboard so the per-packet chart
// work the capture measures is actually rendering.
const MAIN_TAB_ANALYSIS = 'analysis';
// magic-literal: defaults.ts `analysisTabs[0].id` — the "Basic" sub-tab
// (ScoreLead + MergedDelta panels). Pinning it fixes the rendered panel set
// so regime-A and regime-B captures are comparable.
const ANALYSIS_SUBTAB_BASIC = 'basic';

// magic-literal: target navigation cadence. The manual protocol under
// `xset r rate 195 62` produced ~58–60 effective navigations/sec (one per
// frame after the dispatcher's rAF coalescing). 60 Hz pins the auto-driven
// rate independent of the monitor's refresh rate (a 120/144 Hz panel would
// otherwise over-drive). See docs/notes/perf-capture-normalization-protocol.md.
const TARGET_NAV_HZ = 60;
const MIN_STEP_INTERVAL_MS = 1000 / TARGET_NAV_HZ;

// Query kinds that represent analysis load on a board. `probe` (version /
// models metadata) and `match` (off-store engine-vs-engine self-play) are
// excluded — they are not the per-board analysis work the regime-A / regime-B
// split is about.
const ANALYSIS_QUERY_KINDS: readonly QueryKind[] = ['analyze', 'ponder', 'range'];

/**
 * Detail payload attached to each `autonav:step` performance mark. Lets a
 * captured profile be partitioned by analysis state without separate capture
 * sessions.
 */
export interface AutoNavMarkerDetail {
  /** Monotonic step index from 0; the keydown-index analog the
   *  perf-capture-normalization protocol clips fixed windows on. */
  readonly step: number;
  readonly currentBoardId: BoardId;
  /** An analysis query (analyze / ponder / range) is in flight on the board
   *  being navigated — the "active query on the board" (regime-B) case. */
  readonly queryOnCurrentBoard: boolean;
  /** An analysis query is in flight on some OTHER board — the
   *  "analysis happens on another board" case the harness distinguishes. */
  readonly queryOnOtherBoard: boolean;
  /** Count of in-flight board-scoped analysis queries, across all boards. */
  readonly activeQueryCount: number;
  /** Distinct kinds among the in-flight analysis queries, sorted. */
  readonly queryKinds: QueryKind[];
}

/**
 * Pure summary of the in-flight analysis queue relative to a given board.
 * Extracted as a pure unit (no reactivity) so it is unit-testable.
 */
export function summarizeAnalysisQueue(
  inFlight: readonly InFlightQuery[],
  currentBoardId: BoardId,
): Omit<AutoNavMarkerDetail, 'step' | 'currentBoardId'> {
  const analysis = inFlight.filter(
    (q) => q.boardId !== null && ANALYSIS_QUERY_KINDS.includes(q.kind),
  );
  return {
    queryOnCurrentBoard: analysis.some((q) => q.boardId === currentBoardId),
    queryOnOtherBoard: analysis.some((q) => q.boardId !== currentBoardId),
    activeQueryCount: analysis.length,
    queryKinds: [...new Set(analysis.map((q) => q.kind))].sort(),
  };
}

export function useAutoNavigatePerf() {
  const nav = useNavigation();
  const telemetry = useQueryTelemetry();

  const isRunning = ref(false);
  let rafHandle: number | null = null;
  let step = 0;
  let acc = 0;
  let prevTs: number | null = null;

  function atLastNode(): boolean {
    const b = activeBoard.value;
    if (!b) return true;
    const node = b.nodes[b.currentNodeId];
    return !node || node.children.length === 0;
  }

  function frame(ts: number): void {
    if (!isRunning.value) return;
    const b = activeBoard.value;
    if (!b) {
      // Active board vanished mid-run (closed / workspace reset). Stop
      // loudly rather than silently spinning on nothing (ADR-0002).
      console.warn('[autonav] active board disappeared mid-run; stopping.');
      stop();
      return;
    }

    // Fixed-timestep accumulator: pin to ~60 steps/sec regardless of the
    // display refresh rate, and cap the accumulator so a janky frame does
    // not burst-navigate to "catch up" — we emulate steady key-repeat, not a
    // backlog flush.
    acc += prevTs === null ? MIN_STEP_INTERVAL_MS : ts - prevTs;
    prevTs = ts;

    if (acc >= MIN_STEP_INTERVAL_MS) {
      acc = Math.min(acc - MIN_STEP_INTERVAL_MS, MIN_STEP_INTERVAL_MS);
      if (atLastNode()) {
        stop();
        return;
      }
      performance.mark('autonav:step', {
        detail: {
          step,
          currentBoardId: b.id,
          ...summarizeAnalysisQueue(telemetry.inFlight.value, b.id),
        } satisfies AutoNavMarkerDetail,
      });
      nav.next();
      step += 1;
    }

    rafHandle = requestAnimationFrame(frame);
  }

  function start(): void {
    if (isRunning.value) return;
    const b = activeBoard.value;
    if (!b) {
      console.warn('[autonav] no active board to navigate.');
      return;
    }

    // Normalize the capture scenario for replicability: Analysis tab + Basic
    // sub-tab, so every capture renders the same panel set (ScoreLead +
    // MergedDelta) — the per-packet chart work is the dominant regime-B cost
    // (docs/notes/perf-audit-range-query-nav-2026-05-29.md).
    store.session.ui.activeTab = MAIN_TAB_ANALYSIS;
    __devForceActiveAnalysisTab(ANALYSIS_SUBTAB_BASIC);

    step = 0;
    acc = 0;
    prevTs = null;
    isRunning.value = true;
    performance.mark('autonav:start', { detail: { boardId: b.id } });
    rafHandle = requestAnimationFrame(frame);
  }

  function stop(): void {
    if (!isRunning.value) return;
    isRunning.value = false;
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    performance.mark('autonav:end', { detail: { steps: step } });
    // Release the forced sub-tab so the dashboard returns to normal
    // user-driven selection. Resource owned by this run — released at the
    // mutation site (resource-ownership-at-mutation-sites discipline).
    __devForceActiveAnalysisTab(null);
  }

  function toggle(): void {
    if (isRunning.value) stop();
    else start();
  }

  // The rAF loop and the forced-tab override outlive Vue's reactivity graph;
  // release both if the host component unmounts mid-run.
  onUnmounted(() => {
    if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    if (isRunning.value) __devForceActiveAnalysisTab(null);
  });

  return { isRunning: readonly(isRunning), start, stop, toggle };
}
