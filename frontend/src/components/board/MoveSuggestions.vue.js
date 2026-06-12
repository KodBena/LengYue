/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { BOARD_PX, LABEL_BAND, TOTAL_PX, STONE_RADIUS_RATIO } from '../../engine/constants';
import { useMoveSuggestions } from '../../composables/board/use-move-suggestions';
import { usePvAnimation } from '../../composables/board/use-pv-animation';
import { useTransientHint } from '../../composables/useTransientHint';
import { isPasteClick, isMiddleButtonMousedown, pasteModifierLabel } from '../../utils/modifier-key';
const props = defineProps();
const hoveredClusterId = computed(() => {
    if (hoveredIndex.value === null)
        return undefined;
    return suggestions.value.find(s => s.moveIndex === hoveredIndex.value)?.clusterId;
});
const emit = defineEmits();
const { t } = useI18n();
const { setHint, clearHint } = useTransientHint();
// ── Composables ───────────────────────────────────────────────────────────────
const { suggestions, packet, buildPvMoves } = useMoveSuggestions(() => props.currentNodeId);
// Pass the prop as a getter so registry changes to
// `session.ui.pvAnimation` (mode / timings / etc.) reach the live
// composable without requiring a remount of MoveSuggestions.
const { startPv, stopPv, displayStones, cfg: pvCfg } = usePvAnimation(() => props.pvConfig);
const hoveredIndex = ref(null);
// Surface "PV preview is up" to the parent so sibling overlays
// (specifically `BoardWidget`'s game-tree move-number annotation)
// can suppress themselves while the user is reading a hypothetical
// variation. The derived boolean fires only on the
// has-hover ↔ no-hover transition, not on every hover-target
// change within the cluster, so the parent's reactive gate
// toggles once per preview session rather than once per
// suggestion-mouseover.
watch(() => hoveredIndex.value !== null, (active) => emit('pv-preview-active', active));
// ── Logic ─────────────────────────────────────────────────────────────────────
/**
 * Transforms raw PV moves into UI-ready moves with correct move numbering.
 */
function getAnnotatedPv(moveIndex) {
    let pv = buildPvMoves(moveIndex);
    const ann = pvCfg.annotation;
    if (ann === 'fromCurrent' && props.currentMoveNumber !== undefined) {
        pv = pv.map(m => ({
            ...m,
            moveNumber: props.currentMoveNumber + m.moveNumber,
        }));
    }
    return pv;
}
/**
 * Handles the initial hover event.
 */
function onDiskEnter(moveIndex) {
    hoveredIndex.value = moveIndex;
    const pv = getAnnotatedPv(moveIndex);
    // Seed the fingerprint so the packet watcher's first post-hover
    // fire short-circuits when the arriving packet's PV is identical
    // to the one we just rendered (the common case for the same node
    // mid-ponder / mid-range-query). See the watcher block below.
    prevPvFingerprint = pvFingerprint(pv);
    startPv(pv);
    setHint(t('moveSuggestions.pasteHint', { key: pasteModifierLabel() }));
}
/**
 * Real-time Update Guard:
 * When pondering/analysis data arrives, update the displayed stones instantly
 * ONLY if the user is in 'instant' mode. The fingerprint short-circuit prevents
 * the re-render cascade (startPv → clearTimers + new `visible` Set + new
 * `pvMoves` array → `displayStones` invalidation → SVG diff over all PV stones,
 * re-evaluating every stone's `:style` binding) when the arriving packet's PV
 * for the hovered suggestion is structurally identical to the prior one — the
 * common case during a range query, where most packets carry updated visit
 * counts and winrate but the same continuation. Diagnosed in
 * `docs/notes/audit/perf-audit-nav-and-pv-hover-2026-05-27.md` Bug C.
 */
let prevPvFingerprint = '';
function pvFingerprint(pv) {
    return pv.map(m => `${m.x}.${m.y}.${m.color}.${m.moveNumber}`).join('|');
}
watch(packet, () => {
    if (hoveredIndex.value === null || pvCfg.mode !== 'instant')
        return;
    const pv = getAnnotatedPv(hoveredIndex.value);
    const fp = pvFingerprint(pv);
    if (fp === prevPvFingerprint)
        return;
    prevPvFingerprint = fp;
    startPv(pv);
});
/**
 * Navigation Guard:
 * Kill the PV if the board state changes beneath the mouse.
 */
