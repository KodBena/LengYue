/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, toRaw } from 'vue';
import BoardDisplay from './BoardDisplay.vue';
import BoardHeatmapOverlay from './BoardHeatmapOverlay.vue';
import BoardVariationsOverlay from './BoardVariationsOverlay.vue';
import MoveSuggestions from './MoveSuggestions.vue';
import { getBoardSize, decodeBoardArray } from '../../engine/util';
import { useScopedScroll } from '../../composables/useScopedScroll';
import { useNavigation } from '../../composables/useNavigation';
import { findPlacementOnActivePath } from '../../engine/navigator';
import { store } from '../../store';
import { ledger } from '../../state/analysis-ledger';
import { activeAnalysisKeys } from '../../state/analysis-config';
// ── Ownership overlay glue ───────────────────────────────────────────────────
// KataGo's `ownership` field comes back length size² in row-major order.
// The project follows KataGo's default convention: positive values
// indicate the *white* player expects to own that point; negative
// indicate black. Empirically verified against the live engine.
//
// The colorMap is shared across all three ownership sub-modes
// (continuous fill, discrete dots, stone liveness). For the liveness
// case, the call site encodes the disagreement-magnitude as a signed
// value — sign carries the opposing-stone colour, magnitude carries
// the confidence of the disagreement — and this same map paints it.
function ownershipColor(v) {
    const mag = Math.abs(v);
    // Dead-band threshold sourced from the registry leaf promoted in
    // the knob-registry Phase 6 magic-literals sweep (was a hardcoded
    // 0.05 literal). Below this magnitude the ownership signal is too
    // weak to render — paints transparent to prevent flicker as the
    // engine's confidence wavers around 0. Drives via the
    // `display.ownership-deadband-threshold` KnobDecl.
    const deadband = store.profile.settings.appearance.ownershipDeadbandThreshold;
    if (mag < deadband)
        return { fill: 'transparent', opacity: 0 };
    // Ownership overlay ceiling — sourced from the registry leaf
    // promoted in knob-registry Phase 3a (was a hardcoded 0.55 here
    // and at the magnitude multiplier; both still pull from the same
    // leaf so the "signal tops out at the same value it scales by"
    // coupling is preserved). The leaf is reactive — reads during
    // render trigger re-render on slider drag through the
    // `display.ownership-opacity-ceiling` KnobDecl.
    const ceiling = store.profile.settings.appearance.ownershipOpacityCeiling;
    return {
        fill: v > 0 ? '#fff' : '#000',
        opacity: Math.min(ceiling, mag * ceiling),
    };
}
// Liveness marker uses the conventional small-opposing-coloured-dot
// rendering inside the stone (Lizzie / KaTrain / Sabaki convention).
// The threshold filter at the call site has already gated to confident
// disagreement, so a flat near-opaque fill reads cleanly without the
// magnitude-modulated opacity that the territory overlays use.
function livenessColor(v) {
    // magic-literal: 0.95 liveness opacity — band-3 Go-bound visualization
    // decision. Higher than ownershipColor's ceiling because liveness
    // markers have already passed the registry-driven liveness-threshold
    // gate in `livenessCells` below, so the rendering can be near-opaque
    // without the magnitude-modulated fade territory overlays use.
    return { fill: v > 0 ? '#fff' : '#000', opacity: 0.95 };
}
const props = defineProps();
const emit = defineEmits();
const containerRef = ref(null);
const nav = useNavigation();
useScopedScroll(containerRef, (deltaY) => {
    if (deltaY > 0)
        nav.next();
    else
        nav.prev();
});
const boardSize = computed(() => getBoardSize(props.state));
const lastMovePoint = computed(() => {
    const currentNode = props.state.nodes[props.state.currentNodeId];
    return currentNode?.move ?? null;
});
// Decoded ownership cells reactive to the active-palette hash and the
// current node. Both the continuous and dots sub-modes consume this
// list; the liveness sub-mode consumes its sibling `livenessCells`.
const decodedOwnership = computed(() => {
    const rawKey = activeAnalysisKeys.value.rawKey;
    if (!rawKey)
        return null;
    const packet = ledger.getRaw(rawKey, props.state.currentNodeId);
    const raw = packet?.ownership;
    if (!raw)
        return null;
    return decodeBoardArray(raw, boardSize.value);
});
// Split into two variants because the continuous-mode shading
// extends across occupied vertices (rendered as an underlay
// INSIDE BoardDisplay's SVG, between hoshi and stones — the
// stones occlude the underlay's centers while the corners remain
// visible at the cell boundaries, giving the "spatial
// continuity" reading of the engine's ownership map). The
// dots-mode markers stay empty-only — discrete markers on
// stones aren't a meaningful signal.
const allOwnershipCells = computed(() => {
    return decodedOwnership.value ?? [];
});
const emptyOwnershipCells = computed(() => {
    const cells = decodedOwnership.value;
    if (!cells)
        return [];
    return cells.filter(({ x, y }) => !props.state.stones[`${x},${y}`]);
});
const continuousCells = computed(() => store.session.ui.overlayLayers.ownership.continuous ? allOwnershipCells.value : []);
const dotsCells = computed(() => store.session.ui.overlayLayers.ownership.dots ? emptyOwnershipCells.value : []);
// Stone-position cells where the engine's predicted owner disagrees
// with the stone's own colour. The encoded `value` is the raw
// ownership reading — its sign already addresses the colorMap toward
// the *opposing* colour (positive ownership = white-tint over a black
// stone; negative ownership = black-tint over a white stone).
const livenessCells = computed(() => {
    if (!store.session.ui.overlayLayers.ownership.liveness)
        return [];
    const cells = decodedOwnership.value;
    if (!cells)
        return [];
    // Liveness threshold sourced from the registry leaf promoted in
    // the knob-registry Phase 6 magic-literals sweep (was a hardcoded
    // `LIVENESS_THRESHOLD = 0.3` const). Below this magnitude the
    // engine is genuinely undecided about the region; the highlight
    // would flicker as packets arrive. Drives via the
    // `display.liveness-threshold` KnobDecl.
    const livenessThreshold = store.profile.settings.appearance.livenessThreshold;
    return cells.filter(({ x, y, value }) => {
        const stone = props.state.stones[`${x},${y}`];
        if (!stone)
            return false;
        return (stone === 'B' && value > livenessThreshold)
            || (stone === 'W' && value < -livenessThreshold);
    });
});
const currentMoveNumber = computed(() => {
    let count = 0;
    // Tightened from `string | null` to `NodeId | null`. The walk starts
    // at `props.state.currentNodeId` (which is NodeId) and proceeds via
    // `node.parent` (which is `NodeId | null`); the loose `string` was a
    // signature lie covering for the loose type. With the branded type,
    // the Record indexing on rawNodes[currId] is type-safe with no cast.
    let currId = props.state.currentNodeId;
    const rawNodes = toRaw(props.state.nodes);
    while (currId) {
        // Explicit annotation breaks TS7022 circular inference. After
        // ADR-0001's readonly removal, TS can no longer use the readonly
        // hint to break the cycle between `node`'s inferred type and
        // `currId`'s reassignment from `node.parent`. Annotating `node`
        // breaks the cycle by removing one side of the inference.
        const node = rawNodes[currId];
        if (!node)
            break;
        if (node.move?.type === 'place')
            count++;
        currId = node.parent;
    }
    return count;
});
// Per-coordinate move-number map for the active variation up to and
// including the current node. Walks the parent chain in reverse so
// the ordinal at "x,y" is the ordinal of the LAST placement-move at
// that coordinate — a later move overwrites an earlier one whose
// stone has since been captured and replaced. Setup stones from the
// root's AB/AW properties have no `move` event and aren't included.
// Returned undefined (not empty object) when the toggle is off so
// BoardDisplay's v-if cleanly skips the render branch.
// Tracks whether MoveSuggestions is currently previewing a PV
// (the user is hovering a suggestion). Used to suppress the
// game-tree move-number annotation on actual played stones while
// the PV preview is up — the user is reading a hypothetical
// variation whose numbering context is the PV's own annotation,
// and the played-sequence numbers would conflict with that mental
// frame. The signal is a derived boolean from MoveSuggestions'
// `hoveredIndex !== null`, fired on the has-hover ↔ no-hover
// transition; see that component's `pv-preview-active` emit.
const pvHoverActive = ref(false);
const moveNumbersByCoord = computed(() => {
    if (!store.session.ui.showStoneMoveNumbers)
        return undefined;
    if (pvHoverActive.value)
        return undefined;
    const rawNodes = toRaw(props.state.nodes);
    // Walk root → current first by collecting the parent chain, then
    // numbering forward. Walking forward via children is awkward
    // because of variation choices; the parent walk is unambiguous.
    const chain = [];
    let currId = props.state.currentNodeId;
    // Annotated exemption (local/hand-rolled-path-walk): this re-derives
    // getPath's root→current walk (then reverses) as a bare `NodeId[]`. It runs
    // on a `toRaw` snapshot inside a render-coupled computed (ADR-0010); routing
    // it through navigator.ts's `getPath` is sound but a perf-sensitive change
    // (the reactivity shape this computed reads is load-bearing), so it is the
    // branded-path-consolidation arc's work, named-as-debt here.
    // eslint-disable-next-line local/hand-rolled-path-walk -- render-coupled computed; route through getPath in the path-consolidation arc
    while (currId) {
        chain.push(currId);
        const node = rawNodes[currId];
        if (!node)
            break;
        currId = node.parent;
    }
    chain.reverse();
    const result = {};
    let n = 0;
    for (const id of chain) {
        const node = rawNodes[id];
        if (!node)
            continue;
        if (node.move?.type === 'place') {
            n++;
            result[`${node.move.x},${node.move.y}`] = n;
        }
    }
    return result;
});
/**
 * Shift-click on a board vertex: navigate to the nearest node on
 * the active variation path that placed a stone at (x, y), backward
 * search first (the "where did this stone come from?" reading),
 * forward second (an empty intersection the active path plays
 * later). No-op when (x, y) is never played on the active line.
 * The helper resolves the target nodeId; `nav.goTo` performs the
 * navigation through the same `navigateTo` primitive the arrow-
 * key handlers compose on top of.
 */
