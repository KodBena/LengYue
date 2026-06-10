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
import { useAnalysisPersistence } from '../../composables/analysis/useAnalysisPersistence';
import type { AnalysisBundleStorageError } from '../../services/analysis-bundle';
import AnalysisDashboard from '../charts/AnalysisDashboard.vue';

const { t } = useI18n();
const props = defineProps<{ boardId: BoardId; }>();
const persist = useAnalysisPersistence(() => props.boardId);
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
// (built-in) option in that case. The read is cast-free:
// `available_value_bindings` is declared on the capability mirror
// (`AdaptiveReevaluateAdvertisedMetadata` in `engine/katago/types.ts`)
// and validated once at probe time in
// `version-probe.ts::parseVersionResponse` — a mismatched
// advertisement degrades the capability there instead of reaching
// this computed as a type-level lie.
const availableLearnedBindings = computed(() => {
  const list =
    store.engine.info.capabilities?.adaptive_reevaluate?.available_value_bindings ?? [];
  return list.filter((vb) => vb.startsWith('learned_'));
});

// ── Persistence UI state ──────────────────────────────────────────────────
//
// `summary` is reactive on the service's per-board summaries Map.
// A successful save() / discard() / refreshSummaries() flips this
// computed and the subtitle updates without manual invalidation.
// `saving` is purely local — disables the Save button during the
// PUT round-trip. `lastError` shows the most recent typed error
// inline; cleared on the next attempt. `autoSave` reflects the
// registry toggle; the Save button stays available even when
// auto-save is on (relabelled "Save now" to imply throttle
// bypass), while a small "AUTO" badge advertises the policy in
// the title row. `autoSaveError` surfaces the persistent-error
// pause state owned by useAutoSaveAnalyses via the service's
// reactive per-board slot.
const saving = ref(false);
const lastError = ref<string | null>(null);
const summary = persist.summary;
const autoSave = computed(() => store.profile.settings.engine.katago.analysisAutoSave);
const autoSaveError = persist.autoSaveError;
const autoSaveErrorText = computed(() => {
  const err = autoSaveError.value;
  if (!err) return null;
  return t('analysis.persist.autoSavePaused', { reason: describeError(err) });
});

const summarySubtitle = computed(() => {
  const s = summary.value;
  if (!s) return t('analysis.persist.notSaved');
  // For v2-stored bundles the backend reports the SPA-asserted
  // pre-compression byte size; surface the savings ratio so the
  // user sees the payoff of the projected/quantised scheme. For
  // v1 bundles (null uncompressedByteSize), the basic line still
  // shows just the stored size — the v1 codec has no honest
  // "before" value to compare against from the SPA's POV.
  if (
    typeof s.uncompressedByteSize === 'number' &&
    s.uncompressedByteSize > s.storedByteSize
  ) {
    const savings = Math.round(
      (1 - s.storedByteSize / s.uncompressedByteSize) * 100,
    );
    return t('analysis.persist.savedSummaryWithSavings', {
      count: s.recordCount,
      size: formatBytes(s.storedByteSize),
      uncompressed: formatBytes(s.uncompressedByteSize),
      savings,
    });
  }
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
    await persist.save();
  } catch (err) {
    lastError.value = describeError(err);
  } finally {
    saving.value = false;
  }
}

async function onDiscard() {
  if (!confirm(t('analysis.persist.confirmDiscard'))) return;
  try {
    await persist.discard();
    lastError.value = null;
  } catch (err) {
    lastError.value = describeError(err);
  }
}

