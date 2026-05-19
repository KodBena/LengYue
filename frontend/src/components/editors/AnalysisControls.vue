<script setup lang="ts">
/**
 * src/components/editors/AnalysisControls.vue
 * Per-board analysis control surface — engine status, palette
 * picker, ledger purge, server-side bundle persistence
 * (Save / Discard with reactive summary subtitle), move-filter
 * threshold, and the AnalysisDashboard chart cluster.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BoardId } from '../../types';
import { store } from '../../store';
import { ledger } from '../../services/analysis-ledger';
import { analysisService } from '../../services/analysis-service';
import { analysisPersistenceService } from '../../services/analysis-persistence-service';
import type { AnalysisBundleStorageError } from '../../services/analysis-bundle';
import AnalysisDashboard from '../charts/AnalysisDashboard.vue';

const { t } = useI18n();
const props = defineProps<{ boardId: BoardId; }>();
const palettes = computed(() => store.profile.settings.engine.katago.analysis_env.palettes);

// Adaptive-reevaluate UI is gated on the proxy actually advertising
// the capability. When the proxy doesn't advertise (legacy proxies
// or PROXY_ADVERTISE_CAPABILITIES=false), no UI is shown — the
// SPA's wire opt-in falls back to the proxy's legacy auto-engage
// path which is the right semantic for non-advertising proxies.
// The registry values stay populated regardless (so a user who
// configures here, disconnects, and reconnects to an advertising
// proxy gets their config back).
const adaptiveAdvertised = computed(() => {
  const caps = store.engine.info.capabilities;
  return caps !== null && 'adaptive_reevaluate' in caps;
});

// v1.0.26 — list of `learned_*` value-binding versions advertised by
// the proxy. Empty array means the proxy doesn't host any learned
// predictor (either lightgbm not installed, no bundled models, or
// pre-v1.0.26 proxy); the dropdown only shows the "default"
// (built-in) option in that case.
const availableLearnedBindings = computed(() => {
  const caps = store.engine.info.capabilities;
  if (caps === null) return [] as readonly string[];
  const meta = caps.adaptive_reevaluate;
  if (!meta || typeof meta !== 'object') return [] as readonly string[];
  const list = (meta as { available_value_bindings?: unknown }).available_value_bindings;
  if (!Array.isArray(list)) return [] as readonly string[];
  return list.filter((v): v is string => typeof v === 'string' && v.startsWith('learned_'));
});

// ── Persistence UI state ──────────────────────────────────────────────────
//
// `summary` is reactive on the service's per-board summaries Map.
// A successful save() / discard() / refreshSummaries() flips this
// computed and the subtitle updates without manual invalidation.
// `saving` is purely local — disables the Save button during the
// PUT round-trip. `lastError` shows the most recent typed error
// inline; cleared on the next attempt.
const saving = ref(false);
const lastError = ref<string | null>(null);
const summary = computed(() => analysisPersistenceService.summaryFor(props.boardId));

const summarySubtitle = computed(() => {
  const s = summary.value;
  if (!s) return t('analysis.persist.notSaved');
  return t('analysis.persist.savedSummary', {
    count: s.recordCount,
    size: formatBytes(s.storedByteSize),
  });
});

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function isStorageError(err: unknown): err is AnalysisBundleStorageError {
  return typeof err === 'object' && err !== null && 'kind' in err && 'status' in err;
}

function describeError(err: unknown): string {
  if (isStorageError(err)) {
    if (err.kind === 'bundle_too_large') {
      return t('analysis.persist.errorTooLarge', {
        size: formatBytes(err.requestBytes),
        cap: formatBytes(err.capBytes),
      });
    }
    if (err.kind === 'user_quota_exceeded') {
      return t('analysis.persist.errorQuota', {
        current: formatBytes(err.currentBytes),
        quota: formatBytes(err.quotaBytes),
      });
    }
    if (err.kind === 'unknown_scheme') {
      return t('analysis.persist.errorUnknownScheme');
    }
  }
  return t('analysis.persist.errorGeneric');
}

async function onSave() {
  saving.value = true;
  lastError.value = null;
  try {
    await analysisPersistenceService.save(props.boardId);
  } catch (err) {
    lastError.value = describeError(err);
  } finally {
    saving.value = false;
  }
}

async function onDiscard() {
  if (!confirm(t('analysis.persist.confirmDiscard'))) return;
  try {
    await analysisPersistenceService.discard(props.boardId);
    lastError.value = null;
  } catch (err) {
    lastError.value = describeError(err);
  }
}

function purgeLedger() {
  if (confirm(t('analysis.confirmPurge'))) {
    analysisService.stopBoardAnalysis(props.boardId);
    ledger.purgeBoard(props.boardId);
  }
}
</script>

<template>
  <div class="tab-padding">
    <div class="header-row">
      <p>
        {{ $t('analysis.engineLabel') }}
        <span class="status-indicator" :class="{ 'connected': store.engine.status === 'connected' }">
          {{ store.engine.status === 'connected' ? $t('analysis.engineConnected') : $t('analysis.engineOffline') }}
        </span>
      </p>

      <div style="display: flex; gap: var(--space-default);">
        <div class="palette-selector">
          <label>{{ $t('analysis.paletteLabel') }}</label>
          <select v-model="store.profile.settings.engine.katago.analysis_env.activePaletteId" class="dark-select">
            <option v-for="p in palettes" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <button class="toolbar-btn-sm warning-btn" @click="purgeLedger" :title="$t('analysis.purgeTooltip')">{{ $t('analysis.purge') }}</button>
      </div>
    </div>

    <!-- Move-filter slider relocated to the cross-domain knob
         registry editor (knob-registry Phase 3b + 6 sweep). The
         eventual home is a toolbar-hover quick-access surface; this
         stub points users at the current location in the interim. -->
    <div class="analysis-config-box move-filter-box">
      <div class="settings-row">
        <label class="label-with-value">
          <span>{{ $t('analysis.moveFilter') }}</span>
          <span class="value-badge">{{ (store.session.ui.moveFilterThreshold * 100).toFixed(0) }}%</span>
        </label>
        <p class="hint">{{ $t('analysis.moveFilter.movedNotice') }}</p>
      </div>
    </div>

    <div v-if="adaptiveAdvertised" class="analysis-config-box adaptive-box">
      <div class="settings-row">
        <label class="checkbox-row">
          <input
            type="checkbox"
            v-model="store.profile.settings.engine.katago.adaptiveReevaluate.enabled"
          />
          <span>{{ $t('analysis.adaptive.enabled') }}</span>
          <span class="info-icon" :title="$t('analysis.adaptive.tooltip')">?</span>
        </label>
        <div
          v-if="store.profile.settings.engine.katago.adaptiveReevaluate.enabled"
          class="adaptive-fields"
        >
          <label class="label-with-value adaptive-field-row">
            <span>{{ $t('analysis.adaptive.worstQuantile') }}</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              v-model.number="store.profile.settings.engine.katago.adaptiveReevaluate.worstQuantile"
              class="dark-input adaptive-input"
            />
          </label>
          <label class="label-with-value adaptive-field-row">
            <span>{{ $t('analysis.adaptive.extraVisits') }}</span>
            <input
              type="number"
              min="0"
              step="100"
              v-model.number="store.profile.settings.engine.katago.adaptiveReevaluate.extraVisits"
              class="dark-input adaptive-input"
            />
          </label>
          <label class="label-with-value adaptive-field-row">
            <span>{{ $t('analysis.adaptive.maxRounds') }}</span>
            <input
              type="number"
              min="1"
              step="1"
              v-model.number="store.profile.settings.engine.katago.adaptiveReevaluate.maxRounds"
              class="dark-input adaptive-input"
            />
            <span class="info-icon" :title="$t('analysis.adaptive.maxRoundsTooltip')">?</span>
          </label>
          <!--
            v1.0.26 — Phase 3.5 learned value-function selector.
            Dropdown shows "default" (built-in worst-quantile, the
            v1.0.24 behaviour) plus any `learned_*` versions the
            proxy advertises in
            `adaptive_reevaluate.available_value_bindings`. The
            [experimental] tag is shown alongside learned options
            until diverse-corpus retraining lands.
          -->
          <label
            v-if="availableLearnedBindings.length > 0"
            class="label-with-value adaptive-field-row"
          >
            <span>{{ $t('analysis.adaptive.valueBinding.label') }}</span>
            <select
              v-model="store.profile.settings.engine.katago.adaptiveReevaluate.valueBinding"
              class="dark-input adaptive-input"
            >
              <option value="">
                {{ $t('analysis.adaptive.valueBinding.default') }}
              </option>
              <option
                v-for="vb in availableLearnedBindings"
                :key="vb"
                :value="vb"
              >
                {{ $t('analysis.adaptive.valueBinding.learnedLabel', { version: vb }) }}
              </option>
            </select>
            <span
              v-if="store.profile.settings.engine.katago.adaptiveReevaluate.valueBinding.startsWith('learned_')"
              class="info-icon"
              :title="$t('analysis.adaptive.valueBinding.experimentalTooltip')"
            >?</span>
          </label>
          <p class="hint">{{ $t('analysis.adaptive.hint') }}</p>
        </div>
      </div>
    </div>

    <div v-if="store.profile.settings.engine.katago.analysisStorageEnabled" class="analysis-config-box persist-box">
      <div class="settings-row">
        <label class="label-with-value">
          <span class="persist-title-row">
            {{ $t('analysis.persist.title') }}
            <span class="experimental-tag">{{ $t('analysis.persist.experimentalTag') }}</span>
            <span class="info-icon" :title="$t('analysis.persist.tooltip')">?</span>
          </span>
          <span class="value-badge">{{ summarySubtitle }}</span>
        </label>
        <div class="persist-btn-row">
          <button class="toolbar-btn-sm" :disabled="saving" @click="onSave">
            {{ saving ? $t('analysis.persist.saving') : $t('analysis.persist.save') }}
          </button>
          <button v-if="summary" class="toolbar-btn-sm warning-btn" @click="onDiscard">
            {{ $t('analysis.persist.discard') }}
          </button>
        </div>
        <p v-if="lastError" class="hint error-hint">{{ lastError }}</p>
      </div>
    </div>

    <div class="chart-container-outer">
      <AnalysisDashboard 
        :key="boardId"
        :boardId="boardId"
      />
    </div>
  </div>
</template>

<style scoped>
.tab-padding { padding: 0; }
.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-default); }
h3 { margin-top: 0; font-size: var(--text-emphasis); color: var(--accent-primary); }
.status-indicator { font-weight: bold; color: var(--text-0); }
.status-indicator.connected { color: var(--state-success); }

.palette-selector { display: flex; align-items: center; gap: var(--space-default); font-size: var(--text-body); color: var(--text-1); text-transform: uppercase; }
.dark-select { border: 1px solid var(--border-2); color: var(--accent-primary); padding: 2px 6px; border-radius: var(--radius-default); font-size: var(--text-body); outline: none; cursor: pointer; text-transform: uppercase; }

/* theme-exception: .warning-btn uses muted-state-error variants
   (#5a1a1a border, #3a1a1a hover bg) — same pattern as
   PaletteEditor's .del-btn. */
