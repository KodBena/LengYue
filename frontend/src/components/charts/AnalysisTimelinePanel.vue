<!--
  src/components/charts/AnalysisTimelinePanel.vue
  Rug-plot visualiser and "Analyse selection" controls.
  Owns the visits input as local UI state; everything else flows through props/emits.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import HorizontalTimelineVisualizer from '../tree/HorizontalTimelineVisualizer.vue';
import { store } from '../../store';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';
import { useThrottledSnapshot } from '../../composables/useThrottledSnapshot';
import { ANALYSIS_TIMELINE_REDRAW_THROTTLE_MS } from '../../lib/timing';
import type { PlyIndex } from '../../types';

// Phase-0 projection seam: self-source from the injected AnalysisContext.
// The range-select and analyse actions call the context's mutators
// directly (was: emits the dashboard re-wired to the same mutators).
const ctx = injectAnalysisContext();
const visitVector     = ctx.visitVector;
const selectionRange  = ctx.selectionRange;
const engineConnected = ctx.engineConnected;

// Throttled rug-plot data. `visitVector` (the per-turn visit counts) is
// rebuilt every analysis packet; snapshot it to ~4 Hz (the subscriber-
// projection family cadence) so the visualiser redraws at that rate, not the
// packet rate. The template binds the snapshot; selectionRange (user drag)
// stays prompt on its own binding.
const displayedVisitVector = useThrottledSnapshot(visitVector, ANALYSIS_TIMELINE_REDRAW_THROTTLE_MS);

const visits = ref(200);

// The visits-input cap follows the user's configured ponder ceiling
// (engine.katago.ponderMaxVisits); the one-shot range analyze and
// ponder share the same intuition of "deepest analyze the user wants
// to permit." Registry-tunable; default 2,000,000.
const visitsMax = computed(() => store.profile.settings.engine.katago.ponderMaxVisits);

const selectionNodeCount = computed(() =>
  Math.max(0, Math.round(selectionRange.value[1] - selectionRange.value[0]))
);

// Boundary brand-cast: HorizontalTimelineVisualizer is band-1
// (domain-agnostic — works on any numeric vector), so its model-value
// is `[number, number]`. Here the data-vector is the visit-vector
// derived from the active variation path, so the visualizer's range
// values are bounded to `[0, path.length - 1]` — i.e. valid PlyIndices
// by construction. One cast at the band-1 → branded boundary; consumers
// above (the store, useAnalysisTimeline) see the brand.
function onRangeUpdate(r: [number, number]): void {
  ctx.setSelectionRange(r as [PlyIndex, PlyIndex]); // PlyIndex brand mint at the Band-1 → branded boundary (range bounded to the path, see comment above)
}

function onAnalyze(): void {
  ctx.analyzeSelection(visits.value);
}
</script>

<template>
  <div class="section">

    <div class="timeline-header">
      <span class="timeline-title">{{ $t('analysisTimeline.title') }}</span>
      <span class="timeline-info">
        {{ $t('analysisTimeline.nodesSelected', selectionNodeCount) }}
        &nbsp;·&nbsp;
        {{ $t('analysisTimeline.turnsRange', { from: Math.round(selectionRange[0]), to: Math.round(selectionRange[1]) }) }}
      </span>
    </div>

    <div class="timeline-body">
      <HorizontalTimelineVisualizer
        :data-vector="displayedVisitVector"
        :model-value="selectionRange"
        color-mode="quantile"
        @update:model-value="onRangeUpdate"
      />
    </div>

    <div class="timeline-controls">
      <label class="visits-label">{{ $t('analysisTimeline.visits') }}</label>
      <input
        v-model.number="visits"
        type="number"
        min="1"
        :max="visitsMax"
        class="visits-input"
      />
      <button
        class="analyze-btn"
        :disabled="!engineConnected || selectionNodeCount === 0"
        @click="onAnalyze"
      >
        {{ $t('analysisTimeline.analyseSelection', { n: selectionNodeCount }) }}
      </button>
    </div>

  </div>
</template>

<style scoped>
.section {
  background: var(--surface-2);
  border: 1px solid var(--surface-3);
  border-radius: var(--radius-default);
  overflow: hidden;
}
.timeline-header {
  padding: 0 var(--space-medium);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--surface-3);
  border-bottom: 1px solid var(--border-1);
}
.timeline-title {
  font-size: var(--text-body);
  font-weight: bold;
  color: var(--text-0);
  text-transform: uppercase;
  letter-spacing: var(--tracking-default);
}
.timeline-info {
  font-size: var(--text-body);
  color: var(--text-0);
  font-variant-numeric: tabular-nums;
}
.timeline-body { padding: var(--space-default) var(--space-medium) var(--space-tight); }
/* `flex-wrap: wrap` + `row-gap` (iter-14): at narrow control-panel
   widths the VISITS label + 72px input + Analyse-Selection button
   together exceeded available width. The button (flex: 1) used to
   squeeze to a sliver because its `min-width` defaulted to content
   size, which was wider than its allocated flex space. Wrap drops
   the button to its own row when the parent narrows below the
   threshold. */
.timeline-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-default);
  row-gap: var(--space-default);
  padding: var(--space-default) var(--space-medium) var(--space-default);
}
.visits-label { font-size: var(--text-emphasis); color: var(--text-0); flex-shrink: 0; }
.visits-input {
  width: 72px;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  color: var(--text-1);
  padding: 3px 6px;
  border-radius: var(--radius-default);
  font-size: var(--text-emphasis);
}
.visits-input:focus { outline: none; border-color: var(--accent-primary); }
/* theme-exception: .analyze-btn uses muted-accent variants (#2a5a7a /
   #254a60) — desaturated darkened cyans that don't fit the chrome
   anchor vocabulary. Snapping to var(--accent-primary) would brighten
   the button noticeably; preserving the literals keeps the deliberate
   subdued-action-button aesthetic. Future substrate work could add
   accent-tone variants. */
.analyze-btn {
  /* `flex: 1` without `min-width: 0` is intentional: the button
     claims its natural content min-width, which forces the row to
     overflow at narrow widths and triggers `.timeline-controls`'s
     `flex-wrap` — the button then gets its own row and `flex: 1`
     stretches it to full row width with text fitting cleanly. */
  flex: 1;
  background: var(--surface-0);
  border: 1px solid #2a5a7a;
  color: var(--text-0);
  padding: var(--space-tight) var(--space-medium);
  border-radius: var(--radius-default);
  font-size: var(--text-emphasis);
  cursor: pointer;
}
.analyze-btn:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
</style>
