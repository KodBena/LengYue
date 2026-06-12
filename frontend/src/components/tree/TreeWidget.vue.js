/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, toRef, watch, nextTick, onMounted } from 'vue';
import { useTreeLayout } from '../../composables/forest/useTreeLayout';
import { useTreeExpansion } from '../../composables/forest/useTreeExpansion';
import { useScopedScroll } from '../../composables/useScopedScroll';
import { useViewportFollow } from '../../composables/useViewportFollow';
import { useNavigation } from '../../composables/useNavigation';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import { warmSnapshotAccessor } from '../../composables/cards/usePreviewSnapshot';
import { themeColor } from '../../utils/theme-color';
import FloatingThumbnail from '../chrome/FloatingThumbnail.vue';
import { boardsById } from '../../store';
const props = withDefaults(defineProps(), { orientation: 'vertical' });
const emit = defineEmits();
// ── Rendering constants ───────────────────────────────────────────────────────
const CELL = 24;
const PAD = 18;
const NODE_R = 5;
const BOX_SIZE = 10;
const SIDE_OFFSET = 12;
// ── Composables ───────────────────────────────────────────────────────────────
const outerRef = ref(null);
const thumbRef = ref(null);
const nav = useNavigation();
useScopedScroll(outerRef, deltaY => {
    if (deltaY > 0)
        nav.next();
    else
        nav.prev();
});
// Viewport-follow: centres `outerRef` on the active node without reading
// scroll/viewport geometry in the navigation hot path (it caches both from
// a passive scroll listener + ResizeObserver). See the composable header
// for why a synchronous read — or a rAF-deferred one — forces a reflow.
const viewportFollow = useViewportFollow(outerRef);
const expansion = useTreeExpansion();
const { variationMarkerLabels } = useThumbnailCache();
const nodesRef = toRef(props, 'nodes');
const { layout } = useTreeLayout(nodesRef, undefined, expansion);
// Self-sourced current node (Arc 2 / App-decouple). Reads the cursor
// off the store's O(1) `boardsById` index keyed by the `boardId` prop
// rather than receiving it from App.vue. After Arc 1's in-place
// `mutateBoard`, the `currentNodeId` field dep fires on navigation
// while `boardsById` itself does not re-derive — so this recomputes on
// nav without App's template having to read the cursor.
const currentNodeId = computed(() => boardsById.value[props.boardId]?.currentNodeId);
// ── Variation Hover Logic ─────────────────────────────────────────────────────
function onToggleEnter(e, nodeId) {
    if (!thumbRef.value)
        return;
    // The warm-plus-accessor sub-unit of the cured preview-snapshot quartet
    // (usePreviewSnapshot): fire-and-forget warm of the shared snapshot cache,
    // then a synchronous accessor over `getSnapshotSync(nodeId)`. The warm
    // writes ONLY the cache — never the thumbnail's visible state — so a late
    // resolve cannot resurrect a hidden preview (the invariant uniform across
    // both hover surfaces). TreeWidget's gate is owned by the FloatingThumbnail
    // child (set imperatively via show()/hide()), so it reuses only this pair,
    // not the gate-holding quartet form.
    const baseAccessor = warmSnapshotAccessor(nodeId, props.boardId);
    // Labels are tree-structural and stable for the duration of a hover, so
    // they are derived once here, synchronously, and decorated onto the
    // snapshot in TreeWidget's own closure.
    const labels = variationMarkerLabels(nodeId, props.boardId);
    // Synchronous show with the decorated accessor (the ChartPreviewBox
    // accessor contract): FloatingThumbnail invokes it inside its own render
    // scope, so the cache subscription lives in that leaf — TreeWidget's render
    // never reads the cache and stays decoupled from hover-preview fills.
    thumbRef.value.show(() => {
        const snap = baseAccessor();
        return snap ? { ...snap, markerLabels: labels } : null;
    }, e.clientX, e.clientY);
}
function onToggleLeave() {
    thumbRef.value?.hide();
}
// ── Node-circle fill / stroke helpers (chrome via themeColor; B/W
//    stones stay literal as domain colors per ADR-0003 plan §D). ─────────────
function nodeFill(item) {
    if (!item.move)
        return themeColor('--border-3');
    // Stone colors are domain-meaningful (board pieces); not chrome.
    return item.move.color === 'B' ? '#111' : '#eee';
}
function nodeStroke(item) {
    return item.move ? themeColor('--border-3') : themeColor('--border-2');
}
// ── Coordinate mapping ────────────────────────────────────────────────────────
function toPixels(gx, gy) {
    return props.orientation === 'horizontal'
        ? { x: PAD + gy * CELL, y: PAD + gx * CELL }
        : { x: PAD + gx * CELL, y: PAD + gy * CELL };
}
function indicatorPixels(gx, gy) {
    const base = toPixels(gx, gy);
    return props.orientation === 'horizontal'
        ? { x: base.x, y: base.y + SIDE_OFFSET }
        : { x: base.x + SIDE_OFFSET, y: base.y };
}
const svgWidth = computed(() => props.orientation === 'horizontal'
    ? layout.value.rows * CELL + PAD * 2
    : layout.value.cols * CELL + PAD * 2);
