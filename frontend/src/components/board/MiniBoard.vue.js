/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { store } from '../../store';
import MiniBoardSvg from './MiniBoardSvg.vue';
import MiniBoardCanvas from './MiniBoardCanvas.vue';
const __VLS_props = defineProps();
// Low-frequency structural read: the renderer is a settings enum a user changes
// rarely and deliberately, so a reactive read driving the v-if dispatch is fine
// (ADR-0010 read-locality governs HIGH-frequency reads, which this is not).
const useCanvas = computed(() => store.profile.settings.appearance.miniBoardRenderer === 'canvas');
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
if (__VLS_ctx.useCanvas) {
    const __VLS_0 = MiniBoardCanvas;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        snapshot: (__VLS_ctx.snapshot),
        showMarker: (__VLS_ctx.showMarker),
    }));
    const __VLS_2 = __VLS_1({
        snapshot: (__VLS_ctx.snapshot),
        showMarker: (__VLS_ctx.showMarker),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_5;
    var __VLS_3;
}
else {
    const __VLS_6 = MiniBoardSvg;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        snapshot: (__VLS_ctx.snapshot),
        showMarker: (__VLS_ctx.showMarker),
    }));
    const __VLS_8 = __VLS_7({
        snapshot: (__VLS_ctx.snapshot),
        showMarker: (__VLS_ctx.showMarker),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    var __VLS_11;
    var __VLS_9;
}
// @ts-ignore
[useCanvas, snapshot, snapshot, showMarker, showMarker,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
