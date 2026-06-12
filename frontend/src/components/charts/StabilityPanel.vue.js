/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed } from 'vue';
import AnalysisChartPanel from './AnalysisChartPanel.vue';
import { useStabilityMetrics } from '../../composables/analysis/useStabilityMetrics';
import { STABILITY_EXTRACTOR_LABELS, DEFAULT_EXTRACTOR_ID } from '../../engine/analysis/stability-extractors';
import { STABILITY_METRIC_LABELS, STABILITY_METRIC_EXPLANATIONS, DEFAULT_METRIC_ID, } from '../../lib/stability-trajectory';
import { mutateBoard } from '../../store';
import { navigateTo } from '../../engine/navigator';
import { themeColor } from '../../utils/theme-color';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';
// Phase-0 projection seam: self-source from the injected AnalysisContext.
// The active index now reads the context's shared activeMainIndex
// (previously recomputed locally via store.boards.find).
const ctx = injectAnalysisContext();
const boardId = ctx.boardId;
const variationPath = ctx.variationPath;
const selectionRange = ctx.selectionRange;
// V_term constant — duplicated from the useStabilityMetrics default
// so the help text can reference the same value the composable
// computes against. If the default ever moves into a knob-registry
// entry (see `stability-surface-design-space.md`), both reads thread
// through that knob instead.
const V_TERM = 20;
// Default extractor: top1_move is the most-stable extractor in
// practice and produces non-NaN fractions earliest in the search
// trajectory — useful as a starting view that "shows something"
// even with light analysis.
const selectedExtractor = ref(DEFAULT_EXTRACTOR_ID);
// Default metric: anchored_at_v_term matches the design note's
// canonical choice (and the prior single-metric behaviour). The
// other three are experimental alternatives — see each one's
// explanation in the help icon.
const selectedMetric = ref(DEFAULT_METRIC_ID);
const extractorChoices = computed(() => Array.from(STABILITY_EXTRACTOR_LABELS, ([id, label]) => ({ id, label })));
const metricChoices = computed(() => Array.from(STABILITY_METRIC_LABELS, ([id, label]) => ({ id, label })));
// Per-extractor explanation. Surfaced via the (?) icon's native
// title tooltip — same affordance pattern as the rest of the SPA's
// inline help (see RegistryEditor / chrome panels). Reads pair the
// extractor's "what" with the metric's "how" so the user gets one
// coherent explanation per dropdown selection.
const extractorExplanations = {
    scoreLead_sign: `Sign of the position's score lead in {-1, 0, +1}. Stable iff the engine never crossed zero from V=${V_TERM} visits onward.`,
    winrate_quintile: `Winrate bucketed into 5 quintiles (0-4). Stable iff the engine's winrate stayed in the same quintile from V=${V_TERM} visits onward.`,
    search_agrees_with_policy: `Whether the search's current top-1 (most-visited move) matches the network's policy-top-1 within moveInfos. Evolves with search — at low V agrees with prior; at high V on positions where MCTS finds something better, disagrees.`,
    top1_move: `The most-visited move. Stable iff the same move stayed top-1 from V=${V_TERM} visits onward.`,
    top3_set: `The set of top-3 most-visited moves (order-insensitive). Stable iff the same triple stayed top-3 from V=${V_TERM} visits onward.`,
    top2_margin_quintile: `Margin between top-1 and top-2 visit counts, bucketed into 5 quintiles. Captures search *confidence* independent of identity — a position where top-1 just barely beats top-2 looks stable in top1_move but is operationally fragile.`,
};
const helpTitle = computed(() => {
    const ext = STABILITY_EXTRACTOR_LABELS.get(selectedExtractor.value) ?? selectedExtractor.value;
    const extExpl = extractorExplanations[selectedExtractor.value] ?? '(no explanation registered)';
    const met = STABILITY_METRIC_LABELS.get(selectedMetric.value) ?? selectedMetric.value;
    const metExpl = STABILITY_METRIC_EXPLANATIONS[selectedMetric.value] ?? '(no explanation registered)';
    return [
        `Per-turn stability over each turn's KataGo search trajectory.`,
        `Each turn's V-axis trajectory is observed via the chosen extractor; the chosen metric aggregates the trajectory into a single [0, 1] scalar per turn. Window: [V_term=${V_TERM}, V_max]. Log-V weighted throughout (rescale-invariant across deployment budgets).`,
        ``,
        `Metric: ${met}.`,
        metExpl,
        ``,
        `Extractor: ${ext}.`,
        extExpl,
    ].join('\n');
});
const metrics = useStabilityMetrics(variationPath, selectedExtractor, selectedMetric);
const series = computed(() => {
    // Per-datum object shape: ECharts honours `value: [x, y]` as the
    // chart coordinates and exposes the rest of the object to the
    // tooltip formatter via `params[i].data`. Carrying nPackets and
    // vMax alongside the fraction is what makes the diagnostic
    // tooltip (below) possible.
    const data = metrics.value.map(m => ({
        value: [m.turn, Number.isNaN(m.fraction) ? null : m.fraction], // fix the 2-element literal to ECharts' tuple shape
        nPackets: m.nPackets,
        vMin: m.vMin,
        vMax: m.vMax,
        anchorV: m.anchorV,
        nChanges: m.nChanges,
    }));
    return [{
            name: 'Stability',
            data: data, // ECharts accepts per-point {value, ...extra} objects but its data type is narrower; the extra fields ride along for the tooltip formatter (the intervening unknown is for the structural mismatch)
            color: themeColor('--accent-primary'),
        }];
});
const activeIndex = ctx.activeMainIndex;
const getActiveIndex = () => activeIndex.value;
const zoomRange = computed(() => [
    Math.max(0, selectionRange.value[0]),
    Math.max(0, selectionRange.value[1]),
]);
function handleClick(idx) {
    const nodeId = variationPath.value[idx];
    if (nodeId) {
        mutateBoard(boardId, draft => navigateTo(draft, nodeId));
    }
}
function formatXTooltip(val) {
    return `Turn ${Math.round(val)}`;
}
// Custom diagnostic tooltip — surfaces n_packets, V_min, and V_max
// so a NaN value on the chart has a self-evident reason. The
// stability fraction is NaN under four genuinely-distinct
// conditions (each gets a tailored explanation):
//
//   1. n_packets = 0           — no analysis packet ever arrived
//   2. V_max < V_term          — trajectory too short to reach the
//                                window's lower bound
//   3. V_min > V_term          — anchor at V_term is undefined
//                                (first observation already past it)
//   4. else (NaN with packets) — anchor value at V_term was null
//                                (extractor returned null there)
//
// Plus the valid-value case (5). All five render with consistent
// wording so the user can tell "no signal" from "computation
// blocked" at a glance.
//
// Colors stay on var(--text-1) (the body default per style.css and
// the SPA's canonical popover convention; matches EngineQueueTooltip).
// BaseChart's containerBackgroundColor handles the surrounding
// surface-0 background; this formatter contributes the body only.
function tooltipFormatter(params) {
    const item = params[0];
    if (!item)
        return '';
    const xVal = Array.isArray(item.value) ? item.value[0] : item.value;
    const yVal = Array.isArray(item.value) ? item.value[1] : item.value;
    const nPackets = item.data?.nPackets ?? 0;
    const vMin = item.data?.vMin ?? 0;
    const vMax = item.data?.vMax ?? 0;
    const anchorV = item.data?.anchorV ?? NaN;
    const nChanges = item.data?.nChanges ?? 0;
    let valueLine;
    let anchorNote = '';
    if (typeof yVal === 'number' && !Number.isNaN(yVal)) {
        valueLine = `<b>${yVal.toFixed(3)}</b>`;
        // Anchor-based metrics may shift anchorV forward when V_term's
        // value is UNKNOWN (anchored_at_v_term's lenient fallback) or
        // pin to V_max (anchored_at_v_max). Anchor-independent metrics
        // (longest_run, change_rate) report NaN — no note.
        if (Number.isFinite(anchorV) && anchorV !== V_TERM) {
            anchorNote = ` <span style="opacity: 0.7;">(anchored at V=${anchorV})</span>`;
        }
    }
    else if (nPackets === 0) {
        valueLine = `no analysis (engine has not reached this turn)`;
    }
    else if (vMax < V_TERM) {
        valueLine = `trajectory too short (V_max ${vMax} &lt; V_term ${V_TERM})`;
    }
    else if (vMin > V_TERM) {
        valueLine = `first packet at V=${vMin}, after V_term ${V_TERM}`;
    }
    else {
        // Metric-undefined-on-this-trajectory bucket: for anchored
        // metrics, all observations in the window were UNKNOWN; for
        // anchor-independent metrics, the same condition or the
        // window collapsed to a single point. Same wording either way.
        valueLine = `metric undefined (no usable observations in window)`;
    }
    // Always-shown diagnostic line: packet count, V range, and the
    // raw transition count inside the window. nChanges is useful
    // regardless of which metric is selected — it's the "how many
    // times the value actually changed" companion.
    const rangeLine = nPackets === 0
        ? `0 packets`
        : `${nPackets} packet${nPackets === 1 ? '' : 's'}, V ∈ [${vMin}, ${vMax}], ${nChanges} transition${nChanges === 1 ? '' : 's'}`;
    return `
    <div style="line-height: 1.4; padding: var(--space-tight);">
      <b style="font-size: var(--text-body);">Turn ${Math.round(xVal)}</b>
      <div style="margin-top: 4px;">Stability: ${valueLine}${anchorNote}</div>
      <div style="margin-top: 2px; font-size: var(--text-small);">${rangeLine}</div>
    </div>
  `;
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['select']} */ ;
/** @type {__VLS_StyleScopedClasses['select']} */ ;
/** @type {__VLS_StyleScopedClasses['help-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section" },
});
/** @type {__VLS_StyleScopedClasses['section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "header" },
});
/** @type {__VLS_StyleScopedClasses['header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "title" },
});
/** @type {__VLS_StyleScopedClasses['title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
    ...{ class: "select" },
    value: (__VLS_ctx.selectedExtractor),
    'aria-label': "Stability extractor",
});
/** @type {__VLS_StyleScopedClasses['select']} */ ;
for (const [c] of __VLS_vFor((__VLS_ctx.extractorChoices))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (c.id),
        value: (c.id),
    });
    (c.label);
    // @ts-ignore
    [selectedExtractor, extractorChoices,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
    ...{ class: "select" },
    value: (__VLS_ctx.selectedMetric),
    'aria-label': "Stability aggregation metric",
});
/** @type {__VLS_StyleScopedClasses['select']} */ ;
for (const [c] of __VLS_vFor((__VLS_ctx.metricChoices))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (c.id),
        value: (c.id),
    });
    (c.label);
    // @ts-ignore
    [selectedMetric, metricChoices,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "help-icon" },
    title: (__VLS_ctx.helpTitle),
    role: "button",
    'aria-label': "Stability metric explanation",
});
/** @type {__VLS_StyleScopedClasses['help-icon']} */ ;
const __VLS_0 = AnalysisChartPanel;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    label: "Per-Turn Stability (log-V weighted)",
    series: (__VLS_ctx.series),
    activeIndexAccessor: (__VLS_ctx.getActiveIndex),
    zoomRange: (__VLS_ctx.zoomRange),
    formatXTooltip: (__VLS_ctx.formatXTooltip),
    tooltipFormatter: (__VLS_ctx.tooltipFormatter),
    onIndexClick: (__VLS_ctx.handleClick),
}));
const __VLS_2 = __VLS_1({
    label: "Per-Turn Stability (log-V weighted)",
    series: (__VLS_ctx.series),
    activeIndexAccessor: (__VLS_ctx.getActiveIndex),
    zoomRange: (__VLS_ctx.zoomRange),
    formatXTooltip: (__VLS_ctx.formatXTooltip),
    tooltipFormatter: (__VLS_ctx.tooltipFormatter),
    onIndexClick: (__VLS_ctx.handleClick),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
// @ts-ignore
[helpTitle, series, getActiveIndex, zoomRange, formatXTooltip, tooltipFormatter, handleClick,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
