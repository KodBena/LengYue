<script lang="ts">
/**
 * Module-scoped singleton. Preserves user legend selections 
 * across component unmounts (tab switches, game switches).
 */
const globalLegendState: Record<string, boolean> = {};
</script>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';
import { themeColor } from '../../utils/theme-color';

const props = defineProps<{
  series: any[];
  title?: string;
  reservedWidth?: number;
  reservedHeight?: number;
  activeIndex?: number | null;
  zoomRange?: [number, number] | null;
  /**
   * Y-axis scaling discipline:
   *
   *   - `'shared'` (default) — one Y-axis with min/max computed across
   *     every visible series's data inside the X-zoom. Right when every
   *     series shares a meaningful scale (e.g., PlayerPanel's per-player
   *     deltas which are all in points-loss units).
   *
   *   - `'per-series'` — each series is min/max-normalised to [0, 1]
   *     across the X-zoom independently, all rendered on a shared
   *     [0, 1] axis with hidden labels (the axis value is uninterpretable
   *     across series). Right when series live on wildly different
   *     scales (the Game State chart: Score Lead spans ~[-361, 361]
   *     for a 19×19 board while Complexity is locked to [0, 1] and
   *     Win Probability to [0, 1]; a shared axis squashes the ratios
   *     onto the score-dominated range and the user loses the shape
   *     of the bounded series). The tooltip restores absolute
   *     magnitudes per series; the chart preserves relative shape
   *     over time, which is the per-position-quality question the
   *     panel is shaped to answer.
   *
   * Per-series mode is the rendering analogue of v1.0.20's quantile
   * color-mode on the rugplot: parametric squashing of multi-scale
   * data onto one axis is the same kind of distribution-flatten the
   * quantile mode fixed on intensity gradients. Constant-valued
   * series (range = 0) are passed through unnormalised (rendered at
   * value, on a degenerate per-series scale) rather than mapped to
   * a meaningless midpoint.
   */
  normalize?: 'shared' | 'per-series';

  /**
   * Optional formatters mapping the chart's raw x-coordinate to a
   * user-facing string. `formatXAxis` formats the axis-tick labels;
   * `formatXTooltip` formats the tooltip's x-header (which by
   * default reads "Move {raw_x}"). Use when the chart's x-space
   * is *not* the user-facing "move number" the consumer wants
   * displayed — e.g., `MergedDeltaPanel`'s parity-interleaved x
   * where each integer is a ply but the user thinks per-colour.
   * When omitted, BaseChart renders raw numeric x values on the
   * axis and the legacy "Move {x}" tooltip header.
   *
   * `formatXAxis` may return the empty string for x's that
   * shouldn't be labelled (e.g. to suppress every-other-tick
   * duplicates in a parity-interleaved layout).
   */
  formatXAxis?: (val: number) => string;
  formatXTooltip?: (val: number) => string;
}>();

let markerTimer: number | null = null;
let lastMarkerTime = 0;
const DEBOUNCE_MS = 60; 

// Two pieces of dead code were removed from this module during the
// strict-mode build sweep:
//   - `lastSeriesLength` was assigned in updateOptions but never read.
//   - `onResize` was a function reference never wired to anything;
//     resize is handled by the ResizeObserver attached in initChart().
// If either is needed in the future, restoring them is one line each;
// for now, dead-code removal keeps the module surface honest.
let lastDataRefs: any[] = [];
let lastZoomRange: string = '';
let lastSeriesNames: string = '';
let isInitialized = false;

