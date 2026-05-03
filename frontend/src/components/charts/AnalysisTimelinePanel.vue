<!--
  src/components/charts/AnalysisTimelinePanel.vue
  Rug-plot visualiser and "Analyse selection" controls.
  Owns the visits input as local UI state; everything else flows through props/emits.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import HorizontalTimelineVisualizer from '../HorizontalTimelineVisualizer.vue';
import type { PlyIndex } from '../../types';

const props = defineProps<{
  visitVector:    number[];
  selectionRange: [PlyIndex, PlyIndex];
  engineConnected: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:selectionRange', value: [PlyIndex, PlyIndex]): void;
  (e: 'analyze', visits: number): void;
}>();

const visits = ref(200);

const selectionNodeCount = computed(() =>
  Math.max(0, Math.round(props.selectionRange[1] - props.selectionRange[0]))
);

// Boundary brand-cast: HorizontalTimelineVisualizer is band-1
// (domain-agnostic — works on any numeric vector), so its model-value
// is `[number, number]`. Here the data-vector is the visit-vector
// derived from the active variation path, so the visualizer's range
// values are bounded to `[0, path.length - 1]` — i.e. valid PlyIndices
// by construction. One cast at the band-1 → branded boundary; consumers
// above (the store, useAnalysisTimeline) see the brand.
function onRangeUpdate(r: [number, number]): void {
  emit('update:selectionRange', r as [PlyIndex, PlyIndex]);
}
</script>

<template>
  <div class="section">

    <div class="timeline-header">
      <span class="timeline-title">Analysis Range</span>
      <span class="timeline-info">
        {{ selectionNodeCount }} node{{ selectionNodeCount === 1 ? '' : 's' }} selected
        &nbsp;·&nbsp;
        turns {{ Math.round(selectionRange[0]) }}–{{ Math.round(selectionRange[1]) }}
      </span>
    </div>

    <div class="timeline-body">
      <HorizontalTimelineVisualizer
        :data-vector="visitVector"
        :model-value="selectionRange"
        color-mode="global"
        @update:model-value="onRangeUpdate"
      />
    </div>

    <div class="timeline-controls">
      <label class="visits-label">Visits</label>
      <input
        v-model.number="visits"
        type="number"
        min="1"
        max="100000"
        class="visits-input"
      />
      <button
        class="analyze-btn"
        :disabled="!engineConnected || selectionNodeCount === 0"
        @click="emit('analyze', visits)"
      >
        Analyse selection ({{ selectionNodeCount }} nodes)
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
  letter-spacing: 0.1em;
}
.timeline-info {
  font-size: var(--text-body);
  color: var(--text-0);
  font-variant-numeric: tabular-nums;
}
.timeline-body { padding: var(--space-default) var(--space-medium) var(--space-tight); }
.timeline-controls {
  display: flex;
  align-items: center;
  gap: var(--space-default);
  padding: var(--space-default) var(--space-medium) var(--space-default);
}
.visits-label { font-size: var(--text-emphasis); color: var(--text-0); flex-shrink: 0; }
.visits-input {
  width: 72px;
  background: var(--surface-1);
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
  flex: 1;
  background: var(--surface-0);
  border: 1px solid #2a5a7a;
  color: var(--text-0);
  padding: var(--space-tight) var(--space-medium);
  border-radius: var(--radius-default);
  font-size: var(--text-emphasis);
  cursor: pointer;
  transition: background var(--duration-default);
}
.analyze-btn:hover:not(:disabled) { background: #254a60; }
.analyze-btn:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
