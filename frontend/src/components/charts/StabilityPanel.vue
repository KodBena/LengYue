<!--
  src/components/charts/StabilityPanel.vue
  Hosts the triangular stability-interval heatmap. Wires the
  per-board variationPath into `useTriangularHeatmap`, then
  translates a heatmap cell click into an absolute-ply selection
  range for the broader analysis chart.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import HeatmapChart             from './HeatmapChart.vue';
import {
  colorMoveToPly,
  useTriangularHeatmap,
  type HeatmapCell,
} from '../../composables/useTriangularHeatmap';
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
      <span>Stability Interval Analysis</span>
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
.section { background: #181818; border: 1px solid #222; border-radius: 4px; overflow: hidden; margin-bottom: 10px; }
.header { padding: 8px 12px; display: flex; justify-content: space-between; cursor: pointer; font-size: 10px; font-weight: bold; color: #fff; text-transform: uppercase; background: #222; letter-spacing: 0.1em; }
.header:hover { background: #282828; color: #aaa; }
.content { border-top: 1px solid #222; background: #000; }

/* Increased height and allowed flex-growth for full-screen mode */
.heatmap-content { 
  height: 450px; 
  padding: 0px; 
  display: flex; 
  flex-direction: column; 
}
.chevron { font-size: 8px; color: #444; }
</style>