function purgeLedger() {
  if (confirm(t('analysis.confirmPurge'))) {
    persist.stopAnalysis();
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

      <div style="display: flex; flex-wrap: wrap; gap: var(--space-default); min-width: 0;">
        <div class="palette-selector">
          <label>{{ $t('analysis.paletteLabel') }}</label>
          <!-- Annotated exemption: settings-editor v-model bound straight
               onto a profile-settings leaf. A template write to PROFILE
               state sits outside ADR-0001's session.ui template-toggle
               sanction — named layering debt (this editor predates the
               writer-enumeration rule), not a sanctioned pattern; the
               settings-editor surfaces are the natural future mutator arc. -->
          <!-- eslint-disable-next-line local/store-write-needs-owner -->
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
          <!-- Annotated exemption: settings-editor v-model on a
               profile-settings leaf (see the palette-selector note above
               for the class; same for the three below). -->
          <!-- eslint-disable-next-line local/store-write-needs-owner -->
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
            <!-- eslint-disable-next-line local/store-write-needs-owner -->
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
            <!-- eslint-disable-next-line local/store-write-needs-owner -->
            <input
              type="number"
              min="0"
              step="100"
              v-model.number="store.profile.settings.engine.katago.adaptiveReevaluate.extraVisits"
              class="dark-input adaptive-input"
            />
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
            <!-- eslint-disable-next-line local/store-write-needs-owner -->
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
            <span v-if="autoSave" class="auto-badge">{{ $t('analysis.persist.autoSaveLabel') }}</span>
            <span class="info-icon" :title="$t('analysis.persist.tooltip')">?</span>
          </span>
          <span class="value-badge">{{ summarySubtitle }}</span>
        </label>
        <div class="persist-btn-row">
          <button class="toolbar-btn-sm" :disabled="saving" @click="onSave">
            {{ saving
              ? $t('analysis.persist.saving')
              : (autoSave ? $t('analysis.persist.saveNow') : $t('analysis.persist.save')) }}
          </button>
          <button v-if="summary" class="toolbar-btn-sm warning-btn" @click="onDiscard">
            {{ $t('analysis.persist.discard') }}
          </button>
        </div>
        <p v-if="autoSaveErrorText" class="hint error-hint">{{ autoSaveErrorText }}</p>
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
/* Flex chain for the parent-relative dashboard height (iter-12).
   AnalysisControls renders settings rows above a chart-container
   that should consume remaining vertical space. The settings rows
   sit at content height; the chart-container is the flex: 1 child
   that absorbs whatever's left under the tab-body's allocation. */
.tab-padding { padding: 0; display: flex; flex-direction: column; flex: 1; min-height: 0; }
/* Iter-14: `flex-wrap: wrap` lets the right-side cluster
   (palette-selector + PURGE button) drop to a second row when the
   header overflows. At 1024×768 the control panel is pinned to
   220px by iter-1's #control-panel min-width; the right-side div
   alone is ~314px wide, so it was overflowing the row by ~143px
   and pushing PURGE entirely off-screen. `row-gap` keeps a
   little vertical breathing room when wrap engages. */
.header-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; margin-bottom: var(--space-default); row-gap: var(--space-default); }
h3 { margin-top: 0; font-size: var(--text-emphasis); color: var(--accent-primary); }
.status-indicator { font-weight: bold; color: var(--text-0); }
.status-indicator.connected { color: var(--state-success); }

.palette-selector { display: flex; align-items: center; gap: var(--space-default); font-size: var(--text-body); color: var(--text-1); text-transform: uppercase; min-width: 0; }
.dark-select { border: 1px solid var(--border-2); color: var(--accent-primary); padding: 2px 6px; border-radius: var(--radius-default); font-size: var(--text-body); outline: none; cursor: pointer; text-transform: uppercase; max-width: 100%; min-width: 0; }

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
/* AUTO badge mirrors the experimental-tag shape but uses the
   accent-primary palette to signal "active policy" rather than
   "danger / caution". Sits inline with the experimental-tag in
   the title row when analysisAutoSave is on. */
.auto-badge { font-size: var(--text-tiny); padding: 0 var(--space-default); border: 1px solid var(--accent-primary); color: var(--accent-primary); border-radius: var(--radius-default); text-transform: uppercase; line-height: 1.4; }
.info-icon { display: inline-block; width: 13px; height: 13px; border-radius: 50%; border: 1px solid var(--text-1); text-align: center; font-size: 9px; line-height: 11px; color: var(--text-1); cursor: help; }
.settings-row { display: flex; flex-direction: column; gap: 3px; }
.label-with-value { display: flex; justify-content: space-between; align-items: center; font-size: var(--text-body); color: var(--text-1); }
.value-badge { padding: 0 var(--space-default); border-radius: var(--radius-default); color: var(--accent-primary); font-family: monospace; }
.range-slider { width: 100%; accent-color: var(--accent-primary); cursor: pointer; }
.hint { font-size: var(--text-body); color: var(--text-0); margin: 0; }
/* Iter-2 audit Finding C: the 200px floor that lived here
   disagreed silently with AnalysisDashboard's prior
   `calc(100vh - 165px)` height. Iter-12 rewires the dashboard's
   height to be parent-relative; this wrapper now claims the
   remaining vertical space inside `.tab-padding`'s flex column,
   passing it through to the dashboard via `height: 100%`. */
.chart-container-outer { margin-top: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; }
</style>

