<!--
  src/components/chrome/Toolbar.vue
  Purely presentational application toolbar.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PboPopover from '../qeubo/PboPopover.vue';
import ToolbarEngineMetrics from './ToolbarEngineMetrics.vue';
import ToolbarSliderPopover from './ToolbarSliderPopover.vue';
import { useEngineControls } from '../../composables/useEngineControls';
import { useAutoNavigatePerf } from '../../composables/useAutoNavigatePerf';
import { useAutoPopoverPerf } from '../../composables/useAutoPopoverPerf';

const { t } = useI18n();

// RB-1 (App-decouple from engine metrics —
// docs/notes/perf-audit-range-query-nav-2026-05-29.md): status/metrics are
// self-sourced via useEngineControls (store-backed computeds) rather than
// received as props. The live PPS / latency / winrate / scoreLead / watchdog
// telemetry — the per-packet/per-tick reads — now lives in the
// <ToolbarEngineMetrics> leaf below, so this Toolbar reads only `isConnected`
// (low-frequency) and no longer re-renders per packet during analysis.
const { isConnected, clearCache } = useEngineControls();

// Dev affordance: the clear-cache button (cold-cache benchmarking) only
// renders in dev builds. import.meta.env.DEV is statically folded, so the
// button and its handler dead-code-eliminate in production.
const isDevBuild = import.meta.env.DEV;

// Dev affordance: auto-navigate-for-perf-capture harness. Obtained
// unconditionally (matching clearCache above); the button is dev-gated, so
// the loop is unreachable in production and start() never fires there.
const { isRunning: autoNavRunning, toggle: toggleAutoNav } = useAutoNavigatePerf();
// Dev affordance: popover-stress harness — toggles a popover open/closed at a
// fixed cadence while a range query streams (for the popover-sluggishness
// measurement). Targets the queue tooltip; swap the arg for 'sliders'.
const { isRunning: popoverStressRunning, toggle: togglePopoverStress } = useAutoPopoverPerf();

const props = defineProps<{
  title?:       string;
  // Match-running state from `usePlayMatch.isRunning`. When true the
  // MATCH button switches into STOP MATCH mode and emits the stop
  // event instead of opening the modal. Defaults to `false` so
  // existing call sites that don't pass the prop keep the static
  // MATCH-opens-modal behaviour.
  isMatchRunning?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-engine'): void;
  (e: 'mint-card'):    void;
  (e: 'open-match'):   void;
  (e: 'stop-match'):   void;
  (e: 'open-play'):    void;
}>();

// isConnected is destructured from useEngineControls() above (RB-1).
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
</script>

