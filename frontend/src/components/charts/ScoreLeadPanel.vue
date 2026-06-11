<!--
  src/components/charts/ScoreLeadPanel.vue
  Game-state (score-lead) chart panel. Self-sources its view-model from the
  injected AnalysisContext and owns its hover/position thumbnail preview via
  the synchronous-gate + cache-warm + accessor shape (see the script).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import AnalysisChartPanel from './AnalysisChartPanel.vue';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import type { BoardSnapshot } from '../../engine/board-geometry';
import type { NodeId } from '../../types';
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

const { getSnapshot, getSnapshotSync } = useThumbnailCache();
// The preview ref holds the *target node*, written SYNCHRONOUSLY from the
// hover/leave continuations — never an awaited snapshot. The cured #365
// shape (PR #413, TreeWidget.onToggleEnter): a fire-and-forget warm fills
// the shared cache, and the accessor reads the cache synchronously. A slow
// cache-miss resolve can therefore fill a still-targeted thumbnail but can
// never resurrect a node the leave-time reset already cleared. The prior
// `preview.value = await getSnapshot(...)` shape was last-write-wins on the
// VISIBLE state, so a late resolve landing after a leave-time reset
// repopulated the docked preview with the stale hovered position
// (content-resurrection in the activeIndex-null case). Holding the nodeId
// and deriving the snapshot in the accessor moves the only async write off
// the gate and onto the shared cache.
const previewNode = ref<NodeId | null>(null);
// Accessor passed down instead of the value: the per-nav thumbnail update
// then re-renders only the <ChartPreviewBox> leaf, not this panel or the
// chart host (render-coupling postmortem, 2026-05-29).
const getPreview = (): BoardSnapshot | null =>
  previewNode.value ? getSnapshotSync(previewNode.value) : null;

/** Point the preview at `nodeId`: set the target synchronously, then warm
 *  the shared cache fire-and-forget (cache-only write; never the gate). */
function showPreview(nodeId: NodeId): void {
  previewNode.value = nodeId;
  void getSnapshot(nodeId, boardId);
}

/** Reverts the preview box to the current board position */
function resetPreview(): void {
  if (activeIndex.value !== null) {
    const nodeId = variationPath.value[activeIndex.value];
    if (nodeId) {
      showPreview(nodeId);
      return;
    }
  }
  previewNode.value = null;
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
