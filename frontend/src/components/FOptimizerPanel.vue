<!--
  src/components/FOptimizerPanel.vue

  Self-contained panel for running the F-optimizer and managing the
  per-(model, cadence-bucket) cache of results. Reads the current
  SELECTOR model and KataGo cadence from the store; consumers can drop
  this anywhere in the chrome and it picks up the right context
  automatically.

  Three sub-surfaces:
    1. **Status row** — current model + cadence-bucket + effective F
       (with source: cache or fallback) + the "Optimize" button.
    2. **Live progress** — when a run is in flight, streaming
       algorithm log + abort button.
    3. **Cached entries table** — every (model, bucket) entry the
       cache holds, with per-row "Forget" and a global "Forget all".

  The cache value, when present, is consulted directly by
  `analysis-service.ts` (see the `effectiveFirstReportS` import there),
  so applying an optimization result is just "land the cache entry"
  — no slider mutation required. The slider in the registry editor
  remains the fallback for cells without a cache entry.

  Domain band (ADR-0003): KataGo-coupled (B3). The vocabulary —
  models, cadences, first-report — is the KataGo wire surface.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../store';
import { useFOptimizer } from '../composables/useFOptimizer';
import {
  cadenceBucketMs,
  effectiveFirstReportS,
  listEntries,
  type FOptimizerCacheEntry,
} from '../services/optimize-f-cache';

const opt = useFOptimizer();

const currentModel = computed<string | null>(() => store.engine.selectedModel);
const currentCadenceS = computed<number>(
  () => store.profile.settings.engine.katago.reportDuringSearchEvery,
);
const currentBucketMs = computed<number>(() =>
  cadenceBucketMs(currentCadenceS.value),
);
const sliderFs = computed<number>(
  () => store.profile.settings.engine.katago.firstReportDuringSearchAfter,
);
const cachedFsForCurrent = computed<number | null>(() =>
  effectiveFirstReportS(currentModel.value, currentCadenceS.value),
);
// Reactive recommendation: re-runs whenever the cache map mutates
// (we touch it via `opt.cachedEntries.value` inside the closure) or
// the current model changes.
const recommendedCadenceForCurrent = computed<number | null>(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  opt.cachedEntries.value; // dependency trigger
  return opt.recommendedCadence(currentModel.value);
});
const recommendedCadenceMatchesCurrent = computed<boolean>(() => {
  const rec = recommendedCadenceForCurrent.value;
  if (rec === null) return false;
  return cadenceBucketMs(rec) === currentBucketMs.value;
});
const effectiveFsForDisplay = computed<number | null>(() => {
  if (cachedFsForCurrent.value !== null) return cachedFsForCurrent.value;
  return sliderFs.value;
});
const effectiveSource = computed<'cache' | 'slider' | 'none'>(() => {
  if (currentModel.value === null) return 'none';
  if (cachedFsForCurrent.value !== null) return 'cache';
  return 'slider';
});
// Re-read the entries list on each cache mutation; the readonly ref
// from the service updates the references, so `listEntries()` returns
// a fresh snapshot each access. Wrapping in `computed` is the natural
// reactive bridge.
const allEntries = computed<readonly FOptimizerCacheEntry[]>(() => {
  // touch the reactive map so this computed re-runs on mutation
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  opt.cachedEntries.value;
  return listEntries();
});

async function handleOptimize(): Promise<void> {
  const model = currentModel.value;
  if (!model) return;
  await opt.run(model, currentCadenceS.value);
}

function handleAbort(): void {
  opt.abort();
}

function handleForget(entry: FOptimizerCacheEntry): void {
  // Bucket key is `${model}|${bucket}`; convert bucket back to a
  // seconds value within the bucket so `forget` re-derives the same
  // key. The midpoint of the bucket (bucket + 25ms) is comfortably
  // inside the bucket regardless of bucket width.
  const cadenceS = (entry.cadenceBucketMs + 25) / 1000;
  opt.forget(entry.model, cadenceS);
}

