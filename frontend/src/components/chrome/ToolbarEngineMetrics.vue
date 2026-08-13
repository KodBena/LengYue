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

  The MODEL slot moved OUT again, to `EngineModelSelect.vue`: this
  component still whole-renders at ~1Hz on `ENGINE_METRICS_TICK_MS` (a
  250ms throttle can't coalesce a slower 1000ms source — see the
  throttled-snapshot comment below), which kept re-patching the model
  `<select>`'s `<option>`s and killing the user's hover even after the
  throttle fix (Defect 1, live-witnessed re-broken:
  docs/dispatch-reports/ui-fix-1b-diagnosis.md). Giving the select its
  own component instance gives it an independent render effect with no
  dependency on the tick — see that file's header for the full account.

  M2 stage B2b boot-restoration wiring (`.claude/dispatch-reports/lyt-
  boot-restoration.md`; ledger row 2346; ruling row 2073,
  "three-vocabulary engine-status decomposition"): the compiled program
  retires the single `A_engine` leaf this component used to mount inside
  (via the now-retired `ToolbarEngineCluster.vue`) in favour of four
  independently-tracked leaves. This component now renders ONE of two
  `group`s at a time (`'eval'` = identity {version, model} + {winrate,
  scoreLead}; `'health'` = {pps, latency, watchdog}) — the ruling's own
  per-leaf grounding names `eval` as "`winrateDisplay`/`scoreLeadDisplay`
  block" and `health` as "`metric-pps`/`metric-latency`/watchdog-dot
  block", but says nothing about the pre-existing identity (version/model)
  slot, which isn't one of the ruling's three named vocabularies at all.
  DISCLOSED JUDGMENT CALL: identity stays folded into `eval` (it read
  immediately left of winrate/scoreLead before this split, so `eval`
  keeps that same reading order) rather than inventing a fifth leaf the
  compiled program doesn't declare — named here, not hidden, per the
  boot-restoration commission's own STOP-and-report discipline for
  judgment calls the ruling itself left open. `App.vue` mounts one
  instance per group at `#leaf-A_engine_eval` / `#leaf-A_engine_health`;
  `queue` is no longer rendered by this component at all —
  `EngineQueueTooltip.vue` mounts directly at `#leaf-A_engine_queue`
  now, since it was already a fully self-contained sibling (no shared
  state with this component beyond living in the same flex row).

  Overlap fix (ledger row 2372, `.claude/dispatch-reports/lyt-metrics-
  overlap-fix.md`): the live-engine measurement pass
  (`.claude/dispatch-reports/lyt-engine-measurement.md`, Measurement 2)
  found this leaf's real natural content (identity + winrate + lead for
  `eval`; pps + latency + watchdog for `health`) genuinely overflowing
  its 139px column allotment — 534px / 236px of natural need against
  139px, confirmed both by DOM geometry and screenshot as CHARACTER-
  LEVEL text overlap with the neighbouring group, not merely a solver-
  model divergence. Per that commission's own framing, the model-level
  question of whether `A_engine_eval`/`_health` should carry an
  authored width FLOOR (raising the side column's own effective
  minimum) is a separate, filed open design item interacting with the
  three-vocabulary ruling above — NOT touched here. This fix is
  realization-only: it re-shapes what each group RENDERS so it never
  lies about the width it was actually given, following the exact
  compact-badge-plus-hover-popover idiom `EngineQueueTooltip.vue`
  already established (a small always-visible summary; the popover
  carries full fidelity, including — for `eval` — the interactive
  SELECTOR-mode `<EngineModelSelect>` itself, since a functional
  `<select>` cannot be represented by ellipsis or a static compact
  form the way a number can). Both groups' compact forms were measured
  at their real worst-case content width via an isolated static-HTML
  Playwright probe (`Courier New`/monospace, the theme's real
  font-size/spacing tokens) BEFORE being wired into this file, not
  guessed: `eval`'s "100.0%/-999.9" worst case measures 119.94px
  (19px/14% slack under 139px); `health`'s "9999pps ●" worst case
  (with the `HEALTH` label, not the shorter `SYS` candidate also
  probed — `HEALTH` reads clearer and still leaves 32px/23% slack)
  measures 107.09px. Neither the identity/version/model block nor the
  full-precision winrate/scoreLead/pps/latency/watchdog readouts are
  lost — they render inside the hover popover verbatim (same strings,
  same `EngineModelSelect` component instance, same tooltips), per the
  capability-IR realization philosophy the queue idiom already
  establishes: the compact form is honest about what fits inline: the
  popover is where full fidelity lives.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useThrottledSnapshot } from '../../composables/useThrottledSnapshot';
