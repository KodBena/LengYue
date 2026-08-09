<!--
  src/components/wizard/steps/WizardStepPalette.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Wizard step (c) — DEFAULT PALETTE. BASIC/ADVANCED guide (commission
 * rows 1202/1203) over the SAME cells `AnalysisControls.vue` /
 * `PaletteEditor.vue` read and write — ADR-0012, one cell, one home:
 *
 *   - BASIC (default view): two radio-style cards mapping directly to
 *     `analysis_env.activePaletteId` — 'score' (traditional/severe)
 *     preselected, matching `store/defaults.ts`'s own default; 'quality'
 *     (fuzzy/lenient). The commissioner's copy ("[basic] traditional/
 *     severe (I prefer score based view)" / "[basic] fuzzy/lenient (I
 *     prefer statistically informed accuracy measurements)") is kept
 *     verbatim; the "[basic]" prefix is dropped from the rendered label
 *     — the Basic/Advanced section structure itself already conveys
 *     "this is the basic option", so the literal tag would be redundant
 *     chrome rather than information (declared choice, no antecedent
 *     ledger row — a wizard-copy-rendering call the task explicitly
 *     left to this session's judgment).
 *   - ADVANCED (native `<details>` disclosure — the same
 *     `.settings-section` idiom `RegistryEditor.vue`'s branch nodes use;
 *     ADR-0019 genre convention, not a bespoke toggle): the full palette
 *     select (unchanged from the pre-guide step) plus an aggregation
 *     control over the SELECTED palette's `summary_fn`, written through
 *     the identical field-keyed mutation shape `PaletteEditor.vue`'s
 *     `updatePaletteField` uses (find-by-id, assign field, commit) —
 *     just routed through `mutateProfile` instead of PaletteEditor's
 *     clone-and-emit, since the wizard already owns that seam for
 *     `activePaletteId`.
 *
 * Basic and advanced are two VIEWS of the same two cells: picking a
 * basic card changes `activePaletteId`, so re-opening Advanced shows
 * that palette selected in the dropdown; the aggregation control always
 * reflects the CURRENTLY selected palette's live `summary_fn`, in
 * either view.
 */
import { computed } from 'vue';
import { store } from '../../../store';
import { mutateProfile } from '../../../store/profile-owner';
import { WIZARD_PROSE_MEASURE_CH } from '../../../state/layout-model';
import type { AnalysisPalette } from '../../../types/analysis-env';

// R7 measure cap — see `WizardStepEngineUri.vue`'s header comment for
// the shared rationale and why a `[data-prose-measure-ch]` attribute
// accompanies the `v-bind` CSS binding below.
const wizardProseMaxWidthCss = computed(() => `${WIZARD_PROSE_MEASURE_CH}ch`);

const palettes = computed(() => store.profile.settings.engine.katago.analysis_env.palettes);

const activePaletteId = computed({
  get: () => store.profile.settings.engine.katago.analysis_env.activePaletteId,
  set: (v: string) => mutateProfile((profile) => {
    profile.settings.engine.katago.analysis_env.activePaletteId = v;
  }),
});

// ── BASIC: the two commissioner-specified cards ──────────────────────
//
// Hardcoded ids per the commission text verbatim ('score' / 'quality')
// — these are `store/defaults.ts`'s seeded palette ids, not derived
// from the registry, since the basic guide's whole point is naming
// THESE two specific palettes in plain language. A profile whose user
// deleted one of these two palettes via PaletteEditor falls outside
// the commission's stated scope (not addressed here — the card's click
// handler still writes the id; the surrounding behaviour for a
// nonexistent activePaletteId is the same as the pre-existing
// full-select step, unchanged by this guide).
type BasicOption = { paletteId: 'score' | 'quality'; labelKey: string };
const BASIC_OPTIONS: readonly BasicOption[] = [
  { paletteId: 'score', labelKey: 'wizard.palette.basic.traditional.label' },
  { paletteId: 'quality', labelKey: 'wizard.palette.basic.fuzzy.label' },
];

function selectBasic(paletteId: string): void {
  activePaletteId.value = paletteId;
}

// ── ADVANCED: aggregation control over the selected palette's summary_fn ──

const KNOWN_AGGREGATIONS = ['mean_summary', 'min_summary', 'median_summary'] as const;
type KnownAggregation = typeof KNOWN_AGGREGATIONS[number];
type AggregationValue = KnownAggregation | 'custom';

const selectedPalette = computed<AnalysisPalette | undefined>(() =>
  palettes.value.find((p) => p.id === activePaletteId.value),
);

// 'custom' is a DERIVED display state, never written to the cell — it
// surfaces whenever the selected palette's live summary_fn isn't one
// of the three known symbols (a user-authored body via PaletteEditor).
// Per the commission: this state must not be stomped by re-render: it
// falls out of `selectedPalette`'s live value on every read, and only
// an explicit pick of mean/min/median (via `setAggregation` below)
// ever writes the cell — simply displaying 'custom' never does.
const aggregationValue = computed<AggregationValue>(() => {
  const fn = selectedPalette.value?.summary_fn;
  return (KNOWN_AGGREGATIONS as readonly string[]).includes(fn ?? '')
    ? (fn as KnownAggregation)
    : 'custom';
});

const isCustomAggregation = computed(() => aggregationValue.value === 'custom');

function setAggregation(next: KnownAggregation): void {
  const paletteId = activePaletteId.value;
  mutateProfile((profile) => {
    const p = profile.settings.engine.katago.analysis_env.palettes.find((p) => p.id === paletteId);
    if (p) p.summary_fn = next;
  });
}
</script>

<template>
  <div class="wizard-step-palette">
    <p class="step-description" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t('wizard.step.palette.description') }}</p>

    <div class="basic-options" role="radiogroup" :aria-label="$t('wizard.palette.basicGroupAriaLabel')">
      <button
        v-for="opt in BASIC_OPTIONS"
        :key="opt.paletteId"
        type="button"
        class="basic-card"
        :class="{ 'is-selected': activePaletteId === opt.paletteId }"
        role="radio"
        :aria-checked="activePaletteId === opt.paletteId"
        @click="selectBasic(opt.paletteId)"
      >
        <span class="basic-card-label">{{ $t(opt.labelKey) }}</span>
      </button>
    </div>

    <details class="settings-section advanced-section">
      <summary class="branch-header"><h3>{{ $t('wizard.palette.advancedToggle') }}</h3></summary>
      <div class="advanced-content">
        <label class="field-label" for="wizard-palette-select">{{ $t('analysis.paletteLabel') }}</label>
        <select id="wizard-palette-select" v-model="activePaletteId" class="dark-select">
          <option v-for="p in palettes" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>

        <label class="field-label" for="wizard-palette-aggregation">{{ $t('wizard.palette.aggregation.label') }}</label>
        <select
          id="wizard-palette-aggregation"
          class="dark-select"
          :value="aggregationValue"
          @change="(e: any) => setAggregation(e.target.value)"
        >
          <option value="mean_summary">{{ $t('wizard.palette.aggregation.mean') }}</option>
          <option value="min_summary">{{ $t('wizard.palette.aggregation.min') }}</option>
          <option value="median_summary">{{ $t('wizard.palette.aggregation.median') }}</option>
          <option v-if="isCustomAggregation" value="custom" disabled>{{ $t('wizard.palette.aggregation.custom') }}</option>
        </select>
      </div>
    </details>
  </div>
</template>

<style scoped>
.wizard-step-palette { display: flex; flex-direction: column; gap: var(--space-medium); }
.step-description { color: var(--text-1); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }
.field-label { color: var(--text-2); font-size: var(--text-emphasis); text-transform: uppercase; }
.dark-select {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); font-size: var(--text-emphasis); font-family: inherit;
  border-radius: var(--radius-default); outline: none;
}

/* Basic cards — same visual idiom as WizardStepTheme.vue's .theme-card
   (flex row, equal weight, border highlight on selection). */
.basic-options { display: flex; gap: var(--space-medium); }
.basic-card {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: var(--space-medium); border: 2px solid var(--border-2); border-radius: var(--radius-default);
  background: var(--surface-0); cursor: pointer; font-family: inherit; text-align: center;
}
.basic-card.is-selected { border-color: var(--accent-primary); }
.basic-card-label { color: var(--text-0); font-size: var(--text-emphasis); }

/* Advanced disclosure — shared-chrome.css's .settings-section idiom
   (RegistryEditor.vue's branch nodes); no bespoke toggle button. */
.advanced-content { display: flex; flex-direction: column; gap: var(--space-default); padding-top: var(--space-default); }
</style>
