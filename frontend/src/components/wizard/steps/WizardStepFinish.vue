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
 */
import { computed } from 'vue';
import { store } from '../../../store';
import { WIZARD_PROSE_MEASURE_CH } from '../../../state/layout-model';

// R7 measure cap — see `WizardStepEngineUri.vue`'s header comment for
// the shared rationale and why a `[data-prose-measure-ch]` attribute
// accompanies the `v-bind` CSS binding below.
const wizardProseMaxWidthCss = computed(() => `${WIZARD_PROSE_MEASURE_CH}ch`);

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
      <dt>{{ $t('wizard.step.theme.title') }}</dt>
      <dd>{{ $t(`wizard.theme.${themeLabel}`) }}</dd>

      <dt>{{ $t('wizard.step.engineUri.title') }}</dt>
      <dd class="mono">{{ engineUri }}</dd>

      <dt>{{ $t('wizard.step.palette.title') }}</dt>
      <dd>{{ paletteName }}</dd>

      <dt>{{ $t('wizard.step.pvAnimation.title') }}</dt>
      <dd>{{ $t(`wizard.pvAnimation.mode.${pvMode}`) }}</dd>
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
.finish-hint { color: var(--text-2); font-size: var(--text-emphasis); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }
</style>
