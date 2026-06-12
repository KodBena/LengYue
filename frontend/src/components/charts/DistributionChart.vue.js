/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';
import { histogram, kde, } from '../../lib/distributions';
import { themeColor } from '../../utils/theme-color';
import { DISTRIBUTION_REDRAW_THROTTLE_MS as THROTTLE_MS } from '../../lib/timing';
import { createTrailingThrottle } from '../../composables/useThrottledSnapshot';
const props = defineProps();
const expanded = ref(true);
const chartRef = ref(null);
let chartInstance = null;
let resizeObserver = null;
// Last-rendered ECharts series structure signature (cohort names ×
// types × count). When it is unchanged we merge data into the live
// chart instead of purging+rebuilding it — see renderChart.
let lastStructureSig = '';
// Cache the per-series computed shape (KDE points or histogram
// bins). `computed` keeps it reactive to props changes.
const seriesData = computed(() => {
    return props.series.map(s => {
        if (props.variant === 'kde') {
            return {
                meta: s,
                kdePoints: kde(s.samples, { ...props.kdeOptions, withBand: props.showUncertainty }),
            };
        }
        else {
            return {
                meta: s,
                bins: histogram(s.samples, props.histogramOptions),
            };
        }
    });
});
/**
 * Convert a CSS color string into an rgba() with the given alpha.
 * Handles `#rrggbb`, `#rgb`, `rgb(...)`, and `rgba(...)` shapes
 * (which is what `themeColor()` returns; any hex notation from
 * the theme tokens also resolves through here).
 */
function withAlpha(color, alpha) {
    const trimmed = color.trim();
    if (trimmed.startsWith('rgba(')) {
        return trimmed.replace(/rgba\(([^)]+)\)/, (_, body) => {
            const parts = body.split(',').map(p => p.trim());
            return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
        });
    }
    if (trimmed.startsWith('rgb(')) {
        return trimmed.replace(/rgb\(([^)]+)\)/, `rgba($1, ${alpha})`);
    }
    if (trimmed.startsWith('#')) {
        let hex = trimmed.slice(1);
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    // Unknown shape — fall back to the input (no alpha override).
    return trimmed;
}
function buildKdeSeries() {
    const out = [];
    for (const entry of seriesData.value) {
        const points = entry.kdePoints; // seriesData is a {kdePoints}|{bins} union; this path runs only in the 'kde' variant so kdePoints is present
        const { meta } = entry;
        // Uncertainty bounds rendered as two dashed lines bracketing
        // the density curve — the same colour, lighter weight, dashed
        // pattern keeps the bound semantics distinct from the density
        // semantics (different visual language for different concept).
        // The earlier stack-trick fill-between approach had two
        // problems: it required helper series whose visibility wasn't
        // reliably toggled by ECharts' name-based legend mechanism
        // (stack-grouped silent siblings kept rendering after the
        // main curve was hidden), and the fill polygon read as "this
        // is a density too" rather than as a bound on the main curve.
        // All three series here share `name: meta.name`, so the legend
        // entry for that name toggles them together.
        if (props.showUncertainty && points[0]?.lower !== undefined) {
            out.push({
                name: meta.name,
                type: 'line',
                symbol: 'none',
                animation: false,
                lineStyle: { width: 1, color: meta.color, type: 'dashed', opacity: 0.5 },
                itemStyle: { color: meta.color },
                z: 8,
                data: points.map(p => [p.x, p.lower ?? 0]),
            });
            out.push({
                name: meta.name,
                type: 'line',
                symbol: 'none',
                animation: false,
                lineStyle: { width: 1, color: meta.color, type: 'dashed', opacity: 0.5 },
                itemStyle: { color: meta.color },
                z: 8,
                data: points.map(p => [p.x, p.upper ?? 0]),
            });
        }
        // Main density line on top.
        out.push({
            name: meta.name,
            type: 'line',
            smooth: false,
            symbol: 'none',
            animation: false,
            lineStyle: { width: 2, color: meta.color },
            areaStyle: { color: withAlpha(meta.color, 0.18) },
            itemStyle: { color: meta.color },
            z: 10,
            data: points.map(p => [p.x, p.density]),
        });
    }
    return out;
}
function buildHistogramSeries() {
    return seriesData.value.map((entry, idx) => {
        const bins = entry.bins; // seriesData is a {kdePoints}|{bins} union; this path runs only in the non-kde variant so bins is present
        const { meta } = entry;
        return {
            name: meta.name,
            type: 'bar',
            animation: false,
            // barGap '-100%' on every series makes all bar series at the
            // same x overlap rather than group side-by-side. Combined
            // with per-series alpha, the overlap is readable for
            // multi-cohort histograms.
            barGap: '-100%',
            barWidth: '90%',
            itemStyle: {
                color: withAlpha(meta.color, 0.45),
                borderColor: meta.color,
                borderWidth: 1,
            },
            // Later series render on top, so we don't need explicit z —
            // the alpha keeps both visible regardless.
            z: 5 + idx,
            data: bins.map(b => [b.center, b.count]),
        };
    });
}
function buildOption() {
    const series = props.variant === 'kde' ? buildKdeSeries() : buildHistogramSeries();
    const seriesNames = Array.from(new Set(props.series.map(s => s.name)));
    return {
        animation: false,
        backgroundColor: 'transparent',
        grid: { top: 24, bottom: 36, left: 12, right: 16, containLabel: true },
        legend: {
            show: true,
            data: seriesNames,
            // Explicit icon shape — ECharts auto-derives from series
            // type / symbol by default, which gives KDE entries a
            // line-with-dot shape, histogram entries a block, and the
            // disabled state for line series renders as a dot-only
            // shape (inconsistent across variants and confusing in
            // disabled state). Pinning to roundRect makes both
            // variants read as "this colour swatch is this cohort,"
            // and the disabled state is the standard greyed-out
            // rectangle ECharts paints for all icon shapes.
            icon: 'roundRect',
            itemWidth: 14,
            itemHeight: 8,
            top: 0,
            left: 'center',
            textStyle: { color: themeColor('--text-2'), fontSize: 10 },
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: props.variant === 'kde' ? 'line' : 'shadow' },
            backgroundColor: themeColor('--surface-0'),
            borderColor: themeColor('--border-2'),
            textStyle: { color: themeColor('--text-1'), fontSize: 10 },
        },
        xAxis: {
            type: 'value',
            name: props.xAxisLabel ?? '',
            nameLocation: 'middle',
            nameGap: 24,
            nameTextStyle: { color: themeColor('--text-2'), fontSize: 10 },
            axisLine: { lineStyle: { color: themeColor('--border-2') } },
            axisLabel: { color: themeColor('--text-2'), fontSize: 10 },
            splitLine: { lineStyle: { color: themeColor('--border-1') } },
        },
        yAxis: {
            type: 'value',
            name: props.yAxisLabel ?? (props.variant === 'kde' ? 'density' : 'count'),
            nameLocation: 'middle',
            nameGap: 36,
            nameTextStyle: { color: themeColor('--text-2'), fontSize: 10 },
            axisLine: { lineStyle: { color: themeColor('--border-2') } },
            axisLabel: { color: themeColor('--text-2'), fontSize: 10 },
            splitLine: { lineStyle: { color: themeColor('--border-1') } },
        },
        series,
    };
}
function renderChart() {
    if (!chartInstance)
        return;
    const option = buildOption();
    // Incremental-merge unless the series STRUCTURE changes. ECharts
    // merges each series' `data` cheaply with notMerge:false, but a
    // *shrinking* series set — the uncertainty-band sub-series
    // disappearing, a variant switch, a cohort dropping out — leaves
    // stale ghost series behind unless purged (the exact failure the
    // band-toggling note in buildKdeSeries warns about). So purge
    // (notMerge:true) exactly when the structure signature changes;
    // during streaming the structure is stable (same cohorts, same band
    // presence), so the hot path is the cheap merge. Mirrors BaseChart's
    // `namesChanged` gate. Lossless: same KDE, same resolution, same
    // data — only the ECharts write path differs.
    //
    // No lazyUpdate: a single throttled redraw per window has nothing to
    // batch, and deferring the paint into the next rAF only loads the
    // already-saturated regime-B frames (measured: +9% RefreshDriverTick
    // p50 when lazyUpdate was on). Keeping the now-incremental paint
    // synchronous in the throttle's setTimeout holds it off the frame path.
    const sig = option.series.map((s) => `${s.name}:${s.type}`).join('|');
    const structureChanged = sig !== lastStructureSig;
    lastStructureSig = sig;
    chartInstance.setOption(option, { notMerge: structureChanged });
}
/**
 * Trailing+leading throttle around `renderChart`. A chart that has been
 * quiet renders on the next tick; a chart under a packet flood renders
 * at most once per `THROTTLE_MS`. Collapsed panels schedule nothing —
 * `v-show` keeps the chart mounted, so without this gate a hidden panel
 * would pay the full KDE + `setOption` on every source change; the
 * `watch(expanded)` handler renders the current state when it re-opens.
 */
