/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/modals/LoginModal.vue
 *
 * Sign-in / register / switch-user / sign-out modal.
 *
 * Owns its own form state. Reads `useAuth().state` for context display
 * and to detect in-flight / error transitions. Submits via a single
 * parameterised `submit(action)` that dispatches to login or register
 * by pattern match. Logout is a separate synchronous action surfaced
 * only when the current state is 'authenticated'.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../../composables/auth-app/useAuth';
const { t } = useI18n();
const { state, login, register, logout } = useAuth();
const emit = defineEmits();
// ─── Form state (local; not in any store) ───────────────────────────────────
const username = ref('');
const usePassword = ref(false);
const password = ref('');
// ─── Derived view ───────────────────────────────────────────────────────────
const inFlight = computed(() => state.value.kind === 'authenticating');
const isAuthenticated = computed(() => state.value.kind === 'authenticated');
const errorMessage = computed(() => state.value.kind === 'error' ? state.value.message : null);
const currentIdentity = computed(() => {
    switch (state.value.kind) {
        case 'authenticated': return t('auth.currentIdentity.authenticated', { username: state.value.username });
        case 'unauthenticated': return t('auth.currentIdentity.unauthenticated');
        case 'authenticating': return t('auth.currentIdentity.authenticating');
        case 'error': return t('auth.currentIdentity.error');
        case 'unknown': return '';
    }
});
const canSubmit = computed(() => !inFlight.value && username.value.trim().length > 0);
async function submit(action) {
    if (!canSubmit.value)
        return;
    const op = action === 'login' ? login : register;
    const pw = usePassword.value ? password.value : undefined;
    try {
        await op(username.value.trim(), pw);
        emit('close');
    }
    catch {
        // Error already reflected on `state.kind === 'error'` and surfaced
        // via the system log by the composable. Modal stays open so the
        // user can read the error and retry.
    }
}
// ─── Sign-out (synchronous, no try/catch needed — the action can't fail) ────
function handleSignOut() {
    logout();
    emit('close');
}
// ─── Dismiss handlers ───────────────────────────────────────────────────────
function handleCancel() {
    emit('close');
}
function handleBackdropClick(e) {
    // Close only when the click was on the backdrop itself, not bubbled
    // up from the modal card.
    if (e.target === e.currentTarget)
        emit('close');
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
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-row']} */ ;
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.handleBackdropClick) },
    ...{ class: "modal-backdrop" },
});
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "modal-card" },
    role: "dialog",
    'aria-modal': "true",
    'aria-labelledby': "login-modal-title",
});
/** @type {__VLS_StyleScopedClasses['modal-card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
    id: "login-modal-title",
    ...{ class: "modal-title" },
});
/** @type {__VLS_StyleScopedClasses['modal-title']} */ ;
(__VLS_ctx.$t('auth.title'));
if (__VLS_ctx.currentIdentity) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "current-identity" },
    });
    /** @type {__VLS_StyleScopedClasses['current-identity']} */ ;
    (__VLS_ctx.currentIdentity);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "form-row" },
});
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    for: "login-username",
});
(__VLS_ctx.$t('auth.field.username'));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onKeyup: (...[$event]) => {
            __VLS_ctx.submit('login');
            // @ts-ignore
            [handleBackdropClick, $t, $t, currentIdentity, currentIdentity, submit,];
        } },
    id: "login-username",
    value: (__VLS_ctx.username),
    type: "text",
    ...{ class: "text-input" },
    autocomplete: "username",
    autofocus: true,
});
/** @type {__VLS_StyleScopedClasses['text-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "form-row checkbox-row" },
});
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    id: "login-use-password",
    type: "checkbox",
});
(__VLS_ctx.usePassword);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    for: "login-use-password",
});
(__VLS_ctx.$t('auth.field.usePasswordLabel'));
if (__VLS_ctx.usePassword) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-row" },
    });
    /** @type {__VLS_StyleScopedClasses['form-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "login-password",
    });
    (__VLS_ctx.$t('auth.field.password'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeyup: (...[$event]) => {
                if (!(__VLS_ctx.usePassword))
                    return;
                __VLS_ctx.submit('login');
                // @ts-ignore
                [$t, $t, submit, username, usePassword, usePassword,];
            } },
        id: "login-password",
        type: "password",
        ...{ class: "text-input" },
        autocomplete: "current-password",
    });
    (__VLS_ctx.password);
    /** @type {__VLS_StyleScopedClasses['text-input']} */ ;
}
if (__VLS_ctx.errorMessage) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "error-message" },
    });
    /** @type {__VLS_StyleScopedClasses['error-message']} */ ;
    (__VLS_ctx.errorMessage);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "button-row" },
});
/** @type {__VLS_StyleScopedClasses['button-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.handleCancel) },
    ...{ class: "btn btn-secondary" },
    disabled: (__VLS_ctx.inFlight),
});
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-secondary']} */ ;
(__VLS_ctx.$t('auth.button.cancel'));
if (__VLS_ctx.isAuthenticated) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleSignOut) },
        ...{ class: "btn btn-danger" },
        disabled: (__VLS_ctx.inFlight),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn-danger']} */ ;
    (__VLS_ctx.$t('auth.button.signOut'));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.submit('register');
            // @ts-ignore
            [$t, $t, submit, password, errorMessage, errorMessage, handleCancel, inFlight, inFlight, isAuthenticated, handleSignOut,];
        } },
    ...{ class: "btn btn-secondary" },
    disabled: (!__VLS_ctx.canSubmit),
});
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-secondary']} */ ;
(__VLS_ctx.$t('auth.button.registerAndSignIn'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.submit('login');
            // @ts-ignore
            [$t, submit, canSubmit,];
        } },
    ...{ class: "btn btn-primary" },
    disabled: (!__VLS_ctx.canSubmit),
});
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
(__VLS_ctx.inFlight ? __VLS_ctx.$t('auth.button.signingIn') : __VLS_ctx.$t('auth.button.signIn'));
// @ts-ignore
[$t, $t, inFlight, canSubmit,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
});
export default {};
