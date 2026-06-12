/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/board/BoardHeatmapOverlay.vue
 * Stateless per-intersection heatmap overlay.
 *
 * Renders one tinted shape (disc or square) at each cell described by
 * `cells`, using `colorMap` to convert each cell's scalar value into a
 * fill colour and opacity. Geometry mirrors BoardDisplay so the overlay
 * lays exactly on top of the underlying board grid.
 *
 * Domain-agnostic. The component knows nothing about ownership, policy,
 * or any other metric — it accepts decoded cells and a parameter-shaped
 * styling contract. The call site (BoardWidget) composes the source
 * packet, the decoder, and the colour map. When extension-driven
 * overlays land, the call site becomes a registry walk; this component
 * is unchanged.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { BOARD_PX, LABEL_BAND, TOTAL_PX } from '../../engine/constants';
const props = withDefaults(defineProps(), {
    shape: 'disc',
    scale: 0.4,
});
// ── Geometry (mirrors BoardDisplay) ───────────────────────────────────────────
const pad = computed(() => BOARD_PX / (props.size + 1));
const cell = computed(() => (BOARD_PX - 2 * pad.value) / (props.size - 1));
const half = computed(() => cell.value * props.scale);
function cx(x) { return pad.value + x * cell.value; }
function cy(y) { return pad.value + (props.size - 1 - y) * cell.value; }
const renderedCells = computed(() => props.cells.map(c => {
    const style = props.colorMap(c.value);
    return {
        key: `${c.x},${c.y}`,
        cx: cx(c.x),
        cy: cy(c.y),
        fill: style.fill,
        opacity: style.opacity,
    };
}));
const __VLS_defaults = {
    shape: 'disc',
    scale: 0.4,
};
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    viewBox: (`0 0 ${__VLS_ctx.TOTAL_PX} ${__VLS_ctx.TOTAL_PX}`),
    ...{ class: "heatmap-overlay" },
    'aria-hidden': "true",
});
/** @type {__VLS_StyleScopedClasses['heatmap-overlay']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
    transform: (`translate(${__VLS_ctx.LABEL_BAND}, ${__VLS_ctx.LABEL_BAND})`),
});
for (const [cell] of __VLS_vFor((__VLS_ctx.renderedCells))) {
    __VLS_asFunctionalElement(__VLS_intrinsics.template)({
        key: (cell.key),
    });
    if (__VLS_ctx.shape === 'square') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: (cell.cx - __VLS_ctx.half),
            y: (cell.cy - __VLS_ctx.half),
            width: (__VLS_ctx.half * 2),
            height: (__VLS_ctx.half * 2),
            fill: (cell.fill),
            opacity: (cell.opacity),
        });
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            cx: (cell.cx),
            cy: (cell.cy),
            r: (__VLS_ctx.half),
            fill: (cell.fill),
            opacity: (cell.opacity),
        });
    }
    // @ts-ignore
    [TOTAL_PX, TOTAL_PX, LABEL_BAND, LABEL_BAND, renderedCells, shape, half, half, half, half, half,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
