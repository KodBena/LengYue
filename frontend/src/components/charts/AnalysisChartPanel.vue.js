/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, onMounted, onUnmounted } from 'vue';
import BaseChart from './BaseChart.vue';
import ChartPreviewBox from './ChartPreviewBox.vue';
const props = defineProps();
const expanded = ref(true);
// Responsive preview-hide WITHOUT a container query. `container-type:
// inline-size` + `@container (max-width: …)` re-evaluated on every style flush,
// and ECharts' canvas text rendering forces a synchronous flush per redraw — so
// the CQ recompute scaled with (forced flushes × visible panels): a per-nav
// style-recalc tax with charts visible (the "container-query recompute" entry
// of the since-dissolved deferred-items ledger). A ResizeObserver fires only on ACTUAL width changes (not per
// flush); the boolean toggle is idempotent, so a resize that doesn't cross the
// threshold re-renders nothing.
// magic-literal: 379px is the crossing point where the 140px preview + a ~240px
// chart-area still leave the line traces legible (140 + 240 = 380); unchanged
// from the prior @container threshold.
const PREVIEW_HIDE_BELOW_PX = 379;
const contentEl = ref(null);
const narrow = ref(false);
let previewWidthObserver = null;
onMounted(() => {
    const el = contentEl.value;
    if (!el)
        return;
    // ResizeObserver-cached geometry (ADR-0010 imperative-escape): width is read
    // on the observer's own layout-clean callback, never synchronously on a hot
    // path. A 0 width (the v-show-collapsed state) is treated as not-narrow; the
    // observer re-fires with the real width on re-expand.
    previewWidthObserver = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0;
        narrow.value = w > 0 && w <= PREVIEW_HIDE_BELOW_PX;
    });
    previewWidthObserver.observe(el);
});
// Resource ownership at mutation sites (frontend CLAUDE.md) + ADR-0010
// imperative-escape step 4: the ResizeObserver lives outside Vue's reactivity
// graph and MUST be released, or every mounted analysis panel leaks an observer
// for the component's lifetime.
onUnmounted(() => {
    previewWidthObserver?.disconnect();
    previewWidthObserver = null;
});
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['header']} */ ;
/** @type {__VLS_StyleScopedClasses['linear-content']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-box']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-box']} */ ;
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
(__VLS_ctx.label);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "chevron" },
});
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
(__VLS_ctx.expanded ? '▼' : '▶');
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onMouseleave: (__VLS_ctx.onMouseLeave) },
    ref: "contentEl",
    ...{ class: "content linear-content" },
    ...{ class: ({ narrow: __VLS_ctx.narrow }) },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.expanded) }, null, null);
/** @type {__VLS_StyleScopedClasses['content']} */ ;
/** @type {__VLS_StyleScopedClasses['linear-content']} */ ;
/** @type {__VLS_StyleScopedClasses['narrow']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "chart-area" },
});
/** @type {__VLS_StyleScopedClasses['chart-area']} */ ;
const __VLS_0 = BaseChart;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onIndexHover': {} },
    ...{ 'onIndexClick': {} },
    series: (__VLS_ctx.series),
    active: (__VLS_ctx.expanded),
    activeIndexAccessor: (__VLS_ctx.activeIndexAccessor),
    zoomRange: (__VLS_ctx.zoomRange),
    normalize: (__VLS_ctx.normalize),
    formatXAxis: (__VLS_ctx.formatXAxis),
    formatXTooltip: (__VLS_ctx.formatXTooltip),
    tooltipFormatter: (__VLS_ctx.tooltipFormatter),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onIndexHover': {} },
    ...{ 'onIndexClick': {} },
    series: (__VLS_ctx.series),
    active: (__VLS_ctx.expanded),
    activeIndexAccessor: (__VLS_ctx.activeIndexAccessor),
    zoomRange: (__VLS_ctx.zoomRange),
    normalize: (__VLS_ctx.normalize),
    formatXAxis: (__VLS_ctx.formatXAxis),
    formatXTooltip: (__VLS_ctx.formatXTooltip),
    tooltipFormatter: (__VLS_ctx.tooltipFormatter),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    ...{ indexHover: {} },
    onIndexHover: (__VLS_ctx.onIndexHover),
    ...{ indexClick: {} },
    onIndexClick: (__VLS_ctx.onIndexClick),
};
var __VLS_3;
var __VLS_4;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "preview-box" },
    ...{ class: (__VLS_ctx.playerColor === 'B' ? 'marker-b' : __VLS_ctx.playerColor === 'W' ? 'marker-w' : '') },
});
/** @type {__VLS_StyleScopedClasses['preview-box']} */ ;
const __VLS_7 = ChartPreviewBox;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
    accessor: (__VLS_ctx.previewAccessor),
    showMarker: (__VLS_ctx.previewShowMarker),
}));
const __VLS_9 = __VLS_8({
    accessor: (__VLS_ctx.previewAccessor),
    showMarker: (__VLS_ctx.previewShowMarker),
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
// @ts-ignore
[expanded, expanded, expanded, label, onMouseLeave, narrow, series, activeIndexAccessor, zoomRange, normalize, formatXAxis, formatXTooltip, tooltipFormatter, onIndexHover, onIndexClick, playerColor, playerColor, previewAccessor, previewShowMarker,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
