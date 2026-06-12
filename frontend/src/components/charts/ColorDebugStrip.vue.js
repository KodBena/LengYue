/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { getIntensityColor } from '../../engine/suggestion-colors';
const props = defineProps();
const sampleCount = computed(() => props.steps || 100);
const samples = computed(() => {
    const result = [];
    const fn = getIntensityColor.value;
    for (let i = 0; i <= sampleCount.value; i++) {
        const t = i / sampleCount.value;
        result.push({ t, color: fn(t) });
    }
    return result;
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
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "debug-strip-container" },
});
/** @type {__VLS_StyleScopedClasses['debug-strip-container']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "track-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['track-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "track-header" },
});
/** @type {__VLS_StyleScopedClasses['track-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "track-label" },
});
/** @type {__VLS_StyleScopedClasses['track-label']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "strip clean-bg" },
});
/** @type {__VLS_StyleScopedClasses['strip']} */ ;
/** @type {__VLS_StyleScopedClasses['clean-bg']} */ ;
for (const [s] of __VLS_vFor((__VLS_ctx.samples))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: ('c' + s.t),
        ...{ class: "sample" },
        ...{ style: ({ backgroundColor: s.color }) },
    });
    /** @type {__VLS_StyleScopedClasses['sample']} */ ;
    // @ts-ignore
    [samples,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "track-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['track-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "track-header" },
});
/** @type {__VLS_StyleScopedClasses['track-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "track-label" },
});
/** @type {__VLS_StyleScopedClasses['track-label']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "strip wood-texture" },
});
/** @type {__VLS_StyleScopedClasses['strip']} */ ;
/** @type {__VLS_StyleScopedClasses['wood-texture']} */ ;
for (const [s] of __VLS_vFor((__VLS_ctx.samples))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: ('w' + s.t),
        ...{ class: "sample" },
        ...{ style: ({ backgroundColor: s.color }) },
    });
    /** @type {__VLS_StyleScopedClasses['sample']} */ ;
    // @ts-ignore
    [samples,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "scale-footer" },
});
/** @type {__VLS_StyleScopedClasses['scale-footer']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "ticks" },
});
/** @type {__VLS_StyleScopedClasses['ticks']} */ ;
for (const [i] of __VLS_vFor((5))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        key: (i),
        ...{ class: "tick" },
    });
    /** @type {__VLS_StyleScopedClasses['tick']} */ ;
    // @ts-ignore
    [];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
