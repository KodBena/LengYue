<!--
  src/components/charts/ScoreLeadPanel.vue
  Added: Preview Restoration Logic.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import AnalysisChartPanel from './AnalysisChartPanel.vue';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import type { BoardSnapshot } from '../../engine/board-geometry';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';

// Phase-0 projection seam: self-source the chart's view-model from the
// injected AnalysisContext rather than prop-drilled slices, so the
// dashboard no longer re-renders to feed this panel. The local names
// mirror the prior props, so the template bindings are unchanged.
const ctx = injectAnalysisContext();
const series         = ctx.mainSeries;
const boardId        = ctx.boardId;
const variationPath  = ctx.variationPath;
const selectionRange = ctx.selectionRange;
const activeIndex    = ctx.activeMainIndex;
const getActiveIndex = () => activeIndex.value;
const onIndexClick   = ctx.navigation.handleMainClick;

const { getSnapshot } = useThumbnailCache();
const preview = ref<BoardSnapshot | null>(null);
// Accessor passed down instead of the value: the per-nav thumbnail update
// then re-renders only the <ChartPreviewBox> leaf, not this panel or the
// chart host (render-coupling postmortem, 2026-05-29).
const getPreview = () => preview.value;

/** Reverts the preview box to the current board position */
async function resetPreview() {
  if (activeIndex.value !== null) {
    const nodeId = variationPath.value[activeIndex.value];
    if (nodeId) {
      preview.value = await getSnapshot(nodeId, boardId);
    }
  } else {
    preview.value = null;
  }
}

// Watch activeIndex to ensure the default view stays current
watch(activeIndex, resetPreview, { immediate: true });

async function handleHover(turnIdx: number) {
  const nodeId = variationPath.value[turnIdx];
  if (nodeId) {
    preview.value = await getSnapshot(nodeId, boardId);
  }
}

// The Game State chart is ply-indexed (x = variationPath index,
// = absolute ply with root at 0). The default BaseChart tooltip
// header reads "Move {x}" which conflates "play number" with
// "ply"; the chart's vocabulary is ply, so the header should
// say so.
function formatPlyTooltip(val: number): string {
  return `Ply ${val}`;
}
</script>

<template>
  <AnalysisChartPanel
    label="Game State (Turns)"
    :series="series"
    :active-index-accessor="getActiveIndex"
    :zoom-range="selectionRange"
    :on-index-click="onIndexClick"
    :on-index-hover="handleHover"
    :on-mouse-leave="resetPreview"
    :preview-accessor="getPreview"
    :format-x-tooltip="formatPlyTooltip"
    normalize="per-series"
  />
</template>
