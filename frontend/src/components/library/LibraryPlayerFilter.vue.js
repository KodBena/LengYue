/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/library/LibraryPlayerFilter.vue
 *
 * Autocomplete filter input for player names. v-model binds to a
 * filter string (the parent's `playerWhiteLike` or `playerBlackLike`);
 * the dropdown surfaces matches from `useLibraryPlayerSuggest`'s
 * in-memory cache.
 *
 * Thin: input + focus tracking + dropdown render. The actual
 * suggestion source lives in the composable, fed in via the
 * `suggest` prop so the same component renders both filters.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, ref } from 'vue';
import { INTERACTION_DISMISS_DELAY_MS } from '../../lib/timing';
const props = defineProps();
const emit = defineEmits();
const focused = ref(false);
// Reflect the filter value as a plain string for the input.
// `null` (parent's "no filter set") renders as an empty input.
const inputValue = computed({
    get: () => props.modelValue ?? '',
    set: (v) => emit('update:modelValue', v === '' ? null : v),
});
// Suggestions only when the input has focus AND non-empty content.
// Empty + focused would dump the full ~thousands-row cache into the
// DOM; we prefer to require the user signal "I want suggestions."
const open = computed(() => focused.value && inputValue.value.length > 0);
const suggestions = computed(() => open.value ? props.suggest(inputValue.value, 12) : []);
function pick(name) {
    emit('update:modelValue', name);
    focused.value = false;
}
function onBlur() {
    // Defer the close so a mousedown on a suggestion can fire first
    // (`mousedown.prevent` on the list item suppresses focus loss in
    // most browsers but the timing isn't synchronous across all of
    // them; the grace window is the shared interaction-dismiss
    // constant from the timing catalog (`lib/timing`).
    setTimeout(() => { focused.value = false; }, INTERACTION_DISMISS_DELAY_MS);
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
/** @type {__VLS_StyleScopedClasses['filter-input']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-suggest-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "library-player-filter" },
});
/** @type {__VLS_StyleScopedClasses['library-player-filter']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "filter-label" },
});
/** @type {__VLS_StyleScopedClasses['filter-label']} */ ;
(__VLS_ctx.label);
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onFocus: (...[$event]) => {
            __VLS_ctx.focused = true;
            // @ts-ignore
            [label, focused,];
        } },
    ...{ onBlur: (__VLS_ctx.onBlur) },
    value: (__VLS_ctx.inputValue),
    placeholder: (__VLS_ctx.placeholder ?? ''),
    type: "text",
    ...{ class: "filter-input" },
});
/** @type {__VLS_StyleScopedClasses['filter-input']} */ ;
if (__VLS_ctx.open && __VLS_ctx.suggestions.length > 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "filter-suggest" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-suggest']} */ ;
    for (const [name] of __VLS_vFor((__VLS_ctx.suggestions))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            ...{ onMousedown: (...[$event]) => {
                    if (!(__VLS_ctx.open && __VLS_ctx.suggestions.length > 0))
                        return;
                    __VLS_ctx.pick(name);
                    // @ts-ignore
                    [onBlur, inputValue, placeholder, open, suggestions, suggestions, pick,];
                } },
            key: (name),
            ...{ class: "filter-suggest-item" },
        });
        /** @type {__VLS_StyleScopedClasses['filter-suggest-item']} */ ;
        (name);
        // @ts-ignore
        [];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
