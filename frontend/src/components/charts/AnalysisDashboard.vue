<!--
  src/components/charts/AnalysisDashboard.vue
  Pure orchestrator using standardized panels and useChartNavigation.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, watch } from 'vue';

import { useAnalysisProjection } from '../../composables/analysis/useAnalysisProjection';
import { useChartNavigation } from '../../composables/analysis/useChartNavigation';
import { useMistakeFinder } from '../../composables/analysis/useMistakeFinder';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import { consecutiveGaps } from '../../lib/distributions';
import { store } from '../../store';
import { themeColor } from '../../utils/theme-color';
import type { BoardId } from '../../types';
import type { EnrichedSeries } from '../../composables/analysis/useEnrichedData';

import AnalysisTimelinePanel from './AnalysisTimelinePanel.vue';
import ScoreLeadPanel        from './ScoreLeadPanel.vue';
import MergedDeltaPanel      from './MergedDeltaPanel.vue';
import MultiresolutionIntervalPanel from './MultiresolutionIntervalPanel.vue';
import StabilityPanel        from './StabilityPanel.vue';
import StabilityCrossCorrelationPanel from './StabilityCrossCorrelationPanel.vue';
import DistributionChart, { type DistributionSeries } from './DistributionChart.vue';

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

// Mistake-finder calculated property: per-move severity + un-punished
// flag, derived from `enriched.deltaSeries` and the active palette's
// `delta_ordering`. Surfaces as dots on the merged-delta panel.
const mistakes = useMistakeFinder(enriched);

// Distribution-visualisation samples — per-colour series for both
// consumers. delta_fn output is inherently per-colour (evaluated
// from each player's perspective) so pooling would conflate the
// two side's signals; the chart overlays both with transparency
// instead, and the legend toggle disambiguates when needed.
//
// `deltaKdeSeries` feeds the KDE: raw per-move `delta_fn` output
// per colour. Same axis the merged-delta chart renders, so the
// density curve reads without re-interpreting. The KDE's
// threshold-agnostic shape composes with the mistake-finder's
// threshold-via-knob framing — the curve shows the full
// distribution, the threshold is a mental vertical line.
//
// `mistakeGapHistogramSeries` feeds the gaps histogram:
// consecutive *own-colour* move-index distances between mistakes
// (per useMistakeFinder's current threshold). Own-colour-indexed
// rather than chronological-ply because the natural reading is
// "how many of MY moves elapsed between MY mistakes," which
// answers the clustering-vs-scattering question without
// conflating opponent moves into the denominator.
function valuesFromSeries(series: EnrichedSeries[]): number[] {
  const out: number[] = [];
  for (const s of series) {
    for (const [, v] of s.data) if (v !== null) out.push(v);
  }
  return out;
}

const deltaKdeSeries = computed<DistributionSeries[]>(() => [
  { name: 'Black', samples: valuesFromSeries(enriched.value.deltaSeries.black), color: themeColor('--player-black') },
  { name: 'White', samples: valuesFromSeries(enriched.value.deltaSeries.white), color: themeColor('--player-white') },
]);

const mistakeGapHistogramSeries = computed<DistributionSeries[]>(() => [
  { name: 'Black', samples: consecutiveGaps(mistakes.value.filter(m => m.color === 'B').map(m => m.colorLocalIdx)), color: themeColor('--player-black') },
  { name: 'White', samples: consecutiveGaps(mistakes.value.filter(m => m.color === 'W').map(m => m.colorLocalIdx)), color: themeColor('--player-white') },
]);

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

      <!-- Both-players delta panel. Parity-interleaved x-axis
           (black moves at even x, white at odd); per-colour
           dispatch on click / hover by x-parity; active
           marker on the next-to-play colour. See
           `docs/archive/notes/merged-delta-panel-spec.md` for
           the full semantics. -->
      <MergedDeltaPanel
        :black-series="enriched.deltaSeries.black"
        :white-series="enriched.deltaSeries.white"
        :mistakes="mistakes"
        :board-id="boardId"
        :variation-path="variationPath"
        :selection-range="selectionRange"
      />

      <MultiresolutionIntervalPanel
        :board-id="boardId"
        :variation-path="variationPath"
        :selection-range="selectionRange"
        @update:selection-range="setSelectionRange"
      />

      <StabilityPanel
        :board-id="boardId"
        :variation-path="variationPath"
        :selection-range="selectionRange"
      />

      <StabilityCrossCorrelationPanel
        :variation-path="variationPath"
      />

      <DistributionChart
        label="Per-Move Delta Distribution (KDE)"
        variant="kde"
        :series="deltaKdeSeries"
        x-axis-label="delta_fn output"
        :show-uncertainty="true"
      />

      <DistributionChart
        label="Gaps Between Own-Colour Mistakes (Histogram)"
        variant="histogram"
        :series="mistakeGapHistogramSeries"
        x-axis-label="own-colour move gap"
      />
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
