<!--
  src/components/charts/AnalysisChartPanel.vue
  Updated to support onMouseLeave.
-->
<script setup lang="ts">
import { ref } from 'vue';
import BaseChart from './BaseChart.vue';

const props = defineProps<{
  label: string;
  series: any[];
  activeIndex: number | null;
  zoomRange: [number, number];
  previewHtml?: string;
  onIndexClick?: (idx: number) => void;
  onIndexHover?: (idx: number) => void;
  onMouseLeave?: () => void; // New prop for restoration
  playerColor?: 'B' | 'W';
}>();

const expanded = ref(true);
</script>

<template>
  <div class="section">
    <div class="header" @click="expanded = !expanded">
      <span>{{ label }}</span>
      <span class="chevron">{{ expanded ? '▼' : '▶' }}</span>
    </div>

    <div 
      class="content linear-content" 
      v-show="expanded"
      @mouseleave="onMouseLeave" 
    >
      <div class="chart-area">
        <BaseChart
          :series="series"
          :active-index="activeIndex"
          :zoom-range="zoomRange"
          @index-hover="onIndexHover"
          @index-click="onIndexClick"
        />
      </div>
      <div class="preview-box" :class="playerColor === 'B' ? 'marker-b' : playerColor === 'W' ? 'marker-w' : ''">
        <div v-html="previewHtml || ''" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Styles remain identical to previous version */
.section { background: #181818; border: 1px solid #222; border-radius: 4px; overflow: hidden; }
.header { padding: 0 12px; display: flex; justify-content: space-between; cursor: pointer; font-size: 10px; font-weight: bold; color: #fff; text-transform: uppercase; background: #222; letter-spacing: 0.1em; }
.header:hover { background: #282828; color: #aaa; }
.content { border-top: 1px solid #222; background: #000; }
.linear-content { display: flex; height: 160px; align-items: stretch; }
.chart-area { flex: 1; min-width: 0; }
.preview-box { width: 140px; background: #000; border-left: 1px solid #222; display: flex; align-items: center; justify-content: center; }
.preview-box div { width: 100%; height: 100%; }
.marker-b { border-left: 3px solid #4aaef0; }
.marker-w { border-left: 3px solid #f04a4a; }
.chevron { font-size: 8px; color: #444; }
</style>
