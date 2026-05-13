<!--
  src/components/chrome/EngineQueueTooltip.vue

  Toolbar surface for the SPA's outstanding-query queue. Renders
  as a single badge inside the engine-metrics-bar (sibling to PPS,
  LATENCY, WATCHDOG); hover opens a floating panel listing every
  in-flight KataGo proxy query with kind, SELECTOR model label,
  turn / visit progress, and ETA.

  The component reads from `useQueryTelemetry`'s singleton view —
  no local state beyond the hover-open boolean. Empty queue keeps
  the badge visible but dimmed; non-empty queue brightens it and
  shows the count.

  Domain band (ADR-0003): truly agnostic. The strings the panel
  renders are about queries, models, turns, and visits — KataGo
  vocabulary the telemetry singleton already speaks. No
  Go-specific affordances.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQueryTelemetry, type InFlightQuery } from '../../composables/useQueryTelemetry';

const { t } = useI18n();
const { inFlight, cancelQuery } = useQueryTelemetry();

const open = ref(false);

const count = computed(() => inFlight.value.length);

function onCancelClick(queryId: string): void {
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
</script>

<template>
  <div
    class="metric queue-metric"
    :class="{ 'queue-active': count > 0 }"
    @mouseenter="open = true"
    @mouseleave="open = false"
  >
    <span class="m-lbl">{{ $t('toolbar.metric.queue') }}</span>
    <span class="m-val queue-count">{{ count }}</span>

    <div v-if="open" class="queue-popover" role="tooltip">
      <div v-if="count === 0" class="popover-empty">
        {{ $t('toolbar.queue.empty') }}
      </div>
      <div v-else class="popover-table">
        <div class="popover-header">
          {{ $t('toolbar.queue.header', { n: count }) }}
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
            <tr v-for="q in inFlight" :key="q.queryId">
              <td>
                <span class="kind-label">{{ fmtKind(q.kind) }}</span>
                <span v-if="q.label" class="kind-suffix">[{{ q.label }}]</span>
              </td>
              <td>{{ fmtModel(q.model) }}</td>
              <td>{{ fmtProgress(q) }}</td>
              <td class="eta-col">{{ fmtEta(q.etaMs) }}</td>
              <td class="cancel-col">
                <!-- Cancel button shows only when the registrant
                     supplied a `cancel` hook. For probes (which
                     finish quickly and aren't worth cancelling)
                     no hook is registered, so no button renders. -->
                <button
                  v-if="q.cancel !== undefined"
                  class="cancel-btn"
                  :title="$t('toolbar.queue.cancel')"
                  :aria-label="$t('toolbar.queue.cancel')"
                  @click="onCancelClick(q.queryId)"
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
.queue-metric {
  position: relative;
  cursor: default;
}
.queue-metric .m-val {
  /* Dim when idle (count = 0); brighten when work is in flight.
     The active class transitions both colour and weight so the
     badge reads as a passive indicator until the engine has
     something to do. */
  color: var(--text-2);
  transition: color var(--duration-default);
}
.queue-metric.queue-active .m-val {
  color: var(--accent-primary);
  font-weight: bold;
}

.queue-popover {
  position: absolute;
  /* Anchor below the badge with a small gap; left-align so the
     table reads from the badge's left edge outward. */
  top: calc(100% + var(--space-tight));
  left: 0;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  padding: var(--space-tight);
  z-index: 100;
  white-space: nowrap;
  /* Cap the panel width so a long model name or label doesn't
     stretch it across the entire toolbar. The min ensures the
     header text always fits without wrapping. */
  min-width: 240px;
  max-width: 480px;
  font-family: monospace;
  font-size: var(--text-body);
  color: var(--text-1);
  /* Subtle elevation to lift the panel above the chart background
     it may overlap on small viewports. */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.popover-empty {
  color: var(--text-2);
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
  color: var(--text-2);
  font-weight: normal;
  font-size: var(--text-tiny);
  letter-spacing: var(--tracking-default);
  padding: var(--space-tight) var(--space-default) var(--space-tight) 0;
}
td {
  padding: 1px var(--space-default) 1px 0;
  color: var(--text-1);
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
  color: var(--text-2);
}

.cancel-col {
  text-align: right;
  padding: 0;
  width: 1.5em;
}
.cancel-btn {
  background: transparent;
  border: none;
  color: var(--text-2);
  font-family: monospace;
  font-size: var(--text-body);
  cursor: pointer;
  padding: 0 var(--space-tight);
  line-height: 1;
  transition: color var(--duration-default);
}
.cancel-btn:hover {
  color: var(--state-attention);
}
</style>
