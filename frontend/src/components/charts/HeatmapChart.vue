<!-- 
  src/components/charts/HeatmapChart.vue 
  Stateless Heatmap renderer using ECharts.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';
import { useThumbnailCache } from '../../composables/useThumbnailCache';
import {
  colorMoveToPly,
  type HeatmapCell,
  type HeatmapDatum,
} from '../../composables/useTriangularHeatmap';
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

const updateOptions = () => {
  if (!chartInstance) return;
  const categories = Array.from({ length: props.maxMoveIndex + 1 }, (_, i) => i.toString());

  chartInstance.setOption({
    animation: false,
    grid: { top: '2%', left: '8%', right: '12%', bottom: '12%', containLabel: false },
    coordinateSystem: 'cartesian2d',
    square: true,
    backgroundColor: 'transparent',
    tooltip: {
      show: true,
      enterable: true,
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
        const thumb = 'width:80px;height:80px;display:inline-block;border:1px solid #333;background:#000;';
        return `
          <div style="font-size:11px;color:#aaa;margin-bottom:6px;">${label}</div>
          <div style="display:flex;gap:8px;">
            <div style="${thumb}">${startSvg}</div>
            <div style="${thumb}">${endSvg}</div>
          </div>`;
      }
    },
    xAxis: { 
      type: 'category', 
      data: categories,
      show: true,
      axisLabel: { fontSize: 9, color: '#666' },
      min: props.zoomRange ? Math.floor(props.zoomRange[0]/2) : 0,
      max: props.zoomRange ? Math.ceil(props.zoomRange[1]/2) : props.maxMoveIndex
    },
    yAxis: { 
      type: 'category', 
      data: categories,
      show: true,
      axisLabel: { fontSize: 9, color: '#666' },
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
      inRange: { color: ['#1a1a1a', '#4aaef0', '#f04a4a'] },
      textStyle: { color: '#666', fontSize: 9 }
    },
    series: [{
      type: 'heatmap',
      animation: false,
      data: props.data,
      progressive: 1000,
      progressiveThreshold: 3000,
      itemStyle: { borderWidth: 0 }
    }]
  }, { notMerge: false });
};

const initChart = () => {
  if (!chartRef.value) return;

  if (chartRef.value.clientWidth < 10 || chartRef.value.clientHeight < 10) {
    initTimeout = window.setTimeout(initChart, 100);
    return;
  }

  // Use SVG renderer for Firefox stability
  chartInstance = echarts.init(chartRef.value, 'dark', { renderer: 'svg' });
  
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

  updateOptions();
};

onMounted(() => {
  initChart();
});

watch(() => [props.data, props.maxMoveIndex, props.minVal, props.maxVal, props.zoomRange], () => {
  if (chartInstance) updateOptions();
});

onUnmounted(() => {
  if (initTimeout) clearTimeout(initTimeout);
  if (resizeObserver && chartRef.value) resizeObserver.unobserve(chartRef.value);
  chartInstance?.dispose();
});
</script>

<template> 
  <div ref="chartRef" style="width:100%; height:100%; min-height: 300px;"></div> 
</template>
