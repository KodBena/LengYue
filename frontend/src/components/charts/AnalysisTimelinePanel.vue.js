/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref } from 'vue';
import HorizontalTimelineVisualizer from '../tree/HorizontalTimelineVisualizer.vue';
import { store } from '../../store';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';
import { useThrottledSnapshot } from '../../composables/useThrottledSnapshot';
import { ANALYSIS_TIMELINE_REDRAW_THROTTLE_MS } from '../../lib/timing';
// Phase-0 projection seam: self-source from the injected AnalysisContext.
// The range-select and analyse actions call the context's mutators
// directly (was: emits the dashboard re-wired to the same mutators).
const ctx = injectAnalysisContext();
const visitVector = ctx.visitVector;
const selectionRange = ctx.selectionRange;
const engineConnected = ctx.engineConnected;
// Throttled rug-plot data. `visitVector` (the per-turn visit counts) is
// rebuilt every analysis packet; snapshot it to ~4 Hz (the subscriber-
// projection family cadence) so the visualiser redraws at that rate, not the
// packet rate. The template binds the snapshot; selectionRange (user drag)
// stays prompt on its own binding.
const displayedVisitVector = useThrottledSnapshot(visitVector, ANALYSIS_TIMELINE_REDRAW_THROTTLE_MS);
const visits = ref(200);
// The visits-input cap follows the user's configured ponder ceiling
// (engine.katago.ponderMaxVisits); the one-shot range analyze and
// ponder share the same intuition of "deepest analyze the user wants
// to permit." Registry-tunable; default 2,000,000.
const visitsMax = computed(() => store.profile.settings.engine.katago.ponderMaxVisits);
const selectionNodeCount = computed(() => Math.max(0, Math.round(selectionRange.value[1] - selectionRange.value[0])));
// Boundary brand-cast: HorizontalTimelineVisualizer is band-1
// (domain-agnostic — works on any numeric vector), so its model-value
// is `[number, number]`. Here the data-vector is the visit-vector
// derived from the active variation path, so the visualizer's range
// values are bounded to `[0, path.length - 1]` — i.e. valid PlyIndices
// by construction. One cast at the band-1 → branded boundary; consumers
// above (the store, useAnalysisTimeline) see the brand.
function onRangeUpdate(r) {
    ctx.setSelectionRange(r); // PlyIndex brand mint at the Band-1 → branded boundary (range bounded to the path, see comment above)
}
function onAnalyze() {
    ctx.analyzeSelection(visits.value);
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['visits-input']} */ ;
/** @type {__VLS_StyleScopedClasses['analyze-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section" },
});
/** @type {__VLS_StyleScopedClasses['section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "timeline-header" },
});
/** @type {__VLS_StyleScopedClasses['timeline-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "timeline-title" },
});
/** @type {__VLS_StyleScopedClasses['timeline-title']} */ ;
(__VLS_ctx.$t('analysisTimeline.title'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "timeline-info" },
});
/** @type {__VLS_StyleScopedClasses['timeline-info']} */ ;
(__VLS_ctx.$t('analysisTimeline.nodesSelected', __VLS_ctx.selectionNodeCount));
(__VLS_ctx.$t('analysisTimeline.turnsRange', { from: Math.round(__VLS_ctx.selectionRange[0]), to: Math.round(__VLS_ctx.selectionRange[1]) }));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "timeline-body" },
});
/** @type {__VLS_StyleScopedClasses['timeline-body']} */ ;
const __VLS_0 = HorizontalTimelineVisualizer;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    dataVector: (__VLS_ctx.displayedVisitVector),
    modelValue: (__VLS_ctx.selectionRange),
    colorMode: "quantile",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onUpdate:modelValue': {} },
    dataVector: (__VLS_ctx.displayedVisitVector),
    modelValue: (__VLS_ctx.selectionRange),
    colorMode: "quantile",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    ...{ 'update:modelValue': {} },
    'onUpdate:modelValue': (__VLS_ctx.onRangeUpdate),
};
var __VLS_3;
var __VLS_4;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "timeline-controls" },
});
/** @type {__VLS_StyleScopedClasses['timeline-controls']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "visits-label" },
});
/** @type {__VLS_StyleScopedClasses['visits-label']} */ ;
(__VLS_ctx.$t('analysisTimeline.visits'));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "number",
    min: "1",
    max: (__VLS_ctx.visitsMax),
    ...{ class: "visits-input" },
});
(__VLS_ctx.visits);
/** @type {__VLS_StyleScopedClasses['visits-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.onAnalyze) },
    ...{ class: "analyze-btn" },
    disabled: (!__VLS_ctx.engineConnected || __VLS_ctx.selectionNodeCount === 0),
});
/** @type {__VLS_StyleScopedClasses['analyze-btn']} */ ;
(__VLS_ctx.$t('analysisTimeline.analyseSelection', { n: __VLS_ctx.selectionNodeCount }));
// @ts-ignore
[$t, $t, $t, $t, $t, selectionNodeCount, selectionNodeCount, selectionNodeCount, selectionRange, selectionRange, selectionRange, displayedVisitVector, onRangeUpdate, visitsMax, visits, onAnalyze, engineConnected,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
