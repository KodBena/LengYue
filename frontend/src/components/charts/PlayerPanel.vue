<!--
  src/components/charts/PlayerPanel.vue
  Added: Preview Restoration Logic.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import AnalysisChartPanel from './AnalysisChartPanel.vue';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import { colorMoveToPly } from '../../composables/analysis/useTriangularHeatmap';
import type { BoardId, ColorMoveIndex, NodeId, PlyIndex } from '../../types';

// Branded-type signature discipline (Commit 5a + brand-pair extension):
// boardId/variationPath tightened in 5a; activeIndex and onIndexClick now
// branded as ColorMoveIndex so the off-by-colour bug class the brand pair
// was introduced to prevent (heatmap thumbnail hint indexing variationPath
// with a colour-local move number) cannot recur here. The two inline
// `idx * 2 + offset + 1` conversion sites — duplicated from
// `colorMoveToPly` — collapse into the named helper.
const props = defineProps<{
  playerColor:    'B' | 'W';
  label:          string;
  series:         any[];
  boardId:        BoardId;
  variationPath:  NodeId[];
  selectionRange: [PlyIndex, PlyIndex];
  activeIndex:    ColorMoveIndex | null;
  onIndexClick?: (moveIdx: ColorMoveIndex) => void;
}>();

const { getThumbnailSvg } = useThumbnailCache();
const preview = ref('');

async function resetPreview() {
  if (props.activeIndex !== null) {
    const nodeIdx = colorMoveToPly(props.activeIndex, props.playerColor);
    const nodeId = props.variationPath[nodeIdx];
    if (nodeId) {
      preview.value = await getThumbnailSvg(nodeId, props.boardId, true);
    }
  } else {
    preview.value = '';
  }
}

watch(() => props.activeIndex, resetPreview, { immediate: true });

// Boundary brand-cast: the chart's index-hover event emits a chart-
// coordinate (bare number); in a per-player chart whose data is keyed
// by colour-local move index, that coordinate IS a ColorMoveIndex by
// construction. One cast at the chart-event boundary; consumers above
// see the brand. Same shape as `useTriangularHeatmap`'s `s/t` casts.
async function handleHover(rawIdx: number) {
  const moveIdx = rawIdx as ColorMoveIndex;
  const nodeIdx = colorMoveToPly(moveIdx, props.playerColor);
  const nodeId = props.variationPath[nodeIdx];
  if (nodeId) {
    preview.value = await getThumbnailSvg(nodeId, props.boardId, true);
  }
}

// Forwarder for the chart's index-click event. The chart prop signature
// is `(idx: number) => void`; PlayerPanel's API surface above is the
// stricter `(moveIdx: ColorMoveIndex) => void`. Function-parameter
// contravariance forbids the direct passthrough; this wrapper is the
// brand boundary. Same safe-by-construction reasoning as `handleHover`.
function forwardClick(rawIdx: number) {
  props.onIndexClick?.(rawIdx as ColorMoveIndex);
}
</script>

<template>
  <AnalysisChartPanel
    :label="label"
    :series="series"
    :active-index="activeIndex"
    :zoom-range="selectionRange.map(v => v / 2) as [number, number]"
    :player-color="playerColor"
    :on-index-click="forwardClick"
    :on-index-hover="handleHover"
    :on-mouse-leave="resetPreview"
    :preview-html="preview"
  />
</template>
