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
//
// Cured hover-preview invariant (the same one usePreviewSnapshot single-sources
// for the single-NodeId panels): the VISIBLE state is the synchronously-written
// `hoveredCell` gate; the only async work is a fire-and-forget cache WARM that
// writes the shared snapshot cache, never the gate. The two displayed snapshots
// are DERIVED through `getSnapshotSync` over the current cell's endpoints, so a
// late warm can fill a still-hovered preview but can never resurrect a cell the
// leave already cleared. This site keeps its in-place wiring rather than the
// composable: its gate is a two-endpoint `HeatmapCell`, not a single NodeId, so
// it applies the invariant directly (as SidebarWidget's board-keyed docked pane
// does) instead of consuming the NodeId quartet. The prior shape
// (`startSnap.value = await getSnapshot(...)`) was an awaited write into the
// visible refs, guarded only by a latest-wins `hoverToken` counter; deriving
// the snapshots synchronously removes the race at the seam rather than guarding
// around it.
const { getSnapshot, getSnapshotSync } = useThumbnailCache();
const hoveredCell = ref<HeatmapCell | null>(null);

const caption = computed(() => {
  const c = hoveredCell.value;
  if (!c) return '';
  const colorLabel = c.color === 'B' ? 'Black' : 'White';
  return `${colorLabel}: moves ${c.s}–${c.t} · ${c.value.toFixed(3)}`;
});

// The cell's start/end node ids, re-derived from the current gate. Pondering
// can paint a cell whose endpoint is past the live tail of the known
// variationPath; an undefined endpoint degrades to a null preview (hover UX,
// not a state-transition contract — ADR-0002).
const startNode = computed(() => {
  const c = hoveredCell.value;
  return c ? variationPath.value[colorMoveToPly(c.s, c.color)] ?? null : null;
});
const endNode = computed(() => {
  const c = hoveredCell.value;
  return c ? variationPath.value[colorMoveToPly(c.t, c.color)] ?? null : null;
});

// Snapshots DERIVED from the cache over the current endpoints — null on a miss,
// filled reactively when the warm lands (the cache is a reactive Map).
const startSnap = computed<BoardSnapshot | null>(() =>
  startNode.value ? getSnapshotSync(startNode.value) : null);
const endSnap = computed<BoardSnapshot | null>(() =>
  endNode.value ? getSnapshotSync(endNode.value) : null);

// Fire-and-forget warm of the shared cache for both endpoints on every gate
// change (cache-only writes; never the visible refs). No latest-wins token is
// needed: the snapshots read the CURRENT cell, so a stale warm only fills the
// cache and the computeds ignore it once the cell has moved on.
watch(hoveredCell, () => {
  if (startNode.value) void getSnapshot(startNode.value, boardId);
  if (endNode.value)   void getSnapshot(endNode.value, boardId);
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
