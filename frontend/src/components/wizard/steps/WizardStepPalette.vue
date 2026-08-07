<!--
  src/components/wizard/steps/WizardStepPalette.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Wizard step (c) — DEFAULT PALETTE. Same cell and same simple
 * `<select>` presentation as `AnalysisControls.vue`'s palette
 * selector (`profile.settings.engine.katago.analysis_env
 * .activePaletteId` / `.palettes`) — ADR-0012, one cell, one home.
 */
import { computed } from 'vue';
import { store } from '../../../store';
import { mutateProfile } from '../../../store/profile-owner';

const palettes = computed(() => store.profile.settings.engine.katago.analysis_env.palettes);

const activePaletteId = computed({
  get: () => store.profile.settings.engine.katago.analysis_env.activePaletteId,
  set: (v: string) => mutateProfile((profile) => {
    profile.settings.engine.katago.analysis_env.activePaletteId = v;
  }),
});
</script>

<template>
  <div class="wizard-step-palette">
    <p class="step-description">{{ $t('wizard.step.palette.description') }}</p>
    <label class="field-label" for="wizard-palette-select">{{ $t('analysis.paletteLabel') }}</label>
    <select id="wizard-palette-select" v-model="activePaletteId" class="dark-select">
      <option v-for="p in palettes" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
  </div>
</template>

<style scoped>
.wizard-step-palette { display: flex; flex-direction: column; gap: var(--space-default); }
.step-description { color: var(--text-1); margin: 0 0 var(--space-default) 0; }
.field-label { color: var(--text-2); font-size: var(--text-emphasis); text-transform: uppercase; }
.dark-select {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); font-size: var(--text-emphasis); font-family: inherit;
  border-radius: var(--radius-default); outline: none;
}
</style>
