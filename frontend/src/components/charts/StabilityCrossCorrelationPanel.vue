<!--
  src/components/charts/StabilityCrossCorrelationPanel.vue
  Pairwise Pearson correlation matrices over the two stability
  axes — extractors and metrics. Renders two small tables:

  - Extractor × extractor, with one metric held fixed: "do these
    extractors flag the same turns as stable across this game?"
  - Metric × metric, with one extractor held fixed: "do these
    metrics agree on which turns are stable?"

  Self-contained: the panel carries its own "fixed-axis"
  dropdowns and isn't coupled to `StabilityPanel`'s selections.
  Practitioners can explore extractor relationships under one
  metric while the time-series chart shows another, or sync the
  two by hand when comparing apples to apples.

  Collapsed by default — the exception to the dashboard's
  "expanded-by-default" convention because the cross-correlation
  read is exploratory rather than primary. The header stays
  visible; the matrices materialise only on expansion (v-if, not
  v-show, so the composable doesn't fire when collapsed).

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  useStabilityCrossCorrelations,
  type CorrelationMatrix,
} from '../../composables/analysis/useStabilityCrossCorrelations';
import { STABILITY_EXTRACTOR_LABELS } from '../../engine/analysis/stability-extractors';
import { STABILITY_METRIC_LABELS } from '../../lib/stability-trajectory';
import type { NodeId } from '../../types';

const props = defineProps<{
  variationPath: NodeId[];
}>();

const expanded = ref(false);

// Fixed-axis selections — defaults match StabilityPanel's so the
// two views start coherent, but they're independently mutable.
const fixedExtractor = ref<string>('top1_move');
const fixedMetric = ref<string>('anchored_at_v_term');

const extractorChoices = computed<{ id: string; label: string }[]>(() =>
  Array.from(STABILITY_EXTRACTOR_LABELS, ([id, label]) => ({ id, label })),
);
const metricChoices = computed<{ id: string; label: string }[]>(() =>
  Array.from(STABILITY_METRIC_LABELS, ([id, label]) => ({ id, label })),
);

const variationPathRef = computed(() => props.variationPath);
const correlations = useStabilityCrossCorrelations(
  variationPathRef,
  fixedExtractor,
  fixedMetric,
);

/**
 * Cell tint for a correlation value. Sign drives hue (blue=positive,
 * red=negative); magnitude drives alpha (zero correlation → fully
 * transparent, |r|=1 → fully saturated). Returns an rgba() that
 * lays over the panel's --surface-0 base. NaN cells get no tint.
 */
function cellStyle(r: number): Record<string, string> {
  if (!Number.isFinite(r)) return { background: 'transparent' };
  const alpha = Math.min(1, Math.abs(r)) * 0.55;
  if (r >= 0) {
    return { background: `rgba(60, 130, 220, ${alpha})` };
  }
  return { background: `rgba(220, 70, 70, ${alpha})` };
}

function formatCell(r: number): string {
  if (!Number.isFinite(r)) return '—';
  // Two decimals is the standard correlation-matrix resolution;
  // a leading sign for negative values keeps the column widths
  // aligned with positives.
  const s = r.toFixed(2);
  return r >= 0 ? `+${s}` : s;
}

function cellTitle(r: number, n: number, rowLabel: string, colLabel: string): string {
  if (!Number.isFinite(r)) {
    return `${rowLabel} × ${colLabel}: undefined (insufficient data, n=${n})`;
  }
  return `${rowLabel} × ${colLabel}: r = ${r.toFixed(3)}, n = ${n}`;
}

/**
 * Truncate a label to fit the header cells without overflowing.
 * The full label still appears in the title attribute on hover.
 */
function shortId(id: string): string {
  // The registry keys are already short — return as-is. Wrapper
  // exists so a future change to longer keys can centralise the
  // truncation logic without touching the template.
  return id;
}

function matrixCaption(kind: 'extractor' | 'metric'): string {
  if (kind === 'extractor') {
    const m = STABILITY_METRIC_LABELS.get(fixedMetric.value) ?? fixedMetric.value;
    return `Extractor × Extractor (metric held fixed: ${m})`;
  }
  const e = STABILITY_EXTRACTOR_LABELS.get(fixedExtractor.value) ?? fixedExtractor.value;
  return `Metric × Metric (extractor held fixed: ${e})`;
}

function diagonalN(matrix: CorrelationMatrix, idx: number): number {
  // Diagonal entry's n is the number of finite samples in that
  // row's series — the per-row confidence diagnostic.
  return matrix.matrix[idx]?.[idx]?.n ?? 0;
}
</script>

