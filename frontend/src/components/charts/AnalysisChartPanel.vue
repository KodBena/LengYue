<!--
  src/components/charts/AnalysisChartPanel.vue
  Updated to support onMouseLeave.
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
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

// Responsive preview-hide WITHOUT a container query. `container-type:
// inline-size` + `@container (max-width: …)` re-evaluated on every style flush,
// and ECharts' canvas text rendering forces a synchronous flush per redraw — so
// the CQ recompute scaled with (forced flushes × visible panels): a per-nav
// style-recalc tax with charts visible (deferred-items "container-query
// recompute"). A ResizeObserver fires only on ACTUAL width changes (not per
// flush); the boolean toggle is idempotent, so a resize that doesn't cross the
// threshold re-renders nothing.
// magic-literal: 379px is the crossing point where the 140px preview + a ~240px
// chart-area still leave the line traces legible (140 + 240 = 380); unchanged
// from the prior @container threshold.
const PREVIEW_HIDE_BELOW_PX = 379;
const contentEl = ref<HTMLElement | null>(null);
const narrow = ref(false);
let previewWidthObserver: ResizeObserver | null = null;

onMounted(() => {
  const el = contentEl.value;
  if (!el) return;
  // ResizeObserver-cached geometry (ADR-0010 imperative-escape): width is read
  // on the observer's own layout-clean callback, never synchronously on a hot
  // path. A 0 width (the v-show-collapsed state) is treated as not-narrow; the
  // observer re-fires with the real width on re-expand.
  previewWidthObserver = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width ?? 0;
    narrow.value = w > 0 && w <= PREVIEW_HIDE_BELOW_PX;
  });
  previewWidthObserver.observe(el);
});

// Resource ownership at mutation sites (frontend CLAUDE.md) + ADR-0010
// imperative-escape step 4: the ResizeObserver lives outside Vue's reactivity
// graph and MUST be released, or every mounted analysis panel leaks an observer
// for the component's lifetime.
onUnmounted(() => {
  previewWidthObserver?.disconnect();
  previewWidthObserver = null;
});
</script>

<template>
  <div class="section">
    <div class="header" @click="expanded = !expanded">
      <span>{{ label }}</span>
      <span class="chevron">{{ expanded ? '▼' : '▶' }}</span>
    </div>

    <div
      ref="contentEl"
      class="content linear-content"
      :class="{ narrow }"
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
/* The preview-box hides when this row is too narrow for both the chart and the
   140px thumbnail (else the chart collapses to a sliver — the preview-box has no
   flex-shrink and claims its width absolutely while chart-area is the
   sacrificial flex child). This was a `container-type: inline-size` +
   `@container (max-width: 379px)` query; that re-evaluated on EVERY style flush,
   and ECharts forces one per redraw → a per-nav recompute storm (deferred-items
   "container-query recompute"). It's now driven by a ResizeObserver-toggled
   `.narrow` class (fires only on real width changes) — see the script. The
   379px threshold lives at PREVIEW_HIDE_BELOW_PX there. Dropping `container-type`
   also drops its implied layout/size containment, which is safe here: the
   chart-area and preview-box are fixed-size canvas content; nothing inside
   reflows in a way that containment would have scoped. */
.linear-content { display: flex; height: 160px; align-items: stretch; }
.chart-area { flex: 1; min-width: 0; }
.preview-box { width: 140px; background: var(--surface-0); border-left: 1px solid var(--surface-3); display: flex; align-items: center; justify-content: center; }
.linear-content.narrow .preview-box { display: none; }
.preview-box div { width: 100%; height: 100%; }
.marker-b { border-left: 3px solid var(--player-black); }
.marker-w { border-left: 3px solid var(--player-white); }
.chevron { font-size: var(--text-tiny); color: var(--border-3); }
</style>
