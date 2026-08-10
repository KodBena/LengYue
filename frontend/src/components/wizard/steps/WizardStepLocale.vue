<!--
  src/components/wizard/steps/WizardStepLocale.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Wizard step (new, FIRST) — LANGUAGE. Commission wiki2-wizard-i18n:
 * "The setup wizard needs an i18n option (should be the first step)".
 *
 * Reuses `useLocale` verbatim — the SAME composable the toolbar
 * `LocalePicker.vue` reads/writes (`profile.settings.appearance.locale`,
 * via the profile-owner-routed `setLocale`). Selecting an option here
 * writes straight through that one existing cell, so
 * `useAppBootstrap.ts`'s `immediate: true` watch — already mounted
 * app-wide well before the first-run wizard can open — mirrors it
 * onto `i18n.global.locale` the same tick. The rest of the wizard
 * (its own chrome: title, step-indicator labels, buttons; every later
 * step's copy) re-renders in the chosen language immediately, with no
 * wizard-local plumbing of its own — this step is a thin view over
 * the app's one locale mechanism, same as every other wizard step is
 * a thin view over its own store cell (ADR-0012).
 *
 * UNLIKE `WizardStepTheme.vue`'s anti-imposition design (no card
 * pre-highlighted until clicked, commission row 725): a UI has no
 * neutral "no language" state — the wizard is already rendering in
 * SOME locale the instant it opens (the seeded default, or
 * browser-detection at the schema 23→24 migration boundary — see
 * `i18n/locales.ts`). So the currently active locale
 * (`useLocale().locale`) IS shown pre-selected here, mirroring
 * `LocalePicker.vue`'s own `.locale-option.active` idiom rather than
 * the theme step's blank-until-clicked one.
 *
 * PACKAGING SEAM (commission wiki2-wizard-i18n; LC_* env
 * initialization for tauri/docker is a SEPARATE, packaging-side
 * dispatch — explicitly out of this file's scope, not narrowed
 * further here): this step never reads an env var and never
 * special-cases a deployment target. It reads only the existing
 * `profile.settings.appearance.locale` cell, through `useLocale()`,
 * exactly like every other consumer of that cell. A future
 * packaging-side pre-seed (writing a LC_*-derived locale into that
 * same cell, or into the fresh-profile default it seeds from, before
 * this wizard's first render) makes this step's pre-selected default
 * reflect it automatically — no rework here, because the step never
 * held a second copy of "which locale" to begin with.
 */
import { computed } from 'vue';
import { useLocale } from '../../../composables/chrome/useLocale';
import { WIZARD_PROSE_MEASURE_CH } from '../../../state/layout-model';
import type { SupportedLocale } from '../../../i18n/locales';

const { locale, supportedLocales, displayName, flag, setLocale } = useLocale();

// R7 measure cap — see `WizardStepEngineUri.vue`'s header comment for
// the shared rationale and why a `[data-prose-measure-ch]` attribute
// accompanies the `v-bind` CSS binding below.
const wizardProseMaxWidthCss = computed(() => `${WIZARD_PROSE_MEASURE_CH}ch`);

function pick(loc: SupportedLocale): void {
  setLocale(loc);
}
</script>

<template>
  <div class="wizard-step-locale">
    <p class="step-description" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t('wizard.step.locale.description') }}</p>
    <div class="locale-options" role="listbox" :aria-label="$t('localePicker.tooltip')">
      <button
        v-for="loc in supportedLocales"
        :key="loc"
        type="button"
        class="locale-card"
        :class="{ 'is-selected': loc === locale }"
        role="option"
        :aria-selected="loc === locale"
        @click="pick(loc)"
      >
        <span class="locale-flag" aria-hidden="true">{{ flag(loc) }}</span>
        <span class="locale-name">{{ displayName(loc) }}</span>
        <span v-if="loc === locale" class="check" aria-hidden="true">✓</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.wizard-step-locale { display: flex; flex-direction: column; gap: var(--space-medium); }
.step-description { color: var(--text-0); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }

.locale-options { display: flex; flex-direction: column; gap: var(--space-default); }
.locale-card {
  display: flex; align-items: center; gap: var(--space-default); min-height: 24px;
  padding: var(--space-default) var(--space-medium); border: 2px solid var(--border-2); border-radius: var(--radius-default);
  background: var(--surface-0); cursor: pointer; font-family: inherit; /* surface-0 per rows 681/742 */
}
.locale-card.is-selected { border-color: var(--accent-primary); }

.locale-flag { font-size: var(--text-heading); line-height: 1; }
.locale-name { flex: 1; text-align: left; color: var(--text-0); font-size: var(--text-emphasis); }
.check { color: var(--accent-primary); font-size: var(--text-emphasis); }
</style>
