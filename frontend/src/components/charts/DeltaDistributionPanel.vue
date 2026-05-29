<!--
  src/components/charts/DeltaDistributionPanel.vue
  Per-colour delta KDE — the "Per-Move Delta Distribution" chart, sourced
  from the injected analysis context. Was an inline DistributionChart
  instance in AnalysisDashboard before the Phase-0 projection-seam refactor;
  extracted into a named panel so it self-sources from the context (no
  prop-drill) and becomes a clean registry entry for the later tab work.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import DistributionChart from './DistributionChart.vue';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';

const ctx = injectAnalysisContext();
</script>

<template>
  <DistributionChart
    label="Per-Move Delta Distribution (KDE)"
    variant="kde"
    :series="ctx.deltaKdeSeries.value"
    x-axis-label="delta_fn output"
    :show-uncertainty="true"
  />
</template>