const emit = defineEmits(['index-click', 'index-hover']);
const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

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
    if (globalLegendState[s.name] === false) continue;

    const data = s.data;
    if (!data) continue;

    for (let j = 0; j < data.length; j++) {
      const pt = data[j];
      const x = pt?.value !== undefined ? pt.value[0] : pt?.[0];
      const y = pt?.value !== undefined ? pt.value[1] : pt?.[1];

      if (x >= startX && x <= endX && y != null) {
        if (y < min) min = y;
        if (y > max) max = y;
      }
    }
  }

  if (min === Infinity) return { min: 'dataMin', max: 'dataMax' };
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
  if (props.normalize !== 'per-series') return props.series;

  const [startX, endX] = props.zoomRange || [0, Infinity];

  return props.series.map(s => {
    if (!s.data || s.data.length === 0) return s;

    let smin = Infinity;
    let smax = -Infinity;
    for (const pt of s.data) {
      const x = pt?.value !== undefined ? pt.value[0] : pt?.[0];
      const y = pt?.value !== undefined ? pt.value[1] : pt?.[1];
      if (x >= startX && x <= endX && y != null) {
        if (y < smin) smin = y;
        if (y > smax) smax = y;
      }
    }

    if (smin === Infinity) return s;
    const range = smax - smin;
    if (range === 0) return s;  // constant series; pass through unnormalised

    const normalized = s.data.map((pt: any) => {
      const x = pt?.value !== undefined ? pt.value[0] : pt?.[0];
      const y = pt?.value !== undefined ? pt.value[1] : pt?.[1];
      if (y == null) return { value: [x, null], rawY: null };
      return { value: [x, (y - smin) / range], rawY: y };
    });

    return { ...s, data: normalized };
  });
};

const getSelectionMap = () => {
  const map: Record<string, boolean> = {};
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
  if (!chartInstance) return;

  // 1. Check if references changed (O(Series) cost).
  // Because the parent's computed re-maps data on change, refs are reliable.
  const currentRefs = props.series.map(s => s.data);
  const dataChanged = currentRefs.length !== lastDataRefs.length ||
                      currentRefs.some((ref, i) => ref !== lastDataRefs[i]);

  const currentZoom = JSON.stringify(props.zoomRange);
  const zoomChanged = currentZoom !== lastZoomRange;

  // 2. If nothing changed, exit.
  if (!dataChanged && !zoomChanged && isInitialized) return;

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
      backgroundColor: themeColor('--surface-1'),
      borderColor: themeColor('--border-2'),
      textStyle: { color: themeColor('--text-1'), fontSize: 8 },
      confine: true,
      padding: 0,
      formatter: (params: any[]) => {
        let res = `<div style="line-height: 1.2; padding: var(--space-tight);">`;
        const firstParam = params[0];
        const xVal = Array.isArray(firstParam.value) ? firstParam.value[0] : firstParam.value;
        const xHeader = props.formatXTooltip ? props.formatXTooltip(xVal) : `Move ${xVal}`;
        res += `<b style="font-size: var(--text-body); color: ${themeColor('--text-1')};">${xHeader}</b>`;
        params.forEach(item => {
          // When per-series-normalised, the plotted Y is in [0, 1] and
          // the absolute magnitude is carried on the datum as `rawY`.
          // Fall back to the plotted Y for the shared-axis case.
          const dataRaw = (item.data as { rawY?: number } | undefined)?.rawY;
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
      },
      // magic-literal: axisPointer opacity 0.5 — chart-visualization role,
      // distinct from --alpha-disabled. Hand-tuned for visible-but-not-
      // intrusive cursor crosshair against the chart background.
      axisPointer: { type: 'line', lineStyle: { color: themeColor('--accent-primary'), opacity: 0.5 } }
    },
    grid: {
      // `left` was '10%' — at narrow chart-area widths (29px in the
      // iter-2 audit, pre-fix) that resolved to ~3px, below the 9px
      // fontSize of the y-axis label and the labels clipped silently.
      // 30px is enough for a "0.50"-shaped label at fontSize 9 with
      // a few pixels of breathing room; stable regardless of chart
      // width, so the y-axis stays legible at narrow control-panel
      // widths after iter-2's preview-box hide.
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
        formatter: (val: number) => val.toFixed(2)
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
      type: 'line',
      smooth: false,
      animation: false,
      symbol: s.showPoints ? 'circle' : 'none',
      symbolSize: s.showPoints ? 4 : 0,
      lineStyle: { width: 2 },
      itemStyle: s.color ? { color: s.color } : undefined,
      markPoint: { data: [] }
    }))
  }, { notMerge: namesChanged, lazyUpdate: true });

  updateMarker();
};

