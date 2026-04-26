<!--
  src/components/charts/ScoreLeadPanel.vue
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
  series:         any[];
  boardId:        BoardId;
  variationPath:  NodeId[];
  selectionRange: [number, number];
  activeIndex:    number | null;
  onIndexClick?: (turnIdx: number) => void;
}>();

const { getThumbnailSvg } = useThumbnailCache();
const preview = ref('');

/** Reverts the preview box to the current board position */
async function resetPreview() {
  if (props.activeIndex !== null) {
    const nodeId = props.variationPath[props.activeIndex];
    if (nodeId) {
      preview.value = await getThumbnailSvg(nodeId, props.boardId, false);
    }
  } else {
    preview.value = '';
  }
}

// Watch activeIndex to ensure the default view stays current
watch(() => props.activeIndex, resetPreview, { immediate: true });

async function handleHover(turnIdx: number) {
  const nodeId = props.variationPath[turnIdx];
  if (nodeId) {
    preview.value = await getThumbnailSvg(nodeId, props.boardId, false);
  }
}
</script>

<template>
  <AnalysisChartPanel
    label="Game State (Turns)"
    :series="series"
    :active-index="activeIndex"
    :zoom-range="selectionRange"
    :on-index-click="onIndexClick"
    :on-index-hover="handleHover"
    :on-mouse-leave="resetPreview" 
    :preview-html="preview"
  />
</template>
