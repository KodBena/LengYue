<!--
  src/components/charts/PlayerPanel.vue
  Added: Preview Restoration Logic.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import AnalysisChartPanel from './AnalysisChartPanel.vue';
import { useThumbnailCache } from '../../composables/useThumbnailCache';
import type { BoardId, NodeId } from '../../types';

// Branded-type signature discipline (Commit 5a): boardId and variationPath
// are tightened from `string` and `string[]` to BoardId/NodeId[]. Both
// values flow down from AnalysisDashboard, ultimately sourced from
// BoardState. The previous loose signature was a signature lie that
// forced a downstream type mismatch when variationPath[idx] is passed
// to getThumbnailSvg (whose parameter was tightened in Commit 2a).
const props = defineProps<{
  playerColor:    'B' | 'W';
  label:          string;
  series:         any[];
  boardId:        BoardId;
  variationPath:  NodeId[];
  selectionRange: [number, number];
  activeIndex:    number | null;
  onIndexClick?: (moveIdx: number) => void;
}>();

const { getThumbnailSvg } = useThumbnailCache();
const preview = ref('');
const turnOffset = props.playerColor === 'B' ? 0 : 1;

async function resetPreview() {
  if (props.activeIndex !== null) {
    const nodeIdx = props.activeIndex * 2 + turnOffset + 1;
    const nodeId = props.variationPath[nodeIdx];
    if (nodeId) {
      preview.value = await getThumbnailSvg(nodeId, props.boardId, true);
    }
  } else {
    preview.value = '';
  }
}

watch(() => props.activeIndex, resetPreview, { immediate: true });

async function handleHover(moveIdx: number) {
  const nodeIdx = moveIdx * 2 + turnOffset + 1;
  const nodeId = props.variationPath[nodeIdx];
  if (nodeId) {
    preview.value = await getThumbnailSvg(nodeId, props.boardId, true);
  }
}
</script>

<template>
  <AnalysisChartPanel
    :label="label"
    :series="series"
    :active-index="activeIndex"
    :zoom-range="selectionRange.map(v => v / 2) as [number, number]"
    :player-color="playerColor"
    :on-index-click="onIndexClick"
    :on-index-hover="handleHover"
    :on-mouse-leave="resetPreview"
    :preview-html="preview"
  />
</template>
