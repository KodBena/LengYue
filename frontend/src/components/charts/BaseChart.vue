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
let isInitialized = false;

const emit = defineEmits(['index-click', 'index-hover']);
const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

/**
 * Calculates the strictly visible min/max of Y values, respecting X-zoom and Legend toggles.
 */
const getVisibleYBounds = () => {
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
  const margin = range === 0 ? 1 : range * 0.1;
  return { min: min - margin, max: max + margin };
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
  lastDataRefs = currentRefs;
  lastZoomRange = currentZoom;
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
      textStyle: { fontSize: 8 },
      confine: true,
      padding: 0,
      formatter: (params: any[]) => {
        let res = `<div style="line-height: 1.2; padding: var(--space-tight);">`;
        const firstParam = params[0];
        const xVal = Array.isArray(firstParam.value) ? firstParam.value[0] : firstParam.value;
        res += `<b style="font-size: var(--text-body); color: ${themeColor('--text-1')};">Move ${xVal}</b>`;
        params.forEach(item => {
          const yVal = Array.isArray(item.value) ? item.value[1] : item.value;
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
      axisPointer: { type: 'line', lineStyle: { color: themeColor('--accent-primary'), opacity: 0.5 } }
    },
    grid: { 
      left: '10%', 
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
        formatter: (val: number) => val.toFixed(2) // Fixed precision as requested
      },
      splitLine: { lineStyle: { color: themeColor('--surface-3') } }
    },
    xAxis: { 
      type: 'value', 
      show: true,
      min: props.zoomRange ? props.zoomRange[0] : 'dataMin',
      max: props.zoomRange ? props.zoomRange[1] : 'dataMax'
    },
    series: props.series.map(s => ({
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
  }, { notMerge: false, lazyUpdate: true });

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
  const seriesUpdates = props.series.map(s => {
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
  zr.on('click', (params) => {
    const point = [params.offsetX, params.offsetY];
    if (chartInstance!.containPixel('grid', point)) {
      const data = chartInstance!.convertFromPixel({ seriesIndex: 0 }, point);
      emit('index-click', Math.round(data[0]));
    }
  });
  zr.on('mousemove', (params) => {
    const point = [params.offsetX, params.offsetY];
    if (chartInstance!.containPixel('grid', point)) {
      const data = chartInstance!.convertFromPixel({ seriesIndex: 0 }, point);
      emit('index-hover', Math.round(data[0]));
    }
  });

  updateOptions();
};

watch(() => props.zoomRange, updateOptions, { deep: false });
watch(() => props.series, updateOptions, { deep: false });
watch(() => props.activeIndex, debouncedUpdateMarker);


onMounted(initChart);
onUnmounted(() => {
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
