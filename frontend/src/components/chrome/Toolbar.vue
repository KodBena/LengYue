<!--
  src/components/chrome/Toolbar.vue
  Purely presentational application toolbar.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import QeuboToolbar from '../qeubo/QeuboToolbar.vue';
import EngineQueueTooltip from './EngineQueueTooltip.vue';
import ToolbarSliderPopover from './ToolbarSliderPopover.vue';
import { store, setSelectedModel, activeBoard } from '../../store';
import { activeConfigHash } from '../../services/analysis-config';
import { ledger } from '../../services/analysis-ledger';
import type { EngineStatus, EngineMetrics } from '../../types';

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
  (e: 'toggle-engine'): void;
  (e: 'mint-card'):    void;
  (e: 'open-match'):   void;
  (e: 'stop-match'):   void;
}>();

// Two distinct watchdog-dot modes, gated by
// `session.ui.watchdogColorTransition`:
//
//   - OFF (default): sample-driven. Dot reads `latencyMs` from
//     the most recent watchdog poll (5000ms cadence) and flips
//     green/red on the threshold. Colour persists until the next
//     sample replaces the value. This is the historical
//     behaviour the codebase shipped with.
//
//   - ON: ping-tandem. Dot starts an animation when each
//     watchdog `query_version` ping is sent (`pingPendingSince`
//     non-null) and resets to green when the pong returns
//     (`pingPendingSince` null). The animation fades from green
//     toward red over a duration tuned to make a fast pong barely
//     visible and a slow / never-arriving pong fully red. Class
//     applied on the dot triggers the keyframe; class removed
//     snaps the dot back to green per the keyframe's
//     `animation-fill-mode: forwards` interaction with the
//     class-toggle.
//
// The threshold is sourced from the registry leaf promoted in
// the knob-registry Phase 6 sweep (was a hardcoded
// `WATCHDOG_LATENCY_THRESHOLD_MS = 500` const). KataGo's proxy
// returns `query_version` in single-digit ms when idle and
// hundreds-of-ms when concurrent analyses serialise the proxy's
// command queue behind heavy-analyze responses — 500ms is the
// hand-tuned "the engine is busy enough that the user should
// notice" point; users on slower networks can raise it. Drives
// via the `engine.watchdog-latency-threshold-ms` KnobDecl.
const watchdogClasses = computed(() => {
  if (store.session.ui.watchdogColorTransition) {
    return store.engine.metrics.pingPendingSince !== null
      ? 'watchdog-pinging'
      : '';
  }
  return props.metrics.latencyMs >= store.profile.settings.engine.katago.watchdogLatencyThresholdMs
    ? 'watchdog-bad'
    : '';
});

// Bind the keyframe duration to the registry-promoted leaf
// (knob-registry Phase 3a). The CSS rule for `.watchdog-pinging`
// reads `var(--watchdog-animation-ms)` for the animation duration;
// the inline custom property here sources from
// `engine.katago.watchdogAnimationMs` and is driven by the
// `engine.watchdog-animation-ms` KnobDecl. Inline binding rather
// than a stylesheet rule so the property scopes to the dot and
// updates reactively without a watcher.
const watchdogStyle = computed(() => ({
  '--watchdog-animation-ms': `${store.profile.settings.engine.katago.watchdogAnimationMs}ms`,
}));

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
  // Return focus to the document body so the global space-bar
  // ponder toggle (wired in `useUserIORegistry`) fires correctly
  // on the next keystroke. Without the blur, focus stays on the
  // <select>, and `useUserIORegistry`'s `HTMLSelectElement` guard
  // bails on the keydown — the user's "pick model, press space"
  // workflow then needs an intervening click outside the toolbar.
  target.blur();
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