watch(() => props.currentNodeId, () => {
    onLeave();
});
function onLeave() {
    hoveredIndex.value = null;
    stopPv();
    clearHint();
    // Reset the PV-change guard so a fresh hover (even on the same
    // suggestion) starts from a known-empty fingerprint and the
    // initial seed in `onDiskEnter` is the only authority.
    prevPvFingerprint = '';
}
/**
 * Dispatches the click to one of two affordances:
 *  - Modifier-held click (Ctrl on Win/Linux, Cmd on Mac) emits
 *    `paste-pv` with the suggestion's full PV.
 *  - Plain left-click emits `move` with the suggestion's
 *    coordinate, matching the historical behaviour.
 * Middle-click is handled separately on `mousedown` because
 * `click` events are unreliable for the middle button across
 * browsers — see `utils/modifier-key.ts`.
 */
function onSuggestionClick(event, x, y, moveIndex) {
    if (isPasteClick(event)) {
        emit('paste-pv', getAnnotatedPv(moveIndex));
    }
    else {
        emit('move', x, y);
    }
    onLeave();
}
/**
 * Middle-button mousedown handler. Vue's `@click.middle` does not
 * reliably fire across browsers; binding on `mousedown` and
 * filtering on `button === 1` is the portable shape. The
 * `preventDefault()` suppresses the platform default (auto-scroll
 * cursor on Win/Linux).
 */