const updateAxisOnly = () => {
  if (!chartInstance || !isInitialized) return;
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
  if (!chartInstance || props.activeIndex == null || !isInitialized) {
    if (chartInstance) {
      chartInstance.setOption({
        series: props.series.map(() => ({ markPoint: { data: [] } }))
      }, false);
    }
    return;
  }

  const activeIdx = props.activeIndex;
  // Use the same display-series transformation the chart's setOption
  // path uses, so the marker is placed at the normalised Y coordinate
  // in per-series mode (otherwise it would land off-chart at the raw
  // y-value while the chart's data is in [0, 1]).
  const displaySeries = getDisplaySeries();
  const seriesUpdates = displaySeries.map(s => {
    const data = s.data as any[];
    if (!data || data.length === 0) return { markPoint: { data: [] } };

    let point = data[activeIdx];
    const getX = (p: any) => p?.value !== undefined ? p.value[0] : p?.[0];
    const getY = (p: any) => p?.value !== undefined ? p.value[1] : p?.[1];

    if (!point || getX(point) !== activeIdx) {
      point = data.find(d => getX(d) === activeIdx);
    }

    const yVal = getY(point);
    if (!point || yVal == null) return { markPoint: { data: [] } };

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
  if (markerTimer) clearTimeout(markerTimer);
  if (now - lastMarkerTime > DEBOUNCE_MS) {
    updateMarker();
    lastMarkerTime = now;
  } else {
    markerTimer = window.setTimeout(() => {
      updateMarker();
      lastMarkerTime = performance.now();
    }, DEBOUNCE_MS);
  }
};

let resizeObserver: ResizeObserver | null = null;


const initChart = async () => {
  await nextTick();
  if (!chartRef.value || chartRef.value.clientHeight === 0) {
    // magic-literal: 100ms re-init delay — gives the ECharts container
    // time to acquire layout. Same 100ms pattern in HeatmapChart.vue;
    // empirically reliable for the codebase's flex-based chart wrappers.
    setTimeout(initChart, 100);
    return;
  }

  chartInstance = echarts.init(chartRef.value, 'dark');

  // FLUID RESIZE: Listen to the actual DOM element, not the window.
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize();
  });
  resizeObserver.observe(chartRef.value);

  chartInstance.on('legendselectchanged', (params: any) => {
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
  zr.on('click', (params) => {
    const point = [params.offsetX, params.offsetY];
    if (chartInstance!.containPixel('grid', point)) {
      const data = chartInstance!.convertFromPixel({ seriesIndex: 0 }, point);
      emit('index-click', Math.round(data[0]), data[1]);
    }
  });
  zr.on('mousemove', (params) => {
    const point = [params.offsetX, params.offsetY];
    if (chartInstance!.containPixel('grid', point)) {
      const data = chartInstance!.convertFromPixel({ seriesIndex: 0 }, point);
      emit('index-hover', Math.round(data[0]), data[1]);
    }
  });

  updateOptions();
};

watch(() => props.zoomRange, updateOptions, { deep: false });
watch(() => props.series, updateOptions, { deep: false });
watch(() => props.activeIndex, debouncedUpdateMarker);


onMounted(initChart);
onUnmounted(() => {
  // Clear the debounced marker timer first so its callback doesn't
  // fire post-unmount and read a now-disposed chartInstance. The
  // existing callback's null-check would short-circuit safely, but
  // releasing the timer on unmount is the discipline-correct shape.
  if (markerTimer) clearTimeout(markerTimer);
  if (resizeObserver && chartRef.value) {
    resizeObserver.unobserve(chartRef.value);
    resizeObserver.disconnect();
  }
  chartInstance?.dispose();
});
</script>

<template>
  <div ref="chartRef" style="width: 100%; height: 100%;"></div>
</template>