const renderThrottle = createTrailingThrottle(renderChart, THROTTLE_MS);
function scheduleRender() {
    // Collapsed panels schedule nothing (see the doc above); the shared
    // subscriber-projection throttle owns the timer.
    if (chartInstance && expanded.value)
        renderThrottle.schedule();
}
onMounted(() => {
    if (!chartRef.value)
        return;
    chartInstance = echarts.init(chartRef.value);
    renderChart();
    resizeObserver = new ResizeObserver(() => chartInstance?.resize());
    resizeObserver.observe(chartRef.value);
});
onUnmounted(() => {
    // The throttle timer's callback closes over chartInstance; a pending
    // redraw firing after dispose() would setOption on a disposed chart.
    // Cancel it before disposal (ordering is load-bearing).
    renderThrottle.cancel();
    resizeObserver?.disconnect();
    resizeObserver = null;
    chartInstance?.dispose();
    chartInstance = null;
});
watch(() => [
    props.series,
    props.variant,
    props.histogramOptions,
    props.kdeOptions,
    props.showUncertainty,
], scheduleRender, { deep: true });
watch(expanded, async (now) => {
    if (now && chartInstance) {
        await nextTick();
        chartInstance.resize();
        renderChart();
    }
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
/** @type {__VLS_StyleScopedClasses['header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section" },
});
/** @type {__VLS_StyleScopedClasses['section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.expanded = !__VLS_ctx.expanded;
            // @ts-ignore
            [expanded, expanded,];
        } },
    ...{ class: "header" },
});
/** @type {__VLS_StyleScopedClasses['header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.label);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "chevron" },
});
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
(__VLS_ctx.expanded ? '▼' : '▶');
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "content" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.expanded) }, null, null);
/** @type {__VLS_StyleScopedClasses['content']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ref: "chartRef",
    ...{ class: "chart-area" },
});
/** @type {__VLS_StyleScopedClasses['chart-area']} */ ;
// @ts-ignore
[expanded, expanded, label,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
