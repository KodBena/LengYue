/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/chrome/UserBadge.vue
 *
 * Displays current authentication identity AND opens the LoginModal on
 * click. Pattern-matches the AuthState discriminated union into a flat
 * presentational record (BadgeView) in script; template stays dumb.
 *
 * Future evolution: in B5 the 'authenticated' label can use the
 * JWT-verified username from /auth/me. Touches only this file.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../../composables/auth-app/useAuth';
import LoginModal from '../modals/LoginModal.vue';
const { t } = useI18n();
const { state } = useAuth();
const view = computed(() => {
    const s = state.value;
    switch (s.kind) {
        case 'authenticated':
            return { kind: s.kind, label: s.username, dotClass: 'dot-ok' };
        case 'authenticating':
            return { kind: s.kind, label: t('auth.badge.authenticating'), dotClass: 'dot-pending' };
        case 'unauthenticated':
            return { kind: s.kind, label: t('auth.badge.unauthenticated'), dotClass: 'dot-idle' };
        case 'error':
            return { kind: s.kind, label: t('auth.badge.error'), dotClass: 'dot-err' };
        case 'unknown':
            // Pre-bootstrap; render a non-breaking space to reserve layout
            // height without a visible flash before tryAutoLogin completes.
            return { kind: s.kind, label: '\u00A0', dotClass: 'dot-idle' };
    }
});
// Modal visibility — ephemeral local state owned by this component.
// Not in any store; the LoginModal is mounted only when open, so its
// own form state is also fresh on every open.
const isModalOpen = ref(false);
function openModal() { isModalOpen.value = true; }
function closeModal() { isModalOpen.value = false; }
// Auto-open the modal when auth transitions to a state where login
// is the natural next action — rejection (state goes to
// 'unauthenticated' from 'authenticated' due to /auth/me 401) and
// verify errors ('error'). Without this, the user has to discover
// the badge-click affordance after their session was invalidated.
//
// No `immediate: true`: the initial 'unknown' state during boot is
// skipped, so the modal stays closed until the auth subsystem
// actually settles into a non-authenticated state. Consequently
// cold-start with auto-fill (state goes unknown → authenticating →
// authenticated) does not flash the modal.
watch(() => state.value.kind, (next) => {
    if (next === 'unauthenticated' || next === 'error') {
        isModalOpen.value = true;
    }
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['user-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['user-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.openModal) },
    type: "button",
    ...{ class: "user-badge" },
    ...{ class: (`auth-${__VLS_ctx.view.kind}`) },
    title: (__VLS_ctx.$t('auth.badge.tooltip', { kind: __VLS_ctx.view.kind })),
});
/** @type {__VLS_StyleScopedClasses['user-badge']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "dot" },
    ...{ class: (__VLS_ctx.view.dotClass) },
});
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "label" },
});
/** @type {__VLS_StyleScopedClasses['label']} */ ;
(__VLS_ctx.view.label);
if (__VLS_ctx.isModalOpen) {
    const __VLS_0 = LoginModal;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        ...{ 'onClose': {} },
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClose': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    const __VLS_6 = {
        ...{ close: {} },
        onClose: (__VLS_ctx.closeModal),
    };
    var __VLS_3;
    var __VLS_4;
}
// @ts-ignore
[openModal, view, view, view, view, $t, isModalOpen, closeModal,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
