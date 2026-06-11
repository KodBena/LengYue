<!--
  src/components/chrome/ToolbarEngineMetrics.vue
  Live engine-telemetry strip for the toolbar (version / model / winrate /
  scoreLead / PPS / latency / watchdog / queue). Self-sources the
  high-frequency reads (engine `metrics`, the current node's `rootInfo`) so
  they live in THIS leaf: the parent Toolbar mounts it `v-if="isConnected"`
  and no longer reads metrics/ledger in its own render, so a streaming range
  query stops re-rendering the whole toolbar (buttons + popover mounts) per
  packet. The render-coupling-at-composition-nodes fix
  (docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md),
  applied to the toolbar telemetry strip. Everything below moved verbatim
  from Toolbar.vue.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useThrottledSnapshot } from '../../composables/useThrottledSnapshot';
import { useI18n } from 'vue-i18n';
import EngineQueueTooltip from './EngineQueueTooltip.vue';
import { store, setSelectedModel, activeBoard } from '../../store';
import { activeAnalysisKeys } from '../../state/analysis-config';
import { ledger } from '../../state/analysis-ledger';
import { useEngineControls } from '../../composables/useEngineControls';
import { TOOLBAR_METRICS_REDRAW_THROTTLE_MS } from '../../lib/timing';

const { t } = useI18n();

// Self-sourced here rather than in the parent Toolbar (RB-1 routed it through
// Toolbar; this leaf is the next step so the per-tick metric reads no longer
// re-render the whole toolbar). Mounted only while connected, so no
// `isConnected` gate is needed inside this component.
const { metrics } = useEngineControls();

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
    return metrics.value.pingPendingSince !== null
      ? 'watchdog-pinging'
      : '';
  }
  return metrics.value.latencyMs >= store.profile.settings.engine.katago.watchdogLatencyThresholdMs
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
  const target = event.target as HTMLSelectElement; // DOM: handler bound on the model <select>, so target is that element
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
  const packet = ledger.getRaw(activeAnalysisKeys.value.rawKey, board.currentNodeId);
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

// ── Throttled metrics snapshot ────────────────────────────────────────
// This strip re-renders on two per-packet sources: `rootInfo` (winrate /
// scoreLead refine every packet) and `store.engine.metrics`, which
// analysis-service replaces wholesale on every response (the `lastResponseId`
// bump) — so even the 1 Hz PPS and 5 s latency reads churn at the packet rate
// through object identity. Project the four displayed scalars into a derived
// object and publish it to the template via the shared subscriber-projection
// throttle, so the strip redraws at most ~4 Hz. The watchdog dot is left LIVE
// below: its computed short-circuits on a stable class string (no per-packet
// render), and staying live lets a latency spike flip it promptly.
interface MetricsDisplay {
  winrate:   string;
  scoreLead: string;
  pps:       number;
  latency:   number;
}

const liveMetrics = computed<MetricsDisplay>(() => ({
  winrate:   winrateDisplay.value,
  scoreLead: scoreLeadDisplay.value,
  pps:       metrics.value.packetsPerSecond,
  latency:   metrics.value.latencyMs,
}));
const displayed = useThrottledSnapshot(liveMetrics, TOOLBAR_METRICS_REDRAW_THROTTLE_MS);
</script>

<template>
  <div class="engine-metrics-bar">
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
      <span class="m-val eval-val">{{ displayed.winrate }}</span>
    </div>
    <div class="metric" :title="$t('toolbar.metric.scoreLeadTooltip')">
      <span class="m-lbl">{{ $t('toolbar.metric.scoreLead') }}</span>
      <span class="m-val eval-val">{{ displayed.scoreLead }}</span>
    </div>
    <div class="metric">
      <span class="m-lbl">{{ $t('toolbar.metric.pps') }}</span>
      <span class="m-val">{{ displayed.pps }}</span>
    </div>
    <div class="metric">
      <span class="m-lbl">{{ $t('toolbar.metric.latency') }}</span>
      <span class="m-val">{{ $t('toolbar.metric.latencyValue', { ms: displayed.latency }) }}</span>
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
</template>

<style scoped>
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
</style>
