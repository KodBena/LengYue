<!--
  src/components/charts/DistributionChart.vue
  Generic distribution-visualisation primitive. Two variants:

  - 'histogram': discrete-axis count bars over each series's
    `samples`. Bin strategy is integer-aware (unit bins for
    all-integer samples like move-gap distances) and Freedman–
    Diaconis with a bin-count cap for continuous samples.
  - 'kde': continuous-axis density curve via Gaussian-kernel KDE
    with Silverman's-rule bandwidth, optionally with an
    asymptotic-SE confidence band per Wand & Jones 1995 (formula
    in `src/lib/distributions.ts`'s `kde` documentation).

  Per `docs/notes/mistake-finder-pedagogy-and-followups.md`'s
  "Generic distribution-visualisation primitive" sub-section —
  the project author flagged distribution-display as a UI shape
  with cross-surface use beyond the two named consumers, so the
  component is built for reuse from the start rather than as a
  one-off per case. Multi-series input + transparency-for-overlap
  is the canonical multi-cohort distribution-comparison shape.

  Renders directly with ECharts (no BaseChart wrap — distribution
  charts don't need the parity-interleaved hover-by-x machinery
  the analysis charts share). Collapsible panel shell mirrors
  the surrounding chart panels' visual conventions.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';
import {
  histogram,
  kde,
  type HistogramBin,
  type HistogramOptions,
  type KdeOptions,
  type KdePoint,
} from '../../lib/distributions';
import { themeColor } from '../../utils/theme-color';

export interface DistributionSeries {
  /** Legend entry + tooltip key. ECharts toggles all series sharing
   *  this name together, which is how the band-helper sub-series
   *  (for KDE uncertainty) stay tied to their main density curve. */
  name: string;
  samples: number[];
  /** Base color. Lines / bar borders render at full opacity; fills
   *  and uncertainty bands render with reduced alpha so multiple
   *  cohorts can overlap without occlusion. */
  color: string;
}

const props = defineProps<{
  label: string;
  variant: 'histogram' | 'kde';
  series: DistributionSeries[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  histogramOptions?: HistogramOptions;
  kdeOptions?: KdeOptions;
  /** Show the pointwise 95% asymptotic-SE band on KDE curves.
   *  Disabled by default — when enabled, opt-in honestly surfaces
   *  the curve's fragility (especially at low n the band dwarfs
   *  the curve, which is itself the right reading: "don't read
   *  too much into this"). KDE-only; ignored for histogram. */
  showUncertainty?: boolean;
}>();

const expanded = ref(true);
const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

// magic-literal: 250 ms trailing-throttle window for redraws. Matches
// HeatmapChart's THROTTLE_MS — 4 Hz keeps a slow-moving summary
// distribution responsive while collapsing the adaptive-query delta
// floods into one redraw per window. (During an adaptive query's
// adaptive phase every packet that touches a previously-seen turn
// forwards a fresh delta for that turn and its delta-window neighbours,
// so the KDE source churns at the packet rate — a data-changed gate
// wouldn't help there; only a time window does.) Each redraw is a full
// `notMerge: true` KDE rebuild whose cost is tail-heavy (p99 ~75 ms),
// so coalescing bursts directly cuts the dropped-frame pileups.
const THROTTLE_MS = 250;
let pendingTimer: number | null = null;
let lastRenderAt = -Infinity;
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
    } else {
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
function withAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  if (trimmed.startsWith('rgba(')) {
    return trimmed.replace(/rgba\(([^)]+)\)/, (_, body: string) => {
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
  const out: any[] = [];
  for (const entry of seriesData.value) {
    const points = entry.kdePoints as KdePoint[];
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
    const bins = entry.bins as HistogramBin[];
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
      backgroundColor: themeColor('--surface-1'),
      borderColor: themeColor('--border-2'),
      textStyle: { color: themeColor('--text-1'), fontSize: 10 },
    },
    xAxis: {
      type: 'value' as const,
      name: props.xAxisLabel ?? '',
      nameLocation: 'middle' as const,
      nameGap: 24,
      nameTextStyle: { color: themeColor('--text-2'), fontSize: 10 },
      axisLine: { lineStyle: { color: themeColor('--border-2') } },
      axisLabel: { color: themeColor('--text-2'), fontSize: 10 },
      splitLine: { lineStyle: { color: themeColor('--border-1') } },
    },
    yAxis: {
      type: 'value' as const,
      name: props.yAxisLabel ?? (props.variant === 'kde' ? 'density' : 'count'),
      nameLocation: 'middle' as const,
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
  if (!chartInstance) return;
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
  // data — only the ECharts write path differs. lazyUpdate batches the
  // canvas render into the next frame, off the setTimeout callback.
  const sig = option.series.map((s: { name: string; type: string }) => `${s.name}:${s.type}`).join('|');
  const structureChanged = sig !== lastStructureSig;
  lastStructureSig = sig;
  chartInstance.setOption(option, { notMerge: structureChanged, lazyUpdate: true });
}

/**
 * Trailing+leading throttle around `renderChart`. A chart that has been
 * quiet renders on the next tick; a chart under a packet flood renders
 * at most once per `THROTTLE_MS`. Collapsed panels schedule nothing —
 * `v-show` keeps the chart mounted, so without this gate a hidden panel
 * would pay the full KDE + `setOption` on every source change; the
 * `watch(expanded)` handler renders the current state when it re-opens.
 */
function scheduleRender() {
  if (!chartInstance || !expanded.value || pendingTimer !== null) return;
  const wait = Math.max(0, THROTTLE_MS - (performance.now() - lastRenderAt));
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null;
    lastRenderAt = performance.now();
    renderChart();
  }, wait);
}

onMounted(() => {
  if (!chartRef.value) return;
  chartInstance = echarts.init(chartRef.value);
  renderChart();
  lastRenderAt = performance.now();
  resizeObserver = new ResizeObserver(() => chartInstance?.resize());
  resizeObserver.observe(chartRef.value);
});

onUnmounted(() => {
  // The throttle timer's callback closes over chartInstance; a pending
  // redraw firing after dispose() would setOption on a disposed chart.
  // Clear it before disposal (ordering is load-bearing).
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  resizeObserver?.disconnect();
  resizeObserver = null;
  chartInstance?.dispose();
  chartInstance = null;
});

watch(
  () => [
    props.series,
    props.variant,
    props.histogramOptions,
    props.kdeOptions,
    props.showUncertainty,
  ],
  scheduleRender,
  { deep: true },
);
watch(expanded, async (now) => {
  if (now && chartInstance) {
    await nextTick();
    chartInstance.resize();
    renderChart();
  }
});
</script>

<template>
  <div class="section">
    <div class="header" @click="expanded = !expanded">
      <span>{{ label }}</span>
      <span class="chevron">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div class="content" v-show="expanded">
      <div ref="chartRef" class="chart-area"></div>
    </div>
  </div>
</template>

<style scoped>
.section {
  background: var(--surface-2);
  border: 1px solid var(--surface-3);
  border-radius: var(--radius-default);
  overflow: hidden;
  margin-bottom: var(--space-medium);
}
.header {
  padding: var(--space-default) var(--space-medium);
  display: flex;
  justify-content: space-between;
  cursor: pointer;
  font-size: var(--text-body);
  font-weight: bold;
  color: var(--text-0);
  text-transform: uppercase;
  background: var(--surface-3);
  letter-spacing: var(--tracking-default);
}
.header:hover { background: var(--surface-3); color: var(--text-1); }
.content {
  border-top: 1px solid var(--surface-3);
  background: var(--surface-0);
  height: 220px;
}
.chart-area { width: 100%; height: 100%; }
.chevron { font-size: var(--text-tiny); color: var(--border-3); }
</style>
