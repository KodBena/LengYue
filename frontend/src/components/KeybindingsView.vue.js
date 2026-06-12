/// <reference types="../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/KeybindingsView.vue
 *
 * The Keybindings sub-tab of the Settings surface. Walks
 * KEYBINDINGS_REGISTRY, groups actions by domain prefix
 * (`nav` / `display` / `engine`) in plan-sketch order, and
 * delegates each row's render + edit affordance to
 * KeybindingRow. Phase 4 of the archived plan
 * (docs/archive/notes/design/keybindings-plan.md) landed the
 * row-level Edit / Reset / Unbind controls plus the Reset-all
 * button + reserved-keys disclosure at the foot; Phase 3 (the
 * read-only precursor) shipped 2026-05-27.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import KeybindingRow from './KeybindingRow.vue';
import ResetAllKeybindingsModal from './modals/ResetAllKeybindingsModal.vue';
import { KEYBINDINGS_REGISTRY } from '../composables/keybindings-catalog';
import { RESERVED_KEYS, resetAllBindings, } from '../lib/keybindings-capture';
const { t } = useI18n();
const KNOWN_DOMAINS = ['nav', 'display', 'engine'];
const grouped = computed(() => {
    const groups = { nav: [], display: [], engine: [] };
    for (const action of KEYBINDINGS_REGISTRY) {
        const prefix = action.id.split('.')[0];
        if (prefix !== 'nav' && prefix !== 'display' && prefix !== 'engine') {
            // ADR-0002: KeybindingsView's grouped render assumes the closed
            // {nav, display, engine} domain set. A new prefix means the
            // KNOWN_DOMAINS list and the i18n `keybindings.section.<domain>`
            // catalog entries need extending in the same change.
            throw new Error(`KeybindingsView: unknown action domain prefix "${prefix}" for action "${action.id}"`);
        }
        groups[prefix].push(action);
    }
    return KNOWN_DOMAINS.map((d) => [d, groups[d]]);
});
// Reserved-key disclosure body — comma-separated list of the
// keys the editor refuses to bind. Sorted alphabetically (the
// Set's iteration order is insertion order; alphabetical reads
// more naturally to the user than "the order the dev typed them").
const reservedKeysDisplay = computed(() => {
    return [...RESERVED_KEYS].sort().join(', ');
});
const resetAllModalRef = ref(null);
async function handleResetAll() {
    const confirmed = await resetAllModalRef.value?.open();
    if (confirmed === true) {
        resetAllBindings();
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['reset-all-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "keybindings-view tab-padding" },
});
/** @type {__VLS_StyleScopedClasses['keybindings-view']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-padding']} */ ;
for (const [[domain, actions]] of __VLS_vFor((__VLS_ctx.grouped))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        key: (domain),
        ...{ class: "keybindings-section" },
    });
    /** @type {__VLS_StyleScopedClasses['keybindings-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
        ...{ class: "sub-header" },
    });
    /** @type {__VLS_StyleScopedClasses['sub-header']} */ ;
    (__VLS_ctx.t(`keybindings.section.${domain}`));
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "keybindings-table" },
    });
    /** @type {__VLS_StyleScopedClasses['keybindings-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    for (const [action] of __VLS_vFor((actions))) {
        const __VLS_0 = KeybindingRow;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            key: (action.id),
            action: (action),
        }));
        const __VLS_2 = __VLS_1({
            key: (action.id),
            action: (action),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        // @ts-ignore
        [grouped, t,];
    }
    // @ts-ignore
    [];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "keybindings-footer" },
});
/** @type {__VLS_StyleScopedClasses['keybindings-footer']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.handleResetAll) },
    ...{ class: "reset-all-btn" },
});
/** @type {__VLS_StyleScopedClasses['reset-all-btn']} */ ;
(__VLS_ctx.t('keybindings.button.resetAll'));
__VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({
    ...{ class: "reserved-keys-disclosure" },
});
/** @type {__VLS_StyleScopedClasses['reserved-keys-disclosure']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({});
(__VLS_ctx.t('keybindings.reservedKeys.label'));
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "reserved-keys-body" },
});
/** @type {__VLS_StyleScopedClasses['reserved-keys-body']} */ ;
(__VLS_ctx.t('keybindings.reservedKeys.body', { keys: __VLS_ctx.reservedKeysDisplay }));
const __VLS_5 = ResetAllKeybindingsModal;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
    ref: "resetAllModalRef",
}));
const __VLS_7 = __VLS_6({
    ref: "resetAllModalRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
var __VLS_10;
var __VLS_8;
// @ts-ignore
var __VLS_11 = __VLS_10;
// @ts-ignore
[t, t, t, handleResetAll, reservedKeysDisplay,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
