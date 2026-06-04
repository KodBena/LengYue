/**
 * src/composables/perf/autonav.ts
 *
 * SSOT for the auto-navigation capture loop: a fixed-timestep
 * `requestAnimationFrame` walk that drives `useNavigation().next()` to
 * the active line's leaf, emitting per-step performance marks. Two
 * consumers share this core:
 *
 *   - `useAutoNavigatePerf` — the dev-toolbar toggle harness (start /
 *     stop / isRunning), unchanged in public shape.
 *   - the performance-scenario context (`composables/perf/`), whose
 *     `ctx.autonav()` is the awaitable measured pass.
 *
 * The loop YIELDS between frames (one nav step per ~16.7 ms frame), so
 * the single-threaded event loop drains WS analysis packets between
 * steps — which is exactly the regime-B interleaving (UI navigation
 * concurrent with a streaming range analysis) the perf arc cares about.
 * A synchronous nav loop would serialize and never reproduce it.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2) — it reads the active
 * board's node/children structure (`atLastNode`) and drives game-tree
 * navigation, like the harness it generalizes. No Go *rules*, though.
 *
 * Makes no perf *claim* (ADR-0009) — it is the capture harness, not a
 * measured result. See docs/notes/perf-capture-normalization-protocol.md.
 *
 * License: Public Domain (The Unlicense)
 */
import { activeBoard, store } from '../../store';
import { useNavigation } from '../useNavigation';
import { useQueryTelemetry, type QueryKind, type InFlightQuery } from '../useQueryTelemetry';
import { __devForceActiveAnalysisTab } from '../analysis/useAnalysisTabs';
import type { BoardId } from '../../types';
import { AUTONAV_MIN_STEP_INTERVAL_MS } from '../../lib/timing';

// magic-literal: App.vue `controlTabs` id for the Analysis pane; selecting
// it mounts AnalysisControls → AnalysisDashboard so the per-packet chart
// work the capture measures is actually rendering.
const MAIN_TAB_ANALYSIS = 'analysis';
// magic-literal: defaults.ts `analysisTabs[0].id` — the "Basic" sub-tab
// (ScoreLead + MergedDelta panels). Pinning it fixes the rendered panel set
// so captures are comparable.
const ANALYSIS_SUBTAB_BASIC = 'basic';


// Query kinds that represent analysis load on a board. `probe` (version /
// models metadata) and `match` (off-store engine-vs-engine self-play) are
// excluded — they are not the per-board analysis work the regime-A /
// regime-B split is about.
const ANALYSIS_QUERY_KINDS: readonly QueryKind[] = ['analyze', 'ponder', 'range'];

/**
 * Detail payload attached to each `<prefix>:step` performance mark. Lets a
 * captured profile be partitioned by analysis state without separate
 * capture sessions.
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

export interface AutonavOptions {
  /**
   * Prefix for the emitted marks: `<prefix>:start` / `<prefix>:step` /
   * `<prefix>:end`. Defaults to `'autonav'` so the toolbar harness emits
   * the historical `autonav:*` names a captured trace already recognizes.
   */
  readonly markPrefix?: string;
  /**
   * Normalize the Analysis tab + Basic sub-tab on start (released on stop)
   * for capture replicability. Defaults to true. A scenario that pins its
   * own panel set passes false and normalizes itself.
   */
  readonly normalizeTab?: boolean;
}

export interface AutonavHandle {
  /** Resolves when the walk reaches the active line's leaf, the active
   *  board vanishes mid-run, or `cancel()` is called. Never rejects. */
  readonly done: Promise<void>;
  /** Stop early. Idempotent; resolves `done`. */
  cancel(): void;
}

/**
 * Drive `useNavigation().next()` at ~60 Hz to the active line's leaf.
 * Returns immediately with a handle; the walk runs on the rAF loop and
 * resolves `handle.done` at the leaf. Call with no active board and the
 * walk resolves immediately (after a warn) — the caller decides whether
 * that is a precondition violation.
 */
export function runAutonav(opts: AutonavOptions = {}): AutonavHandle {
  const prefix = opts.markPrefix ?? 'autonav';
  const normalizeTab = opts.normalizeTab ?? true;
  const nav = useNavigation();
  const telemetry = useQueryTelemetry();

  let running = true;
  let rafHandle: number | null = null;
  let step = 0;
  let acc = 0;
  let prevTs: number | null = null;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });

  function atLastNode(): boolean {
    const b = activeBoard.value;
    if (!b) return true;
    const node = b.nodes[b.currentNodeId];
    return !node || node.children.length === 0;
  }

  function finish(): void {
    if (!running) return;
    running = false;
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    performance.mark(`${prefix}:end`, { detail: { steps: step } });
    // Release the forced sub-tab so the dashboard returns to normal
    // user-driven selection. Resource owned by this run — released here at
    // the mutation site (resource-ownership-at-mutation-sites discipline).
    if (normalizeTab) __devForceActiveAnalysisTab(null);
    resolveDone();
  }

  function frame(ts: number): void {
    if (!running) return;
    const b = activeBoard.value;
    if (!b) {
      // Active board vanished mid-run (closed / workspace reset). Stop
      // loudly rather than silently spinning on nothing (ADR-0002).
      console.warn('[autonav] active board disappeared mid-run; stopping.');
      finish();
      return;
    }

    // Fixed-timestep accumulator: pin to ~60 steps/sec regardless of the
    // display refresh rate, and cap the accumulator so a janky frame does
    // not burst-navigate to "catch up" — we emulate steady key-repeat, not
    // a backlog flush.
    acc += prevTs === null ? AUTONAV_MIN_STEP_INTERVAL_MS : ts - prevTs;
    prevTs = ts;

    if (acc >= AUTONAV_MIN_STEP_INTERVAL_MS) {
      acc = Math.min(acc - AUTONAV_MIN_STEP_INTERVAL_MS, AUTONAV_MIN_STEP_INTERVAL_MS);
      if (atLastNode()) {
        finish();
        return;
      }
      performance.mark(`${prefix}:step`, {
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

  const b = activeBoard.value;
  if (!b) {
    console.warn('[autonav] no active board to navigate.');
    running = false;
    resolveDone();
    return { done, cancel: () => {} };
  }

  if (normalizeTab) {
    // Normalize the capture scenario for replicability: Analysis tab +
    // Basic sub-tab, so every capture renders the same panel set.
    store.session.ui.activeTab = MAIN_TAB_ANALYSIS;
    __devForceActiveAnalysisTab(ANALYSIS_SUBTAB_BASIC);
  }
  performance.mark(`${prefix}:start`, { detail: { boardId: b.id } });
  rafHandle = requestAnimationFrame(frame);

  return { done, cancel: finish };
}
