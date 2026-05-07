<!--
  src/components/Toolbar.vue
  Purely presentational application toolbar.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import QeuboToolbar from './QeuboToolbar.vue';
import { store } from '../store';
import type { EngineStatus, EngineMetrics } from '../types';

const { t } = useI18n();

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
const engineBtnLabel = computed(() => isConnected.value ? t('toolbar.disconnect') : t('toolbar.connect'));

// Engine identity (KataGo `query_version` + `query_models` probe).
// Two separate slots — VERSION and MODEL — each with its own
// hover tooltip showing the full corresponding probe payload.
// The model slot displays `models[0].internalName` (KataGo's short
// self-identifier) because the alternative `name` field on most
// installs is the model file's full pathname, which leaks operator
// info during streaming or screenshare; the full `query_models`
// response (including `name`) is reachable via the model slot's
// tooltip on demand. Reads `store.engine.info` directly; populated
// by analysisService on each fresh WebSocket open. Slots render
// unconditionally while connected with a `—` placeholder during
// the connect-and-probe window so layout stays stable.
const engineInternalName = computed(() => store.engine.info.internalName);
const engineVersion = computed(() => store.engine.info.version);
const versionTooltip = computed(() => {
  const payload = store.engine.info.versionPayload;
  return payload
    ? `query_version response:\n${JSON.stringify(payload, null, 2)}`
    : t('toolbar.engineVersionTooltipPending');
});
const modelTooltip = computed(() => {
  const payload = store.engine.info.modelsPayload;
  return payload
    ? `query_models response:\n${JSON.stringify(payload, null, 2)}`
    : t('toolbar.engineModelTooltipPending');
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
      <!-- Engine identity, split into two adjacent slots so VERSION
           and MODEL are independently legible and each carries the
           full corresponding probe payload in its hover tooltip.
           Placed leftmost in the metrics cluster so they read as
           "what am I talking to" context for the live-telemetry
           slots that follow. Both slots render unconditionally while
           connected, with a `—` placeholder during the brief
           connect-and-probe window so the layout doesn't shift when
           the responses arrive. -->
      <div class="metric engine-identity" :title="versionTooltip">
        <span class="m-lbl">{{ $t('toolbar.metric.version') }}</span>
        <span class="m-val engine-version-val">{{ engineVersion !== null ? `v${engineVersion}` : '—' }}</span>
      </div>
      <div class="metric engine-identity" :title="modelTooltip">
        <span class="m-lbl">{{ $t('toolbar.metric.model') }}</span>
        <span class="m-val engine-id-val">{{ engineInternalName ?? '—' }}</span>
      </div>
      <div class="metric">
        <span class="m-lbl">{{ $t('toolbar.metric.pps') }}</span>
        <span class="m-val">{{ metrics.packetsPerSecond }}</span>
      </div>
      <div class="metric">
        <span class="m-lbl">{{ $t('toolbar.metric.latency') }}</span>
        <span class="m-val">{{ $t('toolbar.metric.latencyValue', { ms: metrics.latencyMs }) }}</span>
      </div>
      <div class="metric">
        <span class="m-lbl">{{ $t('toolbar.metric.watchdog') }}</span>
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
      <button class="toolbar-btn highlight-btn" @click="emit('mint-card')">{{ $t('toolbar.mintCard') }}</button>
      <button class="toolbar-btn" @click="emit('load-sgf')">{{ $t('toolbar.loadSgf') }}</button>
      <button class="toolbar-btn" @click="emit('save-sgf')">{{ $t('toolbar.saveSgf') }}</button>
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
/* Engine-identity slots (VERSION + MODEL): the model's `internalName`
   can be 30–40 chars (`kata1-b18c384nbt-s9131461376-d4087399203` and
   similar). Shown in full — the toolbar has room and the user
   explicitly wanted the full identifier visible without hover. The
   `cursor: help` on the value cues the hover tooltip (full probe
   response, including the privacy-concerning `name` field). */
.engine-identity { flex-shrink: 0; }
.engine-version-val, .engine-id-val { white-space: nowrap; cursor: help; }
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