function fmtMs(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '—';
  return `${v.toFixed(1)} ms`;
}
function fmtFs(v: number | null): string {
  if (v === null) return '—';
  return `${(v * 1000).toFixed(1)} ms`;
}
function fmtSavings(v: number): string {
  if (Number.isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(0)} ms`;
}
function fmtTime(epoch: number): string {
  const d = new Date(epoch);
  return d.toLocaleString();
}
</script>

<template>
  <section class="f-optimizer-panel">
    <h2>{{ $t('fOptimizer.heading') }}</h2>

    <!-- ─── Status row ─────────────────────────────────────────────── -->
    <div class="status-row">
      <dl class="status-grid">
        <dt>{{ $t('fOptimizer.label.model') }}</dt>
        <dd>{{ currentModel ?? $t('fOptimizer.value.noModel') }}</dd>
        <dt>{{ $t('fOptimizer.label.cadence') }}</dt>
        <dd>
          {{ (currentCadenceS * 1000).toFixed(0) }} ms
          <span class="dim">{{ $t('fOptimizer.label.bucketRange', { low: currentBucketMs, high: currentBucketMs + 49 }) }}</span>
        </dd>
        <dt>{{ $t('fOptimizer.label.effectiveF') }}</dt>
        <dd>
          {{ fmtFs(effectiveFsForDisplay) }}
          <span
            v-if="effectiveSource !== 'none'"
            :class="['source-tag', `source-${effectiveSource}`]"
          >
            {{
              effectiveSource === 'cache'
                ? $t('fOptimizer.tag.cached')
                : $t('fOptimizer.tag.sliderFallback')
            }}
          </span>
        </dd>
      </dl>
      <button
        type="button"
        class="optimize-button"
        :disabled="!currentModel || opt.isRunning.value"
        @click="handleOptimize"
      >
        {{ opt.isRunning.value ? $t('fOptimizer.button.optimizing') : $t('fOptimizer.button.optimize') }}
      </button>
    </div>
    <p v-if="!currentModel" class="hint">{{ $t('fOptimizer.hint.selectModelFirst') }}</p>

    <!-- ─── Recommended cadence ────────────────────────────────────── -->
    <div
      v-if="recommendedCadenceForCurrent !== null && !recommendedCadenceMatchesCurrent"
      class="recommendation-row"
    >
      <span>
        {{
          $t('fOptimizer.recommendation.cadence', {
            model: currentModel,
            cadence: (recommendedCadenceForCurrent * 1000).toFixed(0),
          })
        }}
      </span>
      <button
        type="button"
        class="apply-button"
        @click="opt.applyCadence(recommendedCadenceForCurrent!)"
      >
        {{ $t('fOptimizer.button.applyCadence') }}
      </button>
    </div>

    <!-- ─── Live progress ──────────────────────────────────────────── -->
    <div v-if="opt.isRunning.value || opt.status.value.kind === 'done' || opt.status.value.kind === 'error' || opt.status.value.kind === 'aborted'" class="progress-row">
      <div class="progress-header">
        <span v-if="opt.status.value.kind === 'running'">
          {{ $t('fOptimizer.status.running', { model: opt.status.value.model, cadence: (opt.status.value.cadenceS * 1000).toFixed(0) }) }}
        </span>
        <span v-else-if="opt.status.value.kind === 'done' && opt.status.value.result.bestFS !== null">
          {{ $t('fOptimizer.status.foundF', {
            f: (opt.status.value.result.bestFS * 1000).toFixed(1),
            savings: fmtSavings(opt.status.value.result.savingsMs ?? Number.NaN),
          }) }}
        </span>
        <span v-else-if="opt.status.value.kind === 'done'">
          {{ $t('fOptimizer.status.noUsefulF', { note: opt.status.value.result.note }) }}
        </span>
        <span v-else-if="opt.status.value.kind === 'error'" class="error">
          {{ $t('fOptimizer.status.error', { message: opt.status.value.message }) }}
        </span>
        <span v-else-if="opt.status.value.kind === 'aborted'">{{ $t('fOptimizer.status.aborted') }}</span>
        <button
          v-if="opt.isRunning.value"
          type="button"
          class="abort-button"
          @click="handleAbort"
        >
          {{ $t('fOptimizer.button.abort') }}
        </button>
      </div>
      <details class="progress-details" :open="opt.isRunning.value">
        <summary>{{ $t('fOptimizer.label.algorithmLog', { count: opt.progress.value.length }) }}</summary>
        <pre class="progress-log">{{ opt.progress.value.join('\n') }}</pre>
      </details>
    </div>

    <!-- ─── Cached entries ─────────────────────────────────────────── -->
    <div class="cache-section">
      <div class="cache-header">
        <h3>{{ $t('fOptimizer.heading.cachedEntries', { count: allEntries.length }) }}</h3>
        <button
          v-if="allEntries.length > 0"
          type="button"
          class="forget-all-button"
          @click="opt.forgetAll()"
        >
          {{ $t('fOptimizer.button.forgetAll') }}
        </button>
      </div>
      <p class="hint">{{ $t('fOptimizer.hint.cacheScope') }}</p>
      <table v-if="allEntries.length > 0" class="cache-table">
        <thead>
          <tr>
            <th>{{ $t('fOptimizer.table.header.model') }}</th>
            <th>{{ $t('fOptimizer.table.header.bucket') }}</th>
            <th>{{ $t('fOptimizer.table.header.fStar') }}</th>
            <th>{{ $t('fOptimizer.table.header.expectedDt') }}</th>
            <th>{{ $t('fOptimizer.table.header.savings') }}</th>
            <th>{{ $t('fOptimizer.table.header.recorded') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in allEntries"
            :key="`${entry.model}|${entry.cadenceBucketMs}`"
            :class="{
              'is-current':
                entry.model === currentModel &&
                entry.cadenceBucketMs === currentBucketMs,
            }"
          >
            <td><code>{{ entry.model }}</code></td>
            <td>{{ entry.cadenceBucketMs }}–{{ entry.cadenceBucketMs + 49 }} ms</td>
            <td>{{ fmtFs(entry.fS) }}</td>
            <td>{{ fmtMs(entry.expectedDtMs) }}</td>
            <td>{{ fmtSavings(entry.savingsMs) }}</td>
            <td class="dim">{{ fmtTime(entry.recordedAt) }}</td>
            <td>
              <button
                type="button"
                class="forget-button"
                @click="handleForget(entry)"
              >
                {{ $t('fOptimizer.button.forget') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="dim">{{ $t('fOptimizer.empty.noCached') }}</p>
    </div>
  </section>
</template>

<style scoped>
.f-optimizer-panel {
  display: flex;
  flex-direction: column;
  gap: 1em;
  padding: 1em;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fafafa;
  color: #222;
  font-size: 0.92em;
}
.f-optimizer-panel h2 {
  font-size: 1.1em;
  margin: 0 0 0.2em;
}
.f-optimizer-panel h3 {
  font-size: 1em;
  margin: 0;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 1em;
  flex-wrap: wrap;
}
.status-grid {
  display: grid;
  grid-template-columns: auto auto;
  column-gap: 0.6em;
  row-gap: 0.2em;
  margin: 0;
  flex: 1 1 auto;
}
.status-grid dt {
  font-weight: 600;
  color: #555;
}
.status-grid dd {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.source-tag {
  font-size: 0.85em;
  padding: 1px 6px;
  border-radius: 8px;
  margin-left: 0.4em;
  font-family: inherit;
}
.source-cache {
  background: #c2e7c2;
  color: #1d5320;
}
.source-slider {
  background: #fde2b0;
  color: #6c4408;
}
.source-none {
  background: #eee;
  color: #888;
}

.optimize-button,
.abort-button,
.forget-button,
.forget-all-button {
  font-family: inherit;
  font-size: 0.95em;
  padding: 0.4em 0.9em;
  border: 1px solid #888;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
}
.optimize-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.optimize-button:hover:not(:disabled),
.abort-button:hover,
.forget-button:hover,
.forget-all-button:hover {
  background: #f0f0f0;
}
.abort-button {
  background: #fee;
  border-color: #c44;
  color: #842;
}

.progress-row {
  padding: 0.6em 0.8em;
  border: 1px solid #ddd;
  border-radius: 3px;
  background: #fff;
}
.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.progress-details {
  margin-top: 0.6em;
}
.progress-details summary {
  cursor: pointer;
  font-size: 0.85em;
  color: #555;
}
.progress-log {
  margin: 0.4em 0 0;
  padding: 0.5em;
  max-height: 320px;
  overflow-y: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78em;
  background: #f4f4f4;
  border-radius: 2px;
  white-space: pre;
}

.cache-section {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.cache-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cache-table {
  border-collapse: collapse;
  width: 100%;
  background: #fff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85em;
}
.cache-table th,
.cache-table td {
  border: 1px solid #e0e0e0;
  padding: 0.3em 0.6em;
  text-align: right;
}
.cache-table th:first-child,
.cache-table td:first-child {
  text-align: left;
}
.cache-table th {
  background: #f0f0f0;
  font-weight: 600;
}
.cache-table tr.is-current td {
  background: #f0f8ec;
  font-weight: 600;
}

.recommendation-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8em;
  padding: 0.4em 0.8em;
  background: #e8f0fe;
  border: 1px solid #aac;
  border-radius: 3px;
  font-size: 0.92em;
}
.apply-button {
  font-family: inherit;
  font-size: 0.95em;
  padding: 0.3em 0.8em;
  border: 1px solid #557;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
}
.apply-button:hover {
  background: #f0f0f0;
}

.hint {
  margin: 0;
  font-size: 0.85em;
  color: #666;
}
.dim {
  color: #888;
}
.error {
  color: #c44;
}
</style>
