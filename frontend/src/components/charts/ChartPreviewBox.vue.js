/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import MiniBoard from '../board/MiniBoard.vue';
const props = withDefaults(defineProps(), { showMarker: false });
// Invoked here, inside this leaf's render scope — the subscription to the
// preview source is established in the leaf, so a per-nav update re-renders
// only this box. The accessor contract is unchanged; only its return type
// moved from string to BoardSnapshot.
const snapshot = computed(() => props.accessor?.() ?? null);
const __VLS_defaults = { showMarker: false };
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "preview-content" },
});
/** @type {__VLS_StyleScopedClasses['preview-content']} */ ;
if (__VLS_ctx.snapshot) {
    const __VLS_0 = MiniBoard;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        snapshot: (__VLS_ctx.snapshot),
        showMarker: (__VLS_ctx.showMarker),
    }));
    const __VLS_2 = __VLS_1({
        snapshot: (__VLS_ctx.snapshot),
        showMarker: (__VLS_ctx.showMarker),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
// @ts-ignore
[snapshot, snapshot, showMarker,];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
