/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';
import { themeColor } from '../../utils/theme-color';
import { STABILITY_HEATMAP_REDRAW_THROTTLE_MS as THROTTLE_MS, CHART_INIT_RETRY_MS } from '../../lib/timing';
import { createTrailingThrottle } from '../../composables/useThrottledSnapshot';
const props = defineProps();
const emit = defineEmits();
const chartRef = ref(null);
let chartInstance = null;
let resizeObserver = null;
let initTimeout = null;
const modeRank = { axes: 0, data: 1, full: 2 };
let pendingMode = null;
const buildOptions = () => {
    const categories = Array.from({ length: props.maxMoveIndex + 1 }, (_, i) => i.toString());
    return {
        animation: false,
        grid: { top: '2%', left: '8%', right: '12%', bottom: '12%', containLabel: false },
        coordinateSystem: 'cartesian2d',
        square: true,
        backgroundColor: 'transparent',
        // No ECharts tooltip: the cell info + start/end position boards render in
        // the host's fixed preview window (driven by cell-hover). Emphasis-on-
        // hover highlight still gives the which-cell feedback.
        tooltip: { show: false },
        xAxis: {
            type: 'category',
            data: categories,
            show: true,
            axisLabel: { fontSize: 9, color: themeColor('--text-2') },
            min: props.zoomRange ? Math.floor(props.zoomRange[0] / 2) : 0,
            max: props.zoomRange ? Math.ceil(props.zoomRange[1] / 2) : props.maxMoveIndex
        },
        yAxis: {
            type: 'category',
            data: categories,
            show: true,
            axisLabel: { fontSize: 9, color: themeColor('--text-2') },
            min: props.zoomRange ? Math.floor(props.zoomRange[0] / 2) : 0,
            max: props.zoomRange ? Math.ceil(props.zoomRange[1] / 2) : props.maxMoveIndex
        },
        visualMap: {
            min: props.minVal,
            max: props.maxVal,
            calculable: true,
            orient: 'vertical',
            right: 0,
            top: 'center',
            itemWidth: 10,
            // Heatmap gradient: --heatmap-low (surface-2) -> --heatmap-mid
            // (accent-primary) -> --heatmap-high (state-error). Defined as
            // chart-derived helpers in theme.css.
            inRange: { color: [themeColor('--heatmap-low'), themeColor('--heatmap-mid'), themeColor('--heatmap-high')] },
            textStyle: { color: themeColor('--text-2'), fontSize: 9 }
        },
        series: [{
                type: 'heatmap',
                animation: false,
                data: props.data,
                progressive: 1000,
                progressiveThreshold: 3000,
                itemStyle: { borderWidth: 0 }
            }]
    };
};
// Full setOption. Initial render and category-list change
// (maxMoveIndex) take this path because xAxis/yAxis.data must be
// regenerated for the new category count.
const applyFull = () => {
    if (!chartInstance)
        return;
    chartInstance.setOption(buildOptions(), { notMerge: false, lazyUpdate: true });
};
// Data-only setOption: skips tooltip-formatter / axis-categories
// rebuild, sends just the changed series payload and visualMap range.
// ECharts still calls group.removeAll() inside the heatmap renderer, so
// per-cell redraw cost is unchanged; the saving is in option-merge
// validation, which is small but free given the split exists.
const applyData = () => {
    if (!chartInstance)
        return;
    chartInstance.setOption({
        visualMap: {
            min: props.minVal,
            max: props.maxVal
        },
        series: [{
                type: 'heatmap',
                data: props.data
            }]
    }, { notMerge: false, lazyUpdate: true });
};
// Axes-only setOption: zoomRange change without data change. Cheaper
// than a full rebuild because ECharts doesn't need to revalidate the
// series or visualMap; just the axis bounds.
const applyAxes = () => {
    if (!chartInstance)
        return;
    chartInstance.setOption({
        xAxis: {
            min: props.zoomRange ? Math.floor(props.zoomRange[0] / 2) : 0,
            max: props.zoomRange ? Math.ceil(props.zoomRange[1] / 2) : props.maxMoveIndex
        },
        yAxis: {
            min: props.zoomRange ? Math.floor(props.zoomRange[0] / 2) : 0,
            max: props.zoomRange ? Math.ceil(props.zoomRange[1] / 2) : props.maxMoveIndex
        }
    }, { notMerge: false, lazyUpdate: true });
};
const flushUpdate = () => {
    const mode = pendingMode;
    pendingMode = null;
    if (!chartInstance || !mode)
        return;
    if (mode === 'full')
        applyFull();
    else if (mode === 'data')
        applyData();
    else
        applyAxes();
};
// Shared subscriber-projection throttle; the mode-accumulation above is the
// consumer-specific part (promote to the most-thorough mode in the window).
const updateThrottle = createTrailingThrottle(flushUpdate, THROTTLE_MS);
// Trailing-edge throttle. Coalesces changes within THROTTLE_MS into one
// render and promotes pendingMode to the most-thorough mode requested
// during the window (full > data > axes), so a sequence of (axes, then
// data) collapses correctly into a single data update.
const scheduleUpdate = (mode) => {
    if (!chartInstance)
        return;
    if (pendingMode === null || modeRank[mode] > modeRank[pendingMode]) {
        pendingMode = mode;
    }
    updateThrottle.schedule();
};
const initChart = () => {
    if (!chartRef.value)
        return;
    if (chartRef.value.clientWidth < 10 || chartRef.value.clientHeight < 10) {
        // Re-init delay — gives the ECharts container time to acquire
        // layout. The shared chart init-retry constant from the timing
        // catalog (`lib/timing`).
        initTimeout = window.setTimeout(initChart, CHART_INIT_RETRY_MS);
        return;
    }
    // Canvas renderer: substantially faster than SVG for heatmaps with
    // thousands of cells (the SVG path produces one DOM <rect> per cell
    // and incurs SVG-DOM diff cost on every redraw). The previous "Use
    // SVG renderer for Firefox stability" comment carried no recorded
    // provenance — no worklog, no commit message, no dispatch — and was
    // replaced with canvas as part of the heatmap-throttle change. If a
    // Firefox-specific regression surfaces, revert this single line; the
    // rest of this module is renderer-agnostic.
    chartInstance = echarts.init(chartRef.value, 'dark', { renderer: 'canvas' });
    chartInstance.on('click', (params) => {
        if (params.componentType === 'series' && params.seriesType === 'heatmap' && params.data?.cell) {
            emit('cell-click', params.data.cell); // narrow the loose ECharts param's `data.cell` to the HeatmapCell we attached when building the series
        }
    });
    // Hover drives the host's fixed preview window (replaces the old thumbnail
    // tooltip). `globalout` fires when the cursor leaves the chart entirely.
    chartInstance.on('mouseover', (params) => {
        if (params.componentType === 'series' && params.seriesType === 'heatmap' && params.data?.cell) {
            emit('cell-hover', params.data.cell); // narrow the loose ECharts param's `data.cell` to the HeatmapCell we attached when building the series
        }
    });
    chartInstance.on('mouseout', () => emit('cell-leave'));
    chartInstance.on('globalout', () => emit('cell-leave'));
    resizeObserver = new ResizeObserver(() => {
        if (!chartRef.value || chartRef.value.clientWidth < 10)
            return;
        chartInstance?.resize();
    });
    resizeObserver.observe(chartRef.value);
    applyFull();
};
onMounted(() => {
    initChart();
});
// Three watchers route to the cheapest applicable update path. When
// multiple props change in the same reactive flush, all watchers fire
// and `scheduleUpdate` promotes pendingMode to the most-thorough mode;
// only the first call schedules the timer, so coalescing is automatic.
watch(() => props.maxMoveIndex, () => scheduleUpdate('full'));
watch(() => [props.data, props.minVal, props.maxVal], () => scheduleUpdate('data'));
watch(() => props.zoomRange, () => scheduleUpdate('axes'));
onUnmounted(() => {
    // Throttle pendingTimer holds a reference to flushUpdate which closes
    // over chartInstance; clear it before disposal so a late callback
    // can't read a disposed instance. The chartInstance null-guard inside
    // flushUpdate would short-circuit safely, but discipline-correct shape
    // is to release the timer at the unmount site (mirrors BaseChart's
    // markerTimer cleanup).
    updateThrottle.cancel();
    if (initTimeout)
        clearTimeout(initTimeout);
    if (resizeObserver && chartRef.value)
        resizeObserver.unobserve(chartRef.value);
    chartInstance?.dispose();
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
    ref: "chartRef",
    ...{ style: {} },
});
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
