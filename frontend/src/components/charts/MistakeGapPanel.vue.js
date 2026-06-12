/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import DistributionChart from './DistributionChart.vue';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';
const ctx = injectAnalysisContext();
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
const __VLS_0 = DistributionChart;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    label: "Gaps Between Own-Colour Mistakes (Histogram)",
    variant: "histogram",
    series: (__VLS_ctx.ctx.mistakeGapHistogramSeries.value),
    xAxisLabel: "own-colour move gap",
}));
const __VLS_2 = __VLS_1({
    label: "Gaps Between Own-Colour Mistakes (Histogram)",
    variant: "histogram",
    series: (__VLS_ctx.ctx.mistakeGapHistogramSeries.value),
    xAxisLabel: "own-colour move gap",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
var __VLS_3;
// @ts-ignore
[ctx,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