import { useI18n } from 'vue-i18n';
import EngineModelSelect from './EngineModelSelect.vue';
import { store, activeBoard } from '../../store';
import { activeAnalysisKeys } from '../../state/analysis-config';
import { ledger } from '../../state/analysis-ledger';
import { useEngineControls } from '../../composables/useEngineControls';
import { useHoverPopover } from '../../composables/chrome/useHoverPopover';
import { useFixedAnchoredPopover } from '../../composables/chrome/useFixedAnchoredPopover';
import { TOOLBAR_METRICS_REDRAW_THROTTLE_MS } from '../../lib/timing';

const { t } = useI18n();

// M2 stage B2b: which of the two remaining vocabulary groups this
// instance renders — see the file header's boot-restoration note.
// Defaults to 'eval' (identity + winrate/scoreLead) so an existing
// caller that mounts this component with no prop (e.g. the render-count
// regression guard, `tests/integration/render-count/ToolbarEngineMetrics.
// render-count.test.ts`, predates this split) keeps its pre-split
// behaviour unchanged.
const props = withDefaults(defineProps<{ group?: 'eval' | 'health' }>(), { group: 'eval' });

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
//
// `watchdogClasses` is defined below the throttled-metrics-snapshot
// section (`displayed`, ~line 200) — it reads `displayed.value.*`, not
// `metrics.value.*` directly. See that section's comment for why: an
// un-throttled read here previously re-ran this component's ENTIRE
// render on every 1 Hz `ENGINE_METRICS_TICK_MS` store tick. That WHOLE-
// RENDER coupling is still true after the throttle (a 250ms throttle
// is inert against a slower 1000ms source — see the throttled-snapshot
// comment below) — but it no longer touches the model `<select>`,
// because that element now lives in a sibling leaf component
// (`EngineModelSelect.vue`) with its own independent render effect.
// This component re-rendering on the tick is fine; the select not
// living inside it is what makes the tick unable to reach it
// (docs/dispatch-reports/ui-fix-1b-diagnosis.md, Defect 1 re-diagnosis).
const watchdogClasses = computed(() => {
  if (store.session.ui.watchdogColorTransition) {
    return displayed.value.pingPendingSince !== null
      ? 'watchdog-pinging'
      : '';
  }
  return displayed.value.latency >= store.profile.settings.engine.katago.watchdogLatencyThresholdMs
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

// Engine identity (KataGo `query_version` probe). The VERSION slot
// stays here; the MODEL slot (LEAF-mode static label / SELECTOR-mode
// `<select>` + its own tooltip) is `EngineModelSelect.vue` — a
// self-sourcing leaf mounted below, per that file's own header
// comment for why it's split out (the 1Hz-tick hover-kill witness).
const engineVersion = computed(() => store.engine.info.version);
const versionTooltip = computed(() => {
  const payload = store.engine.info.versionPayload;
  return payload
    ? `query_version response:\n${JSON.stringify(payload, null, 2)}`
    : t('toolbar.engineVersionTooltipPending');
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
// through object identity. Project the displayed scalars into a derived
// object and publish it to the template via the shared subscriber-projection
// throttle, so the strip redraws at most ~4 Hz.
//
// `pingPendingSince` and `latencyMs` (the watchdog dot's inputs) are folded
// into this SAME projection/throttle rather than read live. They used to be
// read directly off `metrics.value` from `watchdogClasses` below, which
// re-ran this component's whole render on every `ENGINE_METRICS_TICK_MS`
// (1000ms) store tick regardless of whether the watchdog fields actually
// changed — ADR-0010's render-locality corollary: "a reactive read anywhere
// in a template re-runs the whole render function." Routing it through
// `useThrottledSnapshot` here does NOT stop that whole-render coupling —
// `ENGINE_METRICS_TICK_MS` (1000ms) is slower than this throttle's own
// 250ms window, so a throttle with nothing faster to coalesce is inert
// (docs/dispatch-reports/ui-fix-1b-diagnosis.md re-diagnosed this after
// the fix shipped and found the tick still firing this component's render
// at ~1Hz). What actually stops the user-visible symptom is
// `EngineModelSelect.vue` no longer being a descendant of this render at
// all — see the MODEL-slot comment above and that file's own header.
// This throttle is kept for its original, still-valid purpose: coalescing
// the numeric-display churn (PPS / latency / winrate / scoreLead) to ~4 Hz
// so those redraw less often than per-packet.
//
// Deliberately reusing the EXISTING 250 ms throttle rather than adding a
// second, faster-but-still-gated one for the watchdog fields alone: the
// watchdog's own cadences are the animated ping-tandem duration
// (`watchdogAnimationMs`, default 500ms) and the un-animated sample poll
// (~5000ms) — both an order of magnitude slower than 250ms, so a single
// shared throttle keeps "a latency spike flips promptly" true in practice
// (worst-case 250ms added latency, imperceptible against either cadence)
// without a second timer instance to reason about. If a future consumer
// needs sub-250ms watchdog responsiveness, split it into its own
// `useThrottledSnapshot` call at that point rather than pre-emptively here.
interface MetricsDisplay {
  winrate:          string;
  scoreLead:        string;
  pps:              number;
  latency:          number;
  pingPendingSince: number | null;
}

const liveMetrics = computed<MetricsDisplay>(() => ({
  winrate:          winrateDisplay.value,
  scoreLead:        scoreLeadDisplay.value,
  pps:              metrics.value.packetsPerSecond,
  latency:          metrics.value.latencyMs,
  pingPendingSince: metrics.value.pingPendingSince,
}));
const displayed = useThrottledSnapshot(liveMetrics, TOOLBAR_METRICS_REDRAW_THROTTLE_MS);

// ── Overlap fix: compact-badge-plus-hover-popover (queue idiom) ────────
// Two independent hover/popover pairs — only one is ever live per mounted
// instance (this component renders exactly one of the two `v-if` branches
// below), but `<script setup>` can't conditionally declare composable
// calls, so both are wired unconditionally; the unused pair's trigger
// element never mounts, so its `open` ref never flips and its listeners
// never attach (see `useFixedAnchoredPopover`'s own `watch(open, ...)`
// gate). Distinct `devId`s so the DEV popover-perf harness can target
// either independently. See the file header's "Overlap fix" section for
// why: `eval`'s natural content (identity + winrate + lead) measured
// 534px against a 139px column, `health`'s (pps + latency + watchdog)
// 236px — both genuinely overflow, confirmed live
// (`.claude/dispatch-reports/lyt-engine-measurement.md`, Measurement 2).
const { open: evalOpen, onMouseEnter: onEvalEnter, onMouseLeave: onEvalLeave } = useHoverPopover({ devId: 'engine-eval' });
const evalTriggerEl = ref<HTMLElement | null>(null);
const evalPopoverEl = ref<HTMLElement | null>(null);
const { style: evalPopoverStyle } = useFixedAnchoredPopover(evalOpen, evalTriggerEl, evalPopoverEl, { align: 'left' });

const { open: healthOpen, onMouseEnter: onHealthEnter, onMouseLeave: onHealthLeave } = useHoverPopover({ devId: 'engine-health' });
const healthTriggerEl = ref<HTMLElement | null>(null);
const healthPopoverEl = ref<HTMLElement | null>(null);
const { style: healthPopoverStyle } = useFixedAnchoredPopover(healthOpen, healthTriggerEl, healthPopoverEl, { align: 'left' });
</script>

<template>
  <div class="engine-metrics-bar">
    <template v-if="props.group === 'eval'">
      <!-- Overlap fix (ledger row 2372): ONE compact always-visible
           badge — identity (version/model) never had a compact numeric
           form to fall back to (a functional SELECTOR `<select>` isn't
           ellipsis-able), so it moves into the hover popover entirely
           rather than getting its own inline slot; winrate/lead render
           as a single paired compact value alongside it, per the
           commission's own "a compact paired form probably fits"
           framing (measured 119.94px worst-case vs. the 139px
           allotment — see the file header). No native `title` on the
           trigger itself: the popover IS the "hover for more" surface,
           so a second native tooltip on the same hover would double up. -->
      <div
        ref="evalTriggerEl"
        class="metric eval-summary"
        @mouseenter="onEvalEnter"
        @mouseleave="onEvalLeave"
      >
        <span class="m-lbl">{{ $t('toolbar.metric.evalSummary') }}</span>
        <span class="m-val eval-summary-val">{{ displayed.winrate }}/{{ displayed.scoreLead }}</span>
      </div>
      <div
        v-if="evalOpen"
        ref="evalPopoverEl"
        class="metrics-popover"
        role="tooltip"
        :style="{ top: evalPopoverStyle.top, left: evalPopoverStyle.left }"
      >
        <!-- Full fidelity lives here, verbatim — same strings, same
             `EngineModelSelect` component instance (still interactive:
             SELECTOR-mode model-picking is not lost, only relocated),
             same per-metric tooltip text as the pre-fix inline markup. -->
        <div class="popover-row" :title="versionTooltip">
          <span class="popover-lbl">{{ $t('toolbar.metric.version') }}</span>
          <span class="popover-val">{{ engineVersion !== null ? `v${engineVersion}` : '—' }}</span>
        </div>
        <!-- No extra popover-lbl here: EngineModelSelect.vue's own
             template already renders a "MODEL" `.m-lbl` internally
             (it's the same markup that used to sit inline in this
             component pre-fix) — labelling it again here would
             duplicate the word. -->
        <div class="popover-row popover-row-model">
          <EngineModelSelect />
        </div>
        <div class="popover-row" :title="$t('toolbar.metric.winrateTooltip')">
          <span class="popover-lbl">{{ $t('toolbar.metric.winrate') }}</span>
          <span class="popover-val">{{ displayed.winrate }}</span>
        </div>
        <div class="popover-row" :title="$t('toolbar.metric.scoreLeadTooltip')">
          <span class="popover-lbl">{{ $t('toolbar.metric.scoreLead') }}</span>
          <span class="popover-val">{{ displayed.scoreLead }}</span>
        </div>
      </div>
    </template>
    <template v-else>
      <!-- Overlap fix (ledger row 2372): PPS stays visible as the
           headline number (already the shortest, least alarming of the
           three) with the watchdog dot alongside it (cheap in width, a
           glanceable status indicator not worth hiding); LATENCY's full
           reading moves into the popover, same reasoning as identity
           above — measured 107.09px worst-case with the `HEALTH` label
           vs. the 139px allotment (see the file header). -->
      <div
        ref="healthTriggerEl"
        class="metric health-summary"
        @mouseenter="onHealthEnter"
        @mouseleave="onHealthLeave"
      >
        <span class="m-lbl">{{ $t('toolbar.metric.healthSummary') }}</span>
        <span class="m-val health-summary-val">{{ $t('toolbar.metric.ppsValue', { n: displayed.pps }) }}</span>
        <span
          class="m-val watchdog-dot"
          :class="watchdogClasses"
          :style="watchdogStyle"
        >●</span>
      </div>
      <div
        v-if="healthOpen"
        ref="healthPopoverEl"
        class="metrics-popover"
        role="tooltip"
        :style="{ top: healthPopoverStyle.top, left: healthPopoverStyle.left }"
      >
        <div class="popover-row">
          <span class="popover-lbl">{{ $t('toolbar.metric.pps') }}</span>
          <span class="popover-val">{{ displayed.pps }}</span>
        </div>
        <div class="popover-row">
          <span class="popover-lbl">{{ $t('toolbar.metric.latency') }}</span>
          <span class="popover-val">{{ $t('toolbar.metric.latencyValue', { ms: displayed.latency }) }}</span>
        </div>
        <div class="popover-row">
          <span class="popover-lbl">{{ $t('toolbar.metric.watchdog') }}</span>
          <span
            class="popover-val watchdog-dot"
            :class="watchdogClasses"
            :style="watchdogStyle"
          >●</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.engine-metrics-bar { display: flex; gap: var(--space-medium); font-family: monospace; font-size: var(--text-emphasis); align-items: center; min-width: 0; }
.metric { display: flex; align-items: center; gap: var(--space-tight); min-width: 0; }
.m-lbl  { color: var(--border-3); font-size: var(--text-tiny); text-transform: uppercase; letter-spacing: var(--tracking-default); }
/* wC-contrast (F9): readable text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. */
.m-val  { color: var(--text-0); font-weight: bold; display: inline-block; text-align: right; }
/* Overlap fix (ledger row 2372): the compact-badge trigger elements.
   Both were measured at their real worst-case content width via an
   isolated static-HTML Playwright probe (`Courier New`/monospace, the
   theme's real font-size/spacing tokens) BEFORE landing here — see the
   file header's "Overlap fix" section for the exact numbers and the
   probe methodology. `min-width`/`max-width` are NOT set here
   (deliberately): unlike the old inline winrate/pps/latency cells,
   these compact values are already short and bounded by their own
   source format (a percentage plus one decimal, a signed one-decimal
   score, a small integer packet rate) — the worst-case figures in the
   header comment are the ceiling this format can produce, not an
   unbounded string that needs an explicit reservation to stay
   rightward-stable. `cursor: help` cues "hover for the full readout,"
   replacing the native `title` the pre-fix identity/winrate/scoreLead
   cells carried individually — one popover now stands in for all of
   them. */
.eval-summary, .health-summary { cursor: help; white-space: nowrap; }
.eval-summary-val, .health-summary-val { white-space: nowrap; }
/* Health's watchdog dot stays inline (see the template comment) — no
   width rule needed beyond the shared `.watchdog-dot` one below; it's
   a single glyph. */

/* ── Popover (queue idiom — EngineQueueTooltip.vue's own `.queue-popover`,
   duplicated rather than shared: `<style scoped>` doesn't cross
   component boundaries, and this popover's content shape — labelled
   rows, not a table — differs enough that sharing would mean threading
   a slot through a dedicated composable for two call sites, more
   machinery than the two rows of near-identical CSS it would save). ── */
.metrics-popover {
  position: fixed;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  padding: var(--space-tight);
  z-index: var(--z-popover-chrome);
  white-space: nowrap;
  min-width: 200px;
  font-family: monospace;
  font-size: var(--text-body);
  color: var(--text-0);
  display: flex;
  flex-direction: column;
  gap: var(--space-tight);
}
.popover-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-medium); }
.popover-row-model { justify-content: flex-start; }
.popover-lbl { color: var(--border-3); font-size: var(--text-tiny); text-transform: uppercase; letter-spacing: var(--tracking-default); }
.popover-val { color: var(--text-0); font-weight: bold; }

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
</style>
