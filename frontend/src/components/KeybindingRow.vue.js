/// <reference types="../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/KeybindingRow.vue
 *
 * Per-action row in the Keybindings sub-tab (Phase 4 of the
 * archived plan, docs/archive/notes/design/keybindings-plan.md).
 * Holds the three-state UI substrate the editor needs:
 *
 *   - idle: shows current effective key + Edit / Reset buttons.
 *   - capturing: shows "Press a key..." prompt + Unbind / Cancel;
 *     a window-level keydown listener (installed only while this
 *     row is capturing) records the press, with conflict detection
 *     and reserved-key rejection.
 *   - conflict: when the captured key is already bound to another
 *     action — shows "<key> is bound to <action>" + Replace /
 *     Cancel.
 *
 * Capture-mode coordination is via the module-scoped `captureMode`
 * ref in `src/lib/keybindings-capture.ts`: starting a capture sets
 * it to this row's action id; the dispatcher early-returns on any
 * non-null captureMode; and a second row entering capture cleanly
 * cancels the first by virtue of the captureMode watch below.
 *
 * Resource ownership (per the codebase's mutation-site discipline):
 * the window-level keydown listener and the captureMode flag are
 * both released on transitions out of capturing AND on unmount,
 * so closing the Settings tab mid-capture (which unmounts the
 * row) leaves no dangling listener and no stuck mode flag.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { store } from '../store';
import { effectiveKey } from '../lib/keybindings';
import { KEYBINDINGS_REGISTRY } from '../composables/keybindings-catalog';
import { captureMode, startCapture, cancelCapture, setBinding, resetBinding, hasOverride, isReservedKey, findActionByKey, } from '../lib/keybindings-capture';
const props = defineProps();
const { t } = useI18n();
const state = ref({ kind: 'idle' });
// Narrowing helpers for the template — Vue templates can't always
// narrow discriminated unions via `v-if="state.kind === '…'"`
// the way TS narrows in script, so we expose pre-narrowed
// computeds and the template reads through them.
const captureState = computed(() => state.value.kind === 'capturing' ? state.value : null);
const conflictState = computed(() => state.value.kind === 'conflict' ? state.value : null);
const currentKeyDisplay = computed(() => {
    const key = effectiveKey(props.action, store.profile.settings.keybindings);
    if (key === null)
        return t('keybindings.unbound');
    if (key === ' ')
        return 'Space';
    return key;
});
const canReset = computed(() => hasOverride(props.action.id));
function pendingKeyDisplay(key) {
    return key === ' ' ? 'Space' : key;
}
function handleEditClick() {
    // Single-capture-at-a-time: startCapture flips the module-scoped
    // flag. Any other row currently in capturing/conflict observes
    // the flag change and resets itself to idle (the captureMode
    // watch below).
    startCapture(props.action.id);
    state.value = { kind: 'capturing', reservedNotice: null };
}
function handleCancel() {
    state.value = { kind: 'idle' };
    cancelCapture();
}
function handleUnbind() {
    setBinding(props.action.id, null);
    state.value = { kind: 'idle' };
    cancelCapture();
}
function handleReset() {
    resetBinding(props.action.id);
}
function handleReplace() {
    if (state.value.kind !== 'conflict')
        return;
    const { pendingKey, conflictingAction } = state.value;
    // Unbind the conflicting action (its override is removed; if its
    // default key was the conflicting one, it falls back to default —
    // which IS the conflicting key — so we explicitly unbind it via
    // an explicit null entry to break the conflict in both
    // override-set and default-set cases).
    setBinding(conflictingAction.id, null);
    setBinding(props.action.id, pendingKey);
    state.value = { kind: 'idle' };
    cancelCapture();
}
function handleCaptureKeydown(e) {
    // Defensive: when state has already transitioned out of capturing
    // (e.g., another row stole capture via captureMode change before
    // the listener was torn down), do nothing.
    if (state.value.kind !== 'capturing')
        return;
    e.preventDefault();
    e.stopPropagation();
    // Escape doubles as "cancel capture" — it's a reserved key AND
    // its standard semantic is "back out of this".
    if (e.key === 'Escape') {
        handleCancel();
        return;
    }
    // Other reserved keys: stay in capturing, surface notice. The
    // notice replaces the prompt so the user knows what they hit.
    if (isReservedKey(e.key)) {
        state.value = { kind: 'capturing', reservedNotice: e.key };
        return;
    }
    // Conflict detection — does any OTHER action currently bind this
    // key? (Self-bind is a no-op semantically, so excluded.) The
    // catalog is passed explicitly — findActionByKey is
    // registry-agnostic.
    const conflict = findActionByKey(KEYBINDINGS_REGISTRY, e.key, props.action.id);
    if (conflict !== null) {
        state.value = {
            kind: 'conflict',
            pendingKey: e.key,
            conflictingAction: conflict,
        };
        return;
    }
    // Free key — commit immediately.
    setBinding(props.action.id, e.key);
    state.value = { kind: 'idle' };
    cancelCapture();
}
// Install / remove the window listener as 'capturing' enters /
// exits. Capture-phase listener (third arg `{ capture: true }`)
// runs before bubbling-phase listeners — including the dispatcher's
// keydown — so even if the dispatcher's captureMode early-return
// were somehow bypassed, this listener gets first crack at the
// event during capture.
watch(() => state.value.kind === 'capturing', (isCapturing) => {
    if (isCapturing) {
        window.addEventListener('keydown', handleCaptureKeydown, { capture: true });
    }
    else {
        window.removeEventListener('keydown', handleCaptureKeydown, { capture: true });
    }
});
// Another row entering capture cancels this row's non-idle state
// cleanly. Don't call cancelCapture() here — the other row owns
// the mode flag now.
watch(() => captureMode.value, (newMode) => {
    if (newMode !== props.action.id && state.value.kind !== 'idle') {
        state.value = { kind: 'idle' };
    }
});
// Resource ownership (mutation-site discipline): the row may unmount
// mid-capture (Settings tab close, profile reset). Release every
// owned resource:
//   1. window keydown listener — removed by transitioning state to
//      idle (which fires the watch above), plus a defensive remove
//      in case the watch hasn't flushed before unmount completes.
//   2. captureMode — cleared iff this row owns it; never overwrite
//      a flag a different row has taken since.
onUnmounted(() => {
    if (state.value.kind !== 'idle') {
        state.value = { kind: 'idle' };
    }
    if (captureMode.value === props.action.id) {
        cancelCapture();
    }
    window.removeEventListener('keydown', handleCaptureKeydown, { capture: true });
});
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['action-buttons']} */ ;
/** @type {__VLS_StyleScopedClasses['row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['row-btn-attention']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
    ...{ class: "keybinding-row" },
});
/** @type {__VLS_StyleScopedClasses['keybinding-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
    ...{ class: "action-label" },
    title: (__VLS_ctx.t(__VLS_ctx.action.descriptionKey)),
});
/** @type {__VLS_StyleScopedClasses['action-label']} */ ;
(__VLS_ctx.t(__VLS_ctx.action.labelKey));
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
    ...{ class: "action-key" },
});
/** @type {__VLS_StyleScopedClasses['action-key']} */ ;
if (__VLS_ctx.state.kind === 'idle') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.currentKeyDisplay);
}
else if (__VLS_ctx.captureState) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "capture-prompt" },
    });
    /** @type {__VLS_StyleScopedClasses['capture-prompt']} */ ;
    (__VLS_ctx.t('keybindings.capture.prompt'));
    if (__VLS_ctx.captureState.reservedNotice !== null) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "reserved-notice" },
        });
        /** @type {__VLS_StyleScopedClasses['reserved-notice']} */ ;
        (__VLS_ctx.t('keybindings.capture.reservedNotice', { key: __VLS_ctx.captureState.reservedNotice }));
    }
}
else if (__VLS_ctx.conflictState) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "conflict-text" },
    });
    /** @type {__VLS_StyleScopedClasses['conflict-text']} */ ;
    (__VLS_ctx.t('keybindings.capture.conflict', {
        key: __VLS_ctx.pendingKeyDisplay(__VLS_ctx.conflictState.pendingKey),
        action: __VLS_ctx.t(__VLS_ctx.conflictState.conflictingAction.labelKey),
    }));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
    ...{ class: "action-buttons" },
});
/** @type {__VLS_StyleScopedClasses['action-buttons']} */ ;
if (__VLS_ctx.state.kind === 'idle') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleEditClick) },
        ...{ class: "row-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['row-btn']} */ ;
    (__VLS_ctx.t('keybindings.button.edit'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleReset) },
        ...{ class: "row-btn" },
        disabled: (!__VLS_ctx.canReset),
    });
    /** @type {__VLS_StyleScopedClasses['row-btn']} */ ;
    (__VLS_ctx.t('keybindings.button.reset'));
}
else if (__VLS_ctx.captureState) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleUnbind) },
        ...{ class: "row-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['row-btn']} */ ;
    (__VLS_ctx.t('keybindings.button.unbind'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleCancel) },
        ...{ class: "row-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['row-btn']} */ ;
    (__VLS_ctx.t('keybindings.button.cancel'));
}
else if (__VLS_ctx.conflictState) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleReplace) },
        ...{ class: "row-btn row-btn-attention" },
    });
    /** @type {__VLS_StyleScopedClasses['row-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['row-btn-attention']} */ ;
    (__VLS_ctx.t('keybindings.button.replace'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleCancel) },
        ...{ class: "row-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['row-btn']} */ ;
    (__VLS_ctx.t('keybindings.button.cancel'));
}
// @ts-ignore
[t, t, t, t, t, t, t, t, t, t, t, t, action, action, state, state, currentKeyDisplay, captureState, captureState, captureState, captureState, conflictState, conflictState, conflictState, conflictState, pendingKeyDisplay, handleEditClick, handleReset, canReset, handleUnbind, handleCancel, handleCancel, handleReplace,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
