/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQeubo } from '../../composables/useQeubo';
import { useHoverPopover } from '../../composables/chrome/useHoverPopover';
import { usePopoverEdgeClamp } from '../../composables/chrome/usePopoverEdgeClamp';
import { pushSystemMessage } from '../../store';
const { t } = useI18n();
const q = useQeubo();
const { open, onMouseEnter, onMouseLeave } = useHoverPopover();
// `right: 0`-anchored — see usePopoverEdgeClamp's behaviour notes.
const { setPopoverEl, xShift } = usePopoverEdgeClamp(open);
// Render gate: hide entirely when calibration is disabled (503 from
// the backend) or the user has no experiment configured. Same
// predicate as the legacy QeuboToolbar's `visible` computed.
const visible = computed(() => q.calibrationEnabled.value === true && q.experimentExists.value);
const hasPair = computed(() => q.currentPair.value !== null);
const verdictDisabled = computed(() => q.isBusy.value || !hasPair.value);
const applyVisible = computed(() => q.toolbarView.value !== 'applied');
const phaseLabel = computed(() => {
    const init = q.initProgress.value;
    if (init)
        return t('qeubo.phase.init', { done: init.done, total: init.total });
    const opt = q.optimizationProgress.value;
    if (opt)
        return t('qeubo.phase.iter', { n: opt.iteration });
    return '';
});
const phaseTooltip = computed(() => t('qeubo.phaseTooltip'));
function formatParams(params) {
    const entries = Object.entries(params);
    if (entries.length === 0)
        return '{}';
    return `{${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}}`;
}
const paramsDebug = computed(() => {
    const view = q.toolbarView.value;
    const a = formatParams(q.appliedParameterValues.value);
    const e = formatParams(q.effectiveParameterValues.value);
    return `view=${view}  applied=${a}  effective=${e}`;
});
// Local toggle for the inline parameter readout. Component-local
// since debug visibility is a per-session preference, not part of
// the PBO state model.
const debugVisible = ref(false);
function setView(v) {
    q.toolbarView.value = v;
}
async function onVerdict(preferred) {
    try {
        await q.submitPreference(preferred);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pushSystemMessage('error', t('qeubo.systemMessage.verdictFailed', { msg }));
    }
}
function onApply() {
    try {
        q.applyEffective();
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pushSystemMessage('error', t('qeubo.systemMessage.applyFailed', { msg }));
    }
}
function onPin() {
    const name = window.prompt(t('qeubo.prompt.bookmarkName'));
    if (name === null)
        return;
    try {
        q.pinCurrent(name);
        pushSystemMessage('info', t('qeubo.systemMessage.bookmarkSaved', { name: name.trim() }));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pushSystemMessage('error', t('qeubo.systemMessage.pinFailed', { msg }));
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['pbo-metric']} */ ;
/** @type {__VLS_StyleScopedClasses['pbo-metric']} */ ;
/** @type {__VLS_StyleScopedClasses['m-val']} */ ;
/** @type {__VLS_StyleScopedClasses['seg-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['seg-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['seg-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['verdict-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['apply-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['pin-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['apply-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['debug-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
if (__VLS_ctx.visible) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onMouseenter: (__VLS_ctx.onMouseEnter) },
        ...{ onMouseleave: (__VLS_ctx.onMouseLeave) },
        ...{ class: "metric pbo-metric" },
    });
    /** @type {__VLS_StyleScopedClasses['metric']} */ ;
    /** @type {__VLS_StyleScopedClasses['pbo-metric']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "m-lbl" },
    });
    /** @type {__VLS_StyleScopedClasses['m-lbl']} */ ;
    (__VLS_ctx.$t('toolbar.metric.pbo'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "m-val pbo-phase" },
        ...{ class: ({ 'pbo-phase-idle': !__VLS_ctx.phaseLabel }) },
    });
    /** @type {__VLS_StyleScopedClasses['m-val']} */ ;
    /** @type {__VLS_StyleScopedClasses['pbo-phase']} */ ;
    /** @type {__VLS_StyleScopedClasses['pbo-phase-idle']} */ ;
    (__VLS_ctx.phaseLabel || '—');
    if (__VLS_ctx.q.isBusy.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "busy-dot" },
            'aria-label': (__VLS_ctx.$t('qeubo.aria.busy')),
        });
        /** @type {__VLS_StyleScopedClasses['busy-dot']} */ ;
    }
    if (__VLS_ctx.open) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: (__VLS_ctx.setPopoverEl),
            ...{ class: "pbo-popover" },
            role: "tooltip",
            ...{ style: ({ transform: `translateX(${__VLS_ctx.xShift}px)` }) },
        });
        /** @type {__VLS_StyleScopedClasses['pbo-popover']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "seg-toggle" },
            role: "radiogroup",
            'aria-label': (__VLS_ctx.$t('qeubo.aria.auditionView')),
        });
        /** @type {__VLS_StyleScopedClasses['seg-toggle']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.visible))
                        return;
                    if (!(__VLS_ctx.open))
                        return;
                    __VLS_ctx.setView('applied');
                    // @ts-ignore
                    [visible, onMouseEnter, onMouseLeave, $t, $t, $t, phaseLabel, phaseLabel, q, open, setPopoverEl, xShift, setView,];
                } },
            type: "button",
            ...{ class: "seg-btn" },
            ...{ class: ({ active: __VLS_ctx.q.toolbarView.value === 'applied' }) },
            disabled: (__VLS_ctx.q.isBusy.value),
            role: "radio",
            'aria-checked': (__VLS_ctx.q.toolbarView.value === 'applied'),
            title: (__VLS_ctx.$t('qeubo.tooltip.applied')),
        });
        /** @type {__VLS_StyleScopedClasses['seg-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (__VLS_ctx.$t('qeubo.label.applied'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.visible))
                        return;
                    if (!(__VLS_ctx.open))
                        return;
                    __VLS_ctx.setView('A');
                    // @ts-ignore
                    [$t, $t, q, q, q, setView,];
                } },
            type: "button",
            ...{ class: "seg-btn" },
            ...{ class: ({ active: __VLS_ctx.q.toolbarView.value === 'A' }) },
            disabled: (__VLS_ctx.q.isBusy.value || !__VLS_ctx.hasPair),
            role: "radio",
            'aria-checked': (__VLS_ctx.q.toolbarView.value === 'A'),
            title: (__VLS_ctx.$t('qeubo.tooltip.candidateA')),
        });
        /** @type {__VLS_StyleScopedClasses['seg-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.visible))
                        return;
                    if (!(__VLS_ctx.open))
                        return;
                    __VLS_ctx.setView('B');
                    // @ts-ignore
                    [$t, q, q, q, setView, hasPair,];
                } },
            type: "button",
            ...{ class: "seg-btn" },
            ...{ class: ({ active: __VLS_ctx.q.toolbarView.value === 'B' }) },
            disabled: (__VLS_ctx.q.isBusy.value || !__VLS_ctx.hasPair),
            role: "radio",
            'aria-checked': (__VLS_ctx.q.toolbarView.value === 'B'),
            title: (__VLS_ctx.$t('qeubo.tooltip.candidateB')),
        });
        /** @type {__VLS_StyleScopedClasses['seg-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        if (__VLS_ctx.hasPair) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "verdict-pair" },
            });
            /** @type {__VLS_StyleScopedClasses['verdict-pair']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.visible))
                            return;
                        if (!(__VLS_ctx.open))
                            return;
                        if (!(__VLS_ctx.hasPair))
                            return;
                        __VLS_ctx.onVerdict(0);
                        // @ts-ignore
                        [$t, q, q, q, hasPair, hasPair, onVerdict,];
                    } },
                type: "button",
                ...{ class: "verdict-btn" },
                disabled: (__VLS_ctx.verdictDisabled),
                title: (__VLS_ctx.$t('qeubo.tooltip.preferA')),
            });
            /** @type {__VLS_StyleScopedClasses['verdict-btn']} */ ;
            (__VLS_ctx.$t('qeubo.label.preferA'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.visible))
                            return;
                        if (!(__VLS_ctx.open))
                            return;
                        if (!(__VLS_ctx.hasPair))
                            return;
                        __VLS_ctx.onVerdict(1);
                        // @ts-ignore
                        [$t, $t, onVerdict, verdictDisabled,];
                    } },
                type: "button",
                ...{ class: "verdict-btn" },
                disabled: (__VLS_ctx.verdictDisabled),
                title: (__VLS_ctx.$t('qeubo.tooltip.preferB')),
            });
            /** @type {__VLS_StyleScopedClasses['verdict-btn']} */ ;
            (__VLS_ctx.$t('qeubo.label.preferB'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "action-row" },
        });
        /** @type {__VLS_StyleScopedClasses['action-row']} */ ;
        if (__VLS_ctx.applyVisible) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.onApply) },
                type: "button",
                ...{ class: "apply-btn" },
                disabled: (__VLS_ctx.q.isBusy.value),
                title: (__VLS_ctx.$t('qeubo.tooltip.useThis')),
            });
            /** @type {__VLS_StyleScopedClasses['apply-btn']} */ ;
            (__VLS_ctx.$t('qeubo.label.useThis'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.onPin) },
            type: "button",
            ...{ class: "pin-btn" },
            disabled: (__VLS_ctx.q.isBusy.value),
            title: (__VLS_ctx.$t('qeubo.tooltip.pin')),
        });
        /** @type {__VLS_StyleScopedClasses['pin-btn']} */ ;
        (__VLS_ctx.$t('qeubo.label.pin'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.visible))
                        return;
                    if (!(__VLS_ctx.open))
                        return;
                    __VLS_ctx.debugVisible = !__VLS_ctx.debugVisible;
                    // @ts-ignore
                    [$t, $t, $t, $t, $t, $t, q, q, verdictDisabled, applyVisible, onApply, onPin, debugVisible, debugVisible,];
                } },
            type: "button",
            ...{ class: "debug-toggle" },
            ...{ class: ({ active: __VLS_ctx.debugVisible }) },
            title: (__VLS_ctx.debugVisible ? __VLS_ctx.$t('qeubo.tooltip.debugHide') : __VLS_ctx.$t('qeubo.tooltip.debugShow')),
        });
        /** @type {__VLS_StyleScopedClasses['debug-toggle']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "phase-help" },
            title: (__VLS_ctx.phaseTooltip),
        });
        /** @type {__VLS_StyleScopedClasses['phase-help']} */ ;
        if (__VLS_ctx.debugVisible) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "params-debug" },
            });
            /** @type {__VLS_StyleScopedClasses['params-debug']} */ ;
            (__VLS_ctx.paramsDebug);
        }
    }
}
// @ts-ignore
[$t, $t, debugVisible, debugVisible, debugVisible, phaseTooltip, paramsDebug,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
