<!--
  src/components/charts/MultiresolutionIntervalPanel.vue
  Hosts the triangular multiresolution-interval heatmap. Wires the
  per-board variationPath into `useTriangularHeatmap`, then
  translates a heatmap cell click into an absolute-ply selection
  range for the broader analysis chart.

  The proxy's `Triangular()` pipeline emits, for every pair of
  colour-local move indices (s, t) with s ≤ t, the `summary_fn`
  of the delta stream over that interval (`min` for the
  quality/default palettes, `mean` for the score/rank palettes).
  The triangular cell at (s, t) is therefore a summary at one
  specific scale (length = t - s + 1); the matrix as a whole is
  the multi-scale view across every possible interval.
  "Multiresolution" is the conventional term for this kind of
  many-scales-at-once analysis (signal-processing vocabulary).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import HeatmapChart             from './HeatmapChart.vue';
import MiniBoard                from '../board/MiniBoard.vue';
import {
  colorMoveToPly,
  useTriangularHeatmap,
  type HeatmapCell,
} from '../../composables/analysis/useTriangularHeatmap';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import type { BoardSnapshot } from '../../engine/board-geometry';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';

// Phase-0 projection seam: self-source from the injected AnalysisContext;
// the cell-click selection routes through the context mutator (was an
// emit the dashboard re-wired to setSelectionRange).
const ctx = injectAnalysisContext();
const boardId        = ctx.boardId;
const variationPath  = ctx.variationPath;
const selectionRange = ctx.selectionRange;

const expanded = ref(true);

const heatmapResults = useTriangularHeatmap(variationPath);

function handleCellClick(cell: HeatmapCell) {
  // s ≤ t holds by the proxy's Triangular() contract, so order-preserving
  // conversion suffices; both endpoints route through `colorMoveToPly` so
  // the colour-local → absolute-ply mapping is the same as the preview uses.
  const startTurn = colorMoveToPly(cell.s, cell.color);
  const endTurn   = colorMoveToPly(cell.t, cell.color);
  ctx.setSelectionRange([startTurn, endTurn]);
}

// ── Fixed preview window (replaces the ECharts thumbnail tooltip) ───────────
// The heatmap emits cell-hover; we resolve the interval's start/end positions
// to BoardSnapshots and render them as MiniBoards below the chart.
const { getSnapshot } = useThumbnailCache();
const hoveredCell = ref<HeatmapCell | null>(null);
const startSnap = ref<BoardSnapshot | null>(null);
const endSnap   = ref<BoardSnapshot | null>(null);

const caption = computed(() => {
  const c = hoveredCell.value;
  if (!c) return '';
  const colorLabel = c.color === 'B' ? 'Black' : 'White';
  return `${colorLabel}: moves ${c.s}–${c.t} · ${c.value.toFixed(3)}`;
});

// Latest-wins guard: rapid hovers issue overlapping async snapshot fetches;
// only the most recent result is allowed to land.
let hoverToken = 0;
watch(hoveredCell, async (cell) => {
  const token = ++hoverToken;
  if (!cell) { startSnap.value = null; endSnap.value = null; return; }
  const startNode = variationPath.value[colorMoveToPly(cell.s, cell.color)];
  const endNode   = variationPath.value[colorMoveToPly(cell.t, cell.color)];
  // Pondering can paint a cell whose endpoint is past the live tail of the
  // known variationPath; degrade to whichever board resolves (hover UX, not
  // a state-transition contract — ADR-0002).
  const [s, e] = await Promise.all([
    startNode ? getSnapshot(startNode, boardId) : Promise.resolve(null),
    endNode   ? getSnapshot(endNode,   boardId) : Promise.resolve(null),
  ]);
  if (token !== hoverToken) return;
  startSnap.value = s;
  endSnap.value   = e;
});
</script>

<template>
  <div class="section">
    <div class="header" @click="expanded = !expanded">
      <span>Multiresolution Interval Analysis</span>
      <span class="chevron">{{ expanded ? '▼' : '▶' }}</span>
    </div>

    <div class="content heatmap-content" v-show="expanded">
      <div class="heatmap-chart-area">
        <HeatmapChart
          :data="heatmapResults.matrix"
          :max-move-index="heatmapResults.moveCount"
          :min-val="heatmapResults.min"
          :max-val="heatmapResults.max"
          :zoom-range="selectionRange"
          @cell-click="handleCellClick"
          @cell-hover="hoveredCell = $event"
          @cell-leave="hoveredCell = null"
        />
      </div>

      <!-- Fixed interval-preview window: start + end position of the hovered
           cell's move-range. Replaces the old at-cursor ECharts tooltip. -->
      <div class="heatmap-preview">
        <div class="preview-caption">{{ caption || 'Hover a cell to preview its interval' }}</div>
        <div class="preview-boards">
          <div class="preview-board"><MiniBoard v-if="startSnap" :snapshot="startSnap" /></div>
          <div class="preview-board"><MiniBoard v-if="endSnap" :snapshot="endSnap" /></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section { background: var(--surface-2); border: 1px solid var(--surface-3); border-radius: var(--radius-default); overflow: hidden; margin-bottom: var(--space-medium); }
.header { padding: var(--space-default) var(--space-medium); display: flex; justify-content: space-between; cursor: pointer; font-size: var(--text-body); font-weight: bold; color: var(--text-0); text-transform: uppercase; background: var(--surface-3); letter-spacing: var(--tracking-default); }
.header:hover { background: var(--surface-3); color: var(--text-1); }
.content { border-top: 1px solid var(--surface-3); background: var(--surface-0); }

/* Increased height and allowed flex-growth for full-screen mode */
.heatmap-content {
  height: 580px;
  padding: 0;
  display: flex;
  flex-direction: column;
}
/* Chart takes the remaining space above the fixed preview strip. */
.heatmap-chart-area { flex: 1; min-height: 0; }

.heatmap-preview {
  flex: 0 0 auto;
  border-top: 1px solid var(--surface-3);
  padding: var(--space-default) var(--space-medium);
  display: flex;
  flex-direction: column;
  gap: var(--space-default);
}
.preview-caption {
  font-size: var(--text-body);
  color: var(--text-1);
  text-align: center;
  min-height: 1.2em;
}
.preview-boards {
  display: flex;
  justify-content: center;
  gap: var(--space-medium);
}
.preview-board {
  width: 120px;
  height: 120px;
  border: 1px solid var(--border-2);
  background: var(--surface-0);
}
.chevron { font-size: var(--text-tiny); color: var(--border-3); }
</style>
