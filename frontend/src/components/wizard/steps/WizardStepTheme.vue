<!--
  src/components/wizard/steps/WizardStepTheme.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Wizard step (a) — THEME. Reads and writes the SAME cell
 * `RegistryEditor.vue`'s Advanced Registry section edits
 * (`profile.settings.appearance.theme`) — ADR-0012, one cell, one
 * home. Commissioner ruling (ledger row 725): the two options are
 * presented side by side with IDENTICAL visual weight and NO
 * preselected favorite — neither card carries an active/highlighted
 * state until the user clicks one, and their DOM order is the
 * registry's own declaration order, not a "recommended first" sort.
 */
import { computed } from 'vue';
import { store } from '../../../store';
import { mutateProfile } from '../../../store/profile-owner';

type Theme = 'dark' | 'cluster';
const THEME_OPTIONS: readonly Theme[] = ['dark', 'cluster'];

const activeTheme = computed<Theme | null>(() => store.profile.settings.appearance.theme);

function selectTheme(theme: Theme): void {
  mutateProfile((profile) => {
    profile.settings.appearance.theme = theme;
  });
}
</script>

<template>
  <div class="wizard-step-theme">
    <p class="step-description">{{ $t('wizard.step.theme.description') }}</p>
    <div class="theme-options">
      <button
        v-for="theme in THEME_OPTIONS"
        :key="theme"
        type="button"
        class="theme-card"
        :class="{ 'is-selected': activeTheme === theme }"
        @click="selectTheme(theme)"
      >
        <span class="theme-swatch" :data-theme-preview="theme"></span>
        <span class="theme-name">{{ $t(`wizard.theme.${theme}`) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.wizard-step-theme { display: flex; flex-direction: column; gap: var(--space-medium); }
.step-description { color: var(--text-1); margin: 0; }

.theme-options { display: flex; gap: var(--space-medium); }
.theme-card {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: var(--space-default);
  padding: var(--space-medium); border: 2px solid var(--border-2); border-radius: var(--radius-default);
  background: var(--surface-1); cursor: pointer; font-family: inherit;
}
.theme-card.is-selected { border-color: var(--accent-primary); }

.theme-swatch {
  width: 100%; height: 64px; border-radius: var(--radius-default); border: 1px solid var(--border-2);
}
/* Neutral, non-branded previews built from each theme's own anchors —
   not the app chrome, so no live [data-theme] re-render is needed to
   preview the OTHER option while one is already active. */
.theme-swatch[data-theme-preview="dark"] { background: linear-gradient(135deg, #000 0%, #1a1a1a 60%, #4aaef0 100%); }
.theme-swatch[data-theme-preview="cluster"] { background: linear-gradient(135deg, #e8e4da 0%, #cfc9ba 60%, #4aaef0 100%); }

.theme-name { color: var(--text-0); font-size: var(--text-emphasis); text-transform: uppercase; }
</style>
