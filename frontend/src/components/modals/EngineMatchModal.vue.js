/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { store } from '../../store';
const { t } = useI18n();
const isOpen = ref(false);
const blackModel = ref(undefined);
const whiteModel = ref(undefined);
const blackVisits = ref(500);
const whiteVisits = ref(500);
const numMoves = ref(20);
// SELECTOR mode is the single criterion for surfacing the
// engine-selection UI. Two-engine matches against a single LEAF
// would be meaningless (both colors play the same network, no
// dropdown choice changes anything); the collapsed single-engine
// view is the honest UX when SELECTOR isn't advertised.
const isSelectorMode = computed(() => {
    const caps = store.engine.info.capabilities;
    return caps !== null && 'selector' in caps;
});
const availableModels = computed(() => store.engine.info.availableModels);
// LEAF-mode label for the collapsed view. Falls back to a dash when
// the singleton hasn't probed yet (rare — the user typically opens
// this after at least one connect).
const singleEngineLabel = computed(() => store.engine.info.internalName ?? availableModels.value[0]?.label ?? '—');
const emit = defineEmits();
const __VLS_exposed = {
    open() {
        // Prefill model dropdowns from the user's current SELECTOR
        // selection; the user can override per-color before starting.
        // Visits and numMoves keep their last-used values so a user
        // running back-to-back matches doesn't have to re-set them.
        const current = store.engine.selectedModel ?? availableModels.value[0]?.label;
        blackModel.value = current ?? undefined;
        whiteModel.value = current ?? undefined;
        isOpen.value = true;
    },
};
defineExpose(__VLS_exposed);
function close() {
    isOpen.value = false;
}
function submit() {
    emit('start-match', {
        numMoves: numMoves.value,
        black: {
            model: isSelectorMode.value ? blackModel.value : undefined,
            maxVisits: blackVisits.value,
        },
        white: {
            model: isSelectorMode.value ? whiteModel.value : undefined,
            maxVisits: whiteVisits.value,
        },
    });
    close();
}
const canSubmit = computed(() => {
    if (numMoves.value < 1)
        return false;
    if (blackVisits.value < 1 || whiteVisits.value < 1)
        return false;
    if (isSelectorMode.value) {
        if (!blackModel.value || !whiteModel.value)
            return false;
    }
    return true;
});
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
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-submit']} */ ;
if (__VLS_ctx.isOpen) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onMousedown: (__VLS_ctx.close) },
        ...{ class: "modal-backdrop" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-content" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-header" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.t('match.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "close-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-body" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_ctx.t('match.subtitle'));
    if (!__VLS_ctx.isSelectorMode) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "single-engine-note" },
        });
        /** @type {__VLS_StyleScopedClasses['single-engine-note']} */ ;
        (__VLS_ctx.t('match.singleEngineNote', { label: __VLS_ctx.singleEngineLabel }));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
    if (__VLS_ctx.isSelectorMode) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.t('match.field.blackEngine'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            value: (__VLS_ctx.blackModel),
            ...{ class: "dark-select" },
        });
        /** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
        for (const [m] of __VLS_vFor((__VLS_ctx.availableModels))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (m.label),
                value: (m.label),
            });
            (m.label);
            // @ts-ignore
            [isOpen, close, close, t, t, t, t, isSelectorMode, isSelectorMode, singleEngineLabel, blackModel, availableModels,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.t('match.field.blackVisits'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        min: "1",
        step: "100",
        ...{ class: "dark-input" },
    });
    (__VLS_ctx.blackVisits);
    /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
    if (__VLS_ctx.isSelectorMode) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.t('match.field.whiteEngine'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            value: (__VLS_ctx.whiteModel),
            ...{ class: "dark-select" },
        });
        /** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
        for (const [m] of __VLS_vFor((__VLS_ctx.availableModels))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (m.label),
                value: (m.label),
            });
            (m.label);
            // @ts-ignore
            [t, t, isSelectorMode, availableModels, blackVisits, whiteModel,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.t('match.field.whiteVisits'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        min: "1",
        step: "100",
        ...{ class: "dark-input" },
    });
    (__VLS_ctx.whiteVisits);
    /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.t('match.field.numMoves'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        min: "1",
        max: "500",
        ...{ class: "dark-input" },
    });
    (__VLS_ctx.numMoves);
    /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_ctx.t('match.hint.stopAnytime'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-footer" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-footer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "btn-cancel" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-cancel']} */ ;
    (__VLS_ctx.t('match.button.cancel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.submit) },
        ...{ class: "btn-submit" },
        disabled: (!__VLS_ctx.canSubmit),
    });
    /** @type {__VLS_StyleScopedClasses['btn-submit']} */ ;
    (__VLS_ctx.t('match.button.start'));
}
// @ts-ignore
[close, t, t, t, t, t, whiteVisits, numMoves, submit, canSubmit,];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
    __typeEmits: {},
});
export default {};
