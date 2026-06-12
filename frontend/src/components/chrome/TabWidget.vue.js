/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
const props = withDefaults(defineProps(), {
    keepMounted: false,
});
const emit = defineEmits();
function selectTab(id) {
    emit('update:modelValue', id);
}
const __VLS_defaults = {
    keepMounted: false,
};
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
/** @type {__VLS_StyleScopedClasses['tab-header']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-header']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "vue-tabs" },
});
/** @type {__VLS_StyleScopedClasses['vue-tabs']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
    ...{ class: "tab-header" },
});
/** @type {__VLS_StyleScopedClasses['tab-header']} */ ;
for (const [tab] of __VLS_vFor((__VLS_ctx.tabs))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectTab(tab.id);
                // @ts-ignore
                [tabs, selectTab,];
            } },
        key: (tab.id),
        ...{ class: ({ active: __VLS_ctx.modelValue === tab.id }) },
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (tab.label);
    // @ts-ignore
    [modelValue,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tab-body" },
});
/** @type {__VLS_StyleScopedClasses['tab-body']} */ ;
for (const [tab] of __VLS_vFor((__VLS_ctx.tabs))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (tab.id),
        ...{ class: "tab-pane" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.modelValue === tab.id) }, null, null);
    /** @type {__VLS_StyleScopedClasses['tab-pane']} */ ;
    if (__VLS_ctx.keepMounted || __VLS_ctx.modelValue === tab.id) {
        var __VLS_0 = {};
        var __VLS_1 = __VLS_tryAsConstant(tab.id);
    }
    // @ts-ignore
    [tabs, modelValue, modelValue, keepMounted,];
}
// @ts-ignore
var __VLS_2 = __VLS_1, __VLS_3 = __VLS_0;
// @ts-ignore
[];
const __VLS_base = (await import('vue')).defineComponent({
    __typeEmits: {},
    __defaults: __VLS_defaults,
    __typeProps: {},
});
const __VLS_export = {};
export default {};
