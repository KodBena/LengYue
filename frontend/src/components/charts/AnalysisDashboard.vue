<!--
  src/components/charts/AnalysisDashboard.vue
  Pure orchestrator using standardized panels and useChartNavigation.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, watch } from 'vue';

import { useAnalysisProjection } from '../../composables/useAnalysisProjection';
import { useChartNavigation } from '../../composables/useChartNavigation';
import { useThumbnailCache } from '../../composables/useThumbnailCache';
import { store } from '../../store';
import type { BoardId } from '../../types';

import AnalysisTimelinePanel from './AnalysisTimelinePanel.vue';
import ScoreLeadPanel        from './ScoreLeadPanel.vue';
import PlayerPanel           from './PlayerPanel.vue';
import StabilityPanel        from './StabilityPanel.vue';

// Branded-type signature discipline (Commit 5a): boardId is tightened
// from `string` to BoardId. The caller (App.vue) passes `activeBoard.id`
// which is BoardId from BoardState — already branded.
const props = defineProps<{ boardId: BoardId }>();

const {
  variationPath,
  mainSeries,
  enriched,
  visitVector,
  selectionRange,
  setSelectionRange,
  activeMainIndex,
  activeBlackIndex,
  activeWhiteIndex,
  analyzeSelection,
} = useAnalysisProjection(props.boardId);

const { warmPath } = useThumbnailCache();

// The two casts that lived here in the prior Commit 5a version are gone.
// useAnalysisProjection now exposes `variationPath` as ComputedRef<NodeId[]>
// (the upstream-boundary adapter sits inside that composable now), so
// useChartNavigation and warmPath both receive correctly-branded types
// without per-call-site casts. This is the proper architectural shape:
// one boundary cast at the source, zero downstream casts.
const navigation = useChartNavigation(variationPath, props.boardId);

watch(variationPath, (path) => {
  warmPath(path, props.boardId);
}, { immediate: true });

const engineConnected = computed(() => store.engine.status === 'connected');
</script>

<template>
  <div class="dashboard">
    <AnalysisTimelinePanel
      :visit-vector="visitVector"
      :selection-range="selectionRange"
      :engine-connected="engineConnected"
      @update:selection-range="setSelectionRange"
      @analyze="visits => analyzeSelection(visits)"
    />

    <div class="scrollable-content">
      <ScoreLeadPanel
        :series="mainSeries"
        :board-id="boardId"
        :variation-path="variationPath"
        :selection-range="selectionRange"
        :active-index="activeMainIndex"
        :on-index-click="navigation.handleMainClick"
      />

      <PlayerPanel
        player-color="B"
        label="Black Performance (Moves)"
        :series="enriched.deltaSeries.black"
        :board-id="boardId"
        :variation-path="variationPath"
        :selection-range="selectionRange"
        :active-index="activeBlackIndex"
        :on-index-click="(idx) => navigation.handlePlayerClick('B', idx)"
      />

      <PlayerPanel
        player-color="W"
        label="White Performance (Moves)"
        :series="enriched.deltaSeries.white"
        :board-id="boardId"
        :variation-path="variationPath"
        :selection-range="selectionRange"
        :active-index="activeWhiteIndex"
        :on-index-click="(idx) => navigation.handlePlayerClick('W', idx)"
      />

      <StabilityPanel
        :board-id="boardId"
        :variation-path="variationPath"
        :selection-range="selectionRange"
        @update:selection-range="setSelectionRange"
      />
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 165px);
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
