<!--
  src/components/Toolbar.vue
  Purely presentational application toolbar.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import QeuboToolbar from './QeuboToolbar.vue';
import { store, setSelectedModel } from '../store';
import type { EngineStatus, EngineMetrics } from '../types';

const { t } = useI18n();

const props = defineProps<{
  engineStatus: EngineStatus;
  metrics:      EngineMetrics;
  title?:       string;
  // Match-running state from `usePlayMatch.isRunning`. When true the
  // MATCH button switches into STOP MATCH mode and emits the stop
  // event instead of opening the modal. Defaults to `false` so
  // existing call sites that don't pass the prop keep the static
  // MATCH-opens-modal behaviour.
  isMatchRunning?: boolean;
}>();

const emit = defineEmits<{
  (e: 'load-sgf'):     void;
  (e: 'save-sgf'):     void;
  (e: 'toggle-engine'): void;
  (e: 'mint-card'):    void;
  (e: 'open-match'):   void;
  (e: 'stop-match'):   void;
}>();

const isConnected   = computed(() => props.engineStatus === 'connected');
// Symmetric verb pairing with the disconnected label; the connected
// branch previously read 'Engine', which left the action ambiguous.
const engineBtnLabel = computed(() => isConnected.value ? t('toolbar.disconnect') : t('toolbar.connect'));

// Single state-driven button: MATCH opens the modal when idle, STOP
// MATCH cancels the cooperative-stop signal when a match is running.
// Two roles on one chrome slot keeps the toolbar compact and avoids
// surfacing a stop button that never fires for users who don't use
// engine matches.
const matchBtnLabel = computed(() => props.isMatchRunning ? t('toolbar.stopMatch') : t('toolbar.match'));
function onMatchClick() {
  if (props.isMatchRunning) emit('stop-match');
  else emit('open-match');
}

// Engine identity (KataGo `query_version` + `query_models` probe).
// Two separate slots — VERSION and MODEL — each with its own
// hover tooltip showing the full corresponding probe payload.
// The model slot's render shape varies by proxy role:
//
//   - LEAF / RELAY / ECHO (or SELECTOR-not-advertised): static
//     label showing `models[0].internalName` (KataGo's short
//     self-identifier — short and path-free, suitable for
//     streaming / screenshare contexts).
//   - SELECTOR (capabilities.selector advertised): `<select>`
//     dropdown sourced from `engine.info.availableModels` (each
//     entry's `label` field). Selection writes to
//     `engine.selectedModel` via the named mutator and persists
//     through SyncService.
//
// In both modes the slot's hover tooltip surfaces the full
// `query_models` payload (including the privacy-concerning `name`
// field on LEAF mode) for debugging.
const engineInternalName = computed(() => store.engine.info.internalName);
const engineVersion = computed(() => store.engine.info.version);
const isSelectorMode = computed(() => {
  const caps = store.engine.info.capabilities;
  return caps !== null && 'selector' in caps;
});
const availableModels = computed(() => store.engine.info.availableModels);
const selectedModel = computed(() => store.engine.selectedModel);
function onSelectModel(event: Event) {
  const target = event.target as HTMLSelectElement;
  setSelectedModel(target.value || null);
}
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
        <select
          v-if="isSelectorMode"
          class="m-val engine-id-val engine-model-select"
          :value="selectedModel ?? ''"
          @change="onSelectModel"
        >
          <option
            v-for="entry in availableModels"
            :key="entry.label"
            :value="entry.label"
          >{{ entry.label }}</option>
        </select>
        <span v-else class="m-val engine-id-val">{{ engineInternalName ?? '—' }}</span>
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
      <button
        class="toolbar-btn"
        :class="{ 'btn-stop-match': isMatchRunning }"
        @click="onMatchClick"
      >{{ matchBtnLabel }}</button>
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
/* SELECTOR-mode model dropdown. The .m-val class on the same
   element supplies the accent colour + bold weight; this rule
   overrides only the chrome — transparent background + thin
   border so it reads as a native part of the metrics row rather
   than a heavy form control. font-family is set explicitly
   because <select> elements default to system-UI typography and
   wouldn't inherit the surrounding monospace; pointer cursor
   overrides .engine-id-val's `help`. */
.engine-model-select { background: transparent; border: 1px solid var(--border-3); padding: 0 var(--space-tight); border-radius: var(--radius-default); cursor: pointer; font-family: monospace; font-size: var(--text-emphasis); }
.engine-controls { display: flex; gap: var(--space-tight); flex-shrink: 0; }
/* magic-literal: .toolbar-btn padding `1px 5px` — toolbar buttons are
   visually-compact one-line action triggers; tighter than the substrate's
   --space-tight (4px) on both axes for the dense top-toolbar's aesthetic. */
.toolbar-btn { background: var(--surface-0); border: 1px solid var(--border-3); color: var(--text-1); padding: 1px 5px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.btn-connected { border-color: var(--state-success) !important; color: var(--state-success) !important; }
/* Match-running attention border on the same slot the MATCH button
   normally occupies. Reuses the existing attention substrate so the
   colour reads as "this button does something interruptive" without
   adding a new theme exception. */
.btn-stop-match { border-color: var(--state-attention) !important; color: var(--state-attention) !important; }
/* theme-exception: .highlight-btn uses muted-cyan border (#2a5a7a)
   — same muted-action-button pattern as QeuboToolbar's .apply-btn.
   Hover-state literal retired with the no-mouseover-change sweep. */
.highlight-btn { border-color: #2a5a7a; color: var(--accent-primary); }
</style>
