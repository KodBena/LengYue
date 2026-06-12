/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { getIntensityColorLinear } from '../../engine/suggestion-colors';
import { store } from '../../store';
import { ledger } from '../../state/analysis-ledger';
import { useVariationPath } from '../../composables/board/useVariationPath';
import { activeAnalysisKeys } from '../../state/analysis-config';
import { useThrottledSnapshot } from '../../composables/useThrottledSnapshot';
import { BOARD_TAB_RUGPLOT_REDRAW_THROTTLE_MS } from '../../lib/timing';
const props = defineProps();
const emit = defineEmits();
const path = useVariationPath(() => props.state.id);
// ── Throttled rugplot source (per-node visit scan) ────────────────────
// `rugPlot` below colours a per-move depth meter from every node on the path
// — an O(path) colour-LUT walk, and the per-node ledger version refs bump on
// essentially every analysis packet, so without coalescing the whole meter
// recolours ~16/s. Split the work: `rugVisits` is the cheap,
// per-packet-reactive half (map lookups, no colour maths); a throttled
// snapshot of it — the shared subscriber-projection mechanism — drives the
// colour walk + re-render at the family ~4 Hz cadence while the meter still
// tracks ongoing analysis.
const rugVisits = computed(() => {
    const rawKey = activeAnalysisKeys.value.rawKey;
    return path.value.map(id => ledger.getRaw(rawKey, id)?.rootInfo?.visits ?? 0);
});
const displayedVisits = useThrottledSnapshot(rugVisits, BOARD_TAB_RUGPLOT_REDRAW_THROTTLE_MS);
// Per-node analysis depth, surfaced as a colour stripe per move along
// the active variation. Derived from the throttled `displayedVisits`
// snapshot above (not the live ledger), so the colour-LUT walk runs at the
// snapshot's ~4 Hz rather than per packet.
//
// Three visual decisions distinct from how the intensity gradient is
// consumed elsewhere (move suggestions, ColorDebugStrip):
//
//   • Target floor is the user-configured ponder ceiling
//     (`engine.katago.ponderMaxVisits`, default 2,000,000; tunable
//     via the registry editor and applied as `maxVisits` in
//     analysis-service's ponder mode). A deeper user-specified
//     `analyzeRange` target wins. Without the floor, the meter
//     saturates instantly on ponder when the user hasn't run a
//     range analysis, because the default `state.maxVisitsTarget`
//     is 1000. The pre-v1.0.20 shape pinned this to a hardcoded
//     100,000 constant; after the v1.0.20 surfacing the analysis
//     service goes deeper than that on ponder, so the meter
//     saturated 20× too quickly. SSOT: same setting both ends
//     consume.
//
//   • Logarithmic compression on visits → t. Linear `visits / target`
//     would put the entire 1k–10k–100k progression into the bottom
//     decile; log mapping spreads each ~10× of visits across roughly
//     equal slices of t, so the colour gradates smoothly as ponder
//     accumulates. `log1p` keeps `visits === 0 → t = 0` clean.
//
//     Distinct from the timeline-panel rug-plot's quantile mapping:
//     the rail meter answers "how deep has analysis gone on this
//     board, on an absolute scale anchored to the configured
//     ceiling?" — magnitude information is the point. The timeline-
//     panel rug-plot answers "which turns in this game got
//     relatively more attention than others?" — rank-position
//     information is the point. Different questions, different
//     mappings; the shared SSOT is the gradient LUT
//     (`getIntensityColorLinear`), the transparent-for-zero rule,
//     and the ponder-ceiling reference.
//
//   • The linear (non-ECDF) variant of the gradient is the right fit
//     here. The ECDF variant remaps `t` through the visit-ratio
//     population's CDF — calibrated for "this move's share of visits
//     at a node," not for "fraction of an absolute target." Feeding
//     log-compressed `visits / target` through the ECDF would just
//     collapse our practical range onto a narrow band of the LUT, so
//     the colour wouldn't change as ponder progressed. `getIntensity-
//     ColorLinear` walks the LUT uniformly with `alpha = 1`, giving
//     hue-only depth signalling at full visibility.
//
//   • Unanalyzed nodes (`visits === 0`) render as transparent so the
//     meter's dark background shows through. Encoding "no data" as a
//     specific gradient endpoint would lie about the absence.
const rugPlot = computed(() => {
    const visitsList = displayedVisits.value;
    if (visitsList.length === 0)
        return [];
    const ponderCeiling = store.profile.settings.engine.katago.ponderMaxVisits;
    const target = Math.max(props.state.maxVisitsTarget ?? 0, ponderCeiling);
    const targetLog = Math.log1p(target);
    return visitsList.map((visits) => {
        if (visits === 0)
            return 'transparent';
        const t = Math.min(1, Math.log1p(visits) / targetLog);
        return getIntensityColorLinear.value(t, 1);
    });
});
// ── Canvas rendering ──────────────────────────────────────────────────────
// The meter was previously one <div> per path move (v-for over rugPlot) with a
// per-slice i18n :title — so a 300-move game rebuilt ~300 vnodes + ~300 t()
// calls on *every* re-render, and reading rugPlot in the template meant every
// 4 Hz colour update re-rendered the whole tab (BoardTab was the single most
// expensive component render in the combined-stress profile, ~7.6ms/render).
//
// A canvas needs none of that: the meter is a fixed ~86×4px strip with no
// per-slice layout, scaling, or interaction (the per-slice tooltip was
// sub-pixel and unusable, so it's dropped). The draw is imperative and runs at
// the existing 4 Hz throttle, entirely off Vue's render path — so the template
// no longer reads rugPlot and the tab stops re-rendering on colour updates.
// (Same reasoning HeatmapChart uses for its canvas renderer over per-cell SVG.)
const meterRef = ref(null);
let meterW = 0; // CSS px, cached from the ResizeObserver (avoids a layout read per draw)
let meterH = 0;
let resizeObs = null;
function drawMeter() {
    const canvas = meterRef.value;
    if (!canvas || meterW === 0 || meterH === 0)
        return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(meterW * dpr));
    const bh = Math.max(1, Math.round(meterH * dpr));
    if (canvas.width !== bw)
        canvas.width = bw;
    if (canvas.height !== bh)
        canvas.height = bh;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    ctx.clearRect(0, 0, bw, bh); // transparent slices → the CSS background shows through
    const colors = rugPlot.value;
    const n = colors.length;
    if (n === 0)
        return;
    const sliceW = bw / n;
    for (let i = 0; i < n; i++) {
        if (colors[i] === 'transparent')
            continue;
        const x0 = Math.floor(i * sliceW);
        const x1 = Math.floor((i + 1) * sliceW);
        ctx.fillStyle = colors[i];
        ctx.fillRect(x0, 0, Math.max(1, x1 - x0), bh);
    }
}
onMounted(() => {
    const canvas = meterRef.value;
    if (!canvas)
        return;
    resizeObs = new ResizeObserver(() => {
        // Reads inside the RO callback are post-layout, so no forced reflow.
        meterW = canvas.clientWidth;
        meterH = canvas.clientHeight;
        drawMeter();
    });
    resizeObs.observe(canvas);
    // Seed once (the RO callback fires async).
    meterW = canvas.clientWidth;
    meterH = canvas.clientHeight;
    drawMeter();
});
// rugPlot is consumed only here (not in the template), so 4 Hz colour updates
// drive an imperative redraw, not a Vue re-render.
watch(rugPlot, drawMeter);
onUnmounted(() => {
    resizeObs?.disconnect();
    resizeObs = null;
});
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['tab-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['review-active']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['review-intermission']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['review-complete']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['close-board-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onMouseenter: (...[$event]) => {
            __VLS_ctx.emit('hover-enter', $event);
            // @ts-ignore
            [emit,];
        } },
    ...{ onMouseleave: (...[$event]) => {
            __VLS_ctx.emit('hover-leave');
            // @ts-ignore
            [emit,];
        } },
    ...{ class: "thumb-container" },
});
/** @type {__VLS_StyleScopedClasses['thumb-container']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tab-thumb" },
    ...{ class: ({
            active: __VLS_ctx.isActive,
            'review-active': __VLS_ctx.reviewState === 'ACTIVE',
            'review-intermission': __VLS_ctx.reviewState === 'INTERMISSION',
            'review-complete': __VLS_ctx.reviewState === 'COMPLETE'
        }) },
});
/** @type {__VLS_StyleScopedClasses['tab-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['review-active']} */ ;
/** @type {__VLS_StyleScopedClasses['review-intermission']} */ ;
/** @type {__VLS_StyleScopedClasses['review-complete']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "tab-label" },
});
/** @type {__VLS_StyleScopedClasses['tab-label']} */ ;
(__VLS_ctx.$t('boardTab.label', { n: __VLS_ctx.index + 1 }));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('close');
            // @ts-ignore
            [emit, isActive, reviewState, reviewState, reviewState, $t, index,];
        } },
    ...{ class: "close-board-btn" },
    title: (__VLS_ctx.$t('boardTab.close')),
});
/** @type {__VLS_StyleScopedClasses['close-board-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "indicator-row" },
});
/** @type {__VLS_StyleScopedClasses['indicator-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.canvas, __VLS_intrinsics.canvas)({
    ref: "meterRef",
    ...{ class: "analysis-meter" },
});
/** @type {__VLS_StyleScopedClasses['analysis-meter']} */ ;
// @ts-ignore
[$t,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
