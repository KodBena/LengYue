<!--
  src/components/Toolbar.vue
  Purely presentational application toolbar.
-->
<script setup lang="ts">
import { computed } from 'vue';
import QeuboToolbar from './QeuboToolbar.vue';
import { store } from '../store';
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

// Engine identity (KataGo `query_version` + `query_models` probe).
// Visible label is `models[0].internalName` — KataGo's short
// self-identifier — because the alternative `name` field on most
// installs is the model file's full pathname, which leaks operator
// info during streaming or screenshare. The full responses are
// retained in `versionPayload` / `modelsPayload` so the hover
// tooltip can show everything (including the privacy-concerning
// `name`) on demand. Reads `store.engine.info` directly; populated
// by analysisService on each fresh WebSocket open.
const engineInternalName = computed(() => store.engine.info.internalName);
const engineVersion = computed(() => store.engine.info.version);
const engineTooltip = computed(() => {
  const info = store.engine.info;
  const parts: string[] = [];
  if (info.versionPayload) {
    parts.push('query_version response:');
    parts.push(JSON.stringify(info.versionPayload, null, 2));
  }
  if (info.modelsPayload) {
    if (parts.length > 0) parts.push('');
    parts.push('query_models response:');
    parts.push(JSON.stringify(info.modelsPayload, null, 2));
  }
  return parts.length > 0
    ? parts.join('\n')
    : 'KataGo backend identity (refreshed on each connect / reconnect). Probe pending.';
});
</script>

<template>
  <div class="toolbar">
    <!-- The toolbar-title element is preserved as a layout slot
         (it participates in the toolbar's flex layout); the text
         binding is opt-in via the `title` prop. No caller passes
         it today; the element renders empty by default. -->
    <span class="toolbar-title">{{ title }}</span>

    <div v-if="isConnected" class="engine-metrics-bar">
      <!-- Engine identity (model + version), placed leftmost in the
           metrics cluster so it reads as "what am I talking to"
           context for the live-telemetry slots that follow. The
           visible value is `models[0].internalName` (KataGo's short
           self-identifier, no path leakage); hover surfaces the full
           probe responses (including the privacy-concerning `name`
           field) for inspection. The slot only renders when the
           probe has come back and at least one of internalName /
           version is known, so the toolbar stays clean during the
           connect-and-probe window. -->
      <div
        v-if="engineInternalName !== null || engineVersion !== null"
        class="metric engine-identity"
        :title="engineTooltip"
      >
        <span class="m-lbl">ENGINE</span>
        <span class="m-val engine-id-val">{{ engineInternalName ?? `v${engineVersion}` }}</span>
      </div>
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
.toolbar { height: 28px; background: var(--surface-0); display: flex; align-items: center; padding: 0 var(--space-default); gap: var(--space-default); justify-content: space-between; border-bottom: 1px solid var(--surface-1); flex-shrink: 0; }
.toolbar-title { font-size: var(--text-body); color: var(--text-0); text-transform: uppercase; letter-spacing: var(--tracking-default); white-space: nowrap; }
.engine-metrics-bar { display: flex; gap: var(--space-medium); font-family: monospace; font-size: var(--text-emphasis); align-items: center; min-width: 0; }
.metric { display: flex; align-items: center; gap: var(--space-tight); min-width: 0; }
.m-lbl  { color: var(--border-3); font-size: var(--text-tiny); text-transform: uppercase; letter-spacing: var(--tracking-default); }
.m-val  { color: var(--accent-primary); font-weight: bold; }
/* Engine-identity slot: the model's `internalName` can be 30–40 chars
   (`kata1-b18c384nbt-s9131461376-d4087399203` and similar). Cap the
   visible width and overflow-ellipsis so the toolbar stays compact;
   the full string is in the hover tooltip alongside the rest of the
   probe response. magic-literal: 220px max-width — empirically chosen
   to fit a typical `b{N}c{M}nbt-s{steps}` pattern without truncation,
   while ellipsing the genuinely long forms. */
.engine-identity { flex-shrink: 1; min-width: 0; }
.engine-id-val { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: help; }
.engine-controls { display: flex; gap: var(--space-tight); flex-shrink: 0; }
/* magic-literal: .toolbar-btn padding `1px 5px` — toolbar buttons are
   visually-compact one-line action triggers; tighter than the substrate's
   --space-tight (4px) on both axes for the dense top-toolbar's aesthetic. */
.toolbar-btn { background: var(--surface-0); border: 1px solid var(--border-3); color: var(--text-1); padding: 1px 5px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.btn-connected { border-color: var(--state-success) !important; color: var(--state-success) !important; }
/* theme-exception: .highlight-btn uses muted-cyan border (#2a5a7a)
   — same muted-action-button pattern as QeuboToolbar's .apply-btn.
   Hover-state literal retired with the no-mouseover-change sweep. */
.highlight-btn { border-color: #2a5a7a; color: var(--accent-primary); }
</style>
