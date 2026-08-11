<!--
  src/components/chrome/ToolbarEngineCluster.vue

  LYT toolbar ontology reencode (commissioner-ratified 2026-08-11, ledger
  rows 1930/1931, item 2 "ONE ENGINE CLUSTER, ENVELOPE-RESERVED"). Extracted
  from the former Toolbar.vue: connect/disconnect, the engine-controls
  button cluster (mint-card / learn-path / play / match — the literal
  `.engine-controls` bundle that name already referred to), and engine
  metrics (ToolbarEngineMetrics) are now ONE functional cluster, mounted
  into the `.lyt` encoding's own `A_engine` leaf — a single envelope-
  reserved (`envelope: {disconnected, connected}`) band whose reservation
  is the MAX across engine states, so connecting/disconnecting changes
  what's enabled/visible WITHIN the reserved slot, never where anything
  sits (the commissioner's witnessed defect this closes: "Actions still
  reorganize the buttons in the toolbar (e.g. connecting)").

  The forecloses-the-class statement (ADR-0000 Rule 2, closure form): the
  invariant is "no widget's mount is conditionally inserted/removed from
  flow by engine connection state" — the quantification universe swept for
  this cluster is every DIRECT child of this cluster (metrics is the only
  state-conditional one; the buttons themselves render unconditionally in
  both states, only their content/highlight changes) plus the sibling
  ToolbarAppCluster.vue (audited: no engine-state-conditional structure
  there either, per that file's own header). The reservation this leaf
  gets in `research/lyt/encodings/lengyue_landscape.lyt` /
  `lengyue_portrait.lyt` is derived from a real-app Playwright measurement
  of BOTH states — see this repair's own dispatch report
  (`.claude/dispatch-reports/lyt-toolbar-ontology-reencode.md`) for the
  sweep table and derivation.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolbarEngineMetrics from './ToolbarEngineMetrics.vue';
import { useEngineControls } from '../../composables/useEngineControls';

const { t } = useI18n();

// isConnected is the ONLY engine-state read here (RB-1's render-coupling
// discipline, carried over from the pre-split Toolbar.vue): the live
// per-packet/per-tick telemetry lives inside <ToolbarEngineMetrics>,
// which self-sources it, so this cluster re-renders on connect/disconnect
// transitions only, not per packet.
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
  <div class="engine-cluster">
    <!-- Live engine telemetry — the one state-conditional mount in this
         cluster. Its track is reserved at the CONNECTED envelope state's
         width regardless of which state is live (envelope basis), so
         mounting/unmounting it never re-partitions a sibling. -->
    <ToolbarEngineMetrics v-if="isConnected" />
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
  </div>
</template>

<style scoped>
/* magic-literal: 28px min-height — same rationale as the pre-split
   Toolbar.vue's own `.toolbar` rule (badges + buttons at the project's
   ~13px text-emphasis font). `flex-wrap` lets the button row degrade
   onto a second line at narrow widths rather than clipping, same
   degradation mechanism the W1 REPAIR pass's own measured-sweep
   methodology relies on. */
.engine-cluster { min-height: 28px; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-tight); min-width: 0; }
/* Repair-pass lesson carried forward directly (App.vue's Finding A
   dated note): `.toolbar-cluster`/`.engine-controls` (the button-group
   sub-clusters) get their OWN wrap+shrink here, at authoring time,
   rather than via an external override rule reaching past the scoping
   boundary the way the pre-split Toolbar.vue needed App.vue to do — this
   component only ever mounts in the narrow side-column context now, so
   the old full-viewport-width "atomic cluster" assumption never applies
   here and doesn't need to be assumed then overridden. */
.toolbar-cluster { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-tight); flex-shrink: 1; min-width: 0; }
.engine-controls { display: flex; flex-wrap: wrap; gap: var(--space-tight); flex-shrink: 1; min-width: 0; }
/* magic-literal: .toolbar-btn padding `1px 5px` — see Toolbar.vue's
   history for the same rule (this is a verbatim carry-over, unchanged).
   G30 (WCAG 2.5.8): 24px min-height pointer-target floor. */
.toolbar-btn { background: var(--surface-0); border: 1px solid var(--border-3); color: var(--text-0); padding: 1px 5px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: var(--tracking-tight); min-height: 24px; display: inline-flex; align-items: center; justify-content: center; }
.btn-connected { border-color: var(--state-success) !important; color: var(--state-success) !important; }
.btn-stop-match { border-color: var(--state-attention) !important; color: var(--state-attention) !important; }
/* theme-exception: .highlight-btn uses muted-cyan border (#2a5a7a) —
   same muted-action-button pattern as QeuboToolbar's .apply-btn. */
.highlight-btn { border-color: #2a5a7a; color: var(--accent-primary); }
</style>
