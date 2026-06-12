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
import { useQueryTelemetry } from '../useQueryTelemetry';
import { __devForceActiveAnalysisTab } from '../analysis/useAnalysisTabs';
import { AUTONAV_MIN_STEP_INTERVAL_MS } from '../../lib/timing';
// magic-literal: App.vue `controlTabs` id for the Analysis pane; selecting
// it mounts AnalysisControls → AnalysisDashboard so the per-packet chart
// work the capture measures is actually rendering.
const MAIN_TAB_ANALYSIS = 'analysis';
// magic-literal: defaults.ts `analysisTabs[0].id` — the "Basic" sub-tab
// (ScoreLead + MergedDelta panels). Pinning it fixes the rendered panel set
// so captures are comparable. The default `subTab` for a normalized run;
// a scenario that measures a different panel set (e.g. the Stability sub-tab,
// where `StabilityPanel`'s `useStabilityMetrics` runs) passes its own id.
const ANALYSIS_SUBTAB_BASIC = 'basic';
// Query kinds that represent analysis load on a board. `probe` (version /
// models metadata) and `match` (off-store engine-vs-engine self-play) are
// excluded — they are not the per-board analysis work the regime-A /
// regime-B split is about.
const ANALYSIS_QUERY_KINDS = ['analyze', 'ponder', 'range'];
/**
 * Pure summary of the in-flight analysis queue relative to a given board.
 * Extracted as a pure unit (no reactivity) so it is unit-testable.
 */
export function summarizeAnalysisQueue(inFlight, currentBoardId) {
    const analysis = inFlight.filter((q) => q.boardId !== null && ANALYSIS_QUERY_KINDS.includes(q.kind));
    return {
        queryOnCurrentBoard: analysis.some((q) => q.boardId === currentBoardId),
        queryOnOtherBoard: analysis.some((q) => q.boardId !== currentBoardId),
        activeQueryCount: analysis.length,
        queryKinds: [...new Set(analysis.map((q) => q.kind))].sort(),
    };
}
/**
 * Drive `useNavigation().next()` at ~60 Hz to the active line's leaf.
 * Returns immediately with a handle; the walk runs on the rAF loop and
 * resolves `handle.done` at the leaf. Call with no active board and the
 * walk resolves immediately (after a warn) — the caller decides whether
 * that is a precondition violation.
 */
export function runAutonav(opts = {}) {
    const prefix = opts.markPrefix ?? 'autonav';
    const normalizeTab = opts.normalizeTab ?? true;
    const subTab = opts.subTab ?? ANALYSIS_SUBTAB_BASIC;
    const nav = useNavigation();
    const telemetry = useQueryTelemetry();
    let running = true;
    let rafHandle = null;
    let step = 0;
    let acc = 0;
    let prevTs = null;
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });
    function atLastNode() {
        const b = activeBoard.value;
        if (!b)
            return true;
        const node = b.nodes[b.currentNodeId];
        return !node || node.children.length === 0;
    }
    function finish() {
        if (!running)
            return;
        running = false;
        if (rafHandle !== null) {
            cancelAnimationFrame(rafHandle);
            rafHandle = null;
        }
        performance.mark(`${prefix}:end`, { detail: { steps: step } });
        // Release the forced sub-tab so the dashboard returns to normal
        // user-driven selection. Resource owned by this run — released here at
        // the mutation site (resource-ownership-at-mutation-sites discipline).
        if (normalizeTab)
            __devForceActiveAnalysisTab(null);
        resolveDone();
    }
    function frame(ts) {
        if (!running)
            return;
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
                },
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
        return { done, cancel: () => { } };
    }
    if (normalizeTab) {
        // Normalize the capture scenario for replicability: Analysis tab +
        // the chosen sub-tab (default Basic), so every capture renders the
        // same panel set.
        store.session.ui.activeTab = MAIN_TAB_ANALYSIS;
        __devForceActiveAnalysisTab(subTab);
    }
    performance.mark(`${prefix}:start`, { detail: { boardId: b.id } });
    rafHandle = requestAnimationFrame(frame);
    return { done, cancel: finish };
}