const svgHeight = computed(() => props.orientation === 'horizontal'
    ? layout.value.cols * CELL + PAD * 2
    : layout.value.rows * CELL + PAD * 2);
// Pixel position of the active-node ring — the one nav-reactive piece of
// the tree. Null when the current node has no layout position yet
// (transiently, before the ensureVisible watch expands its ancestors).
const activeRingPos = computed(() => {
    const id = currentNodeId.value;
    if (!id)
        return null;
    const pos = layout.value.positions.get(id);
    return pos ? toPixels(pos.gx, pos.gy) : null;
});
// The ring is updated IMPERATIVELY (a `<circle ref>` patched in a watch),
// NOT bound reactively in the template. Decoupling it into a standalone
// element wasn't enough: reading `activeRingPos` in the template still re-runs
// TreeWidget's whole render function on every nav (the full v-for over edges +
// nodeList, evaluating every v-memo key) — the per-item v-memo only spares the
// *patch*, not the render. Chrome profiling showed `<TreeWidget> render` at
// ~24% self-time, the single biggest JS cost, driven entirely by this read.
// Moving the ring off the render path (same trick as the canvas rug-plots)
// means a cursor-only nav touches one circle's attributes and TreeWidget's
// render runs only on genuine tree-structure change.
const activeRingEl = ref(null);
function updateActiveRing(pos) {
    const el = activeRingEl.value;
    if (!el)
        return;
    if (pos) {
        el.setAttribute('cx', String(pos.x));
        el.setAttribute('cy', String(pos.y));
        el.style.display = '';
    }
    else {
        el.style.display = 'none';
    }
}
watch(activeRingPos, updateActiveRing);
onMounted(() => updateActiveRing(activeRingPos.value)); // seed (the ref is null at setup)
// ── Viewport Centering & Auto-Expand ──────────────────────────────────────────
//
// `immediate: true` so the invariant fires on mount (the SPA-reload
// case, where currentNodeId is hydrated to a mid-variation node and
// no change event ever happens). `ensureVisible` walks up from the
// new node and unions every ancestor into the expansion set — this
// is the load-bearing piece of the "current-node-is-always-visible"
// invariant the composable's header documents. Covers all three
// trigger cases (mount, lateral nav, multi-step PV paste) uniformly.
watch(currentNodeId, async (newId, _oldId) => {
    if (!newId)
        return;
    expansion.ensureVisible(props.nodes, newId);
    // Wait for Vue to trigger useTreeLayout and patch the DOM.
    await nextTick();
    // Center the newly revealed node. On the initial-mount run the layout
    // position may not exist yet; the early return is the right behaviour
    // (first paint scrolls to its own default and subsequent navigation
    // takes over). `centerOn` reads only cached geometry — no synchronous
    // reflow — and no-ops when the node is already comfortably in view.
    const pos = layout.value.positions.get(newId);
    if (!pos)
        return;
    const { x, y } = toPixels(pos.gx, pos.gy);
    viewportFollow.centerOn(x, y);
}, { immediate: true });
// ── Derived display lists ─────────────────────────────────────────────────────
const nodeList = computed(() => {
    // `parentIdForToggle` is added to the type literal because the loop
    // unconditionally assigns it (line below). The previous omission was
    // a partial type that the strict-mode typecheck flagged as a missing
    // property in the array element literal at the items.push site.
    // It's NodeId | '' (the empty string is the sentinel "no toggle owner";
    // when isBranching is true, the value is a real NodeId).
    const items = [];
    layout.value.positions.forEach((pos, id) => {
        const node = props.nodes[id];
        if (!node)
            return;
        const { x: px, y: py } = toPixels(pos.gx, pos.gy);
        const { x: ix, y: iy } = indicatorPixels(pos.gx, pos.gy);
        // --- NEW LOGIC: Attach to the mainline child instead of the parent ---
        let hasSiblings = false;
        let parentIdForToggle = '';
        let isParentExpanded = false;
        if (node.parent) {
            const parentNode = props.nodes[node.parent];
            // If this node is the FIRST child (mainline) and its parent has variations
            if (parentNode && parentNode.children.length > 1 && parentNode.children[0] === id) {
                hasSiblings = true;
                parentIdForToggle = node.parent;
                isParentExpanded = expansion.isExpanded(node.parent);
            }
        }
        items.push({
            id, px, py, ix, iy,
            move: node.move,
            isBranching: hasSiblings,
            isExpanded: isParentExpanded,
            parentIdForToggle, // Pass to template
            isGameHead: !!props.gameHeadIds?.has(id),
        });
    });
    return items;
});
const edges = computed(() => {
    const result = [];
    layout.value.positions.forEach((pos, nodeId) => {
        const node = props.nodes[nodeId];
        if (!node)
            return;
        const start = toPixels(pos.gx, pos.gy);
        for (const childId of node.children) {
            const childPos = layout.value.positions.get(childId);
            if (!childPos)
                continue;
            const end = toPixels(childPos.gx, childPos.gy);
            let d = childPos.gx === pos.gx ? `M${start.x},${start.y} L${end.x},${end.y}` :
                (props.orientation === 'horizontal' ? `M${start.x},${start.y} L${start.x + CELL / 2},${start.y} L${start.x + CELL / 2},${end.y} L${end.x},${end.y}` :
                    `M${start.x},${start.y} L${start.x},${(start.y + end.y) / 2} L${end.x},${(start.y + end.y) / 2} L${end.x},${end.y}`);
            result.push({ d, id: `${nodeId}-${childId}` });
        }
    });
    return result;
});
const __VLS_defaults = { orientation: 'vertical' };
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
/** @type {__VLS_StyleScopedClasses['node-circle']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-group']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-group']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-box']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-group']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-mark']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tree-widget-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['tree-widget-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ref: "outerRef",
    ...{ class: "tree-widget-outer" },
});
/** @type {__VLS_StyleScopedClasses['tree-widget-outer']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    width: (__VLS_ctx.svgWidth),
    height: (__VLS_ctx.svgHeight),
    ...{ class: "tree-svg" },
});
/** @type {__VLS_StyleScopedClasses['tree-svg']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
    ...{ class: "tree-edges" },
    'stroke-width': "1.2",
    'stroke-linecap': "round",
});
/** @type {__VLS_StyleScopedClasses['tree-edges']} */ ;
for (const [edge] of __VLS_vFor((__VLS_ctx.edges))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        key: (edge.id),
        d: (edge.d),
    });
    __VLS_asFunctionalDirective(__VLS_directives.vMemo, {})(null, { ...__VLS_directiveBindingRestFields, value: ([edge.d]) }, null, null);
    // @ts-ignore
    [svgWidth, svgHeight, edges,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
    ref: "activeRingEl",
    r: (__VLS_ctx.NODE_R + 3),
    ...{ class: "active-ring" },
    'stroke-width': "1",
    ...{ style: {} },
});
/** @type {__VLS_StyleScopedClasses['active-ring']} */ ;
for (const [item] of __VLS_vFor((__VLS_ctx.nodeList))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        key: (item.id),
    });
    __VLS_asFunctionalDirective(__VLS_directives.vMemo, {})(null, { ...__VLS_directiveBindingRestFields, value: ([item.isGameHead, item.move?.color, item.isBranching, item.isExpanded, item.px, item.py]) }, null, null);
    if (item.isGameHead) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            cx: (item.px),
            cy: (item.py),
            r: (__VLS_ctx.NODE_R + 5),
            ...{ class: "game-head-ring" },
            'stroke-width': "1.5",
        });
        /** @type {__VLS_StyleScopedClasses['game-head-ring']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.emit('select-node', item.id);
                // @ts-ignore
                [NODE_R, NODE_R, nodeList, emit,];
            } },
        cx: (item.px),
        cy: (item.py),
        r: (__VLS_ctx.NODE_R),
        fill: (__VLS_ctx.nodeFill(item)),
        stroke: (__VLS_ctx.nodeStroke(item)),
        'stroke-width': "1",
        ...{ class: "node-circle" },
    });
    /** @type {__VLS_StyleScopedClasses['node-circle']} */ ;
    if (item.isBranching) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ onClick: (...[$event]) => {
                    if (!(item.isBranching))
                        return;
                    __VLS_ctx.expansion.toggle(item.parentIdForToggle /* layout item's parent id is a NodeId */);
                    // @ts-ignore
                    [NODE_R, nodeFill, nodeStroke, expansion,];
                } },
            ...{ onMouseenter: (e => __VLS_ctx.onToggleEnter(e, item.parentIdForToggle /* layout item's parent id is a NodeId */)) },
            ...{ onMouseleave: (__VLS_ctx.onToggleLeave) },
            ...{ class: "toggle-group" },
        });
        /** @type {__VLS_StyleScopedClasses['toggle-group']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
            x1: (item.px),
            y1: (item.py),
            x2: (item.ix),
            y2: (item.iy),
            ...{ class: "toggle-leader" },
            'stroke-width': "1",
            'stroke-dasharray': "2,1",
        });
        /** @type {__VLS_StyleScopedClasses['toggle-leader']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: (item.ix - __VLS_ctx.BOX_SIZE / 2),
            y: (item.iy - __VLS_ctx.BOX_SIZE / 2),
            width: (__VLS_ctx.BOX_SIZE),
            height: (__VLS_ctx.BOX_SIZE),
            ...{ class: "toggle-box" },
            'stroke-width': "1",
            rx: "1",
        });
        /** @type {__VLS_StyleScopedClasses['toggle-box']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
            x1: (item.ix - 2.5),
            y1: (item.iy),
            x2: (item.ix + 2.5),
            y2: (item.iy),
            ...{ class: "toggle-mark" },
            'stroke-width': "1",
        });
        /** @type {__VLS_StyleScopedClasses['toggle-mark']} */ ;
        if (!item.isExpanded) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
                x1: (item.ix),
                y1: (item.iy - 2.5),
                x2: (item.ix),
                y2: (item.iy + 2.5),
                ...{ class: "toggle-mark" },
                'stroke-width': "1",
            });
            /** @type {__VLS_StyleScopedClasses['toggle-mark']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: (item.ix - 7),
            y: (item.iy - 7),
            width: "14",
            height: "14",
            fill: "transparent",
            ...{ class: "hit-area" },
        });
        /** @type {__VLS_StyleScopedClasses['hit-area']} */ ;
    }
    // @ts-ignore
    [onToggleEnter, onToggleLeave, BOX_SIZE, BOX_SIZE, BOX_SIZE, BOX_SIZE,];
}
const __VLS_0 = FloatingThumbnail;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ref: "thumbRef",
}));
const __VLS_2 = __VLS_1({
    ref: "thumbRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
var __VLS_3;
// @ts-ignore
var __VLS_6 = __VLS_5;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