<template>
  <div class="toolbar">
    <!-- The toolbar-title element is preserved as a layout slot
         (it participates in the toolbar's flex layout); the text
         binding is opt-in via the `title` prop. No caller passes
         it today; the element renders empty by default. -->
    <span class="toolbar-title">{{ title }}</span>

    <!-- Live engine telemetry (version / model / winrate / scoreLead / PPS /
         latency / watchdog / queue). Extracted to its own leaf so its
         per-packet / per-tick reads re-render only it, not the whole toolbar
         (render-coupling fix — see ToolbarEngineMetrics.vue). Mounted only
         while connected; the `v-if` is the sole engine-state read left in
         this Toolbar's render. -->
    <ToolbarEngineMetrics v-if="isConnected" />

    <!-- Knob registry quick-access — hover the badge to drop down a
         compact, priority-ordered list of every scalar knob in the
         registry. Sits visually adjacent to the engine-metrics row
         (PPS, LATENCY, WATCHDOG, QUEUE) when connected, but the badge
         itself is substrate-driven (ADR-0003 band 1) and renders
         unconditionally — preferences like ownership opacity and hue
         offset have nothing to do with engine reachability. Mounting
         INSIDE the v-if="isConnected" wrapper above was the PR #225
         band/chrome-neighbourhood mismatch; see
         `docs/notes/postmortem-knob-toolbar-popover-2026-05.md` for
         the discipline this placement preserves. -->
    <ToolbarSliderPopover />

    <!-- PBO (preference-based Bayesian optimisation) calibration
         popover. Self-gating on `calibrationEnabled &&
         experimentExists` — feature constraint, not an inherited
         engine-lifecycle gate (see
         `docs/notes/postmortem-knob-toolbar-popover-2026-05.md`
         for the band-coherence discipline). Sits between metrics
         and engine controls so it shares horizontal space with
         engine telemetry without competing for the title region.
         The user-facing name is PBO; code identifiers and the
         backend's `/qeubo/*` routes retain `qeubo` (the
         acquisition function / library name). -->
    <PboPopover />

    <div class="engine-controls">
      <button class="toolbar-btn highlight-btn" @click="emit('mint-card')">{{ $t('toolbar.mintCard') }}</button>
      <!-- PLAY opens the manage-games-on-this-board modal. Single
           surface for both "start new game vs engine" and "end an
           existing game" — see `PlayEngineModal.vue` for the
           shape. Sibling to MATCH (engine-vs-engine self-play)
           and intentionally adjacent so the two engine-driven
           game affordances are visually grouped. -->
      <button class="toolbar-btn" @click="emit('open-play')">{{ $t('toolbar.play') }}</button>
      <button
        class="toolbar-btn"
        :class="{ 'btn-stop-match': isMatchRunning }"
        @click="onMatchClick"
      >{{ matchBtnLabel }}</button>
      <!-- Dev-only cold-cache affordance, beside connect/disconnect. -->
      <button
        v-if="isDevBuild"
        class="toolbar-btn"
        :disabled="!isConnected"
        :title="$t('engine.clearCache.title')"
        @click="clearCache"
      >{{ $t('toolbar.clearCache') }}</button>
      <!-- Dev-only auto-navigate-for-perf-capture affordance (useAutoNavigatePerf). -->
      <button
        v-if="isDevBuild"
        class="toolbar-btn"
        :class="{ 'btn-connected': autoNavRunning }"
        :title="$t('toolbar.autoNavPerf.title')"
        @click="toggleAutoNav"
      >{{ autoNavRunning ? $t('toolbar.autoNavPerf.stop') : $t('toolbar.autoNavPerf.start') }}</button>
      <!-- Dev-only popover-stress affordance (useAutoPopoverPerf). -->
      <button
        v-if="isDevBuild"
        class="toolbar-btn"
        :class="{ 'btn-connected': popoverStressRunning }"
        :title="$t('toolbar.popoverStress.title')"
        @click="togglePopoverStress('queue')"
      >{{ popoverStressRunning ? $t('toolbar.popoverStress.stop') : $t('toolbar.popoverStress.start') }}</button>
      <button
        class="toolbar-btn"
        :class="{ 'btn-connected': isConnected }"
        @click="emit('toggle-engine')"
      >{{ engineBtnLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
/* magic-literal: 28px `.toolbar` min-height. The toolbar renders
   one row of metric badges + engine-controls at the project author's
   text-emphasis font (~13px). 28 leaves the badges room for their
   ~1px vertical padding plus the line-box without crowding the
   border-bottom. Composes with `.top-nav-bar`'s 32px (parent in
   App.vue) — the 4px gap is implicit centring room inside the parent.
   `min-height` (not `height`) + `flex-wrap: wrap` (iter-13, audit
   Finding G): at narrow viewports the metric cluster previously got
   crushed while `engine-identity` / `engine-controls` (both
   flex-shrink: 0) kept their full width — labels became unreadable,
   CONNECT clipped off the right edge. Wrapping lets the toolbar
   grow vertically instead. `justify-content: space-between` still
   spreads items within each wrapped row. */
.toolbar { min-height: 28px; background: var(--surface-0); display: flex; flex-wrap: wrap; align-items: center; padding: 0 var(--space-default); gap: var(--space-default); justify-content: space-between; border-bottom: 1px solid var(--surface-1); flex-shrink: 0; }
.toolbar-title { font-size: var(--text-body); color: var(--text-0); text-transform: uppercase; letter-spacing: var(--tracking-default); white-space: nowrap; }
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
