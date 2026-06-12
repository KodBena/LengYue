/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { BOARD_COLOR, LINE_COLOR, LABEL_COLOR, LABEL_BAND, LABEL_FONT_SIZE, LABEL_INSET_RATIO, TOTAL_PX, MARKER_INNER_RATIO, ALL_X_LABELS, } from '../../engine/constants';
import { boardGeometry, gridLines } from '../../engine/board-geometry';
const props = defineProps();
const emit = defineEmits();
// Unique ID suffix to prevent gradient collisions between multiple boards/thumbnails
const uid = Math.random().toString(36).substring(2, 6);
const boardSize = computed(() => props.size ?? 19);
// Inner-board geometry from the shared SSOT (src/engine/board-geometry.ts).
// `pad` is the inset within the playable area from the area edge to the
// first grid line (one cell wide, by Go-board convention). LABEL_BAND sits
// *outside* this — the playing-area group is translated by (LABEL_BAND,
// LABEL_BAND) inside the SVG, so these inner-board-relative coords don't
// carry the offset themselves.
const geo = computed(() => boardGeometry(boardSize.value));
const pad = computed(() => geo.value.pad);
const cell = computed(() => geo.value.cell);
const stoneR = computed(() => geo.value.stoneR);
const STAR_R = 2.5; // Fixed dot size — does not need to scale with the board.
// Coordinate-label offset from the SVG edge (viewBox-units). The label
// sits inside the strip between the SVG edge and the nearest edge-row
// stone; LABEL_INSET_RATIO chooses where in that strip (0 = edge, 1 =
// stone, 0.5 = centered). Size-aware via pad and stoneR — smaller boards
// have larger stones, so the strip narrows; the ratio holds across sizes.
const labelOffset = computed(() => LABEL_INSET_RATIO * (LABEL_BAND + pad.value - stoneR.value));
const xLabels = computed(() => ALL_X_LABELS.slice(0, boardSize.value));
const hoshi = computed(() => {
    const s = boardSize.value;
    if (s === 19) {
        return [
            [3, 3], [9, 3], [15, 3],
            [3, 9], [9, 9], [15, 9],
            [3, 15], [9, 15], [15, 15],
        ];
    }
    if (s === 13) {
        // Corners at 3 and 9, tengen at 6.
        return [[3, 3], [9, 3], [3, 9], [9, 9], [6, 6]];
    }
    if (s === 9) {
        // Corners at 2 and 6, tengen at 4.
        return [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]];
    }
    // Other sizes (5x5, etc.) get no hoshi rather than wrong hoshi.
    console.warn(`[BoardDisplay uid=${uid}] no hoshi definition for size=${s}`);
    return [];
});
// Grid line set from the shared SSOT (gridLines), memoised on size.
const lines = computed(() => gridLines(boardSize.value));
const stoneList = computed(() => {
    return Object.entries(props.stones).map(([key, color]) => {
        const [bx, by] = key.split(',').map(Number);
        const { x, y } = toSVG(bx, by);
        return { key, x, y, color };
    });
});
function toSVG(bx, by) {
    // Board y=0 is at the bottom; SVG y increases downward, so we flip
    // (handled by the shared geometry). The playing-area group is translated
    // by (LABEL_BAND, LABEL_BAND) in the template, so these are inner-board
    // coordinates.
    return geo.value.toSVG(bx, by);
}
function onBoardClick(e) {
    const svg = e.currentTarget; // DOM: the handler is bound on the board's <svg>, so currentTarget is that element
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursor = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    // Cursor is in viewBox coords (0..TOTAL_PX); subtract LABEL_BAND to land
    // in inner-board coords before resolving column/row.
    const col = Math.round((cursor.x - LABEL_BAND - pad.value) / cell.value);
    const row = Math.round((cursor.y - LABEL_BAND - pad.value) / cell.value);
    const s = boardSize.value;
    if (col >= 0 && col < s && row >= 0 && row < s) {
        const boardY = s - 1 - row;
        if (e.shiftKey) {
            emit('shift-click', col, boardY);
        }
        else {
            emit('click', col, boardY);
        }
    }
}
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
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    ...{ onClick: (__VLS_ctx.onBoardClick) },
    viewBox: (`0 0 ${__VLS_ctx.TOTAL_PX} ${__VLS_ctx.TOTAL_PX}`),
    ...{ class: "board-svg" },
});
/** @type {__VLS_StyleScopedClasses['board-svg']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.defs, __VLS_intrinsics.defs)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.pattern, __VLS_intrinsics.pattern)({
    id: ('wood-' + __VLS_ctx.uid),
    patternUnits: "userSpaceOnUse",
    width: (__VLS_ctx.TOTAL_PX),
    height: (__VLS_ctx.TOTAL_PX),
});
__VLS_asFunctionalElement1(__VLS_intrinsics.image)({
    href: "/textures/wood.jpg",
    width: (__VLS_ctx.TOTAL_PX),
    height: (__VLS_ctx.TOTAL_PX),
    preserveAspectRatio: "xMidYMid slice",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
    id: ('grad-b-' + __VLS_ctx.uid),
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
    id: ('grad-w-' + __VLS_ctx.uid),
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
    fill: (`url(#wood-${__VLS_ctx.uid})`),
});
if (__VLS_ctx.showLabels) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        fill: (__VLS_ctx.LABEL_COLOR),
        'font-size': (__VLS_ctx.LABEL_FONT_SIZE),
        'font-weight': "bold",
        'font-family': "monospace",
        'text-anchor': "middle",
        'dominant-baseline': "middle",
    });
    __VLS_asFunctionalDirective(__VLS_directives.vMemo, {})(null, { ...__VLS_directiveBindingRestFields, value: ([__VLS_ctx.boardSize]) }, null, null);
    for (const [label, i] of __VLS_vFor((__VLS_ctx.xLabels))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
            key: ('lxt' + i),
            x: (__VLS_ctx.LABEL_BAND + __VLS_ctx.pad + i * __VLS_ctx.cell),
            y: (__VLS_ctx.labelOffset),
        });
        (label);
        // @ts-ignore
        [onBoardClick, TOTAL_PX, TOTAL_PX, TOTAL_PX, TOTAL_PX, TOTAL_PX, TOTAL_PX, uid, uid, uid, uid, BOARD_COLOR, showLabels, LABEL_COLOR, LABEL_FONT_SIZE, boardSize, xLabels, LABEL_BAND, pad, cell, labelOffset,];
    }
    for (const [label, i] of __VLS_vFor((__VLS_ctx.xLabels))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
            key: ('lxb' + i),
            x: (__VLS_ctx.LABEL_BAND + __VLS_ctx.pad + i * __VLS_ctx.cell),
            y: (__VLS_ctx.TOTAL_PX - __VLS_ctx.labelOffset),
        });
        (label);
        // @ts-ignore
        [TOTAL_PX, xLabels, LABEL_BAND, pad, cell, labelOffset,];
    }
    for (const [i] of __VLS_vFor((__VLS_ctx.boardSize))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
            key: ('lyl' + i),
            x: (__VLS_ctx.labelOffset),
            y: (__VLS_ctx.LABEL_BAND + __VLS_ctx.pad + (__VLS_ctx.boardSize - i) * __VLS_ctx.cell),
        });
        (i);
        // @ts-ignore
        [boardSize, boardSize, LABEL_BAND, pad, cell, labelOffset,];
    }
    for (const [i] of __VLS_vFor((__VLS_ctx.boardSize))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
            key: ('lyr' + i),
            x: (__VLS_ctx.TOTAL_PX - __VLS_ctx.labelOffset),
            y: (__VLS_ctx.LABEL_BAND + __VLS_ctx.pad + (__VLS_ctx.boardSize - i) * __VLS_ctx.cell),
        });
        (i);
        // @ts-ignore
        [TOTAL_PX, boardSize, boardSize, LABEL_BAND, pad, cell, labelOffset,];
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
    transform: (`translate(${__VLS_ctx.LABEL_BAND}, ${__VLS_ctx.LABEL_BAND})`),
});
__VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
    stroke: (__VLS_ctx.LINE_COLOR),
    'stroke-width': "0.8",
    opacity: "0.8",
});
__VLS_asFunctionalDirective(__VLS_directives.vMemo, {})(null, { ...__VLS_directiveBindingRestFields, value: ([__VLS_ctx.boardSize]) }, null, null);
for (const [l, i] of __VLS_vFor((__VLS_ctx.lines))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
        key: (i),
        x1: (l.x1),
        y1: (l.y1),
        x2: (l.x2),
        y2: (l.y2),
    });
    // @ts-ignore
    [boardSize, LABEL_BAND, LABEL_BAND, LINE_COLOR, lines,];
}
for (const [h, i] of __VLS_vFor((__VLS_ctx.hoshi))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        key: ('h' + i),
        cx: (__VLS_ctx.toSVG(h[0], h[1]).x),
        cy: (__VLS_ctx.toSVG(h[0], h[1]).y),
        r: (__VLS_ctx.STAR_R),
        fill: "#222",
    });
    __VLS_asFunctionalDirective(__VLS_directives.vMemo, {})(null, { ...__VLS_directiveBindingRestFields, value: ([__VLS_ctx.boardSize]) }, null, null);
    // @ts-ignore
    [boardSize, hoshi, toSVG, toSVG, STAR_R,];
}
if (__VLS_ctx.underlayCells && __VLS_ctx.underlayColorMap && __VLS_ctx.underlayCells.length > 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({});
    for (const [ucell] of __VLS_vFor((__VLS_ctx.underlayCells))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            key: (`under-${ucell.x},${ucell.y}`),
            x: (__VLS_ctx.toSVG(ucell.x, ucell.y).x - __VLS_ctx.cell / 2),
            y: (__VLS_ctx.toSVG(ucell.x, ucell.y).y - __VLS_ctx.cell / 2),
            width: (__VLS_ctx.cell),
            height: (__VLS_ctx.cell),
            fill: (__VLS_ctx.underlayColorMap(ucell.value).fill),
            opacity: (__VLS_ctx.underlayColorMap(ucell.value).opacity),
        });
        // @ts-ignore
        [cell, cell, cell, cell, toSVG, toSVG, underlayCells, underlayCells, underlayCells, underlayColorMap, underlayColorMap, underlayColorMap,];
    }
}
for (const [stone] of __VLS_vFor((__VLS_ctx.stoneList))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        key: (stone.key),
    });
    __VLS_asFunctionalDirective(__VLS_directives.vMemo, {})(null, { ...__VLS_directiveBindingRestFields, value: ([stone.color, stone.x, stone.y]) }, null, null);
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: (stone.x),
        cy: (stone.y),
        r: (__VLS_ctx.stoneR),
        fill: (stone.color === 'B' ? `url(#grad-b-${__VLS_ctx.uid})` : `url(#grad-w-${__VLS_ctx.uid})`),
        stroke: (stone.color === 'B' ? '#000' : '#aaa'),
        'stroke-width': "0.5",
    });
    // @ts-ignore
    [uid, uid, stoneList, stoneR,];
}
if (__VLS_ctx.lastMove && __VLS_ctx.lastMove.type === 'place' && !__VLS_ctx.moveNumbers) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: (__VLS_ctx.toSVG(__VLS_ctx.lastMove.x, __VLS_ctx.lastMove.y).x),
        cy: (__VLS_ctx.toSVG(__VLS_ctx.lastMove.x, __VLS_ctx.lastMove.y).y),
        r: (__VLS_ctx.stoneR * __VLS_ctx.MARKER_INNER_RATIO),
        fill: "none",
        stroke: (__VLS_ctx.stones[`${__VLS_ctx.lastMove.x},${__VLS_ctx.lastMove.y}`] === 'B' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)'),
        'stroke-width': "2",
    });
}
if (__VLS_ctx.moveNumbers) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({});
    for (const [stone] of __VLS_vFor((__VLS_ctx.stoneList))) {
        __VLS_asFunctionalElement(__VLS_intrinsics.template)({
            key: (`mn-${stone.key}`),
        });
        if (__VLS_ctx.moveNumbers[stone.key] !== undefined) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
                x: (stone.x),
                y: (stone.y + 1),
                'font-size': (__VLS_ctx.stoneR * (__VLS_ctx.moveNumbers[stone.key] >= 100 ? 0.5 : __VLS_ctx.moveNumbers[stone.key] >= 10 ? 0.6 : 0.7)),
                fill: (stone.color === 'B' ? '#e8e8e8' : '#1a1a1a'),
                'text-anchor': "middle",
                'dominant-baseline': "middle",
                'font-family': "monospace",
                'font-weight': "bold",
                'pointer-events': "none",
            });
            __VLS_asFunctionalDirective(__VLS_directives.vMemo, {})(null, { ...__VLS_directiveBindingRestFields, value: ([__VLS_ctx.moveNumbers[stone.key], stone.x, stone.y, stone.color]) }, null, null);
            (__VLS_ctx.moveNumbers[stone.key]);
        }
        // @ts-ignore
        [toSVG, toSVG, stoneList, stoneR, stoneR, lastMove, lastMove, lastMove, lastMove, lastMove, lastMove, lastMove, lastMove, moveNumbers, moveNumbers, moveNumbers, moveNumbers, moveNumbers, moveNumbers, moveNumbers, MARKER_INNER_RATIO, stones,];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
