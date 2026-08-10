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
 *
 * Copy refinement (commissioner refinement, ledger rows 1349/1350):
 *   - Advanced now carries an explanation of each of the four seeded
 *     palettes (`PALETTE_DESCRIPTIONS` below), derived from
 *     `store/defaults.ts`'s `delta_fn`/`summary_fn` definitions and
 *     `docs/archive/dispatch/frontend-to-frontend-default-palette-metrics-spec.md`.
 *   - The aggregation control's label was "Combine scores using:",
 *     which the commissioner objected to verbatim ("it suggests free
 *     monoidal compositions rather than summary aggregation"); it now
 *     reads "Summary over interval:", matching `PaletteEditor.vue`'s
 *     own "Summary Function:" vocabulary for the same field.
 *   - A pointer to `PaletteEditor.vue`'s actual home — the "Analysis
 *     Environment" sub-tab of `SettingsTab.vue` — closes the advanced
 *     section for users who want fully custom palettes.
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

// ── ADVANCED: per-palette descriptions (commissioner refinement,
// ledger rows 1349/1350) ──────────────────────────────────────────
//
// Hardcoded to the four seeded ids (`store/defaults.ts`) the same way
// BASIC_OPTIONS above hardcodes 'score'/'quality' — these descriptions
// are honest prose about THOSE FOUR SPECIFIC PALETTES' delta_fn/
// summary_fn (derived from `store/defaults.ts:241-302` and
// `docs/archive/dispatch/frontend-to-frontend-default-palette-metrics-spec.md`),
// not a generic renderer over whatever the user has authored. A
// palette id outside this set (user-added via PaletteEditor, or one
// of the four renamed/deleted) simply has no entry here and renders
// no description — same falls-outside-scope posture BASIC_OPTIONS'
// comment above already documents for a deleted 'score'/'quality'.
type PaletteDescription = { paletteId: string; nameKey: string; descriptionKey: string };
const PALETTE_DESCRIPTIONS: readonly PaletteDescription[] = [
  { paletteId: 'score', nameKey: 'wizard.palette.describe.score.name', descriptionKey: 'wizard.palette.describe.score.body' },
  { paletteId: 'quality', nameKey: 'wizard.palette.describe.quality.name', descriptionKey: 'wizard.palette.describe.quality.body' },
  { paletteId: 'rank', nameKey: 'wizard.palette.describe.rank.name', descriptionKey: 'wizard.palette.describe.rank.body' },
  { paletteId: 'default', nameKey: 'wizard.palette.describe.default.name', descriptionKey: 'wizard.palette.describe.default.body' },
];
// Only describe ids that are actually present in this profile's
// palette list (a deleted seed palette gets no orphaned entry).
const knownPaletteDescriptions = computed(() =>
  PALETTE_DESCRIPTIONS.filter((d) => palettes.value.some((p) => p.id === d.paletteId)),
);

// ── ADVANCED: the FORMAL definition under each description (row 1378) ──
//
// Every palette entry shows both the human description above AND its
// actual formal definition — the live `delta_fn`/`summary_fn` this
// profile's cells actually hold, rendered in the app's code idiom
// (a small monospace line), not a hardcoded/translated string. Reading
// live off `store` (rather than duplicating the expression into i18n
// catalogs) keeps this truthful if the user later hand-edits a
// palette via PaletteEditor — the formal definition shown here is
// always what the cell actually computes, never a stale translated
// snapshot. `symbols` supplies the delta_fn's underlying expression
// body when the palette's `delta_fn` names a known symbol; an
// unrecognised name (hand-authored inline expression) falls back to
// showing the bare name with no body line, rather than fabricating one.
const symbols = computed(() => store.profile.settings.engine.katago.analysis_env.symbols);
type PaletteDefinition = { paletteId: string; deltaFn: string; deltaFnBody: string | undefined; summaryFn: string };
const paletteDefinitions = computed<PaletteDefinition[]>(() =>
  palettes.value
    .filter((p) => PALETTE_DESCRIPTIONS.some((d) => d.paletteId === p.id))
    .map((p) => ({
      paletteId: p.id,
      deltaFn: p.delta_fn,
      deltaFnBody: symbols.value[p.delta_fn],
      summaryFn: p.summary_fn,
    })),
);
function definitionFor(paletteId: string): PaletteDefinition | undefined {
  return paletteDefinitions.value.find((d) => d.paletteId === paletteId);
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

        <div class="palette-table-scroll">
          <table class="palette-table">
            <thead>
              <tr>
                <th scope="col">{{ $t('wizard.palette.table.descriptionHeader') }}</th>
                <th scope="col">{{ $t('wizard.palette.definitionLabel') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in knownPaletteDescriptions" :key="d.paletteId">
                <td>
                  <span class="palette-name">{{ $t(d.nameKey) }}</span>
                  <span class="description-text" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t(d.descriptionKey) }}</span>
                </td>
                <td>
                  <code v-if="definitionFor(d.paletteId)" class="palette-definition">
                    <span class="definition-line">delta_fn: {{ definitionFor(d.paletteId)!.deltaFn }}<template v-if="definitionFor(d.paletteId)!.deltaFnBody"> = {{ definitionFor(d.paletteId)!.deltaFnBody }}</template></span>
                    <span class="definition-line">summary_fn: {{ definitionFor(d.paletteId)!.summaryFn }}</span>
                  </code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="field-hint" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t('wizard.palette.editorPointer') }}</p>
      </div>
    </details>
  </div>
