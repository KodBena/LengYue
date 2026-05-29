<!--
  src/components/charts/MistakeGapPanel.vue
  Own-colour mistake-gap histogram — consecutive own-colour move distances
  between mistakes, sourced from the injected analysis context. Was an
  inline DistributionChart instance in AnalysisDashboard before the Phase-0
  projection-seam refactor; extracted into a named panel so it self-sources
  from the context (no prop-drill) and becomes a clean registry entry for
  the later tab work.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import DistributionChart from './DistributionChart.vue';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';

const ctx = injectAnalysisContext();
</script>

<template>
  <DistributionChart
    label="Gaps Between Own-Colour Mistakes (Histogram)"
    variant="histogram"
    :series="ctx.mistakeGapHistogramSeries.value"
    x-axis-label="own-colour move gap"
  />
</template>
