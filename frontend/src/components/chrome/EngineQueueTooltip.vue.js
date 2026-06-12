/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQueryTelemetry } from '../../composables/useQueryTelemetry';
import { useHoverPopover } from '../../composables/chrome/useHoverPopover';
import { usePopoverEdgeClamp } from '../../composables/chrome/usePopoverEdgeClamp';
import { createTrailingThrottle } from '../../composables/useThrottledSnapshot';
import { QUEUE_TOOLTIP_REDRAW_THROTTLE_MS } from '../../lib/timing';
const { t } = useI18n();
const { inFlight, cancelQuery } = useQueryTelemetry();
const { open, onMouseEnter, onMouseLeave } = useHoverPopover({ devId: 'queue' });
// `left: 0`-anchored — the composable handles both anchor
// directions symmetrically (clamps the offending edge whichever
// it is); no per-popover direction config needed.
const { setPopoverEl, xShift } = usePopoverEdgeClamp(open);
const count = computed(() => inFlight.value.length);
function onCancelClick(queryId) {
    cancelQuery(queryId);
}
function fmtEta(ms) {
    if (ms === null || !Number.isFinite(ms))
        return t('toolbar.queue.etaUnknown');
    if (ms < 1000)
        return `${Math.max(0, Math.round(ms))}ms`;
    if (ms < 60_000)
        return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    return `${m}m ${s.toString().padStart(2, '0')}s`;
}
function fmtKind(kind) {
    // Localised mapping; falls back to the raw kind if a key is
    // missing (defensive — kinds added later that haven't been
    // catalogued in the locale still render rather than blanking).
    const key = `toolbar.queue.kind.${kind}`;
    const translated = t(key);
    return translated === key ? kind : translated;
}
function fmtModel(model) {
    return model ?? t('toolbar.queue.modelDefault');
}
function fmtProgress(q) {
    if (q.turnsTotal > 1) {
        return t('toolbar.queue.progressTurns', {
            done: q.progress.turnsCompleted,
            total: q.turnsTotal,
        });
    }
    // Single-turn queries report ongoing visit count. The visits
    // ceiling is shown as the denominator when known; otherwise
    // just the current count.
    const visits = q.progress.currentTurnVisits;
    const ceiling = q.visitsPerTurn;
    return ceiling !== null
        ? `${visits.toLocaleString()} / ${ceiling.toLocaleString()}`
        : visits.toLocaleString();
}
const displayRows = ref([]);
function rebuildRows() {
    displayRows.value = inFlight.value.map((q) => ({
        queryId: q.queryId,
        kindText: fmtKind(q.kind),
        label: q.label,
        modelText: fmtModel(q.model),
        progressText: fmtProgress(q),
        etaText: fmtEta(q.etaMs),
        canCancel: q.cancel !== undefined,
    }));
}
// Shared trailing throttle (the subscriber-projection mechanism), but gated:
// a closed popover's list isn't rendered, so don't rebuild when closed —
// schedule only while open. `inFlight` is replaced wholesale per packet, so
// the watch fires per packet; the throttle coalesces to ~4 Hz.
const rowsThrottle = createTrailingThrottle(rebuildRows, QUEUE_TOOLTIP_REDRAW_THROTTLE_MS);
watch(inFlight, () => { if (open.value)
    rowsThrottle.schedule(); });
// Seed synchronously on open (bypassing the throttle) so the list is fresh
// the instant the popover shows; the default 'pre' flush runs before the
// popover renders, so there's no stale/empty flash.
watch(open, (isOpen) => { if (isOpen)
    rebuildRows(); });
onUnmounted(rowsThrottle.cancel);
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['queue-metric']} */ ;
/** @type {__VLS_StyleScopedClasses['queue-metric']} */ ;
/** @type {__VLS_StyleScopedClasses['m-val']} */ ;
/** @type {__VLS_StyleScopedClasses['cancel-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onMouseenter: (__VLS_ctx.onMouseEnter) },
    ...{ onMouseleave: (__VLS_ctx.onMouseLeave) },
    ...{ class: "metric queue-metric" },
    ...{ class: ({ 'queue-active': __VLS_ctx.count > 0 }) },
});
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['queue-metric']} */ ;
/** @type {__VLS_StyleScopedClasses['queue-active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-lbl" },
});
/** @type {__VLS_StyleScopedClasses['m-lbl']} */ ;
(__VLS_ctx.$t('toolbar.metric.queue'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-val queue-count" },
});
/** @type {__VLS_StyleScopedClasses['m-val']} */ ;
/** @type {__VLS_StyleScopedClasses['queue-count']} */ ;
(__VLS_ctx.count);
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: (__VLS_ctx.setPopoverEl),
        ...{ class: "queue-popover" },
        role: "tooltip",
        ...{ style: ({ transform: `translateX(${__VLS_ctx.xShift}px)` }) },
    });
    /** @type {__VLS_StyleScopedClasses['queue-popover']} */ ;
    if (__VLS_ctx.displayRows.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "popover-empty" },
        });
        /** @type {__VLS_StyleScopedClasses['popover-empty']} */ ;
        (__VLS_ctx.$t('toolbar.queue.empty'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "popover-table" },
        });
        /** @type {__VLS_StyleScopedClasses['popover-table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "popover-header" },
        });
        /** @type {__VLS_StyleScopedClasses['popover-header']} */ ;
        (__VLS_ctx.$t('toolbar.queue.header', { n: __VLS_ctx.displayRows.length }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('toolbar.queue.col.kind'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('toolbar.queue.col.model'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('toolbar.queue.col.progress'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "eta-col" },
        });
        /** @type {__VLS_StyleScopedClasses['eta-col']} */ ;
        (__VLS_ctx.$t('toolbar.queue.col.eta'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "cancel-col" },
        });
        /** @type {__VLS_StyleScopedClasses['cancel-col']} */ ;
        (__VLS_ctx.$t('toolbar.queue.col.cancel'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [row] of __VLS_vFor((__VLS_ctx.displayRows))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (row.queryId),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "kind-label" },
            });
            /** @type {__VLS_StyleScopedClasses['kind-label']} */ ;
            (row.kindText);
            if (row.label) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "kind-suffix" },
                });
                /** @type {__VLS_StyleScopedClasses['kind-suffix']} */ ;
                (row.label);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.modelText);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.progressText);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "eta-col" },
            });
            /** @type {__VLS_StyleScopedClasses['eta-col']} */ ;
            (row.etaText);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "cancel-col" },
            });
            /** @type {__VLS_StyleScopedClasses['cancel-col']} */ ;
            if (row.canCancel) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.open))
                                return;
                            if (!!(__VLS_ctx.displayRows.length === 0))
                                return;
                            if (!(row.canCancel))
                                return;
                            __VLS_ctx.onCancelClick(row.queryId);
                            // @ts-ignore
                            [onMouseEnter, onMouseLeave, count, count, $t, $t, $t, $t, $t, $t, $t, $t, open, setPopoverEl, xShift, displayRows, displayRows, displayRows, onCancelClick,];
                        } },
                    ...{ class: "cancel-btn" },
                    title: (__VLS_ctx.$t('toolbar.queue.cancel')),
                    'aria-label': (__VLS_ctx.$t('toolbar.queue.cancel')),
                });
                /** @type {__VLS_StyleScopedClasses['cancel-btn']} */ ;
            }
            // @ts-ignore
            [$t, $t,];
        }
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