// Live engine-evaluation surface — slim-tier preview of the
// "user-captured rootInfo display" arc. Reads winrate and
// scoreLead directly from the canonical packet for the active
// board's current node so the user can sense the engine's
// view without activating move-suggestions and reading the blue
// spot. The fuller arc (user picks which scalars + framing via
// a filter-expression-style compiler, analogous to
// `moveFilterExpression`) is its own future work unit; this
// surface is two hardcoded metrics with W-framed display
// matching the SPA-wide canonical framing in
// `engine/katago/winrate-framing.ts`. When the fuller arc
// lands, this fixed pair retires in favour of the configurable
// slot.
//
// Reactive shape: `ledger.getRaw(hash, nodeId)` registers a
// per-node version-ref dependency on the read, so the display
// re-evaluates whenever the current node's packet is bumped by
// `analysis-service::onAnalysisUpdate`. Hash separation across
// config swaps mirrors `use-move-suggestions.ts:78`'s
// established precedent.
const rootInfo = computed(() => {
  const board = activeBoard.value;
  if (!board) return null;
  const packet = ledger.getRaw(activeConfigHash.value, board.currentNodeId);
  return packet?.rootInfo ?? null;
});
const winrateDisplay = computed(() => {
  const r = rootInfo.value;
  if (!r || !Number.isFinite(r.winrate)) return '—';
  return `${(r.winrate * 100).toFixed(1)}%`;
});
const scoreLeadDisplay = computed(() => {
  const r = rootInfo.value;
  if (!r || !Number.isFinite(r.scoreLead)) return '—';
  const sign = r.scoreLead >= 0 ? '+' : '';
  return `${sign}${r.scoreLead.toFixed(1)}`;
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
            :disabled="!entry.healthy"
            :title="entry.healthy ? entry.label : t('toolbar.modelUnavailable', { label: entry.label })"
          >{{ entry.label }}{{ entry.healthy ? '' : ' (unavailable)' }}</option>
        </select>
        <span v-else class="m-val engine-id-val">{{ engineInternalName ?? '—' }}</span>
      </div>
      <!-- Live engine evaluation — slim preview of the user-
           captured rootInfo display arc (see the corresponding
           computeds in <script>). Two hardcoded W-framed
           scalars; tooltips name the framing so the value is
           unambiguous without reading the source. Renders
           unconditionally inside the connected-only metrics bar;
           '—' placeholder when no packet exists for the active
           node (pre-analysis, fresh navigation, or post-purge). -->
      <div class="metric" :title="$t('toolbar.metric.winrateTooltip')">
        <span class="m-lbl">{{ $t('toolbar.metric.winrate') }}</span>
        <span class="m-val eval-val">{{ winrateDisplay }}</span>
      </div>
      <div class="metric" :title="$t('toolbar.metric.scoreLeadTooltip')">
        <span class="m-lbl">{{ $t('toolbar.metric.scoreLead') }}</span>
        <span class="m-val eval-val">{{ scoreLeadDisplay }}</span>
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
          :class="watchdogClasses"
          :style="watchdogStyle"
        >●</span>
      </div>
      <!-- Queue tooltip — hover the count to see every in-flight
           proxy query, with kind, SELECTOR model label, turn /
           visit progress and ETA. Always rendered while connected
           so the user knows whether the engine has outstanding
           work even when no per-board ponder is active. -->
      <EngineQueueTooltip />
    </div>

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
/* Watchdog dot. magic-literal: #00ff88 (green) is the in-codebase
   liveness-OK convention; var(--state-attention) is the
   substrate's red attention anchor. */
.watchdog-dot { color: #00ff88; }
/* Default (un-animated) mode — `watchdog-bad` reflects the most
   recent watchdog poll's `latencyMs` against the registry-driven
   `engine.katago.watchdogLatencyThresholdMs` leaf. Class toggles
   instantly; the 5000ms watchdog cadence gives the dot its
   "stays red for ~5s after a spike" feel. */
.watchdog-dot.watchdog-bad { color: var(--state-attention); }
/* Animated mode — gated by `session.ui.watchdogColorTransition`,
   default off. Class is added when a watchdog ping is in flight
   (`pingPendingSince` non-null) and removed on pong; the
   keyframe animates green → red, with `forwards` holding the
   end colour if the ping outruns the animation, and the
   class-remove path snaps back to the base green (no
   transition declared, so removal is instant). The duration is
   sourced from the `--watchdog-animation-ms` CSS custom property
   bound inline by `watchdogStyle` to the
   `engine.katago.watchdogAnimationMs` registry leaf (promoted in
   knob-registry Phase 3a). Fallback 500ms matches the prior
   hardcoded literal so an unbound dot animates identically to
   the pre-promotion behaviour. The latency-threshold counterpart
   for un-animated mode lives at
   `engine.katago.watchdogLatencyThresholdMs` (knob-registry
   Phase 6 sweep) — same value at default; independent surface
   for tuning. */
.watchdog-dot.watchdog-pinging {
  animation: watchdog-pong-pending var(--watchdog-animation-ms, 500ms) linear forwards;
}
@keyframes watchdog-pong-pending {
  from { color: #00ff88; }
  to   { color: var(--state-attention); }
}
.engine-version-val, .engine-id-val, .eval-val { white-space: nowrap; cursor: help; }
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
