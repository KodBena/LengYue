<!--
  src/components/charts/HeatmapChart.vue
  Stateless Heatmap renderer using ECharts.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import { themeColor } from '../../utils/theme-color';
import {
  colorMoveToPly,
  type HeatmapCell,
  type HeatmapDatum,
} from '../../composables/analysis/useTriangularHeatmap';
import type { BoardId, NodeId } from '../../types';

const { getSync } = useThumbnailCache();

// Branded-type signature discipline: boardId and variationPath are
// branded BoardId / NodeId[]; data is HeatmapDatum[] (objects carrying
// both the visual [x,y,v] tuple and the typed HeatmapCell), so the
// formatter and click handler recover colour and colour-local move
// indices directly rather than reconstructing them from the visual
// triangle half. The conversion to absolute ply for variationPath
// indexing routes through `colorMoveToPly` — indexing variationPath
// with a ColorMoveIndex is now a compile error.
const props = defineProps<{
  data: HeatmapDatum[];
  maxMoveIndex: number;
  minVal: number;
  maxVal: number;
  boardId?: BoardId;
  variationPath?: NodeId[];
  zoomRange?: [number, number] | null;
}>();

const emit = defineEmits<{
  'cell-click': [HeatmapCell];
}>();

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let initTimeout: number | null = null;

// ── Throttling and split update paths ───────────────────────────────────────
//
// ECharts' heatmap renderer destroys-and-recreates every Rect on every
// setOption — `HeatmapView.js` calls `group.removeAll()` before
// `_renderOnGridLike` walks the data array and builds fresh Rects. There
// is no cell-level diff. For a typical Go game the triangle holds
// 5k–22k cells; redrawing all of them on every analysis packet (even
// RAF-coalesced at 60 Hz upstream) saturates the main thread and the
// chart visibly janks under fast-backend conditions (NN-cache hits,
// proxy replay-cache replays).
//
// Three independent mitigations compose here:
//   1. Trailing-edge throttle bounds the chart to ≤ 1 redraw per
//      THROTTLE_MS, collapsing packet floods. The stability heatmap is
//      summary information that changes slowly; 4 Hz is plenty.
//   2. Split update paths (`applyData` / `applyAxes` / `applyFull`)
//      send only the option keys that actually changed, skipping
//      tooltip-formatter / category-list rebuild on data-only updates.
//      Cell redraw cost is unchanged (ECharts' fault) but option-merge
//      validation is cheaper, and the split makes the render footprint
//      auditable.
//   3. `lazyUpdate: true` defers ECharts' actual paint to the next
//      animation frame, coalescing the (rare) case of multiple
//      synchronous setOption calls within a tick.
//
// A polymorphic-renderer abstraction is parked under Future projects
// in `docs/TODO.md` — when ECharts is replaced for this surface the
// throttle constant and the split-path machinery become renderer
// configuration rather than ECharts-specific workarounds.

// magic-literal: 250ms throttle window. Chosen as the crossover where
// 4 Hz still feels responsive for slow-moving summary data while
// reducing redraw work ~15× vs. the upstream RAF rate.
const THROTTLE_MS = 250;

type UpdateMode = 'full' | 'data' | 'axes';
const modeRank: Record<UpdateMode, number> = { axes: 0, data: 1, full: 2 };

let pendingTimer: number | null = null;
let lastRenderAt = -Infinity;
let pendingMode: UpdateMode | null = null;

