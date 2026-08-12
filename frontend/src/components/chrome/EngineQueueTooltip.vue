<!--
  src/components/chrome/EngineQueueTooltip.vue

  Toolbar surface for the SPA's outstanding-query queue. Renders
  as a single badge inside the engine-metrics-bar (sibling to PPS,
  LATENCY, WATCHDOG); hover opens a floating panel listing every
  in-flight KataGo proxy query with kind, SELECTOR model label,
  turn / visit progress, and ETA.

  The component reads from `useQueryTelemetry`'s singleton view.
  Empty queue keeps the badge visible but dimmed; non-empty queue
  brightens it and shows the count.

  Hover behaviour is provided by `useHoverPopover` (extracted on
  2026-05-17 when the third instance — `PboPopover` — triggered
  the composable-extraction threshold flagged in
  `docs/worklog/2026-05-14-popover-hover-finickiness.md`). The
  popover sits flush against the badge (no `margin-top` dead
  zone) so the common case is gap-less; the composable's ~150ms
  close-grace timer handles overshoot.

  Domain band (ADR-0003): truly agnostic. The strings the panel
  renders are about queries, models, turns, and visits — KataGo
  vocabulary the telemetry singleton already speaks. No
  Go-specific affordances.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQueryTelemetry, type InFlightQuery } from '../../composables/useQueryTelemetry';
import { useHoverPopover } from '../../composables/chrome/useHoverPopover';
import { useFixedAnchoredPopover } from '../../composables/chrome/useFixedAnchoredPopover';
import { createTrailingThrottle } from '../../composables/useThrottledSnapshot';
import { QUEUE_TOOLTIP_REDRAW_THROTTLE_MS } from '../../lib/timing';
import type { QueryId } from '../../types';

const { t } = useI18n();
const { inFlight, cancelQuery } = useQueryTelemetry();
const { open, onMouseEnter, onMouseLeave } = useHoverPopover({ devId: 'queue' });

// Clip-ancestor fix (commission lyt-popover-clip-class, ratified
// program row 1937). This popover mounts inside `App.vue`'s
// `.lyt-toolbar-strip` (M2 stage B2b boot-restoration wiring,
// `.claude/dispatch-reports/lyt-boot-restoration.md`: directly at the
// `#leaf-A_engine_queue` slot now — this component no longer mounts as
// ToolbarEngineMetrics's child via the retired ToolbarEngineCluster.vue,
// see `lyt-widget-registry.ts`'s own header), the SAME `overflow-y: auto`
// clipping ancestor `ToolbarSliderPopover.vue`'s D1 fix escaped
// (`.claude/dispatch-reports/lyt-sliders-popover-defects.md`). Not
// visually re-witnessed for THIS component in this commission — see
// `.claude/dispatch-reports/lyt-popover-clip-class.md`'s per-member
// disposition for why (the badge mounts only while
// `useEngineControls().isConnected` is true, which this commission's
// own isolation posture — dead-pinned ports, no live engine — cannot
// provide) — but the ancestor chain and positioning scheme were
// identical to ToolbarSliderPopover's pre-fix shape (`position:
// absolute; top: 100%; left: 0`, same `.lyt-toolbar-strip` ancestor,
// same z-index tier), so it is routed through the same composable as a
// same-class structural fix rather than left unfixed pending a live
// witness that this environment cannot produce. `usePopoverEdgeClamp`
// (horizontal-only, snapshot-once — no scroll/resize tracking, see
// that composable's own "Snapshot semantics" note) no longer applies;
// `useFixedAnchoredPopover` supersedes it here.
const triggerEl = ref<HTMLElement | null>(null);
const popoverEl = ref<HTMLElement | null>(null);
const { style: popoverStyle } = useFixedAnchoredPopover(open, triggerEl, popoverEl, { align: 'left' });

const count = computed(() => inFlight.value.length);

function onCancelClick(queryId: QueryId): void {
  cancelQuery(queryId);
}

