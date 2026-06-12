/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { watch } from 'vue';
import AnalysisChartPanel from './AnalysisChartPanel.vue';
import { usePreviewSnapshot } from '../../composables/cards/usePreviewSnapshot';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';
// Phase-0 projection seam: self-source the chart's view-model from the
// injected AnalysisContext rather than prop-drilled slices, so the
// dashboard no longer re-renders to feed this panel. The local names
// mirror the prior props, so the template bindings are unchanged.
const ctx = injectAnalysisContext();
const series = ctx.mainSeries;
const boardId = ctx.boardId;
const variationPath = ctx.variationPath;
const selectionRange = ctx.selectionRange;
const activeIndex = ctx.activeMainIndex;
const getActiveIndex = () => activeIndex.value;
const onIndexClick = ctx.navigation.handleMainClick;
// The cured hover-preview quartet, single-sourced in usePreviewSnapshot:
// a synchronously-written `previewNode` gate, a fire-and-forget cache warm,
// and a `getPreview` accessor over the synchronous cache read — so a late
// cache-miss resolve can fill a still-targeted thumbnail but can never
// resurrect a node the leave-time reset already cleared. The accessor is
// passed down (not the value) so the per-nav thumbnail update re-renders
// only the <ChartPreviewBox> leaf, not this panel or the chart host
// (render-coupling postmortem, 2026-05-29).
const { getPreview, showPreview, reset } = usePreviewSnapshot(boardId);
/** Reverts the preview box to the current board position */
function resetPreview() {
    if (activeIndex.value !== null) {
        const nodeId = variationPath.value[activeIndex.value];
        if (nodeId) {
            showPreview(nodeId);
            return;
        }
    }
    reset();
}
// Watch activeIndex to ensure the default view stays current
watch(activeIndex, resetPreview, { immediate: true });
function handleHover(turnIdx) {
    const nodeId = variationPath.value[turnIdx];
    if (nodeId) {
        showPreview(nodeId);
    }
}
// The Game State chart is ply-indexed (x = variationPath index,
// = absolute ply with root at 0). The default BaseChart tooltip
// header reads "Move {x}" which conflates "play number" with
// "ply"; the chart's vocabulary is ply, so the header should
// say so.
function formatPlyTooltip(val) {
    return `Ply ${val}`;
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
const __VLS_0 = AnalysisChartPanel;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    label: "Game State (Turns)",
    series: (__VLS_ctx.series),
    activeIndexAccessor: (__VLS_ctx.getActiveIndex),
    zoomRange: (__VLS_ctx.selectionRange),
    onIndexClick: (__VLS_ctx.onIndexClick),
    onIndexHover: (__VLS_ctx.handleHover),
    onMouseLeave: (__VLS_ctx.resetPreview),
    previewAccessor: (__VLS_ctx.getPreview),
    formatXTooltip: (__VLS_ctx.formatPlyTooltip),
    normalize: "per-series",
}));
const __VLS_2 = __VLS_1({
    label: "Game State (Turns)",
    series: (__VLS_ctx.series),
    activeIndexAccessor: (__VLS_ctx.getActiveIndex),
    zoomRange: (__VLS_ctx.selectionRange),
    onIndexClick: (__VLS_ctx.onIndexClick),
    onIndexHover: (__VLS_ctx.handleHover),
    onMouseLeave: (__VLS_ctx.resetPreview),
    previewAccessor: (__VLS_ctx.getPreview),
    formatXTooltip: (__VLS_ctx.formatPlyTooltip),
    normalize: "per-series",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
var __VLS_3;
// @ts-ignore
[series, getActiveIndex, selectionRange, onIndexClick, handleHover, resetPreview, getPreview, formatPlyTooltip,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
