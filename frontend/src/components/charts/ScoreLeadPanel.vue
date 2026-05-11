<!--
  src/components/charts/ScoreLeadPanel.vue
  Added: Preview Restoration Logic.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import AnalysisChartPanel from './AnalysisChartPanel.vue';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import type { BoardId, NodeId, PlyIndex } from '../../types';

// Branded-type signature discipline (Commit 5a): boardId and variationPath
// are tightened from `string` and `string[]` to BoardId/NodeId[]. Both
// values flow down from AnalysisDashboard, ultimately sourced from
// BoardState. The previous loose signature was a signature lie that
// forced a downstream type mismatch when variationPath[idx] is passed
// to getThumbnailSvg (whose parameter was tightened in Commit 2a).
//
// selectionRange is `[PlyIndex, PlyIndex]` per `BoardState.analysisRange`'s
// brand. activeIndex stays bare `number | null`: ScoreLeadPanel's series
// indexes the variation path, so semantically it's a PlyIndex, but
// AnalysisChartPanel's shared activeIndex prop is consumed polymorphically
// (PlayerPanel passes ColorMoveIndex), so the brand belongs at this
// caller's API surface only if/when ScoreLeadPanel itself becomes a
// brand boundary. Leaving it bare here matches the design call recorded
// in the PlayerPanel brand commit's closure note.
const props = defineProps<{
  series:         any[];
  boardId:        BoardId;
  variationPath:  NodeId[];
  selectionRange: [PlyIndex, PlyIndex];
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
    normalize="per-series"
  />
</template>
