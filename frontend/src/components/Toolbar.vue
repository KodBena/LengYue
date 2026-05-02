<!--
  src/components/Toolbar.vue
  Purely presentational application toolbar.
-->
<script setup lang="ts">
import { computed } from 'vue';
import QeuboToolbar from './QeuboToolbar.vue';
import type { EngineStatus, EngineMetrics } from '../types';

const props = defineProps<{
  engineStatus: EngineStatus;
  metrics:      EngineMetrics;
  title?:       string;
}>();

const emit = defineEmits<{
  (e: 'load-sgf'):     void;
  (e: 'save-sgf'):     void;
  (e: 'toggle-engine'): void;
  (e: 'mint-card'):    void;
}>();

const isConnected   = computed(() => props.engineStatus === 'connected');
// Symmetric verb pairing with the disconnected label; the connected
// branch previously read 'Engine', which left the action ambiguous.
const engineBtnLabel = computed(() => isConnected.value ? 'Disconnect' : 'Connect');
</script>

<template>
  <div class="toolbar">
    <!-- TASK 3: Generic Naming -->
    <span class="toolbar-title">{{ title ?? 'Open Go Studio' }}</span>

    <div v-if="isConnected" class="engine-metrics-bar">
      <div class="metric">
        <span class="m-lbl">PPS</span>
        <span class="m-val">{{ metrics.packetsPerSecond }}</span>
      </div>
      <div class="metric">
        <span class="m-lbl">LATENCY</span>
        <span class="m-val">{{ metrics.latencyMs }}ms</span>
      </div>
      <div class="metric">
        <span class="m-lbl">WATCHDOG</span>
        <span
          class="m-val watchdog-dot"
          :style="{ color: metrics.latencyMs < 500 ? '#00ff88' : 'var(--state-attention)' }"
        >●</span>
      </div>
    </div>

    <!-- qEUBO calibration cluster. Self-gating: renders only when an
         experiment exists. Sits between metrics and engine controls
         so it shares horizontal space with engine telemetry without
         competing for the title region. -->
    <QeuboToolbar />

    <div class="engine-controls">
      <button class="toolbar-btn highlight-btn" @click="emit('mint-card')">Mint Card</button>
      <button class="toolbar-btn" @click="emit('load-sgf')">Load SGF</button>
      <button class="toolbar-btn" @click="emit('save-sgf')">Save SGF</button>
      <button
        class="toolbar-btn"
        :class="{ 'btn-connected': isConnected }"
        @click="emit('toggle-engine')"
      >{{ engineBtnLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
.toolbar { height: 28px; background: var(--surface-3); display: flex; align-items: center; padding: 0 6px; gap: 6px; justify-content: space-between; border-bottom: 1px solid var(--surface-1); flex-shrink: 0; }
.toolbar-title { font-size: 10px; color: var(--text-0); text-transform: uppercase; letter-spacing: 0.12em; white-space: nowrap; }
.engine-metrics-bar { display: flex; gap: 10px; font-family: monospace; font-size: 11px; }
.metric { display: flex; align-items: center; gap: 4px; }
.m-lbl  { color: var(--border-3); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
.m-val  { color: var(--accent-primary); font-weight: bold; }
.engine-controls { display: flex; gap: 4px; flex-shrink: 0; }
.toolbar-btn { background: var(--border-2); border: 1px solid var(--border-3); color: var(--text-1); padding: 1px 5px; font-size: 11px; cursor: pointer; border-radius: 3px; font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: 0.05em; transition: background 0.15s, border-color 0.15s; }
.toolbar-btn:hover { background: var(--border-3); border-color: var(--border-3); color: var(--text-0); }
.btn-connected { border-color: var(--state-success) !important; color: var(--state-success) !important; }
/* theme-exception: .highlight-btn uses muted-cyan border (#2a5a7a)
   and #1a3a4a hover bg — same muted-action-button pattern as
   QeuboToolbar's .apply-btn. */
.highlight-btn { border-color: #2a5a7a; color: var(--accent-primary); }
.highlight-btn:hover { background: #1a3a4a; border-color: var(--accent-primary); }
</style>
