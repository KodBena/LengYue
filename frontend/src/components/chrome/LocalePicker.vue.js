/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useLocale } from '../../composables/chrome/useLocale';
const { locale, supportedLocales, displayName, flag, isMachineTranslated, setLocale } = useLocale();
const open = ref(false);
const currentFlag = computed(() => flag(locale.value));
const currentName = computed(() => displayName(locale.value));
function toggle() {
    open.value = !open.value;
}
function pick(loc) {
    setLocale(loc);
    open.value = false;
}
// Document-level dismiss: clicking anywhere outside the root closes
// the menu. Using `pointerdown` (capture phase) so the closer fires
// before any in-menu click handler that mutates state, preventing the
// open=true flicker if the user clicks the trigger again to dismiss.
// Listener is installed only while the menu is open and torn down on
// close — keeps the global-listener footprint zero in the steady
// state and follows the resource-ownership convention codified in
// docs/archive/notes/resource-ownership-audit-plan.md.
const rootRef = ref(null);
function onDocumentPointerDown(e) {
    if (!rootRef.value)
        return;
    if (rootRef.value.contains(e.target))
        return; // DOM: event.target is an EventTarget; Node is contains()'s arg type
    open.value = false;
}
function onKeydown(e) {
    if (e.key === 'Escape')
        open.value = false;
}
watch(open, (isOpen) => {
    if (isOpen) {
        document.addEventListener('pointerdown', onDocumentPointerDown, true);
        document.addEventListener('keydown', onKeydown);
    }
    else {
        document.removeEventListener('pointerdown', onDocumentPointerDown, true);
        document.removeEventListener('keydown', onKeydown);
    }
});
// Defensive cleanup: if the component unmounts while the menu is
// open (rare — only on a parent re-key or full app teardown), the
// document listeners would otherwise outlive the component.
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onKeydown);
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['locale-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['locale-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['locale-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['locale-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['locale-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['locale-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['locale-option']} */ ;
/** @type {__VLS_StyleScopedClasses['locale-option']} */ ;
/** @type {__VLS_StyleScopedClasses['locale-option']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['locale-option']} */ ;
/** @type {__VLS_StyleScopedClasses['flag']} */ ;
/** @type {__VLS_StyleScopedClasses['locale-option']} */ ;
/** @type {__VLS_StyleScopedClasses['name']} */ ;
/** @type {__VLS_StyleScopedClasses['locale-option']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ref: "rootRef",
    ...{ class: "locale-picker" },
    ...{ class: ({ open: __VLS_ctx.open }) },
});
/** @type {__VLS_StyleScopedClasses['locale-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['open']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.toggle) },
    type: "button",
    ...{ class: "locale-trigger" },
    title: (__VLS_ctx.$t('localePicker.tooltip')),
    'aria-haspopup': (true),
    'aria-expanded': (__VLS_ctx.open),
});
/** @type {__VLS_StyleScopedClasses['locale-trigger']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "flag" },
});
/** @type {__VLS_StyleScopedClasses['flag']} */ ;
(__VLS_ctx.currentFlag);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "name" },
});
/** @type {__VLS_StyleScopedClasses['name']} */ ;
(__VLS_ctx.currentName);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "caret" },
    'aria-hidden': "true",
});
/** @type {__VLS_StyleScopedClasses['caret']} */ ;
if (__VLS_ctx.isMachineTranslated) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "machine-notice" },
        title: (__VLS_ctx.$t('localePicker.machineTranslatedTooltip')),
    });
    /** @type {__VLS_StyleScopedClasses['machine-notice']} */ ;
    (__VLS_ctx.$t('localePicker.machineTranslatedNotice'));
}
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "locale-menu" },
        role: "listbox",
    });
    /** @type {__VLS_StyleScopedClasses['locale-menu']} */ ;
    for (const [loc] of __VLS_vFor((__VLS_ctx.supportedLocales))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.open))
                        return;
                    __VLS_ctx.pick(loc);
                    // @ts-ignore
                    [open, open, open, toggle, $t, $t, $t, currentFlag, currentName, isMachineTranslated, supportedLocales, pick,];
                } },
            key: (loc),
            ...{ class: "locale-option" },
            ...{ class: ({ active: loc === __VLS_ctx.locale }) },
            role: "option",
            'aria-selected': (loc === __VLS_ctx.locale),
        });
        /** @type {__VLS_StyleScopedClasses['locale-option']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "flag" },
        });
        /** @type {__VLS_StyleScopedClasses['flag']} */ ;
        (__VLS_ctx.flag(loc));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "name" },
        });
        /** @type {__VLS_StyleScopedClasses['name']} */ ;
        (__VLS_ctx.displayName(loc));
        if (loc === __VLS_ctx.locale) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "check" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['check']} */ ;
        }
        // @ts-ignore
        [locale, locale, locale, flag, displayName,];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