.warning-btn { color: var(--state-error) !important; border-color: #5a1a1a !important; }

.toolbar-btn-sm { border: 1px solid var(--border-3); color: var(--text-1); padding: 2px 6px; font-size: var(--text-body); cursor: pointer; border-radius: var(--radius-default); text-transform: uppercase; }

/* ... remaining styles ... */
.analysis-config-box { margin-top: 0; background: var(--surface-2); padding: 0 var(--space-medium); border-radius: var(--radius-default); border: 1px solid var(--surface-3); }
.move-filter-box { border-bottom: 2px solid var(--border-2); margin-bottom: var(--space-medium); }
.persist-box { padding: var(--space-default) var(--space-medium); margin-bottom: var(--space-medium); border-bottom: 2px solid var(--border-2); }
.adaptive-box { padding: var(--space-default) var(--space-medium); margin-bottom: var(--space-medium); border-bottom: 2px solid var(--border-2); }
.checkbox-row { display: flex; align-items: center; gap: var(--space-default); font-size: var(--text-body); color: var(--text-1); cursor: pointer; }
.checkbox-row input[type="checkbox"] { accent-color: var(--accent-primary); cursor: pointer; }
.adaptive-fields { margin-top: var(--space-default); display: flex; flex-direction: column; gap: var(--space-default); }
.adaptive-field-row { padding-left: var(--space-loose); }
/* magic-literal: 100px adaptive-input width — narrow numeric input
   for compact value entry (worst_quantile is sub-1, extra_visits is
   in hundreds). Same width chosen for both so the two rows align
   visually. */
.adaptive-input { width: 100px; padding: 1px 4px; font-family: monospace; font-size: var(--text-body); background: var(--surface-0); border: 1px solid var(--border-2); color: var(--accent-primary); border-radius: var(--radius-default); outline: none; }
.adaptive-input:focus { border-color: var(--accent-primary); }
.persist-btn-row { display: flex; gap: var(--space-default); margin-top: var(--space-default); }
.error-hint { color: var(--state-error); }
.persist-title-row { display: inline-flex; align-items: center; gap: var(--space-default); }
.experimental-tag { font-size: var(--text-tiny); padding: 0 var(--space-default); border: 1px solid var(--state-warning); color: var(--state-warning); border-radius: var(--radius-default); text-transform: uppercase; line-height: 1.4; }
.info-icon { display: inline-block; width: 13px; height: 13px; border-radius: 50%; border: 1px solid var(--text-1); text-align: center; font-size: 9px; line-height: 11px; color: var(--text-1); cursor: help; }
.settings-row { display: flex; flex-direction: column; gap: 3px; }
.label-with-value { display: flex; justify-content: space-between; align-items: center; font-size: var(--text-body); color: var(--text-1); }
.value-badge { padding: 0 var(--space-default); border-radius: var(--radius-default); color: var(--accent-primary); font-family: monospace; }
.range-slider { width: 100%; accent-color: var(--accent-primary); cursor: pointer; }
.hint { font-size: var(--text-body); color: var(--text-0); margin: 0; }
.chart-container-outer { margin-top: 0; min-height: 200px; }
</style>

