/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/chrome/RootErrorBoundary.vue
 * Catches errors propagating from descendant components — render,
 * watcher, lifecycle, event handler, and setup errors — surfaces them
 * via the system log per ADR-0002, and displays a fallback UI with a
 * reload button so the user is not left staring at a white screen.
 *
 * Wraps App.vue's root content in a single boundary at the top of
 * the component tree. Vue 3's `onErrorCaptured` returns false to stop
 * propagation; the global `app.config.errorHandler` in main.ts is the
 * last-resort backstop for errors that don't propagate through this
 * boundary (App.vue's own setup, mount-time errors).
 *
 * Closes auditor-notes.md item #5.
 *
 * License: Public Domain (The Unlicense).
 */
import { ref, onErrorCaptured } from 'vue';
import { useI18n } from 'vue-i18n';
import { pushSystemMessage } from '../../store';
const { t } = useI18n();
const error = ref(null);
onErrorCaptured((err, _instance, info) => {
    console.error('[RootErrorBoundary] Caught error:', err, info);
    const msg = err instanceof Error ? err.message : String(err);
    // pushSystemMessage is mutating store state; if it itself throws
    // (e.g., a future regression in store wiring), don't recurse — log
    // and proceed.
    try {
        pushSystemMessage('error', t('errors.unhandledUi', { msg }));
    }
    catch (pushErr) {
        console.error('[RootErrorBoundary] pushSystemMessage failed:', pushErr);
    }
    error.value = err instanceof Error ? err : new Error(msg);
    // Stop propagation. The global errorHandler in main.ts handles
    // anything that escapes this boundary (App.vue setup, mount).
    return false;
});
function reload() {
    location.reload();
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['reb-reload']} */ ;
if (!__VLS_ctx.error) {
    var __VLS_0 = {};
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "reb-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['reb-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "reb-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['reb-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "reb-title" },
    });
    /** @type {__VLS_StyleScopedClasses['reb-title']} */ ;
    (__VLS_ctx.$t('errors.boundary.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "reb-text" },
    });
    /** @type {__VLS_StyleScopedClasses['reb-text']} */ ;
    (__VLS_ctx.$t('errors.boundary.body'));
    if (__VLS_ctx.error.message) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.pre, __VLS_intrinsics.pre)({
            ...{ class: "reb-message" },
        });
        /** @type {__VLS_StyleScopedClasses['reb-message']} */ ;
        (__VLS_ctx.error.message);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.reload) },
        ...{ class: "reb-reload" },
    });
    /** @type {__VLS_StyleScopedClasses['reb-reload']} */ ;
    (__VLS_ctx.$t('errors.boundary.reload'));
}
// @ts-ignore
var __VLS_1 = __VLS_0;
// @ts-ignore
[error, error, error, $t, $t, $t, reload,];
const __VLS_base = (await import('vue')).defineComponent({});
const __VLS_export = {};
export default {};