</template>

<style scoped>
.wizard-step-palette {
  display: flex; flex-direction: column; gap: var(--space-medium);
  /* No height budget / overflow here — superseded by the modal shell's
     own scroll contract (ledger rows 1498/1499/1500): SetupWizardModal
     .vue's `.wizard-body` is now the single scroll owner for every
     step's content, with `min-height: 0` so it actually shrinks to
     cede space rather than pushing the step to grow unbounded. This
     step's own `calc(88vh - 156px)` budget was an instance guard for
     one symptom of the same defect (row 1460) and is dead under the
     shell contract — kept alive it would silently duplicate (and could
     drift from) the modal's real scroll boundary. */
}
.step-description { color: var(--text-1); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }
.field-label { color: var(--text-0); font-size: var(--text-emphasis); text-transform: uppercase; }
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

/* Per-palette table (row 1464 amendment): DESCRIPTION | DEFINITION
   columns, one row per seeded palette, replacing the former stacked
   dt/dd + definition-under-description layout. The scroll wrapper is
   the wide-content containment idiom (ADR-0010-adjacent discipline for
   data-dense rows): this table lives INSIDE the step's own vertical
   scroll region (`.wizard-step-palette`'s max-height above), and a
   genuinely unbreakable long definition token scrolls HORIZONTALLY
   within this wrapper alone — it never grows the step (or the modal)
   wider, since `table-layout: fixed` plus each column's own wrap rule
   below is the first line of defense and this wrapper is strictly a
   fallback for whatever wrap can't absorb. */
.palette-table-scroll { overflow-x: auto; max-width: 100%; }
.palette-table {
  width: 100%; min-width: 420px; border-collapse: collapse; table-layout: fixed;
}
.palette-table th, .palette-table td {
  text-align: left; vertical-align: top; padding: var(--space-tight) var(--space-default);
  border-bottom: 1px solid var(--border-2);
}
.palette-table th {
  color: var(--text-0); font-size: var(--text-emphasis); text-transform: uppercase;
}
.palette-table td { color: var(--text-0); font-size: var(--text-emphasis); }
.palette-table td:first-child, .palette-table td:last-child { width: 50%; }
.palette-name { display: block; color: var(--text-0); font-weight: 600; margin-bottom: 2px; }
/* Description prose — same secondary-text idiom as .field-hint
   (WizardStepEngineUri.vue / WizardStepFinish.vue), wraps within its
   cell instead of relying on a max-width measure cap (the cell IS the
   measure here). */
.description-text { display: block; overflow-wrap: break-word; max-width: v-bind(wizardProseMaxWidthCss); }

/* Formal definition (row 1378) — the actual delta_fn/summary_fn this
   profile's cell holds, rendered in the app's code idiom: monospace,
   muted, distinct from the prose description in the first column. Wraps
   within its own cell (`overflow-wrap: anywhere` — code tokens have no
   natural break points a plain word-wrap would find) rather than
   pushing the table wider; `.palette-table-scroll` above is the
   fallback for whatever this can't absorb. */
.palette-definition {
  display: flex; flex-direction: column; gap: 2px;
  font-family: var(--font-mono, monospace); font-size: var(--text-tiny);
  color: var(--text-0); overflow-wrap: anywhere;
}
.definition-line { display: block; }
.field-hint { color: var(--text-0); font-size: var(--text-emphasis); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }
</style>
