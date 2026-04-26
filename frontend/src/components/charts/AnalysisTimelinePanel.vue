<!--
  src/components/charts/AnalysisTimelinePanel.vue
  Rug-plot visualiser and "Analyse selection" controls.
  Owns the visits input as local UI state; everything else flows through props/emits.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import HorizontalTimelineVisualizer from '../HorizontalTimelineVisualizer.vue';

const props = defineProps<{
  visitVector:    number[];
  selectionRange: [number, number];
  engineConnected: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:selectionRange', value: [number, number]): void;
  (e: 'analyze', visits: number): void;
}>();

const visits = ref(200);

const selectionNodeCount = computed(() =>
  Math.max(0, Math.round(props.selectionRange[1] - props.selectionRange[0]))
);
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
        @update:model-value="r => emit('update:selectionRange', r)"
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
  background: #181818;
  border: 1px solid #222;
  border-radius: 4px;
  overflow: hidden;
}
.timeline-header {
  padding: 0 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #222;
  border-bottom: 1px solid #2a2a2a;
}
.timeline-title {
  font-size: 10px;
  font-weight: bold;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.timeline-info {
  font-size: 10px;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.timeline-body { padding: 6px 10px 4px; }
.timeline-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 8px;
}
.visits-label { font-size: 11px; color: #fff; flex-shrink: 0; }
.visits-input {
  width: 72px;
  background: #111;
  border: 1px solid #333;
  color: #ccc;
  padding: 3px 6px;
  border-radius: 3px;
  font-size: 11px;
}
.visits-input:focus { outline: none; border-color: #4aaef0; }
.analyze-btn {
  flex: 1;
  background: #000;
  border: 1px solid #2a5a7a;
  color: #fff;
  padding: 4px 10px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
}
.analyze-btn:hover:not(:disabled) { background: #254a60; }
.analyze-btn:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
