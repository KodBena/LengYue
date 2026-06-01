<!--
  src/components/charts/AnalysisChartPanel.vue
  Updated to support onMouseLeave.
-->
<script setup lang="ts">
import { ref } from 'vue';
import BaseChart from './BaseChart.vue';
import ChartPreviewBox from './ChartPreviewBox.vue';
import type { BoardSnapshot } from '../../engine/board-geometry';

const props = defineProps<{
  label: string;
  series: any[];
  activeIndexAccessor?: () => number | null;
  zoomRange: [number, number];
  // Accessor (not a value) for the hover / position thumbnail, rendered by
  // the isolated <ChartPreviewBox> leaf. Passing `() => preview.value` keeps
  // the per-nav thumbnail read OUT of this host's render, so a thumbnail
  // update re-renders only the leaf — not this host or the panel above it
  // (render-coupling postmortem, 2026-05-29).
  previewAccessor?: () => BoardSnapshot | null;
  // Draw the last-move ring in the preview (the delta panel wants it; the
  // others don't). Static per panel — forwarded to MiniBoard.
  previewShowMarker?: boolean;
  // Second arg is the raw y-coordinate at the cursor (in
  // seriesIndex-0's data space). Optional because most consumers
  // (single-series panels) don't need it; the merged-delta panel
  // does, to disambiguate overlaid series by y-proximity.
  onIndexClick?: (idx: number, y?: number) => void;
  onIndexHover?: (idx: number, y?: number) => void;
  onMouseLeave?: () => void; // New prop for restoration
  playerColor?: 'B' | 'W';
  /** Forwarded to BaseChart; see its `normalize` prop docs. */
  normalize?: 'shared' | 'per-series';
  /** Forwarded to BaseChart; see its `formatXAxis` / `formatXTooltip` prop docs. */
  formatXAxis?: (val: number) => string;
  formatXTooltip?: (val: number) => string;
  /** Forwarded to BaseChart; full-tooltip override. See BaseChart's
   *  `tooltipFormatter` prop docs. */
  tooltipFormatter?: (params: any[]) => string;
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
          :active="expanded"
          :active-index-accessor="activeIndexAccessor"
          :zoom-range="zoomRange"
          :normalize="normalize"
          :format-x-axis="formatXAxis"
          :format-x-tooltip="formatXTooltip"
          :tooltip-formatter="tooltipFormatter"
          @index-hover="onIndexHover"
          @index-click="onIndexClick"
        />
      </div>
      <div class="preview-box" :class="playerColor === 'B' ? 'marker-b' : playerColor === 'W' ? 'marker-w' : ''">
        <ChartPreviewBox :accessor="previewAccessor" :show-marker="previewShowMarker" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.section { background: var(--surface-2); border: 1px solid var(--surface-3); border-radius: var(--radius-default); overflow: hidden; }
.header { padding: 0 var(--space-medium); display: flex; justify-content: space-between; cursor: pointer; font-size: var(--text-body); font-weight: bold; color: var(--text-0); text-transform: uppercase; background: var(--surface-3); letter-spacing: var(--tracking-default); }
.header:hover { background: var(--surface-3); color: var(--text-1); }
.content { border-top: 1px solid var(--surface-3); background: var(--surface-0); }
/* container-type: inline-size enables the @container query below
   so we can hide the preview-box when this row is too narrow for
   both the chart and the 140px thumbnail. Without it, the chart
   collapses to a sliver (~29px at 1024×768) because the
   preview-box has no flex-shrink and claims its width absolutely
   while the chart-area is the sacrificial flex child. */
.linear-content { display: flex; height: 160px; align-items: stretch; container-type: inline-size; }
.chart-area { flex: 1; min-width: 0; }
.preview-box { width: 140px; background: var(--surface-0); border-left: 1px solid var(--surface-3); display: flex; align-items: center; justify-content: center; }

/* magic-literal: 379px CQ threshold for hiding `.preview-box` —
   derived, not arbitrary. It's the crossing point where the 140px
   preview + a ~240px chart-area still leaves the line traces
   legible (140 + 240 = 380; <380 hides the preview). 240 is the
   project author's eyeballed legibility floor for the analysis
   line charts; if the chart's renderer changes (axis margins,
   font sizes, point density) and the floor shifts, this threshold
   moves too. */
@container (max-width: 379px) {
  .preview-box { display: none; }
}
.preview-box div { width: 100%; height: 100%; }
.marker-b { border-left: 3px solid var(--player-black); }
.marker-w { border-left: 3px solid var(--player-white); }
.chevron { font-size: var(--text-tiny); color: var(--border-3); }
</style>
