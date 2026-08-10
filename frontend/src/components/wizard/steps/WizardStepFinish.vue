<!--
  src/components/wizard/steps/WizardStepFinish.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Wizard step "finish" — a read-only summary of the cells the wizard
 * touched. Every value here is read straight from the real store
 * cell (ADR-0012: no shadow snapshot) — Settings shows the exact
 * same values immediately after the wizard closes.
 *
 * SKIPPED-VS-SET (audit M18, ledger rows 1390/1397): a row's value is
 * shown either way (the cell always holds SOME value — every step
 * ships a sensible default per `useSetupWizard.ts`'s header), but a
 * row whose step is absent from `visitedSteps` (passed in by
 * `SetupWizardModal.vue`, sourced from `useSetupWizard`'s one home
 * for visit-tracking) is marked as still on its seeded default rather
 * than something the user actually chose — the heading no longer
 * claims blanket credit for values the user never saw.
 *
 * SGF-IMPORT ROW (commission rows 1404/1407/1464/1468): unlike every
 * other row here, this one is deliberately NOT read from a real store
 * cell — an SGF import has no store cell, and per the commission it
 * must not exist in the backend yet either; the plan is still staged,
 * not committed (`useSetupWizard.ts`'s `finish()` is what commits it,
 * which fires AFTER this recap is read, when the user clicks
 * Finish). Stating "N files ready to import" here — never "imported"
 * — is what keeps this step's description ("Everything is saved…")
 * honest for the one step whose effect genuinely hasn't happened yet.
 * `stagedImportCount` is passed in by `SetupWizardModal.vue`, sourced
 * from `wizard.importStaging.plan.value.length`.
 */
import { computed } from 'vue';
import { store } from '../../../store';
import { WIZARD_PROSE_MEASURE_CH } from '../../../state/layout-model';
import type { WizardStepId } from '../../../composables/useSetupWizard';

const props = defineProps<{
  visitedSteps: ReadonlySet<WizardStepId>;
  stagedImportCount: number;
}>();

// R7 measure cap — see `WizardStepEngineUri.vue`'s header comment for
// the shared rationale and why a `[data-prose-measure-ch]` attribute
// accompanies the `v-bind` CSS binding below.
const wizardProseMaxWidthCss = computed(() => `${WIZARD_PROSE_MEASURE_CH}ch`);

function wasVisited(id: WizardStepId): boolean {
  return props.visitedSteps.has(id);
}

const themeLabel = computed(() => store.profile.settings.appearance.theme);
const engineUri = computed(() => store.profile.settings.engine.katago.url);
const paletteName = computed(() => {
  const env = store.profile.settings.engine.katago.analysis_env;
  return env.palettes.find(p => p.id === env.activePaletteId)?.name ?? env.activePaletteId;
});
const pvMode = computed(() => store.session.ui.pvAnimation.mode);
</script>

<template>
  <div class="wizard-step-finish">
    <p class="step-description" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t('wizard.step.finish.description') }}</p>
    <dl class="summary-list">
      <dt :class="{ 'is-default': !wasVisited('theme') }">{{ $t('wizard.step.theme.title') }}</dt>
      <dd :class="{ 'is-default': !wasVisited('theme') }">
        {{ $t(`wizard.theme.${themeLabel}`) }}
        <span v-if="!wasVisited('theme')" class="default-badge">{{ $t('wizard.finish.defaultBadge') }}</span>
      </dd>

      <dt :class="{ 'is-default': !wasVisited('engineUri') }">{{ $t('wizard.step.engineUri.title') }}</dt>
      <dd class="mono" :class="{ 'is-default': !wasVisited('engineUri') }">
        {{ engineUri }}
        <span v-if="!wasVisited('engineUri')" class="default-badge">{{ $t('wizard.finish.defaultBadge') }}</span>
      </dd>

      <dt :class="{ 'is-default': !wasVisited('palette') }">{{ $t('wizard.step.palette.title') }}</dt>
      <dd :class="{ 'is-default': !wasVisited('palette') }">
        {{ paletteName }}
        <span v-if="!wasVisited('palette')" class="default-badge">{{ $t('wizard.finish.defaultBadge') }}</span>
      </dd>

      <dt :class="{ 'is-default': !wasVisited('demoBoard') }">{{ $t('wizard.pvAnimation.modeLabel') }}</dt>
      <dd :class="{ 'is-default': !wasVisited('demoBoard') }">
        {{ $t(`wizard.pvAnimation.mode.${pvMode}`) }}
        <span v-if="!wasVisited('demoBoard')" class="default-badge">{{ $t('wizard.finish.defaultBadge') }}</span>
      </dd>

      <dt :class="{ 'is-default': !wasVisited('sgfImport') }">{{ $t('wizard.step.sgfImport.title') }}</dt>
      <dd :class="{ 'is-default': !wasVisited('sgfImport') }">
        {{ $t('wizard.finish.sgfImport.staged', stagedImportCount) }}
        <span v-if="!wasVisited('sgfImport')" class="default-badge">{{ $t('wizard.finish.defaultBadge') }}</span>
      </dd>
    </dl>
    <p class="finish-hint" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t('wizard.finish.hint') }}</p>
  </div>
</template>

<style scoped>
.wizard-step-finish { display: flex; flex-direction: column; gap: var(--space-default); }
.step-description { color: var(--text-1); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }
.summary-list { display: grid; grid-template-columns: auto 1fr; gap: var(--space-tight) var(--space-medium); margin: 0; }
.summary-list dt { color: var(--text-2); font-size: var(--text-emphasis); text-transform: uppercase; }
.summary-list dd { color: var(--text-0); font-size: var(--text-emphasis); margin: 0; }
.summary-list dd.mono { font-family: monospace; }
.summary-list dt.is-default,
.summary-list dd.is-default { color: var(--text-2); font-style: italic; }
.default-badge {
  font-size: var(--text-tiny); color: var(--text-2); font-style: normal; font-weight: normal;
  text-transform: uppercase; border: 1px solid var(--border-3); border-radius: var(--radius-default);
  padding: 0 var(--space-tight); margin-left: var(--space-tight);
}
.finish-hint { color: var(--text-2); font-size: var(--text-emphasis); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }
</style>
