/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { store } from '../../store';
import { useHoverPopover } from '../../composables/chrome/useHoverPopover';
import { usePopoverEdgeClamp } from '../../composables/chrome/usePopoverEdgeClamp';
import KnobSlider from '../knobs/KnobSlider.vue';
const { open, onMouseEnter, onMouseLeave } = useHoverPopover({ devId: 'sliders' });
// Iter-2 audit: the `right: 0` anchor overflows the left edge at
// narrow viewports, clipping the knob-label column. Composable
// handles the measurement + translateX shift.
const { setPopoverEl, xShift } = usePopoverEdgeClamp(open);
/**
 * Every scalar (inputs.length === 1) knob in the registry, sorted
 * by ascending `priority` with `undefined` treated as Infinity so
 * unset knobs sit at the end. The list is flat — domains aren't
 * surfaced as headers in the popover, since the user picked the
 * priority field specifically to flatten the ordering question
 * for rapid access.
 */
const orderedKnobs = computed(() => {
    const entries = [];
    for (const [key, decl] of Object.entries(store.profile.settings.knobs)) {
        if (decl.inputs.length !== 1)
            continue;
        entries.push({ id: key, decl }); // re-brand: the knobs registry is keyed by KnobId; Object.entries widens the key to string
    }
    entries.sort((a, b) => priorityKey(a.decl) - priorityKey(b.decl));
    return entries;
});
function priorityKey(decl) {
    return decl.priority ?? Number.POSITIVE_INFINITY;
}
const count = computed(() => orderedKnobs.value.length);
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['sliders-metric']} */ ;
/** @type {__VLS_StyleScopedClasses['sliders-metric']} */ ;
/** @type {__VLS_StyleScopedClasses['m-val']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onMouseenter: (__VLS_ctx.onMouseEnter) },
    ...{ onMouseleave: (__VLS_ctx.onMouseLeave) },
    ...{ class: "metric sliders-metric" },
});
/** @type {__VLS_StyleScopedClasses['metric']} */ ;
/** @type {__VLS_StyleScopedClasses['sliders-metric']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-lbl" },
});
/** @type {__VLS_StyleScopedClasses['m-lbl']} */ ;
(__VLS_ctx.$t('toolbar.metric.sliders'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "m-val sliders-count" },
});
/** @type {__VLS_StyleScopedClasses['m-val']} */ ;
/** @type {__VLS_StyleScopedClasses['sliders-count']} */ ;
(__VLS_ctx.count);
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: (__VLS_ctx.setPopoverEl),
        ...{ class: "sliders-popover" },
        role: "tooltip",
        ...{ style: ({ transform: `translateX(${__VLS_ctx.xShift}px)` }) },
    });
    /** @type {__VLS_StyleScopedClasses['sliders-popover']} */ ;
    if (__VLS_ctx.count === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "popover-empty" },
        });
        /** @type {__VLS_StyleScopedClasses['popover-empty']} */ ;
        (__VLS_ctx.$t('toolbar.sliders.empty'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "popover-body" },
        });
        /** @type {__VLS_StyleScopedClasses['popover-body']} */ ;
        for (const [entry] of __VLS_vFor((__VLS_ctx.orderedKnobs))) {
            const __VLS_0 = KnobSlider;
            // @ts-ignore
            const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
                key: (entry.id),
                knobId: (entry.id),
                compact: true,
            }));
            const __VLS_2 = __VLS_1({
                key: (entry.id),
                knobId: (entry.id),
                compact: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_1));
            // @ts-ignore
            [onMouseEnter, onMouseLeave, $t, $t, count, count, open, setPopoverEl, xShift, orderedKnobs,];
        }
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
