/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { BOARD_PX, BOARD_COLOR, LINE_COLOR, MARKER_INNER_RATIO } from '../../engine/constants';
import { boardGeometry, gridLines } from '../../engine/board-geometry';
const props = withDefaults(defineProps(), { showMarker: false });
// Per-instance gradient-id suffix so multiple MiniBoards on screen don't
// collide on the wood pattern / stone gradient ids.
const uid = Math.random().toString(36).substring(2, 6);
const size = computed(() => props.snapshot.size);
const geo = computed(() => boardGeometry(size.value));
const lines = computed(() => gridLines(size.value));
const stoneList = computed(() => Object.entries(props.snapshot.stones).map(([key, color]) => {
    const [bx, by] = key.split(',').map(Number);
    const { x, y } = geo.value.toSVG(bx, by);
    return { key, x, y, color };
}));
const labelList = computed(() => Object.entries(props.snapshot.markerLabels ?? {}).map(([key, label]) => {
    const [bx, by] = key.split(',').map(Number);
    const { x, y } = geo.value.toSVG(bx, by);
    return { key, x, y, label };
}));
// Last-move ring position + colour (white ring on a black stone, vice versa),
// matching the string projection.
const markerRing = computed(() => {
    const lm = props.snapshot.lastMove;
    if (!props.showMarker || !lm || lm.type !== 'place')
        return null;
    const { x, y } = geo.value.toSVG(lm.x, lm.y);
    const onBlack = props.snapshot.stones[`${lm.x},${lm.y}`] === 'B';
    return { x, y, r: geo.value.stoneR * MARKER_INNER_RATIO, stroke: onBlack ? 'white' : 'black' };
});
const __VLS_defaults = { showMarker: false };
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
    viewBox: (`0 0 ${__VLS_ctx.BOARD_PX} ${__VLS_ctx.BOARD_PX}`),
    ...{ class: "mini-board" },
    xmlns: "http://www.w3.org/2000/svg",
});
/** @type {__VLS_StyleScopedClasses['mini-board']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.defs, __VLS_intrinsics.defs)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.pattern, __VLS_intrinsics.pattern)({
    id: (`wd-${__VLS_ctx.uid}`),
    patternUnits: "userSpaceOnUse",
    width: (__VLS_ctx.BOARD_PX),
    height: (__VLS_ctx.BOARD_PX),
});
__VLS_asFunctionalElement1(__VLS_intrinsics.image)({
    href: "/textures/wood.jpg",
    width: (__VLS_ctx.BOARD_PX),
    height: (__VLS_ctx.BOARD_PX),
    preserveAspectRatio: "xMidYMid slice",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
    id: (`gb-${__VLS_ctx.uid}`),
    cx: "35%",
    cy: "30%",
    r: "50%",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
    offset: "0%",
    'stop-color': "#666",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
    offset: "100%",
    'stop-color': "#111",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
    id: (`gw-${__VLS_ctx.uid}`),
    cx: "35%",
    cy: "30%",
    r: "50%",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
    offset: "0%",
    'stop-color': "#fff",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
    offset: "100%",
    'stop-color': "#d0d0d0",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
    width: "100%",
    height: "100%",
    fill: (__VLS_ctx.BOARD_COLOR),
});
__VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
    width: "100%",
    height: "100%",
    fill: (`url(#wd-${__VLS_ctx.uid})`),
});
__VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
    stroke: (__VLS_ctx.LINE_COLOR),
    'stroke-width': "0.8",
    opacity: "0.3",
});
__VLS_asFunctionalDirective(__VLS_directives.vMemo, {})(null, { ...__VLS_directiveBindingRestFields, value: ([__VLS_ctx.size]) }, null, null);
for (const [l, i] of __VLS_vFor((__VLS_ctx.lines))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
        key: (i),
        x1: (l.x1),
        y1: (l.y1),
        x2: (l.x2),
        y2: (l.y2),
    });
    // @ts-ignore
    [BOARD_PX, BOARD_PX, BOARD_PX, BOARD_PX, BOARD_PX, BOARD_PX, uid, uid, uid, uid, BOARD_COLOR, LINE_COLOR, size, lines,];
}
for (const [stone] of __VLS_vFor((__VLS_ctx.stoneList))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        key: (stone.key),
        cx: (stone.x),
        cy: (stone.y),
        r: (__VLS_ctx.geo.stoneR),
        fill: (stone.color === 'B' ? `url(#gb-${__VLS_ctx.uid})` : `url(#gw-${__VLS_ctx.uid})`),
        stroke: (stone.color === 'B' ? '#000' : '#aaa'),
        'stroke-width': "0.5",
    });
    __VLS_asFunctionalDirective(__VLS_directives.vMemo, {})(null, { ...__VLS_directiveBindingRestFields, value: ([stone.color, stone.x, stone.y]) }, null, null);
    // @ts-ignore
    [uid, uid, stoneList, geo,];
}
if (__VLS_ctx.markerRing) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: (__VLS_ctx.markerRing.x),
        cy: (__VLS_ctx.markerRing.y),
        r: (__VLS_ctx.markerRing.r),
        fill: "none",
        stroke: (__VLS_ctx.markerRing.stroke),
        'stroke-width': "2",
        opacity: "0.8",
    });
}
for (const [lbl] of __VLS_vFor((__VLS_ctx.labelList))) {
    __VLS_asFunctionalElement(__VLS_intrinsics.template)({
        key: (lbl.key),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: (lbl.x - 7),
        y: (lbl.y - 7),
        width: "14",
        height: "14",
        fill: "rgba(255,255,255,0)",
        rx: "2",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
        x: (lbl.x),
        y: (lbl.y + 1),
        fill: "#000",
        'font-size': "28",
        'font-weight': "bold",
        'font-family': "monospace",
        'text-anchor': "middle",
        'dominant-baseline': "middle",
    });
    (lbl.label);
    // @ts-ignore
    [markerRing, markerRing, markerRing, markerRing, markerRing, labelList,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