<template>
  <div class="section">
    <div class="header" @click="expanded = !expanded">
      <span class="title">Cross-correlations</span>
      <span class="chevron">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div class="content" v-if="expanded">
      <div class="controls">
        <label>
          <span class="control-label">Metric for extractor matrix</span>
          <select class="select" v-model="fixedMetric">
            <option v-for="c in metricChoices" :key="c.id" :value="c.id">{{ c.label }}</option>
          </select>
        </label>
        <label>
          <span class="control-label">Extractor for metric matrix</span>
          <select class="select" v-model="fixedExtractor">
            <option v-for="c in extractorChoices" :key="c.id" :value="c.id">{{ c.label }}</option>
          </select>
        </label>
      </div>

      <!-- Extractor × Extractor -->
      <div class="matrix-block">
        <div class="caption">{{ matrixCaption('extractor') }}</div>
        <table class="corr">
          <thead>
            <tr>
              <th class="corner"></th>
              <th
                v-for="(id, j) in correlations.extractor.ids"
                :key="`eh-${j}`"
                :title="correlations.extractor.labels[j]"
              >{{ shortId(id) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(id, i) in correlations.extractor.ids" :key="`er-${i}`">
              <th
                :title="`${correlations.extractor.labels[i]} (n = ${diagonalN(correlations.extractor, i)})`"
              >{{ shortId(id) }}</th>
              <td
                v-for="(cell, j) in correlations.extractor.matrix[i]"
                :key="`ec-${i}-${j}`"
                :style="cellStyle(cell.value)"
                :title="cellTitle(cell.value, cell.n, correlations.extractor.labels[i], correlations.extractor.labels[j])"
              >{{ formatCell(cell.value) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Metric × Metric -->
      <div class="matrix-block">
        <div class="caption">{{ matrixCaption('metric') }}</div>
        <table class="corr">
          <thead>
            <tr>
              <th class="corner"></th>
              <th
                v-for="(id, j) in correlations.metric.ids"
                :key="`mh-${j}`"
                :title="correlations.metric.labels[j]"
              >{{ shortId(id) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(id, i) in correlations.metric.ids" :key="`mr-${i}`">
              <th
                :title="`${correlations.metric.labels[i]} (n = ${diagonalN(correlations.metric, i)})`"
              >{{ shortId(id) }}</th>
              <td
                v-for="(cell, j) in correlations.metric.matrix[i]"
                :key="`mc-${i}-${j}`"
                :style="cellStyle(cell.value)"
                :title="cellTitle(cell.value, cell.n, correlations.metric.labels[i], correlations.metric.labels[j])"
              >{{ formatCell(cell.value) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="legend">
        Pearson r over the per-turn stability series. Blue tint = positive,
        red = negative; intensity scales with |r|. Hover any cell for the
        exact r and n.
      </div>
    </div>
  </div>
</template>

<style scoped>
.section {
  background: var(--surface-2);
  border: 1px solid var(--surface-3);
  border-radius: var(--radius-default);
  overflow: hidden;
  margin-bottom: var(--space-medium);
}
.header {
  padding: var(--space-default) var(--space-medium);
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-size: var(--text-body);
  font-weight: bold;
  color: var(--text-0);
  text-transform: uppercase;
  background: var(--surface-3);
  letter-spacing: var(--tracking-default);
}
.header:hover { color: var(--text-1); }
.title { color: var(--text-0); }
.chevron { font-size: var(--text-tiny); color: var(--border-3); }
.content {
  border-top: 1px solid var(--surface-3);
  background: var(--surface-0);
  padding: var(--space-medium);
}
.controls {
  display: flex;
  gap: var(--space-medium);
  margin-bottom: var(--space-medium);
  flex-wrap: wrap;
}
.controls label {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 200px;
  gap: 4px;
}
.control-label {
  font-size: var(--text-tiny);
  color: var(--text-1);
  text-transform: uppercase;
  letter-spacing: var(--tracking-default);
}
.select {
  background: var(--surface-0);
  color: var(--text-1);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  padding: 4px 8px;
  font-size: var(--text-small);
  cursor: pointer;
}
.select:hover { border-color: var(--accent-primary); }
.select:focus { outline: none; border-color: var(--accent-primary); }
.matrix-block { margin-bottom: var(--space-medium); }
.caption {
  font-size: var(--text-tiny);
  color: var(--text-1);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: var(--tracking-default);
}
.corr {
  border-collapse: collapse;
  font-size: var(--text-tiny);
  color: var(--text-1);
}
.corr th, .corr td {
  border: 1px solid var(--border-2);
  padding: 4px 6px;
  text-align: center;
  white-space: nowrap;
  font-family: 'Courier New', monospace;
}
.corr th {
  background: var(--surface-2);
  font-weight: normal;
}
.corr th.corner {
  background: transparent;
  border: none;
}
.corr td {
  min-width: 56px;
}
.legend {
  font-size: var(--text-tiny);
  color: var(--text-1);
  margin-top: var(--space-default);
  line-height: 1.4;
}
</style>
