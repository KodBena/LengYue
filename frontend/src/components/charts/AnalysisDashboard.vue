<!--
  src/components/charts/AnalysisDashboard.vue
  Provider + layout for the Analysis tab's chart cluster. Creates the
  per-board AnalysisContext once and provides it to the subtree; the panels
  inject the context and read only the slices they display. This component
  reads no high-frequency reactive value in its own render, so an analysis
  packet no longer re-renders the whole subtree (the render-coupling fix —
  see useAnalysisContext and docs/notes/postmortem-render-coupling-at-
  composition-nodes-2026-05-29.md, Recommendation 2).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { watch } from 'vue';
import { provideAnalysisContext } from '../../composables/analysis/useAnalysisContext';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import type { BoardId } from '../../types';

import AnalysisTimelinePanel from './AnalysisTimelinePanel.vue';
import ScoreLeadPanel        from './ScoreLeadPanel.vue';
import MergedDeltaPanel      from './MergedDeltaPanel.vue';
import MultiresolutionIntervalPanel from './MultiresolutionIntervalPanel.vue';
import StabilityPanel        from './StabilityPanel.vue';
import StabilityCrossCorrelationPanel from './StabilityCrossCorrelationPanel.vue';
import DeltaDistributionPanel from './DeltaDistributionPanel.vue';
import MistakeGapPanel       from './MistakeGapPanel.vue';

const props = defineProps<{ boardId: BoardId }>();

// Create + provide the analysis context for this board. The panels below
// inject it; this component reads none of its high-frequency refs in its
// own render — that is what keeps an analysis packet from re-rendering the
// whole subtree.
const ctx = provideAnalysisContext(props.boardId);

// Thumbnail warming stays here: a side-effect tied to the dashboard's
// presence, not to any one panel. It is a watcher, not a render read, so
// it does not re-couple the provider's render to the variation path.
const { warmPath } = useThumbnailCache();
watch(ctx.variationPath, (path) => {
  warmPath(path, props.boardId);
}, { immediate: true });
</script>

<template>
  <div class="dashboard">
    <AnalysisTimelinePanel />

    <div class="scrollable-content">
      <ScoreLeadPanel />
      <MergedDeltaPanel />
      <MultiresolutionIntervalPanel />
      <StabilityPanel />
      <StabilityCrossCorrelationPanel />
      <DeltaDistributionPanel />
      <MistakeGapPanel />
    </div>
  </div>
</template>

<style scoped>
/* Iter-2 audit Finding B: `height: calc(100vh - 165px)` was the
   prior shape — viewport-relative, with 165px hand-summed from the
   chrome heights (toolbar 28 + nav-bar 32 + status-bar 20 +
   tree-panel-header 20 + various). Brittle to any chrome-height
   change. Iter-12 rewires the chain to be parent-relative:
   `.tab-body → .tab-pane → AnalysisControls's .tab-padding →
   .chart-container-outer → .dashboard`, each link a flex-column
   with `flex: 1; min-height: 0`. The dashboard now takes whatever
   vertical space the analysis tab actually has, regardless of
   chrome geometry above. */
.dashboard {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-0);
  gap: var(--space-default);
  padding: var(--space-medium);
}
.scrollable-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-medium);
}
</style>
