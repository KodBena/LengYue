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
import { computed, ref } from 'vue';
import { mutateProfile } from '../../../store/profile-owner';
import { WIZARD_PROSE_MEASURE_CH } from '../../../state/layout-model';

type Theme = 'dark' | 'cluster';
const THEME_OPTIONS: readonly Theme[] = ['dark', 'cluster'];

// R7 measure cap — see `WizardStepEngineUri.vue`'s header comment for
// the shared rationale and why a `[data-prose-measure-ch]` attribute
// accompanies the `v-bind` CSS binding below.
const wizardProseMaxWidthCss = computed(() => `${WIZARD_PROSE_MEASURE_CH}ch`);

// Review BLOCKER (swz-setup-wizard-review.md finding 1, resolved per
// ledger row 747): the highlight is WIZARD-LOCAL presentation state,
// not the live store cell — the schema seeds a default theme for
// fresh profiles (the app must always render some theme), so a
// store-derived highlight pre-selects that default the moment the
// step opens, violating the anti-imposition ruling (row 725). Nothing
// highlights until the user clicks; the click writes the real cell
// (one fact, one home holds for the WRITE); skipping leaves the
// seeded default in place unannounced.
const chosenThisSession = ref<Theme | null>(null);

function selectTheme(theme: Theme): void {
  chosenThisSession.value = theme;
  mutateProfile((profile) => {
    profile.settings.appearance.theme = theme;
  });
}
</script>

<template>
  <div class="wizard-step-theme">
    <p class="step-description" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t('wizard.step.theme.description') }}</p>
    <div class="theme-options">
      <button
        v-for="theme in THEME_OPTIONS"
        :key="theme"
        type="button"
        class="theme-card"
        :class="{ 'is-selected': chosenThisSession === theme }"
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
.step-description { color: var(--text-0); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }

.theme-options { display: flex; gap: var(--space-medium); }
.theme-card {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: var(--space-default);
  padding: var(--space-medium); border: 2px solid var(--border-2); border-radius: var(--radius-default);
  background: var(--surface-0); cursor: pointer; font-family: inherit; /* surface-0 per rows 681/742 */
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
