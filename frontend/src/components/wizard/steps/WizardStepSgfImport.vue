<!--
  src/components/wizard/steps/WizardStepSgfImport.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Wizard step (g) — OPTIONAL SGF IMPORT. Reuses the existing Library
 * import affordance verbatim (`LibraryImportPanel.vue` +
 * `useLibraryImport.ts`, the same drag-drop / pick-files /
 * pick-directory surface `LibraryTab.vue` mounts, wired to the same
 * `/library/games/import` backend call) — no second import pipeline.
 * Entirely optional: Skip/Next both simply move on, same as every
 * other step (see `useSetupWizard.ts`'s header for why skip and next
 * are behaviourally identical here).
 */
import { computed } from 'vue';
import LibraryImportPanel from '../../library/LibraryImportPanel.vue';
import { useLibraryImport } from '../../../composables/library/useLibraryImport';
import { WIZARD_PROSE_MEASURE_CH } from '../../../state/layout-model';

const imp = useLibraryImport();

// R7 measure cap — see `WizardStepEngineUri.vue`'s header comment for
// the shared rationale and why a `[data-prose-measure-ch]` attribute
// accompanies the `v-bind` CSS binding below.
const wizardProseMaxWidthCss = computed(() => `${WIZARD_PROSE_MEASURE_CH}ch`);
</script>

<template>
  <div class="wizard-step-sgf-import">
    <p class="step-description" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t('wizard.step.sgfImport.description') }}</p>
    <LibraryImportPanel :imp="imp" />
  </div>
</template>

<style scoped>
.wizard-step-sgf-import { display: flex; flex-direction: column; gap: var(--space-default); }
.step-description { color: var(--text-1); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }
</style>
