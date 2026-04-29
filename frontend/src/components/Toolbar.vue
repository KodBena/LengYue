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
const engineBtnLabel = computed(() => isConnected.value ? 'Engine' : 'Connect');
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
          :style="{ color: metrics.latencyMs < 500 ? '#00ff88' : '#ff4444' }"
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
.toolbar { height: 45px; background: #252525; display: flex; align-items: center; padding: 0 15px; gap: 12px; justify-content: space-between; border-bottom: 1px solid #111; flex-shrink: 0; }
.toolbar-title { font-size: 10px; color: #fff; text-transform: uppercase; letter-spacing: 0.12em; white-space: nowrap; }
.engine-metrics-bar { display: flex; gap: 18px; font-family: monospace; font-size: 11px; }
.metric { display: flex; align-items: center; gap: 5px; }
.m-lbl  { color: #555; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
.m-val  { color: #4aaef0; font-weight: bold; }
.engine-controls { display: flex; gap: 8px; flex-shrink: 0; }
.toolbar-btn { background: #333; border: 1px solid #444; color: #ccc; padding: 5px 12px; font-size: 11px; cursor: pointer; border-radius: 3px; font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: 0.05em; transition: background 0.15s, border-color 0.15s; }
.toolbar-btn:hover { background: #444; border-color: #555; color: #fff; }
.btn-connected { border-color: #4caf50 !important; color: #4caf50 !important; }
.highlight-btn { border-color: #2a5a7a; color: #4aaef0; }
.highlight-btn:hover { background: #1a3a4a; border-color: #4aaef0; }
</style>
