<!--
  src/components/charts/StabilityPanel.vue
  Hosts the triangular multiresolution-interval heatmap. Wires the
  per-board variationPath into `useTriangularHeatmap`, then
  translates a heatmap cell click into an absolute-ply selection
  range for the broader analysis chart.

  Name note: the panel was originally titled "Stability Interval
  Analysis", which was a misnomer — nothing about stability is
  computed. The proxy's `Triangular()` pipeline emits, for every
  pair of colour-local move indices (s, t) with s ≤ t, the
  `summary_fn` of the delta stream over that interval (`min` for
  the quality/default palettes, `mean` for the score/rank
  palettes). The triangular cell at (s, t) is therefore a summary
  at one specific scale (length = t - s + 1); the matrix as a
  whole is the multi-scale view across every possible interval.
  "Multiresolution" is the conventional term for this kind of
  many-scales-at-once analysis (signal-processing vocabulary).
  Renamed to reflect what's actually shown.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import HeatmapChart             from './HeatmapChart.vue';
import {
  colorMoveToPly,
  useTriangularHeatmap,
  type HeatmapCell,
} from '../../composables/analysis/useTriangularHeatmap';
import type { BoardId, NodeId, PlyIndex } from '../../types.ts';

const props = defineProps<{
  boardId:        BoardId;
  variationPath:  NodeId[];
  selectionRange: [PlyIndex, PlyIndex];
}>();

const emit = defineEmits<{
  (e: 'update:selectionRange', value: [PlyIndex, PlyIndex]): void;
}>();

const expanded = ref(true);

const pathRef = computed(() => props.variationPath);
const heatmapResults = useTriangularHeatmap(pathRef);

function handleCellClick(cell: HeatmapCell) {
  // s ≤ t holds by the proxy's Triangular() contract, so order-preserving
  // conversion suffices; both endpoints route through `colorMoveToPly` so
  // the colour-local → absolute-ply mapping is the same as the heatmap
  // tooltip uses.
  const startTurn = colorMoveToPly(cell.s, cell.color);
  const endTurn   = colorMoveToPly(cell.t, cell.color);
  emit('update:selectionRange', [startTurn, endTurn]);
}
</script>

<template>
  <div class="section">
    <div class="header" @click="expanded = !expanded">
      <span>Multiresolution Interval Analysis</span>
      <span class="chevron">{{ expanded ? '▼' : '▶' }}</span>
    </div>

    <div class="content heatmap-content" v-show="expanded">
      <HeatmapChart
        :data="heatmapResults.matrix"
        :max-move-index="heatmapResults.moveCount"
        :min-val="heatmapResults.min"
        :max-val="heatmapResults.max"
        :board-id="boardId"
        :variation-path="variationPath"
        :zoom-range="selectionRange"
        @cell-click="handleCellClick"
      />
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
  height: 450px;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.chevron { font-size: var(--text-tiny); color: var(--border-3); }
</style>
