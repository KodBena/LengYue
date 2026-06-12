<!--
  src/components/charts/ScoreLeadPanel.vue
  Game-state (score-lead) chart panel. Self-sources its view-model from the
  injected AnalysisContext and owns its hover/position thumbnail preview via
  the synchronous-gate + cache-warm + accessor shape (see the script).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { watch } from 'vue';
import AnalysisChartPanel from './AnalysisChartPanel.vue';
import { usePreviewSnapshot } from '../../composables/cards/usePreviewSnapshot';
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

// The cured hover-preview quartet, single-sourced in usePreviewSnapshot:
// a synchronously-written `previewNode` gate, a fire-and-forget cache warm,
// and a `getPreview` accessor over the synchronous cache read — so a late
// cache-miss resolve can fill a still-targeted thumbnail but can never
// resurrect a node the leave-time reset already cleared. The accessor is
// passed down (not the value) so the per-nav thumbnail update re-renders
// only the <ChartPreviewBox> leaf, not this panel or the chart host
// (render-coupling postmortem, 2026-05-29).
const { getPreview, showPreview, reset } = usePreviewSnapshot(boardId);

/** Reverts the preview box to the current board position */
function resetPreview(): void {
  if (activeIndex.value !== null) {
    const nodeId = variationPath.value[activeIndex.value];
    if (nodeId) {
      showPreview(nodeId);
      return;
    }
  }
  reset();
}

// Watch activeIndex to ensure the default view stays current
watch(activeIndex, resetPreview, { immediate: true });

function handleHover(turnIdx: number): void {
  const nodeId = variationPath.value[turnIdx];
  if (nodeId) {
    showPreview(nodeId);
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