function onShiftClick(x, y) {
    const targetId = findPlacementOnActivePath(props.state, x, y);
    if (targetId !== null)
        nav.goTo(targetId);
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
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ref: "containerRef",
    ...{ class: "board-widget-container" },
});
/** @type {__VLS_StyleScopedClasses['board-widget-container']} */ ;
const __VLS_0 = BoardDisplay;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    ...{ 'onShiftClick': {} },
    size: (__VLS_ctx.boardSize),
    stones: (__VLS_ctx.state.stones),
    lastMove: (__VLS_ctx.lastMovePoint),
    showLabels: (true),
    moveNumbers: (__VLS_ctx.moveNumbersByCoord),
    underlayCells: (__VLS_ctx.continuousCells),
    underlayColorMap: (__VLS_ctx.ownershipColor),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    ...{ 'onShiftClick': {} },
    size: (__VLS_ctx.boardSize),
    stones: (__VLS_ctx.state.stones),
    lastMove: (__VLS_ctx.lastMovePoint),
    showLabels: (true),
    moveNumbers: (__VLS_ctx.moveNumbersByCoord),
    underlayCells: (__VLS_ctx.continuousCells),
    underlayColorMap: (__VLS_ctx.ownershipColor),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    ...{ click: {} },
    onClick: ((x, y) => __VLS_ctx.emit('move', x, y)),
    ...{ shiftClick: {} },
    onShiftClick: (__VLS_ctx.onShiftClick),
};
var __VLS_3;
var __VLS_4;
if (__VLS_ctx.dotsCells.length > 0) {
    const __VLS_7 = BoardHeatmapOverlay;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        cells: (__VLS_ctx.dotsCells),
        size: (__VLS_ctx.boardSize),
        colorMap: (__VLS_ctx.ownershipColor),
        shape: "disc",
        scale: (0.3),
    }));
    const __VLS_9 = __VLS_8({
        cells: (__VLS_ctx.dotsCells),
        size: (__VLS_ctx.boardSize),
        colorMap: (__VLS_ctx.ownershipColor),
        shape: "disc",
        scale: (0.3),
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
}
if (__VLS_ctx.livenessCells.length > 0) {
    const __VLS_12 = BoardHeatmapOverlay;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
        cells: (__VLS_ctx.livenessCells),
        size: (__VLS_ctx.boardSize),
        colorMap: (__VLS_ctx.livenessColor),
        shape: "disc",
        scale: (0.13),
    }));
    const __VLS_14 = __VLS_13({
        cells: (__VLS_ctx.livenessCells),
        size: (__VLS_ctx.boardSize),
        colorMap: (__VLS_ctx.livenessColor),
        shape: "disc",
        scale: (0.13),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
}
if (__VLS_ctx.store.session.ui.showMoveSuggestions) {
    const __VLS_17 = MoveSuggestions;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
        ...{ 'onMove': {} },
        ...{ 'onPastePv': {} },
        ...{ 'onPvPreviewActive': {} },
        boardId: (__VLS_ctx.state.id),
        currentNodeId: (__VLS_ctx.state.currentNodeId),
        boardSize: (__VLS_ctx.boardSize),
        pvConfig: (__VLS_ctx.store.session.ui.pvAnimation),
        currentMoveNumber: (__VLS_ctx.currentMoveNumber),
        showTranspositionRings: (__VLS_ctx.store.session.ui.showTranspositionRings),
        moveSuggestionsFadeMs: (__VLS_ctx.store.profile.settings.appearance.moveSuggestionsFadeMs),
    }));
    const __VLS_19 = __VLS_18({
        ...{ 'onMove': {} },
        ...{ 'onPastePv': {} },
        ...{ 'onPvPreviewActive': {} },
        boardId: (__VLS_ctx.state.id),
        currentNodeId: (__VLS_ctx.state.currentNodeId),
        boardSize: (__VLS_ctx.boardSize),
        pvConfig: (__VLS_ctx.store.session.ui.pvAnimation),
        currentMoveNumber: (__VLS_ctx.currentMoveNumber),
        showTranspositionRings: (__VLS_ctx.store.session.ui.showTranspositionRings),
        moveSuggestionsFadeMs: (__VLS_ctx.store.profile.settings.appearance.moveSuggestionsFadeMs),
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    let __VLS_22;
    const __VLS_23 = {
        ...{ move: {} },
        onMove: ((x, y) => __VLS_ctx.emit('move', x, y)),
        ...{ pastePv: {} },
        onPastePv: ((pv) => __VLS_ctx.emit('paste-pv', pv)),
        ...{ pvPreviewActive: {} },
        onPvPreviewActive: (...[$event]) => {
            if (!(__VLS_ctx.store.session.ui.showMoveSuggestions))
                return;
            __VLS_ctx.pvHoverActive = $event;
            // @ts-ignore
            [boardSize, boardSize, boardSize, boardSize, state, state, state, lastMovePoint, moveNumbersByCoord, continuousCells, ownershipColor, ownershipColor, emit, emit, emit, onShiftClick, dotsCells, dotsCells, livenessCells, livenessCells, livenessColor, store, store, store, store, currentMoveNumber, pvHoverActive,];
        },
    };
    var __VLS_20;
    var __VLS_21;
}
if (__VLS_ctx.store.session.ui.boardVariations !== 'off' || __VLS_ctx.store.session.ui.showActiveNextMove) {
    const __VLS_24 = BoardVariationsOverlay;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
        state: (__VLS_ctx.state),
        size: (__VLS_ctx.boardSize),
        variationsMode: (__VLS_ctx.store.session.ui.boardVariations),
        showActiveNextMove: (__VLS_ctx.store.session.ui.showActiveNextMove),
        showMoveSuggestions: (__VLS_ctx.store.session.ui.showMoveSuggestions),
    }));
    const __VLS_26 = __VLS_25({
        state: (__VLS_ctx.state),
        size: (__VLS_ctx.boardSize),
        variationsMode: (__VLS_ctx.store.session.ui.boardVariations),
        showActiveNextMove: (__VLS_ctx.store.session.ui.showActiveNextMove),
        showMoveSuggestions: (__VLS_ctx.store.session.ui.showMoveSuggestions),
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
}
// @ts-ignore
[boardSize, state, store, store, store, store, store,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
