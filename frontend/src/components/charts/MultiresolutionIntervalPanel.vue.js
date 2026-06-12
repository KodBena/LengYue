/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed, watch } from 'vue';
import HeatmapChart from './HeatmapChart.vue';
import MiniBoard from '../board/MiniBoard.vue';
import { colorMoveToPly, useTriangularHeatmap, } from '../../composables/analysis/useTriangularHeatmap';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';
// Phase-0 projection seam: self-source from the injected AnalysisContext;
// the cell-click selection routes through the context mutator (was an
// emit the dashboard re-wired to setSelectionRange).
const ctx = injectAnalysisContext();
const boardId = ctx.boardId;
const variationPath = ctx.variationPath;
const selectionRange = ctx.selectionRange;
const expanded = ref(true);
const heatmapResults = useTriangularHeatmap(variationPath);
function handleCellClick(cell) {
    // s ≤ t holds by the proxy's Triangular() contract, so order-preserving
    // conversion suffices; both endpoints route through `colorMoveToPly` so
    // the colour-local → absolute-ply mapping is the same as the preview uses.
    const startTurn = colorMoveToPly(cell.s, cell.color);
    const endTurn = colorMoveToPly(cell.t, cell.color);
    ctx.setSelectionRange([startTurn, endTurn]);
}
// ── Fixed preview window (replaces the ECharts thumbnail tooltip) ───────────
// The heatmap emits cell-hover; we resolve the interval's start/end positions
// to BoardSnapshots and render them as MiniBoards below the chart.
//
// Cured hover-preview invariant (the same one usePreviewSnapshot single-sources
// for the single-NodeId panels): the VISIBLE state is the synchronously-written
// `hoveredCell` gate; the only async work is a fire-and-forget cache WARM that
// writes the shared snapshot cache, never the gate. The two displayed snapshots
// are DERIVED through `getSnapshotSync` over the current cell's endpoints, so a
// late warm can fill a still-hovered preview but can never resurrect a cell the
// leave already cleared. This site keeps its in-place wiring rather than the
// composable: its gate is a two-endpoint `HeatmapCell`, not a single NodeId, so
// it applies the invariant directly (as SidebarWidget's board-keyed docked pane
// does) instead of consuming the NodeId quartet. The prior shape
// (`startSnap.value = await getSnapshot(...)`) was an awaited write into the
// visible refs, guarded only by a latest-wins `hoverToken` counter; deriving
// the snapshots synchronously removes the race at the seam rather than guarding
// around it.
const { getSnapshot, getSnapshotSync } = useThumbnailCache();
const hoveredCell = ref(null);
const caption = computed(() => {
    const c = hoveredCell.value;
    if (!c)
        return '';
    const colorLabel = c.color === 'B' ? 'Black' : 'White';
    return `${colorLabel}: moves ${c.s}–${c.t} · ${c.value.toFixed(3)}`;
});
// The cell's start/end node ids, re-derived from the current gate. Pondering
// can paint a cell whose endpoint is past the live tail of the known
// variationPath; an undefined endpoint degrades to a null preview (hover UX,
// not a state-transition contract — ADR-0002).
const startNode = computed(() => {
    const c = hoveredCell.value;
    return c ? variationPath.value[colorMoveToPly(c.s, c.color)] ?? null : null;
});
const endNode = computed(() => {
    const c = hoveredCell.value;
    return c ? variationPath.value[colorMoveToPly(c.t, c.color)] ?? null : null;
});
// Snapshots DERIVED from the cache over the current endpoints — null on a miss,
// filled reactively when the warm lands (the cache is a reactive Map).
const startSnap = computed(() => startNode.value ? getSnapshotSync(startNode.value) : null);
const endSnap = computed(() => endNode.value ? getSnapshotSync(endNode.value) : null);
// Fire-and-forget warm of the shared cache for both endpoints on every gate
// change (cache-only writes; never the visible refs). No latest-wins token is
// needed: the snapshots read the CURRENT cell, so a stale warm only fills the
// cache and the computeds ignore it once the cell has moved on.
watch(hoveredCell, () => {
    if (startNode.value)
        void getSnapshot(startNode.value, boardId);
    if (endNode.value)
        void getSnapshot(endNode.value, boardId);
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section" },
});
/** @type {__VLS_StyleScopedClasses['section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.expanded = !__VLS_ctx.expanded;
            // @ts-ignore
            [expanded, expanded,];
        } },
    ...{ class: "header" },
});
/** @type {__VLS_StyleScopedClasses['header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "chevron" },
});
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
(__VLS_ctx.expanded ? '▼' : '▶');
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "content heatmap-content" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.expanded) }, null, null);
/** @type {__VLS_StyleScopedClasses['content']} */ ;
/** @type {__VLS_StyleScopedClasses['heatmap-content']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "heatmap-chart-area" },
});
/** @type {__VLS_StyleScopedClasses['heatmap-chart-area']} */ ;
const __VLS_0 = HeatmapChart;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onCellClick': {} },
    ...{ 'onCellHover': {} },
    ...{ 'onCellLeave': {} },
    data: (__VLS_ctx.heatmapResults.matrix),
    maxMoveIndex: (__VLS_ctx.heatmapResults.moveCount),
    minVal: (__VLS_ctx.heatmapResults.min),
    maxVal: (__VLS_ctx.heatmapResults.max),
    zoomRange: (__VLS_ctx.selectionRange),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onCellClick': {} },
    ...{ 'onCellHover': {} },
    ...{ 'onCellLeave': {} },
    data: (__VLS_ctx.heatmapResults.matrix),
    maxMoveIndex: (__VLS_ctx.heatmapResults.moveCount),
    minVal: (__VLS_ctx.heatmapResults.min),
    maxVal: (__VLS_ctx.heatmapResults.max),
    zoomRange: (__VLS_ctx.selectionRange),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    ...{ cellClick: {} },
    onCellClick: (__VLS_ctx.handleCellClick),
    ...{ cellHover: {} },
    onCellHover: (...[$event]) => {
        __VLS_ctx.hoveredCell = $event;
        // @ts-ignore
        [expanded, expanded, heatmapResults, heatmapResults, heatmapResults, heatmapResults, selectionRange, handleCellClick, hoveredCell,];
    },
    ...{ cellLeave: {} },
    onCellLeave: (...[$event]) => {
        __VLS_ctx.hoveredCell = null;
        // @ts-ignore
        [hoveredCell,];
    },
};
var __VLS_3;
var __VLS_4;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "heatmap-preview" },
});
/** @type {__VLS_StyleScopedClasses['heatmap-preview']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "preview-caption" },
});
/** @type {__VLS_StyleScopedClasses['preview-caption']} */ ;
(__VLS_ctx.caption || 'Hover a cell to preview its interval');
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "preview-boards" },
});
/** @type {__VLS_StyleScopedClasses['preview-boards']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "preview-board" },
});
/** @type {__VLS_StyleScopedClasses['preview-board']} */ ;
if (__VLS_ctx.startSnap) {
    const __VLS_7 = MiniBoard;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        snapshot: (__VLS_ctx.startSnap),
    }));
    const __VLS_9 = __VLS_8({
        snapshot: (__VLS_ctx.startSnap),
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "preview-board" },
});
/** @type {__VLS_StyleScopedClasses['preview-board']} */ ;
if (__VLS_ctx.endSnap) {
    const __VLS_12 = MiniBoard;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
        snapshot: (__VLS_ctx.endSnap),
    }));
    const __VLS_14 = __VLS_13({
        snapshot: (__VLS_ctx.endSnap),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
}
// @ts-ignore
[caption, startSnap, startSnap, endSnap, endSnap,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
