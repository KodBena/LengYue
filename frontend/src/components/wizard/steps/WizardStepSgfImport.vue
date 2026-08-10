<!--
  src/components/wizard/steps/WizardStepSgfImport.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Wizard step (g) — OPTIONAL SGF IMPORT.
 *
 * PURE-STAGING core (commission rows 1404/1407/1464/1468): this step
 * used to reuse `LibraryImportPanel.vue` + `useLibraryImport.ts`
 * verbatim, which uploads to the backend the instant a file is
 * picked/dropped — the commissioner imported a game mid-wizard and it
 * "destructively updated the DB immediately." That path stays exactly
 * as-is for the Library tab's own import UI (`LibraryTab.vue` still
 * mounts `LibraryImportPanel.vue` + `useLibraryImport.ts` unchanged);
 * this step instead drives `wizard.importStaging`
 * (`useWizardImportStaging.ts`), a distinct composable owned by
 * `useSetupWizard.ts` for the wizard session's lifetime, whose
 * `pickFiles`/`pickDirectory`/`dropItems` PARSE files into an
 * in-memory `StagedImportFile[]` plan and touch neither the store nor
 * `libraryService`. The plan only ever reaches the backend via
 * `useSetupWizard.ts`'s `finish()` (the last step's Next/Finish
 * button) — dismissing the wizard via backdrop/×/Escape calls
 * `cancel()` instead, which discards the plan, so this step has zero
 * externally-visible effect unless the whole wizard is genuinely
 * finished. See that composable's header for the full rationale.
 *
 * This is therefore its own self-contained staging UI (idle / reading
 * / staged / errored), not `LibraryImportPanel.vue` reused: that
 * component's states/copy ("Imported N new games") describe a
 * completed upload, which would misrepresent a merely-staged plan —
 * exactly the kind of factually-wrong recap the commission called
 * out. Visual language (drop zone, buttons, tokens) intentionally
 * mirrors `LibraryImportPanel.vue`'s so the two surfaces still read
 * as the same affordance.
 */
import { computed } from 'vue';
import type { WizardImportStaging } from '../../../composables/library/useWizardImportStaging';
import { WIZARD_PROSE_MEASURE_CH } from '../../../state/layout-model';

const props = defineProps<{
  staging: WizardImportStaging;
}>();

const wizardProseMaxWidthCss = computed(() => `${WIZARD_PROSE_MEASURE_CH}ch`);

const stagedCount = computed(() => props.staging.plan.value.length);

function onDrop(ev: DragEvent): void {
  ev.preventDefault();
  if (ev.dataTransfer?.items) {
    void props.staging.dropItems(ev.dataTransfer.items);
  }
}
function onDragOver(ev: DragEvent): void {
  ev.preventDefault();
}
</script>

<template>
  <div class="wizard-step-sgf-import">
    <p class="step-description" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t('wizard.step.sgfImport.description') }}</p>

    <div
      class="staging-panel"
      :class="{ 'is-active': staging.phase.value !== 'idle' }"
      @drop="onDrop"
      @dragover="onDragOver"
    >
      <div class="staging-hint-row">
        <p class="import-hint">{{ $t('wizard.sgfImport.dropHint') }}</p>
        <div class="import-buttons">
          <button class="import-btn" type="button" @click="staging.pickFiles">
            {{ $t('wizard.sgfImport.pickFiles') }}
          </button>
          <button class="import-btn" type="button" @click="staging.pickDirectory">
            {{ $t('wizard.sgfImport.pickDirectory') }}
          </button>
        </div>
      </div>

      <p v-if="staging.phase.value === 'reading'" class="reading-status">
        {{ $t('wizard.sgfImport.reading') }}
      </p>

      <div v-if="staging.phase.value === 'errored'" class="error-row">
        <p class="err" role="alert">{{ $t('wizard.sgfImport.error', { message: staging.errorMessage.value ?? '' }) }}</p>
        <button class="import-btn" type="button" @click="staging.clear">
          {{ $t('wizard.sgfImport.dismiss') }}
        </button>
      </div>

      <div v-if="stagedCount > 0" class="staged-summary">
        <p class="staged-count">{{ $t('wizard.sgfImport.staged', stagedCount) }}</p>
        <ul class="staged-list">
          <li v-for="f in staging.plan.value" :key="f.fileName + f.input.sourcePath" class="staged-item">
            {{ f.fileName }}
          </li>
        </ul>
        <button class="import-btn" type="button" @click="staging.clear">
          {{ $t('wizard.sgfImport.clear') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wizard-step-sgf-import { display: flex; flex-direction: column; gap: var(--space-default); }
.step-description { color: var(--text-1); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }

.staging-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-default);
  padding: var(--space-medium);
  border: 2px dashed var(--border-1);
  border-radius: var(--radius-default);
  background: var(--surface-0);
}
.staging-panel.is-active {
  border-style: solid;
  border-color: var(--accent-primary);
}
.staging-panel:hover:not(.is-active) {
  border-color: var(--accent-primary);
}

.staging-hint-row { display: flex; flex-direction: column; gap: var(--space-default); }
.import-hint {
  margin: 0;
  font-size: var(--text-body);
  color: var(--text-2);
}
.import-buttons {
  display: flex;
  gap: var(--space-default);
}
.import-btn {
  padding: var(--space-tight) var(--space-default);
  font-size: var(--text-body);
  background: var(--surface-0);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-default);
  color: var(--text-1);
  cursor: pointer;
  align-self: flex-start;
}
.import-btn:hover {
  border-color: var(--accent-primary);
}

.reading-status { color: var(--text-2); font-size: var(--text-body); margin: 0; }
.error-row { display: flex; flex-direction: column; gap: var(--space-tight); align-items: flex-start; }
.err { color: var(--state-error); font-weight: bold; margin: 0; }

.staged-summary { display: flex; flex-direction: column; gap: var(--space-tight); }
.staged-count { color: var(--text-0); font-size: var(--text-body); margin: 0; font-weight: bold; }
.staged-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 120px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.staged-item {
  color: var(--text-1);
  font-size: var(--text-tiny);
  font-family: monospace;
}
</style>