const buildOptions = () => {
  const categories = Array.from({ length: props.maxMoveIndex + 1 }, (_, i) => i.toString());
  return {
    animation: false,
    grid: { top: '2%', left: '8%', right: '12%', bottom: '12%', containLabel: false },
    coordinateSystem: 'cartesian2d',
    square: true,
    backgroundColor: 'transparent',
    tooltip: {
      show: true,
      enterable: true,
      backgroundColor: themeColor('--surface-1'),
      borderColor: themeColor('--border-2'),
      textStyle: { color: themeColor('--text-1') },
      formatter: (p: any) => {
        if (!p.data?.cell) return '';
        const cell = p.data.cell as HeatmapCell;
        const colorLabel = cell.color === 'B' ? 'Black' : 'White';
        const label = `${colorLabel}: moves ${cell.s}–${cell.t} &nbsp; ${cell.value.toFixed(3)}`;

        if (!props.boardId || !props.variationPath) return label;

        const startPly = colorMoveToPly(cell.s, cell.color);
        const endPly   = colorMoveToPly(cell.t, cell.color);
        // Pondering can paint a cell whose endpoint is past the live tail
        // of the known variationPath. Per ADR-0002 this is hover UX, not
        // a state-transition contract: degrade to label-only rather than
        // index out-of-bounds.
        const startNode = props.variationPath[startPly];
        const endNode   = props.variationPath[endPly];
        if (!startNode || !endNode) return label;

        const startSvg = getSync(startNode, false);
        const endSvg   = getSync(endNode, false);
        const thumb = `width:80px;height:80px;display:inline-block;border:1px solid ${themeColor('--border-2')};background:${themeColor('--surface-0')};`;
        return `
          <div style="font-size:var(--text-emphasis);color:${themeColor('--text-1')};margin-bottom:var(--space-default);">${label}</div>
          <div style="display:flex;gap:var(--space-default);">
            <div style="${thumb}">${startSvg}</div>
            <div style="${thumb}">${endSvg}</div>
          </div>`;
      }
    },
    xAxis: {
      type: 'category',
      data: categories,
      show: true,
      axisLabel: { fontSize: 9, color: themeColor('--text-2') },
      min: props.zoomRange ? Math.floor(props.zoomRange[0]/2) : 0,
      max: props.zoomRange ? Math.ceil(props.zoomRange[1]/2) : props.maxMoveIndex
    },
    yAxis: {
      type: 'category',
      data: categories,
      show: true,
      axisLabel: { fontSize: 9, color: themeColor('--text-2') },
      min: props.zoomRange ? Math.floor(props.zoomRange[0]/2) : 0,
      max: props.zoomRange ? Math.ceil(props.zoomRange[1]/2) : props.maxMoveIndex
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
  if (!chartInstance) return;
  chartInstance.setOption(buildOptions(), { notMerge: false, lazyUpdate: true });
};

// Data-only setOption: skips tooltip-formatter / axis-categories
// rebuild, sends just the changed series payload and visualMap range.
// ECharts still calls group.removeAll() inside the heatmap renderer, so
// per-cell redraw cost is unchanged; the saving is in option-merge
// validation, which is small but free given the split exists.
const applyData = () => {
  if (!chartInstance) return;
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
  if (!chartInstance) return;
  chartInstance.setOption({
    xAxis: {
      min: props.zoomRange ? Math.floor(props.zoomRange[0]/2) : 0,
      max: props.zoomRange ? Math.ceil(props.zoomRange[1]/2) : props.maxMoveIndex
    },
    yAxis: {
      min: props.zoomRange ? Math.floor(props.zoomRange[0]/2) : 0,
      max: props.zoomRange ? Math.ceil(props.zoomRange[1]/2) : props.maxMoveIndex
    }
  }, { notMerge: false, lazyUpdate: true });
};

const flushUpdate = () => {
  pendingTimer = null;
  lastRenderAt = performance.now();
  const mode = pendingMode;
  pendingMode = null;
  if (!chartInstance || !mode) return;
  if (mode === 'full') applyFull();
  else if (mode === 'data') applyData();
  else applyAxes();
};

// Trailing-edge throttle. Coalesces changes within THROTTLE_MS into one
// render and promotes pendingMode to the most-thorough mode requested
// during the window (full > data > axes), so a sequence of (axes, then
// data) collapses correctly into a single data update.
const scheduleUpdate = (mode: UpdateMode) => {
  if (!chartInstance) return;
  if (pendingMode === null || modeRank[mode] > modeRank[pendingMode]) {
    pendingMode = mode;
  }
  if (pendingTimer !== null) return;
  const elapsed = performance.now() - lastRenderAt;
  const wait = Math.max(0, THROTTLE_MS - elapsed);
  pendingTimer = window.setTimeout(flushUpdate, wait);
};

const initChart = () => {
  if (!chartRef.value) return;

  if (chartRef.value.clientWidth < 10 || chartRef.value.clientHeight < 10) {
    // magic-literal: 100ms re-init delay matching BaseChart.vue's pattern;
    // gives the ECharts container time to acquire layout.
    initTimeout = window.setTimeout(initChart, 100);
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

  chartInstance.on('click', (params: any) => {
    if (params.componentType === 'series' && params.seriesType === 'heatmap' && params.data?.cell) {
      emit('cell-click', params.data.cell as HeatmapCell);
    }
  });

  resizeObserver = new ResizeObserver(() => {
    if (!chartRef.value || chartRef.value.clientWidth < 10) return;
    chartInstance?.resize();
  });
  resizeObserver.observe(chartRef.value);

  applyFull();
  lastRenderAt = performance.now();
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
  if (pendingTimer) clearTimeout(pendingTimer);
  if (initTimeout) clearTimeout(initTimeout);
  if (resizeObserver && chartRef.value) resizeObserver.unobserve(chartRef.value);
  chartInstance?.dispose();
});
</script>

<template>
  <div ref="chartRef" style="width:100%; height:100%; min-height: 300px;"></div>
</template>