function fmtEta(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return t('toolbar.queue.etaUnknown');
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function fmtKind(kind: InFlightQuery['kind']): string {
  // Localised mapping; falls back to the raw kind if a key is
  // missing (defensive — kinds added later that haven't been
  // catalogued in the locale still render rather than blanking).
  const key = `toolbar.queue.kind.${kind}`;
  const translated = t(key);
  return translated === key ? kind : translated;
}

function fmtModel(model: string | null): string {
  return model ?? t('toolbar.queue.modelDefault');
}

function fmtProgress(q: InFlightQuery): string {
  if (q.turnsTotal > 1) {
    return t('toolbar.queue.progressTurns', {
      done:  q.progress.turnsCompleted,
      total: q.turnsTotal,
    });
  }
  // Single-turn queries report ongoing visit count. The visits
  // ceiling is shown as the denominator when known; otherwise
  // just the current count.
  const visits  = q.progress.currentTurnVisits;
  const ceiling = q.visitsPerTurn;
  return ceiling !== null
    ? `${visits.toLocaleString()} / ${ceiling.toLocaleString()}`
    : visits.toLocaleString();
}

// ── Throttled open-list snapshot ──────────────────────────────────────
// The badge `count` is live (it changes only on query add/remove). The
// OPEN list, by contrast, reads each row's progress + ETA — values the
// telemetry singleton churns on EVERY analysis packet — so binding the
// `v-for` straight to `inFlight` redraws the whole table at the packet
// rate (hundreds of redraws across one range query, none of it legible
// at that speed). We snapshot the rows into plain, pre-formatted strings
// on a trailing+leading throttle (QUEUE_TOOLTIP_REDRAW_THROTTLE_MS) so
// the list redraws at most ~4 Hz. Formatting the reactive fields HERE
// and storing plain values is what decouples the template from the
// packet stream — it no longer touches `q.progress` / `q.etaMs`. Same
// shape as the redraw throttles in DistributionChart / HeatmapChart, the
// sibling consumers of this timing catalog.
interface QueueRow {
  queryId:      QueryId;
  kindText:     string;
  label?:       string;
  modelText:    string;
  progressText: string;
  etaText:      string;
  canCancel:    boolean;
}

const displayRows = ref<QueueRow[]>([]);

function rebuildRows(): void {
  displayRows.value = inFlight.value.map((q): QueueRow => ({
    queryId:      q.queryId,
    kindText:     fmtKind(q.kind),
    label:        q.label,
    modelText:    fmtModel(q.model),
    progressText: fmtProgress(q),
    etaText:      fmtEta(q.etaMs),
    canCancel:    q.cancel !== undefined,
  }));
}

// Shared trailing throttle (the subscriber-projection mechanism), but gated:
// a closed popover's list isn't rendered, so don't rebuild when closed —
// schedule only while open. `inFlight` is replaced wholesale per packet, so
// the watch fires per packet; the throttle coalesces to ~4 Hz.
const rowsThrottle = createTrailingThrottle(rebuildRows, QUEUE_TOOLTIP_REDRAW_THROTTLE_MS);
watch(inFlight, () => { if (open.value) rowsThrottle.schedule(); });

// Seed synchronously on open (bypassing the throttle) so the list is fresh
// the instant the popover shows; the default 'pre' flush runs before the
// popover renders, so there's no stale/empty flash.
watch(open, (isOpen) => { if (isOpen) rebuildRows(); });

onUnmounted(rowsThrottle.cancel);
</script>

<template>
  <div
    ref="triggerEl"
    class="metric queue-metric"
    :class="{ 'queue-active': count > 0 }"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <span class="m-lbl">{{ $t('toolbar.metric.queue') }}</span>
    <span class="m-val queue-count">{{ count }}</span>

    <div v-if="open" ref="popoverEl" class="queue-popover" role="tooltip" :style="{ top: popoverStyle.top, left: popoverStyle.left }">
      <div v-if="displayRows.length === 0" class="popover-empty">
        {{ $t('toolbar.queue.empty') }}
      </div>
      <div v-else class="popover-table">
        <div class="popover-header">
          {{ $t('toolbar.queue.header', { n: displayRows.length }) }}
        </div>
        <table>
          <thead>
            <tr>
              <th>{{ $t('toolbar.queue.col.kind') }}</th>
              <th>{{ $t('toolbar.queue.col.model') }}</th>
              <th>{{ $t('toolbar.queue.col.progress') }}</th>
              <th class="eta-col">{{ $t('toolbar.queue.col.eta') }}</th>
              <th class="cancel-col">{{ $t('toolbar.queue.col.cancel') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in displayRows" :key="row.queryId">
              <td>
                <span class="kind-label">{{ row.kindText }}</span>
                <span v-if="row.label" class="kind-suffix">[{{ row.label }}]</span>
              </td>
              <td>{{ row.modelText }}</td>
              <td>{{ row.progressText }}</td>
              <td class="eta-col">{{ row.etaText }}</td>
              <td class="cancel-col">
                <!-- Cancel button shows only when the registrant
                     supplied a `cancel` hook. For probes (which
                     finish quickly and aren't worth cancelling)
                     no hook is registered, so no button renders. -->
                <button
                  v-if="row.canCancel"
                  class="cancel-btn"
                  :title="$t('toolbar.queue.cancel')"
                  :aria-label="$t('toolbar.queue.cancel')"
                  @click="onCancelClick(row.queryId)"
                >✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* W4 item 2 fix: same root cause as ToolbarSliderPopover.vue's own
   "SLIDERS11" defect (see that file's header comment for the full
   diagnosis) — `.metric`'s flex/gap rule lives in
   ToolbarEngineMetrics.vue's SCOPED style and never reaches this
   different SFC despite the shared class name, so QUEUE and its count
   rendered concatenated with no gap. This component now declares its
   OWN layout rather than relying on the borrowed name. */
.queue-metric {
  position: relative;
  cursor: default;
  display: flex;
  align-items: center;
  gap: var(--space-tight);
}
.queue-metric .m-val {
  /* Dim when idle (count = 0); brighten when work is in flight.
     The active class transitions both colour and weight so the
     badge reads as a passive indicator until the engine has
     something to do. Envelope-reserved width (item 2's "envelope-
     reserved cells" requirement) so a growing queue count never
     reflows this badge's neighbours — 3ch covers realistic in-flight
     counts (the proxy's own MAX_SESSIONS-scale queue depth never
     reaches 4 digits per session). */
  display: inline-block;
  min-width: 3ch;
  text-align: right;
  color: var(--text-0);
}
.queue-metric.queue-active .m-val {
  color: var(--accent-primary);
  font-weight: bold;
}

.queue-popover {
  /* Clip-ancestor fix (commission lyt-popover-clip-class): this rule
     was previously anchored `top: 100%; left: 0` under CSS's absolute
     positioning scheme, relative to `.queue-metric`'s own `position:
     relative` box. `position: fixed` (below) escapes `.lyt-toolbar-
     strip`'s `overflow-y: auto` clip the same
     way `ToolbarSliderPopover.vue`'s D1 fix does (see that file's
     header, and `useFixedAnchoredPopover.ts`'s own header, for the
     full diagnosis); `top`/`left` are now script-computed by
     `useFixedAnchoredPopover` (align: 'left', matching the prior
     `left: 0` anchor) and bound via `popoverStyle`. Anchor stays
     flush against the badge (no gap) — the zero-gap layout still
     pairs with the grace-period close timer in <script> to make
     pointer-traverse from badge to popover gap-free in the common
     case while still tolerating overshoot. */
  position: fixed;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  padding: var(--space-tight);
  z-index: var(--z-popover-chrome); /* W4 item 3: was a hardcoded 100 — LOWER than its sibling toolbar popovers' hardcoded 1000, the concrete occlusion bug a commissioner screenshot review caught. Shared token now — see theme.css's own doc comment. */
  white-space: nowrap;
  /* Cap the panel width so a long model name or label doesn't
     stretch it across the entire toolbar. The min ensures the
     header text always fits without wrapping. */
  min-width: 240px;
  max-width: 480px;
  font-family: monospace;
  font-size: var(--text-body);
  color: var(--text-0);
}

.popover-empty {
  color: var(--text-0);
  padding: var(--space-tight);
  font-style: italic;
}

.popover-header {
  color: var(--text-0);
  font-weight: bold;
  padding: var(--space-tight);
  border-bottom: 1px solid var(--border-2);
  margin-bottom: var(--space-tight);
}

table {
  width: 100%;
  border-collapse: collapse;
}
th {
  text-align: left;
  color: var(--text-0);
  font-weight: normal;
  font-size: var(--text-tiny);
  letter-spacing: var(--tracking-default);
  padding: var(--space-tight) var(--space-default) var(--space-tight) 0;
}
td {
  padding: 1px var(--space-default) 1px 0;
  color: var(--text-0);
}
.eta-col {
  text-align: right;
  padding-right: var(--space-default);
}
.kind-label {
  color: var(--text-0);
}
.kind-suffix {
  margin-left: var(--space-tight);
  color: var(--text-0);
}

.cancel-col {
  text-align: right;
  padding: 0;
  width: 1.5em;
}
.cancel-btn {
  background: transparent;
  border: none;
  color: var(--text-0);
  font-family: monospace;
  font-size: var(--text-body);
  cursor: pointer;
  padding: 0 var(--space-tight);
  line-height: 1;
}
.cancel-btn:hover {
  color: var(--state-attention);
}
</style>
