/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/modals/ConfirmLoadModal.vue
 * Modal dialog presented when the user attempts to load a card while
 * the active board has non-trivial state. Resolves to a structured
 * { action, remember } pair; the caller is responsible for honoring
 * the remember flag (typically by persisting `action` as the user's
 * default for the next dirty-board encounter).
 *
 * License: Public Domain (The Unlicense).
 */
import { ref } from 'vue';
const isOpen = ref(false);
const remember = ref(false);
let resolvePromise = null;
const __VLS_exposed = {
    open() {
        isOpen.value = true;
        remember.value = false;
        return new Promise(resolve => {
            resolvePromise = resolve;
        });
    }
};
defineExpose(__VLS_exposed);
function handle(action) {
    isOpen.value = false;
    if (resolvePromise) {
        resolvePromise({
            action,
            remember: remember.value && action !== 'cancel',
        });
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-row']} */ ;
if (__VLS_ctx.isOpen) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onMousedown: (...[$event]) => {
                if (!(__VLS_ctx.isOpen))
                    return;
                __VLS_ctx.handle('cancel');
                // @ts-ignore
                [isOpen, handle,];
            } },
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
    (__VLS_ctx.$t('confirmLoad.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-body" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t('confirmLoad.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "checkbox-row" },
    });
    /** @type {__VLS_StyleScopedClasses['checkbox-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
        id: "remember-cb",
    });
    (__VLS_ctx.remember);
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "remember-cb",
    });
    (__VLS_ctx.$t('confirmLoad.rememberLabel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-footer" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-footer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isOpen))
                    return;
                __VLS_ctx.handle('cancel');
                // @ts-ignore
                [handle, $t, $t, $t, remember,];
            } },
        ...{ class: "btn-cancel" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-cancel']} */ ;
    (__VLS_ctx.$t('confirmLoad.button.cancel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isOpen))
                    return;
                __VLS_ctx.handle('overwrite');
                // @ts-ignore
                [handle, $t,];
            } },
        ...{ class: "btn-overwrite" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-overwrite']} */ ;
    (__VLS_ctx.$t('confirmLoad.button.overwrite'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isOpen))
                    return;
                __VLS_ctx.handle('new');
                // @ts-ignore
                [handle, $t,];
            } },
        ...{ class: "btn-submit" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-submit']} */ ;
    (__VLS_ctx.$t('confirmLoad.button.openInNewTab'));
}
// @ts-ignore
[$t,];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
});
export default {};
