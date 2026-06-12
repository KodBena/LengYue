/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';
import { themeColor } from '../../utils/theme-color';
import { CHART_MARKER_DEBOUNCE_MS as DEBOUNCE_MS, BASE_CHART_REDRAW_THROTTLE_MS, CHART_INIT_RETRY_MS } from '../../lib/timing';
import { createTrailingThrottle } from '../../composables/useThrottledSnapshot';
import { reactive } from 'vue';
/**
 * Module-scoped singleton. Preserves user legend selections
 * across component unmounts (tab switches, game switches).
 *
 * Reactive so downstream panels can observe it — e.g.
 * `MergedDeltaPanel` filters its mistake-finder scatter to
 * hide black mistakes when "Black Delta" is toggled off, and
 * white mistakes when "White Delta" is. ECharts handles the
 * line series natively (one series ↔ one legend entry); panels
 * that overlay derived series whose visibility should track
 * another series's legend toggle read this map. Keyed by
 * series `name`; absent / `true` = visible, `false` = hidden.
 */
export const globalLegendState = reactive({});
export default {};
const __VLS_export = await (async () => {
    const props = withDefaults(defineProps(), {
        // Vue casts an omitted `boolean`-typed prop to `false`, not `undefined`.
        // Without this default, every consumer that omits `active` (the
        // ReviewSessionPanel intermission chart) would read `active === false`
        // and the updateOptions/updateMarker gate below would suppress the
        // chart's first setOption forever — a blank chart plus a live zr handler
        // calling containPixel on an unconfigured (`_model`-less) instance. The
        // gate is opt-in: omitted ⇒ always active.
        active: true,
    });
    let markerTimer = null;
    let lastMarkerTime = 0;
    // Two pieces of dead code were removed from this module during the
    // strict-mode build sweep:
    //   - `lastSeriesLength` was assigned in updateOptions but never read.
    //   - `onResize` was a function reference never wired to anything;
    //     resize is handled by the ResizeObserver attached in initChart().
    // If either is needed in the future, restoring them is one line each;
    // for now, dead-code removal keeps the module surface honest.
    let lastDataRefs = [];
    let lastZoomRange = '';
    let lastSeriesNames = '';
    let isInitialized = false;
    const emit = defineEmits(['index-click', 'index-hover']);
    const chartRef = ref(null);
    let chartInstance = null;
    // Set when a data/marker redraw was suppressed because the chart was
    // inactive (collapsed); flushed by the `active` watch on re-expand.
    let pendingRedraw = false;
    /**
     * Calculates the strictly visible min/max of Y values, respecting X-zoom and Legend toggles.
     */
    const getVisibleYBounds = () => {
        // Per-series mode renders every series on a normalised [0, 1] axis.
        // The 10% margin is preserved so the lines don't kiss the chart
        // edge when a series saturates at its own min/max.
        if (props.normalize === 'per-series') {
            return { min: -0.1, max: 1.1 };
        }
        let min = Infinity;
        let max = -Infinity;
        const [startX, endX] = props.zoomRange || [0, Infinity];
        for (let i = 0; i < props.series.length; i++) {
            const s = props.series[i];
            if (globalLegendState[s.name] === false)
                continue;
            const data = s.data;
            if (!data)
                continue;
            for (let j = 0; j < data.length; j++) {
                const pt = data[j];
                const x = pt?.value !== undefined ? pt.value[0] : pt?.[0];
                const y = pt?.value !== undefined ? pt.value[1] : pt?.[1];
                if (x >= startX && x <= endX && y != null) {
                    if (y < min)
                        min = y;
                    if (y > max)
                        max = y;
                }
            }
        }
        if (min === Infinity)
            return { min: 'dataMin', max: 'dataMax' };
        const range = max - min;
        // magic-literal: 10% Y-axis margin — chart-visualization padding above
        // and below the data range so peaks/troughs don't kiss the chart edge.
        // Conventional default for ECharts axis tuning.
        const margin = range === 0 ? 1 : range * 0.1;
        return { min: min - margin, max: max + margin };
    };
    /**
     * For `normalize='per-series'`, transform each series's data so that
     * the Y coordinate is the value's position in [0, 1] within the
     * series's own min/max across the X-zoom. The original value is
     * retained on each datum as `rawY` so the tooltip formatter can
     * show absolute magnitudes. Returns props.series unchanged when
     * `normalize !== 'per-series'`.
     */
    const getDisplaySeries = () => {
        if (props.normalize !== 'per-series')
            return props.series;
        const [startX, endX] = props.zoomRange || [0, Infinity];
        return props.series.map(s => {
            if (!s.data || s.data.length === 0)
                return s;
            let smin = Infinity;
            let smax = -Infinity;
            for (const pt of s.data) {
                const x = pt?.value !== undefined ? pt.value[0] : pt?.[0];
                const y = pt?.value !== undefined ? pt.value[1] : pt?.[1];
                if (x >= startX && x <= endX && y != null) {
                    if (y < smin)
                        smin = y;
                    if (y > smax)
                        smax = y;
                }
            }
            if (smin === Infinity)
                return s;
            const range = smax - smin;
            if (range === 0)
                return s; // constant series; pass through unnormalised
            const normalized = s.data.map((pt) => {
                const x = pt?.value !== undefined ? pt.value[0] : pt?.[0];
                const y = pt?.value !== undefined ? pt.value[1] : pt?.[1];
                if (y == null)
                    return { value: [x, null], rawY: null };
                return { value: [x, (y - smin) / range], rawY: y };
            });
            return { ...s, data: normalized };
        });
    };
    const getSelectionMap = () => {
        const map = {};
        props.series.forEach(s => {
            map[s.name] = globalLegendState[s.name] !== false;
        });
        return map;
    };
    /**
     * High-performance update logic.
     * Detects if a full re-render is needed based on array reference changes.
     */
    const updateOptions = () => {
        if (!chartInstance)
            return;
        // Collapsed: skip the ECharts option-merge entirely (the per-packet cost
        // this gate exists to eliminate) and remember to catch up on re-expand.
        if (props.active === false) {
            pendingRedraw = true;
            return;
        }
        // 1. Check if references changed (O(Series) cost).
        // Because the parent's computed re-maps data on change, refs are reliable.
        const currentRefs = props.series.map(s => s.data);
        const dataChanged = currentRefs.length !== lastDataRefs.length ||
            currentRefs.some((ref, i) => ref !== lastDataRefs[i]);
        const currentZoom = JSON.stringify(props.zoomRange);
        const zoomChanged = currentZoom !== lastZoomRange;
        // 2. If nothing changed, exit.
        if (!dataChanged && !zoomChanged && isInitialized)
            return;
        // 3. If only zoom/bounds changed, do a cheap axis update.
        if (!dataChanged && zoomChanged && isInitialized) {
            lastZoomRange = currentZoom;
            updateAxisOnly();
            return;
        }
        // 4. Heavy update: Data has changed or we are initializing.
        // Use notMerge: true when the set of series names has changed —
        // ECharts retains series across merges when keyed by name, so a
        // legitimate name change (palette swap, series-set restructure,
        // or the empty-series case after a purge: N names → 0 names) would
        // leave the prior names visible alongside the new ones without
        // notMerge. The "purge doesn't clear Game State" bug surfaced
        // exactly here: every BaseChart consumer except ScoreLeadPanel
        // emits at least one always-present stub series (PlayerPanel's
        // `Black Delta` / `White Delta` carry null-valued data when
        // ledger is empty), so their name-set is stable across purge and
        // merge-mode renders correctly. ScoreLeadPanel's mainSeries goes
        // from N palette-driven names to empty, and merge-mode preserves
        // the old names — hence the lingering legend + line traces.
        //
        // When names are stable and only data refs changed, merge mode
        // (notMerge: false) is preserved — that's the optimal path for
        // ponder-stream updates where ECharts' internal animation /
        // scroll / drag state should survive across data refreshes.
        //
        // Calling chartInstance.clear() here would also kill the prior
        // series, but it ALSO clears the backdrop and axis styling —
        // leaving an unconfigured ECharts element that paints as a black
        // void on dark themes. notMerge:true on a setOption that still
        // carries the full chart config (legend / tooltip / grid / axes)
        // replaces the series list cleanly while preserving the frame.
        const currentNames = props.series.map(s => s.name).join('|');
        const namesChanged = currentNames !== lastSeriesNames;
        lastDataRefs = currentRefs;
        lastZoomRange = currentZoom;
        lastSeriesNames = currentNames;
        isInitialized = true;
        const bounds = getVisibleYBounds();
        chartInstance.setOption({
            animation: false,
            backgroundColor: 'transparent',
            legend: {
                show: true,
                selected: getSelectionMap(),
                textStyle: { color: themeColor('--text-2'), fontSize: 10 },
                top: '0%',
                left: 'center'
            },
            tooltip: {
                trigger: 'axis',
                showContent: true,
                // surface-0 + text-1 matches the SPA's canonical popover
                // styling (e.g., EngineQueueTooltip) rather than the prior
                // surface-1 which is invisible against text-2 in light themes
                // where surface-1 and text-2 both resolve to the same
                // cluster value (per the cluster-12 palette's chrome
                // convention).
                backgroundColor: themeColor('--surface-0'),
                borderColor: themeColor('--border-2'),
                textStyle: { color: themeColor('--text-1'), fontSize: 8 },
                confine: true,
                padding: 0,
                formatter: props.tooltipFormatter ?? ((params) => {
                    let res = `<div style="line-height: 1.2; padding: var(--space-tight);">`;
                    const firstParam = params[0];
                    const xVal = Array.isArray(firstParam.value) ? firstParam.value[0] : firstParam.value;
                    const xHeader = props.formatXTooltip ? props.formatXTooltip(xVal) : `Move ${xVal}`;
                    res += `<b style="font-size: var(--text-body); color: ${themeColor('--text-1')};">${xHeader}</b>`;
                    params.forEach(item => {
                        // When per-series-normalised, the plotted Y is in [0, 1] and
                        // the absolute magnitude is carried on the datum as `rawY`.
                        // Fall back to the plotted Y for the shared-axis case.
                        const dataRaw = item.data?.rawY;
                        const yVal = dataRaw !== undefined && dataRaw !== null
                            ? dataRaw
                            : (Array.isArray(item.value) ? item.value[1] : item.value);
                        const val = typeof yVal === 'number' ? yVal.toFixed(2) : yVal;
                        res += `
            <div style="margin-top: 2px; display: flex; align-items: center; gap: var(--space-tight);">
              ${item.marker.replace('width:10px;height:10px', 'width:6px;height:6px')}
              <span style="color: ${themeColor('--text-1')};">${item.seriesName}:</span>
              <b style="margin-left: auto;">${val}</b>
            </div>`;
                    });
                    res += `</div>`;
                    return res;
                }),
                // magic-literal: axisPointer opacity 0.5 — chart-visualization role,
                // distinct from --alpha-disabled. Hand-tuned for visible-but-not-
                // intrusive cursor crosshair against the chart background.
                axisPointer: { type: 'line', lineStyle: { color: themeColor('--accent-primary'), opacity: 0.5 } }
            },
            grid: {
                // magic-literal: 30px y-axis-grid `left` margin — replaces the
                // prior '10%' which at narrow chart-area widths (29px in the
                // iter-2 audit pre-fix) resolved to ~3px, below the 9px y-axis
                // label fontSize and clipped silently. 30 is enough for a
                // "0.50"-shaped label at fontSize 9 with a few px of breathing
                // room; stable regardless of chart width. If the y-axis label
                // fontSize grows (currently 9, set immediately below), or the
                // longest expected label widens past "0.50"/"+99", retune.
                left: 30,
                right: props.reservedWidth ? `${props.reservedWidth + 20}px` : '5%',
                bottom: props.reservedHeight ? `${props.reservedHeight + 10}px` : '15%',
                top: '15%',
                containLabel: false
            },
            yAxis: {
                type: 'value',
                min: bounds.min,
                max: bounds.max,
                axisLabel: {
                    fontSize: 9,
                    color: themeColor('--text-2'),
                    // Hide the axis labels in per-series mode: a number in [0, 1]
                    // doesn't tell the operator which series's scale they're
                    // reading, so the label is actively misleading. Hover restores
                    // absolute magnitudes via the tooltip's rawY path.
                    show: props.normalize !== 'per-series',
                    formatter: (val) => val.toFixed(2)
                },
                splitLine: { lineStyle: { color: themeColor('--surface-3') } }
            },
            xAxis: {
                type: 'value',
                show: true,
                min: props.zoomRange ? props.zoomRange[0] : 'dataMin',
                max: props.zoomRange ? props.zoomRange[1] : 'dataMax',
                // Spread the `axisLabel` key in *only* when a formatter is
                // provided. Setting it to `undefined` explicitly clobbers
                // ECharts' default tick labels (the symptom: panels that
                // didn't opt into a custom formatter lost their tick
                // labels entirely on `setOption` with `notMerge:
                // namesChanged`).
                ...(props.formatXAxis && {
                    axisLabel: { formatter: props.formatXAxis },
                }),
            },
            series: getDisplaySeries().map(s => ({
                name: s.name,
                data: s.data,
                // Default 'line' preserved; scatter / bar / etc. opt in by
                // setting `s.type` on the series object. Per-datum styling
                // (itemStyle, symbolSize) is honoured by ECharts and is the
                // canonical channel for variable-per-point appearance —
                // mistake-finder dots (variable color + size per severity)
                // ride here without further BaseChart plumbing.
                type: s.type ?? 'line',
                smooth: false,
                animation: false,
                symbol: s.showPoints ? 'circle' : 'none',
                symbolSize: s.showPoints ? 4 : 0,
                lineStyle: { width: 2 },
                itemStyle: s.color ? { color: s.color } : undefined,
                z: s.z,
                markPoint: { data: [] }
            }))
        }, { notMerge: namesChanged, lazyUpdate: true });
        updateMarker();
    };
    const updateAxisOnly = () => {
        if (!chartInstance || !isInitialized)
            return;
        const bounds = getVisibleYBounds();
        chartInstance.setOption({
            xAxis: {
                min: props.zoomRange ? props.zoomRange[0] : 'dataMin',
                max: props.zoomRange ? props.zoomRange[1] : 'dataMax'
            },
            yAxis: {
                min: bounds.min,
                max: bounds.max
            }
        }, { notMerge: false, lazyUpdate: true });
    };
    const updateMarker = () => {
        // Collapsed: defer the marker setOption too (per-nav work while hidden).
        if (props.active === false) {
            pendingRedraw = true;
            return;
        }
        // Read the cursor through the accessor; the marker path is this function +
        // the watch below, decoupled from the Vue render tree.
        const activeIdx = props.activeIndexAccessor ? props.activeIndexAccessor() : null;
        if (!chartInstance || activeIdx == null || !isInitialized) {
            if (chartInstance) {
                chartInstance.setOption({
                    series: props.series.map(() => ({ markPoint: { data: [] } }))
                }, false);
            }
            return;
        }
        // Use the same display-series transformation the chart's setOption
        // path uses, so the marker is placed at the normalised Y coordinate
        // in per-series mode (otherwise it would land off-chart at the raw
        // y-value while the chart's data is in [0, 1]).
        const displaySeries = getDisplaySeries();
        const seriesUpdates = displaySeries.map(s => {
            // No cast: `s` is already `any` (props.series is any[] — part of the
            // recorded no-explicit-any backlog, see eslint.config.js header), so
            // the historical `as any[]` here added nothing. The two element
            // shapes (tuple vs { value } datum) are handled structurally by
            // getX/getY below.
            const data = s.data;
            if (!data || data.length === 0)
                return { markPoint: { data: [] } };
            let point = data[activeIdx];
            const getX = (p) => p?.value !== undefined ? p.value[0] : p?.[0];
            const getY = (p) => p?.value !== undefined ? p.value[1] : p?.[1];
            if (!point || getX(point) !== activeIdx) {
                point = data.find((d) => getX(d) === activeIdx);
            }
            const yVal = getY(point);
            if (!point || yVal == null)
                return { markPoint: { data: [] } };
            return {
                markPoint: {
                    animation: false,
                    silent: true,
                    symbol: 'circle',
                    symbolSize: 8,
                    label: { show: false },
                    itemStyle: {
                        color: themeColor('--accent-primary'),
                        borderColor: themeColor('--text-0'),
                        borderWidth: 1,
                        shadowBlur: 4,
                        shadowColor: 'rgba(0,0,0,0.5)'
                    },
                    data: [{ coord: [activeIdx, yVal] }]
                }
            };
        });
        chartInstance.setOption({ series: seriesUpdates }, { notMerge: false, lazyUpdate: true });
    };
    const debouncedUpdateMarker = () => {
        const now = performance.now();
        if (markerTimer)
            clearTimeout(markerTimer);
        if (now - lastMarkerTime > DEBOUNCE_MS) {
            updateMarker();
            lastMarkerTime = now;
        }
        else {
            markerTimer = window.setTimeout(() => {
                updateMarker();
                lastMarkerTime = performance.now();
            }, DEBOUNCE_MS);
        }
    };
    let resizeObserver = null;
    const initChart = async () => {
        await nextTick();
        if (!chartRef.value || chartRef.value.clientHeight === 0) {
            // Re-init delay — gives the ECharts container time to acquire
            // layout. The shared chart init-retry constant from the timing
            // catalog (`lib/timing`), also used by HeatmapChart.
            setTimeout(initChart, CHART_INIT_RETRY_MS);
            return;
        }
        chartInstance = echarts.init(chartRef.value, 'dark');
        // FLUID RESIZE: Listen to the actual DOM element, not the window.
        resizeObserver = new ResizeObserver(() => {
            chartInstance?.resize();
        });
        resizeObserver.observe(chartRef.value);
        chartInstance.on('legendselectchanged', (params) => {
            Object.assign(globalLegendState, params.selected);
            updateAxisOnly();
        });
        const zr = chartInstance.getZr();
        // Click/hover emit two args: the rounded x-coordinate (in
        // seriesIndex-0's space) and the raw y-coordinate at the
        // pixel under the cursor. Existing single-arg listeners
        // (ScoreLeadPanel, PlayerPanel) ignore the y harmlessly via
        // JavaScript's positional-args slack; the merged-delta panel
        // consumes the y to disambiguate which of its overlaid series
        // the user clicked closest to (per-color move dispatch).
        // `containPixel` dereferences the chart's internal `_model`, which is
        // only built by the first `setOption` (updateOptions). A chart can be
        // init'd-but-not-yet-configured — e.g. it mounts while collapsed
        // (`active === false`) and the gate defers the first setOption. Guard on
        // `isInitialized` (set true exactly when setOption first runs) so a stray
        // pointer event over an unconfigured instance is a no-op, not a crash.
        zr.on('click', (params) => {
            if (!isInitialized)
                return;
            const point = [params.offsetX, params.offsetY];
            if (chartInstance.containPixel('grid', point)) {
                const data = chartInstance.convertFromPixel({ seriesIndex: 0 }, point);
                emit('index-click', Math.round(data[0]), data[1]);
            }
        });
        zr.on('mousemove', (params) => {
            if (!isInitialized)
                return;
            const point = [params.offsetX, params.offsetY];
            if (chartInstance.containPixel('grid', point)) {
                const data = chartInstance.convertFromPixel({ seriesIndex: 0 }, point);
                emit('index-hover', Math.round(data[0]), data[1]);
            }
        });
        updateOptions();
    };
    // Series-data redraw throttle (the shared subscriber-projection mechanism).
    // The parent re-maps `series` (new refs) on every analysis packet; without
    // coalescing, `updateOptions` -> setOption (the expensive ECharts
    // option-merge) would run at the packet rate (~24/s). `updateOptions` reads
    // the latest props at execution time, so the coalesced redraw always reflects
    // the newest data. The zoom watch below stays prompt (user-driven, debounced
    // upstream).
    const dataThrottle = createTrailingThrottle(updateOptions, BASE_CHART_REDRAW_THROTTLE_MS);
    watch(() => props.zoomRange, updateOptions, { deep: false });
    watch(() => props.series, dataThrottle.schedule, { deep: false });
    watch(() => (props.activeIndexAccessor ? props.activeIndexAccessor() : null), debouncedUpdateMarker);
    // Re-expand: flush the redraw/marker deferred while collapsed, so the chart
    // catches up to the latest data in one pass (vs having run setOption per
    // packet while hidden). Only AnalysisChartPanel passes `active`; consumers
    // that omit it never gate, so this watch never fires for them.
    watch(() => props.active, (now) => {
        if (now !== false && pendingRedraw) {
            pendingRedraw = false;
            updateOptions();
            updateMarker();
        }
    });
    onMounted(initChart);
    onUnmounted(() => {
        // Clear the debounced marker timer first so its callback doesn't
        // fire post-unmount and read a now-disposed chartInstance. The
        // existing callback's null-check would short-circuit safely, but
        // releasing the timer on unmount is the discipline-correct shape.
        if (markerTimer)
            clearTimeout(markerTimer);
        // Release the data-redraw throttle timer too, so a pending setOption
        // can't fire into a disposed chartInstance.
        dataThrottle.cancel();
        if (resizeObserver && chartRef.value) {
            resizeObserver.unobserve(chartRef.value);
            resizeObserver.disconnect();
        }
        chartInstance?.dispose();
    });
    const __VLS_defaults = {
        // Vue casts an omitted `boolean`-typed prop to `false`, not `undefined`.
        // Without this default, every consumer that omits `active` (the
        // ReviewSessionPanel intermission chart) would read `active === false`
        // and the updateOptions/updateMarker gate below would suppress the
        // chart's first setOption forever — a blank chart plus a live zr handler
        // calling containPixel on an unconfigured (`_model`-less) instance. The
        // gate is opt-in: omitted ⇒ always active.
        active: true,
    };
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
    return (await import('vue')).defineComponent({
        emits: {},
        __defaults: __VLS_defaults,
        __typeProps: {},
    });
})();
