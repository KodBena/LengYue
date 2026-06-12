/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PboPopover from '../qeubo/PboPopover.vue';
import ToolbarEngineMetrics from './ToolbarEngineMetrics.vue';
import ToolbarSliderPopover from './ToolbarSliderPopover.vue';
import { useEngineControls } from '../../composables/useEngineControls';
import { useAutoNavigatePerf } from '../../composables/useAutoNavigatePerf';
import { useAutoPopoverPerf } from '../../composables/useAutoPopoverPerf';
const { t } = useI18n();
// RB-1 (App-decouple from engine metrics —
// docs/notes/perf-audit-range-query-nav-2026-05-29.md): status/metrics are
// self-sourced via useEngineControls (store-backed computeds) rather than
// received as props. The live PPS / latency / winrate / scoreLead / watchdog
// telemetry — the per-packet/per-tick reads — now lives in the
// <ToolbarEngineMetrics> leaf below, so this Toolbar reads only `isConnected`
// (low-frequency) and no longer re-renders per packet during analysis.
const { isConnected, clearCache } = useEngineControls();
// Dev affordance: the clear-cache button (cold-cache benchmarking) only
// renders in dev builds. import.meta.env.DEV is statically folded, so the
// button and its handler dead-code-eliminate in production.
const isDevBuild = import.meta.env.DEV;
// Dev affordance: auto-navigate-for-perf-capture harness. Obtained
// unconditionally (matching clearCache above); the button is dev-gated, so
// the loop is unreachable in production and start() never fires there.
const { isRunning: autoNavRunning, toggle: toggleAutoNav } = useAutoNavigatePerf();
// Dev affordance: popover-stress harness — toggles a popover open/closed at a
// fixed cadence while a range query streams (for the popover-sluggishness
// measurement). Targets the queue tooltip; swap the arg for 'sliders'.
const { isRunning: popoverStressRunning, toggle: togglePopoverStress } = useAutoPopoverPerf();
const props = defineProps();
const emit = defineEmits();
// isConnected is destructured from useEngineControls() above (RB-1).
// Symmetric verb pairing with the disconnected label; the connected
// branch previously read 'Engine', which left the action ambiguous.
const engineBtnLabel = computed(() => isConnected.value ? t('toolbar.disconnect') : t('toolbar.connect'));
// Single state-driven button: MATCH opens the modal when idle, STOP
// MATCH cancels the cooperative-stop signal when a match is running.
// Two roles on one chrome slot keeps the toolbar compact and avoids
// surfacing a stop button that never fires for users who don't use
// engine matches.
const matchBtnLabel = computed(() => props.isMatchRunning ? t('toolbar.stopMatch') : t('toolbar.match'));
function onMatchClick() {
    if (props.isMatchRunning)
        emit('stop-match');
    else
        emit('open-match');
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
    ...{ class: "toolbar" },
});
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "toolbar-title" },
});
/** @type {__VLS_StyleScopedClasses['toolbar-title']} */ ;
(__VLS_ctx.title);
if (__VLS_ctx.isConnected) {
    const __VLS_0 = ToolbarEngineMetrics;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
const __VLS_5 = ToolbarSliderPopover;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({}));
const __VLS_7 = __VLS_6({}, ...__VLS_functionalComponentArgsRest(__VLS_6));
const __VLS_10 = PboPopover;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({}));
const __VLS_12 = __VLS_11({}, ...__VLS_functionalComponentArgsRest(__VLS_11));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "engine-controls" },
});
/** @type {__VLS_StyleScopedClasses['engine-controls']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('mint-card');
            // @ts-ignore
            [title, isConnected, emit,];
        } },
    ...{ class: "toolbar-btn highlight-btn" },
});
/** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['highlight-btn']} */ ;
(__VLS_ctx.$t('toolbar.mintCard'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('open-play');
            // @ts-ignore
            [emit, $t,];
        } },
    ...{ class: "toolbar-btn" },
});
/** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
(__VLS_ctx.$t('toolbar.play'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.onMatchClick) },
    ...{ class: "toolbar-btn" },
    ...{ class: ({ 'btn-stop-match': __VLS_ctx.isMatchRunning }) },
});
/** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-stop-match']} */ ;
(__VLS_ctx.matchBtnLabel);
if (__VLS_ctx.isDevBuild) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.clearCache) },
        ...{ class: "toolbar-btn" },
        disabled: (!__VLS_ctx.isConnected),
        title: (__VLS_ctx.$t('engine.clearCache.title')),
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    (__VLS_ctx.$t('toolbar.clearCache'));
}
if (__VLS_ctx.isDevBuild) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.toggleAutoNav) },
        ...{ class: "toolbar-btn" },
        ...{ class: ({ 'btn-connected': __VLS_ctx.autoNavRunning }) },
        title: (__VLS_ctx.$t('toolbar.autoNavPerf.title')),
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-connected']} */ ;
    (__VLS_ctx.autoNavRunning ? __VLS_ctx.$t('toolbar.autoNavPerf.stop') : __VLS_ctx.$t('toolbar.autoNavPerf.start'));
}
if (__VLS_ctx.isDevBuild) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isDevBuild))
                    return;
                __VLS_ctx.togglePopoverStress('queue');
                // @ts-ignore
                [isConnected, $t, $t, $t, $t, $t, $t, onMatchClick, isMatchRunning, matchBtnLabel, isDevBuild, isDevBuild, isDevBuild, clearCache, toggleAutoNav, autoNavRunning, autoNavRunning, togglePopoverStress,];
            } },
        ...{ class: "toolbar-btn" },
        ...{ class: ({ 'btn-connected': __VLS_ctx.popoverStressRunning }) },
        title: (__VLS_ctx.$t('toolbar.popoverStress.title')),
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-connected']} */ ;
    (__VLS_ctx.popoverStressRunning ? __VLS_ctx.$t('toolbar.popoverStress.stop') : __VLS_ctx.$t('toolbar.popoverStress.start'));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('toggle-engine');
            // @ts-ignore
            [emit, $t, $t, $t, popoverStressRunning, popoverStressRunning,];
        } },
    ...{ class: "toolbar-btn" },
    ...{ class: ({ 'btn-connected': __VLS_ctx.isConnected }) },
});
/** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-connected']} */ ;
(__VLS_ctx.engineBtnLabel);
// @ts-ignore
[isConnected, engineBtnLabel,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
