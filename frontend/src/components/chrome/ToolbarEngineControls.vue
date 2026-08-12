<!--
  src/components/chrome/ToolbarEngineControls.vue

  M2 stage B2b boot-restoration wiring (`.claude/dispatch-reports/lyt-boot-
  restoration.md`; ledger row 2346; ruling row 2073, "three-vocabulary
  engine-status decomposition"). Extracted from the retired
  `ToolbarEngineCluster.vue`: the connect/disconnect + engine-controls
  button cluster (mint-card / learn-path / play / match — the literal
  `.engine-controls` bundle) is the fourth of the four leaves the ruling's
  own decomposition needs a home for (the ruling names three vocabularies
  — {winrate, lead} | {pps, latency, watchdog} | {queue} — plus this
  action cluster for the retired leaf's own `action` facet-half). Mounted
  at the compiled program's own `A_engine_controls` leaf
  (`lyt-widget-registry.ts`), unconditionally (connect/disconnect must be
  reachable while disconnected, unlike the metrics groups which only
  render once connected).

  `ToolbarEngineCluster.vue` previously wrapped this markup plus
  `<ToolbarEngineMetrics>` in ONE envelope-reserved mount at the single
  retired `A_engine` leaf. That wrapping `.engine-cluster` flex row is no
  longer needed here: the four new leaves already sit in their own CSS
  Grid row (`lyt-layout.gen.ts`'s own path "2.0", four elastic 1fr
  tracks in a 60px fixed row) — LytNode.vue's own grid does the
  row-layout job the old wrapper's `display:flex` used to do.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEngineControls } from '../../composables/useEngineControls';

const { t } = useI18n();

const { isConnected } = useEngineControls();

const props = defineProps<{
  // Match-running state from `usePlayMatch.isRunning`. When true the
  // MATCH button switches into STOP MATCH mode and emits the stop event
  // instead of opening the modal.
  isMatchRunning?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-engine'): void;
  (e: 'mint-card'):    void;
  (e: 'open-match'):   void;
  (e: 'stop-match'):   void;
  (e: 'open-play'):    void;
  (e: 'open-learn-path'): void;
}>();

const engineBtnLabel = computed(() => isConnected.value ? t('toolbar.disconnect') : t('toolbar.connect'));

const matchBtnLabel = computed(() => props.isMatchRunning ? t('toolbar.stopMatch') : t('toolbar.match'));
function onMatchClick() {
  if (props.isMatchRunning) emit('stop-match');
  else emit('open-match');
}
</script>

<template>
  <div class="engine-controls toolbar-cluster">
    <button class="toolbar-btn highlight-btn" @click="emit('mint-card')">{{ $t('toolbar.mintCard') }}</button>
    <button class="toolbar-btn" @click="emit('open-learn-path')">{{ $t('toolbar.learnPath') }}</button>
    <button class="toolbar-btn" @click="emit('open-play')">{{ $t('toolbar.play') }}</button>
    <button
      class="toolbar-btn"
      :class="{ 'btn-stop-match': isMatchRunning }"
      @click="onMatchClick"
    >{{ matchBtnLabel }}</button>
    <button
      class="toolbar-btn"
      :class="{ 'btn-connected': isConnected }"
      @click="emit('toggle-engine')"
    >{{ engineBtnLabel }}</button>
  </div>
</template>

<style scoped>
/* Verbatim carry-over from the retired ToolbarEngineCluster.vue's own
   rules for this same markup — see that file's git history for the
   pre-split rationale (magic-literal 28px min-height / flex-wrap
   degradation / 24px pointer-target floor). */
.engine-controls { display: flex; flex-wrap: wrap; gap: var(--space-tight); flex-shrink: 1; min-width: 0; min-height: 28px; align-items: center; }
.toolbar-cluster { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-tight); flex-shrink: 1; min-width: 0; }
.toolbar-btn { background: var(--surface-0); border: 1px solid var(--border-3); color: var(--text-0); padding: 1px 5px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: var(--tracking-tight); min-height: 24px; display: inline-flex; align-items: center; justify-content: center; }
.btn-connected { border-color: var(--state-success) !important; color: var(--state-success) !important; }
.btn-stop-match { border-color: var(--state-attention) !important; color: var(--state-attention) !important; }
.highlight-btn { border-color: #2a5a7a; color: var(--accent-primary); }
</style>
