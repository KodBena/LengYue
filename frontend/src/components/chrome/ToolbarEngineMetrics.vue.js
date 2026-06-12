/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { useThrottledSnapshot } from '../../composables/useThrottledSnapshot';
import { useI18n } from 'vue-i18n';
import EngineQueueTooltip from './EngineQueueTooltip.vue';
import { store, setSelectedModel, activeBoard } from '../../store';
import { activeAnalysisKeys } from '../../state/analysis-config';
import { ledger } from '../../state/analysis-ledger';
import { useEngineControls } from '../../composables/useEngineControls';
import { TOOLBAR_METRICS_REDRAW_THROTTLE_MS } from '../../lib/timing';
const { t } = useI18n();
// Self-sourced here rather than in the parent Toolbar (RB-1 routed it through
// Toolbar; this leaf is the next step so the per-tick metric reads no longer
// re-render the whole toolbar). Mounted only while connected, so no
// `isConnected` gate is needed inside this component.
const { metrics } = useEngineControls();
// Two distinct watchdog-dot modes, gated by
// `session.ui.watchdogColorTransition`:
//
//   - OFF (default): sample-driven. Dot reads `latencyMs` from
//     the most recent watchdog poll (5000ms cadence) and flips
//     green/red on the threshold. Colour persists until the next
//     sample replaces the value. This is the historical
//     behaviour the codebase shipped with.
//
//   - ON: ping-tandem. Dot starts an animation when each
//     watchdog `query_version` ping is sent (`pingPendingSince`
//     non-null) and resets to green when the pong returns
//     (`pingPendingSince` null). The animation fades from green
//     toward red over a duration tuned to make a fast pong barely
//     visible and a slow / never-arriving pong fully red. Class
//     applied on the dot triggers the keyframe; class removed
//     snaps the dot back to green per the keyframe's
//     `animation-fill-mode: forwards` interaction with the
//     class-toggle.
//
// The threshold is sourced from the registry leaf promoted in
// the knob-registry Phase 6 sweep (was a hardcoded
// `WATCHDOG_LATENCY_THRESHOLD_MS = 500` const). KataGo's proxy
// returns `query_version` in single-digit ms when idle and
// hundreds-of-ms when concurrent analyses serialise the proxy's
// command queue behind heavy-analyze responses — 500ms is the
// hand-tuned "the engine is busy enough that the user should
// notice" point; users on slower networks can raise it. Drives
// via the `engine.watchdog-latency-threshold-ms` KnobDecl.
const watchdogClasses = computed(() => {
    if (store.session.ui.watchdogColorTransition) {
        return metrics.value.pingPendingSince !== null
            ? 'watchdog-pinging'
            : '';
    }
    return metrics.value.latencyMs >= store.profile.settings.engine.katago.watchdogLatencyThresholdMs
        ? 'watchdog-bad'
        : '';
});
// Bind the keyframe duration to the registry-promoted leaf
// (knob-registry Phase 3a). The CSS rule for `.watchdog-pinging`
// reads `var(--watchdog-animation-ms)` for the animation duration;
// the inline custom property here sources from
// `engine.katago.watchdogAnimationMs` and is driven by the
// `engine.watchdog-animation-ms` KnobDecl. Inline binding rather
// than a stylesheet rule so the property scopes to the dot and
// updates reactively without a watcher.
const watchdogStyle = computed(() => ({
    '--watchdog-animation-ms': `${store.profile.settings.engine.katago.watchdogAnimationMs}ms`,
}));
// Engine identity (KataGo `query_version` + `query_models` probe).
// Two separate slots — VERSION and MODEL — each with its own
// hover tooltip showing the full corresponding probe payload.
// The model slot's render shape varies by proxy role:
//
//   - LEAF / RELAY / ECHO (or SELECTOR-not-advertised): static
//     label showing `models[0].internalName` (KataGo's short
//     self-identifier — short and path-free, suitable for
//     streaming / screenshare contexts).
//   - SELECTOR (capabilities.selector advertised): `<select>`
//     dropdown sourced from `engine.info.availableModels` (each
//     entry's `label` field). Selection writes to
//     `engine.selectedModel` via the named mutator and persists
//     through SyncService.
//
// In both modes the slot's hover tooltip surfaces the full
// `query_models` payload (including the privacy-concerning `name`
// field on LEAF mode) for debugging.
const engineInternalName = computed(() => store.engine.info.internalName);
const engineVersion = computed(() => store.engine.info.version);
const isSelectorMode = computed(() => {
    const caps = store.engine.info.capabilities;
    return caps !== null && 'selector' in caps;
});
const availableModels = computed(() => store.engine.info.availableModels);
const selectedModel = computed(() => store.engine.selectedModel);
function onSelectModel(event) {
    const target = event.target; // DOM: handler bound on the model <select>, so target is that element
    setSelectedModel(target.value || null);
    // Return focus to the document body so the global space-bar
    // ponder toggle (wired in `useUserIORegistry`) fires correctly
    // on the next keystroke. Without the blur, focus stays on the
    // <select>, and `useUserIORegistry`'s `HTMLSelectElement` guard
    // bails on the keydown — the user's "pick model, press space"
    // workflow then needs an intervening click outside the toolbar.
    target.blur();
}
const versionTooltip = computed(() => {
    const payload = store.engine.info.versionPayload;
    return payload
        ? `query_version response:\n${JSON.stringify(payload, null, 2)}`
        : t('toolbar.engineVersionTooltipPending');
});
const modelTooltip = computed(() => {
    const payload = store.engine.info.modelsPayload;
    return payload
        ? `query_models response:\n${JSON.stringify(payload, null, 2)}`
        : t('toolbar.engineModelTooltipPending');
});
// Live engine-evaluation surface — slim-tier preview of the
// "user-captured rootInfo display" arc. Reads winrate and
// scoreLead directly from the canonical packet for the active
// board's current node so the user can sense the engine's
// view without activating move-suggestions and reading the blue
// spot. The fuller arc (user picks which scalars + framing via
// a filter-expression-style compiler, analogous to
// `moveFilterExpression`) is its own future work unit; this
// surface is two hardcoded metrics with W-framed display
// matching the SPA-wide canonical framing in
// `engine/katago/winrate-framing.ts`. When the fuller arc
// lands, this fixed pair retires in favour of the configurable
// slot.
//
// Reactive shape: `ledger.getRaw(hash, nodeId)` registers a
// per-node version-ref dependency on the read, so the display
// re-evaluates whenever the current node's packet is bumped by
// `analysis-service::onAnalysisUpdate`. Hash separation across
// config swaps mirrors `use-move-suggestions.ts:78`'s
// established precedent.
const rootInfo = computed(() => {
    const board = activeBoard.value;
    if (!board)
        return null;
    const packet = ledger.getRaw(activeAnalysisKeys.value.rawKey, board.currentNodeId);
    return packet?.rootInfo ?? null;
});
const winrateDisplay = computed(() => {
    const r = rootInfo.value;
    if (!r || !Number.isFinite(r.winrate))
        return '—';
    return `${(r.winrate * 100).toFixed(1)}%`;
});
const scoreLeadDisplay = computed(() => {
    const r = rootInfo.value;
    if (!r || !Number.isFinite(r.scoreLead))
        return '—';
    const sign = r.scoreLead >= 0 ? '+' : '';
    return `${sign}${r.scoreLead.toFixed(1)}`;
});
const liveMetrics = computed(() => ({
    winrate: winrateDisplay.value,
    scoreLead: scoreLeadDisplay.value,
    pps: metrics.value.packetsPerSecond,
    latency: metrics.value.latencyMs,
}));
const displayed = useThrottledSnapshot(liveMetrics, TOOLBAR_METRICS_REDRAW_THROTTLE_MS);
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['watchdog-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['watchdog-dot']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "engine-metrics-bar" },
});
/** @type {__VLS_StyleScopedClasses['engine-metrics-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "metric engine-identity" },
    title: (__VLS_ctx.versionTooltip),
});
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['engine-identity']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-lbl" },
});
/** @type {__VLS_StyleScopedClasses['m-lbl']} */ ;
(__VLS_ctx.$t('toolbar.metric.version'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-val engine-version-val" },
});
/** @type {__VLS_StyleScopedClasses['m-val']} */ ;
/** @type {__VLS_StyleScopedClasses['engine-version-val']} */ ;
(__VLS_ctx.engineVersion !== null ? `v${__VLS_ctx.engineVersion}` : '—');
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "metric engine-identity" },
    title: (__VLS_ctx.modelTooltip),
});
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['engine-identity']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-lbl" },
});
/** @type {__VLS_StyleScopedClasses['m-lbl']} */ ;
(__VLS_ctx.$t('toolbar.metric.model'));
if (__VLS_ctx.isSelectorMode) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (__VLS_ctx.onSelectModel) },
        ...{ class: "m-val engine-id-val engine-model-select" },
        value: (__VLS_ctx.selectedModel ?? ''),
    });
    /** @type {__VLS_StyleScopedClasses['m-val']} */ ;
    /** @type {__VLS_StyleScopedClasses['engine-id-val']} */ ;
    /** @type {__VLS_StyleScopedClasses['engine-model-select']} */ ;
    for (const [entry] of __VLS_vFor((__VLS_ctx.availableModels))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (entry.label),
            value: (entry.label),
            disabled: (!entry.healthy),
            title: (entry.healthy ? entry.label : __VLS_ctx.t('toolbar.modelUnavailable', { label: entry.label })),
        });
        (entry.label);
        (entry.healthy ? '' : ' (unavailable)');
        // @ts-ignore
        [versionTooltip, $t, $t, engineVersion, engineVersion, modelTooltip, isSelectorMode, onSelectModel, selectedModel, availableModels, t,];
    }
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "m-val engine-id-val" },
    });
    /** @type {__VLS_StyleScopedClasses['m-val']} */ ;
    /** @type {__VLS_StyleScopedClasses['engine-id-val']} */ ;
    (__VLS_ctx.engineInternalName ?? '—');
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "metric" },
    title: (__VLS_ctx.$t('toolbar.metric.winrateTooltip')),
});
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-lbl" },
});
/** @type {__VLS_StyleScopedClasses['m-lbl']} */ ;
(__VLS_ctx.$t('toolbar.metric.winrate'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-val eval-val" },
});
/** @type {__VLS_StyleScopedClasses['m-val']} */ ;
/** @type {__VLS_StyleScopedClasses['eval-val']} */ ;
(__VLS_ctx.displayed.winrate);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "metric" },
    title: (__VLS_ctx.$t('toolbar.metric.scoreLeadTooltip')),
});
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-lbl" },
});
/** @type {__VLS_StyleScopedClasses['m-lbl']} */ ;
(__VLS_ctx.$t('toolbar.metric.scoreLead'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-val eval-val" },
});
/** @type {__VLS_StyleScopedClasses['m-val']} */ ;
/** @type {__VLS_StyleScopedClasses['eval-val']} */ ;
(__VLS_ctx.displayed.scoreLead);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "metric" },
});
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-lbl" },
});
/** @type {__VLS_StyleScopedClasses['m-lbl']} */ ;
(__VLS_ctx.$t('toolbar.metric.pps'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-val" },
});
/** @type {__VLS_StyleScopedClasses['m-val']} */ ;
(__VLS_ctx.displayed.pps);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "metric" },
});
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-lbl" },
});
/** @type {__VLS_StyleScopedClasses['m-lbl']} */ ;
(__VLS_ctx.$t('toolbar.metric.latency'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-val" },
});
/** @type {__VLS_StyleScopedClasses['m-val']} */ ;
(__VLS_ctx.$t('toolbar.metric.latencyValue', { ms: __VLS_ctx.displayed.latency }));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "metric" },
});
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-lbl" },
});
/** @type {__VLS_StyleScopedClasses['m-lbl']} */ ;
(__VLS_ctx.$t('toolbar.metric.watchdog'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-val watchdog-dot" },
    ...{ class: (__VLS_ctx.watchdogClasses) },
    ...{ style: (__VLS_ctx.watchdogStyle) },
});
/** @type {__VLS_StyleScopedClasses['m-val']} */ ;
/** @type {__VLS_StyleScopedClasses['watchdog-dot']} */ ;
const __VLS_0 = EngineQueueTooltip;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
// @ts-ignore
[$t, $t, $t, $t, $t, $t, $t, $t, engineInternalName, displayed, displayed, displayed, displayed, watchdogClasses, watchdogStyle,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