function onSuggestionMousedown(event, moveIndex) {
    if (!isMiddleButtonMousedown(event))
        return;
    event.preventDefault();
    emit('paste-pv', getAnnotatedPv(moveIndex));
    onLeave();
}
// ── SVG Geometry ──────────────────────────────────────────────────────────────
const pad = computed(() => BOARD_PX / (props.boardSize + 1));
const cell = computed(() => (BOARD_PX - 2 * pad.value) / (props.boardSize - 1));
const stoneR = computed(() => cell.value * STONE_RADIUS_RATIO);
const safeUid = computed(() => props.boardId.replace(/[^a-z0-9]/gi, ''));
function toSvg(x, y) {
    return {
        x: pad.value + x * cell.value,
        y: pad.value + (props.boardSize - 1 - y) * cell.value,
    };
}
// Uniform opacity transition across all modes. Previously this was
// gated on window mode, leaving instant / sequential to snap stones
// in/out — see the composable's header comment for the rationale.
const pvTransition = computed(() => `opacity ${pvCfg.fadeDurationMs}ms ease`);
// Suggestion-ring outline + suggestion-disk fade. Driven by the
// `appearance.moveSuggestionsFadeMs` knob (default 60). Setting to 0
// makes the ring/disk snap; the CSS `0ms ease` shape is the right
// no-op (browser produces no intermediate frames). Previously
// hardcoded as `opacity 60ms ease` literals on the two `:style`
// bindings below — see the pv-overlay-typography-calibration
// work-status item for the original calibration concern (now
// satisfied here: the user chooses the value).
const suggestionTransition = computed(() => `opacity ${props.moveSuggestionsFadeMs ?? 60}ms ease`);
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
    viewBox: (`0 0 ${__VLS_ctx.TOTAL_PX} ${__VLS_ctx.TOTAL_PX}`),
    ...{ class: "suggestions-overlay" },
    'aria-hidden': "true",
});
/** @type {__VLS_StyleScopedClasses['suggestions-overlay']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.defs, __VLS_intrinsics.defs)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
    id: (`gb-${__VLS_ctx.safeUid}`),
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
    id: (`gw-${__VLS_ctx.safeUid}`),
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
__VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
    transform: (`translate(${__VLS_ctx.LABEL_BAND}, ${__VLS_ctx.LABEL_BAND})`),
});
for (const [s] of __VLS_vFor((__VLS_ctx.suggestions))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ onMouseenter: (...[$event]) => {
                __VLS_ctx.onDiskEnter(s.moveIndex);
                // @ts-ignore
                [TOTAL_PX, TOTAL_PX, safeUid, safeUid, LABEL_BAND, LABEL_BAND, suggestions, onDiskEnter,];
            } },
        ...{ onMouseleave: (__VLS_ctx.onLeave) },
        ...{ onClick: ((e) => __VLS_ctx.onSuggestionClick(e, s.x, s.y, s.moveIndex)) },
        ...{ onMousedown: ((e) => __VLS_ctx.onSuggestionMousedown(e, s.moveIndex)) },
        key: (`sugg-${s.x}-${s.y}`),
        ...{ class: "suggestion-group" },
        ...{ style: ({ pointerEvents: (__VLS_ctx.hoveredIndex !== null && s.moveIndex !== __VLS_ctx.hoveredIndex) ? 'none' : 'all' }) },
    });
    /** @type {__VLS_StyleScopedClasses['suggestion-group']} */ ;
    if (s.clusterColor && (__VLS_ctx.showTranspositionRings ?? true)) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            cx: (__VLS_ctx.toSvg(s.x, s.y).x),
            cy: (__VLS_ctx.toSvg(s.x, s.y).y),
            r: (__VLS_ctx.stoneR * 1.01),
            fill: "none",
            stroke: (s.clusterColor),
            'stroke-width': "2.5",
            ...{ style: ({
                    opacity: (__VLS_ctx.hoveredIndex === null || s.moveIndex === __VLS_ctx.hoveredIndex || (s.clusterId !== undefined && s.clusterId === __VLS_ctx.hoveredClusterId)) ? 0.8 : 0,
                    transition: __VLS_ctx.suggestionTransition,
                }) },
        });
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: (__VLS_ctx.toSvg(s.x, s.y).x),
        cy: (__VLS_ctx.toSvg(s.x, s.y).y),
        r: (__VLS_ctx.stoneR),
        fill: (s.color),
        ...{ class: "suggestion-disk" },
        ...{ style: ({
                opacity: __VLS_ctx.hoveredIndex !== null ? 0 : 1,
                transition: __VLS_ctx.suggestionTransition,
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['suggestion-disk']} */ ;
    if (__VLS_ctx.hoveredIndex === null) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
            x: (__VLS_ctx.toSvg(s.x, s.y).x),
            y: (__VLS_ctx.toSvg(s.x, s.y).y + 1),
            ...{ class: "suggestion-label" },
            'font-size': (__VLS_ctx.stoneR * 0.59),
            'dominant-baseline': "middle",
            fill: (s.isBest ? '#003040' : '#000'),
        });
        /** @type {__VLS_StyleScopedClasses['suggestion-label']} */ ;
        (s.winrateLabel);
    }
    if (s.isBest && __VLS_ctx.hoveredIndex === null) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
            x: (__VLS_ctx.toSvg(s.x, s.y).x),
            y: (__VLS_ctx.toSvg(s.x, s.y).y + __VLS_ctx.stoneR * 0.62),
            ...{ class: "suggestion-label" },
            'font-size': (__VLS_ctx.stoneR * 0.58),
            'dominant-baseline': "middle",
            fill: "#003040",
            opacity: "0.75",
        });
        /** @type {__VLS_StyleScopedClasses['suggestion-label']} */ ;
        (s.scoreLabel);
    }
    // @ts-ignore
    [onLeave, onSuggestionClick, onSuggestionMousedown, hoveredIndex, hoveredIndex, hoveredIndex, hoveredIndex, hoveredIndex, hoveredIndex, hoveredIndex, showTranspositionRings, toSvg, toSvg, toSvg, toSvg, toSvg, toSvg, toSvg, toSvg, stoneR, stoneR, stoneR, stoneR, stoneR, hoveredClusterId, suggestionTransition, suggestionTransition,];
}
for (const [stone] of __VLS_vFor((__VLS_ctx.displayStones))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        key: (`pv-${stone.moveNumber}`),
        ...{ class: "pv-stone-group" },
    });
    /** @type {__VLS_StyleScopedClasses['pv-stone-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: (__VLS_ctx.toSvg(stone.x, stone.y).x),
        cy: (__VLS_ctx.toSvg(stone.x, stone.y).y),
        r: (__VLS_ctx.stoneR),
        fill: (stone.color === 'B' ? `url(#gb-${__VLS_ctx.safeUid})` : `url(#gw-${__VLS_ctx.safeUid})`),
        stroke: (stone.color === 'B' ? '#000' : '#aaa'),
        'stroke-width': "0.5",
        ...{ style: ({ opacity: stone.opacity, transition: __VLS_ctx.pvTransition }) },
    });
    if (__VLS_ctx.pvCfg.annotation !== 'none') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
            x: (__VLS_ctx.toSvg(stone.x, stone.y).x),
            y: (__VLS_ctx.toSvg(stone.x, stone.y).y + 1),
            ...{ class: "pv-label" },
            'font-size': (__VLS_ctx.stoneR * 0.82),
            'dominant-baseline': "middle",
            fill: (stone.color === 'B' ? '#e8e8e8' : '#1a1a1a'),
            ...{ style: ({ opacity: stone.opacity, transition: __VLS_ctx.pvTransition }) },
        });
        /** @type {__VLS_StyleScopedClasses['pv-label']} */ ;
        (stone.moveNumber);
    }
    // @ts-ignore
    [safeUid, safeUid, toSvg, toSvg, toSvg, toSvg, stoneR, stoneR, displayStones, pvTransition, pvTransition, pvCfg,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
