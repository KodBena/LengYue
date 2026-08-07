<!--
  src/components/wizard/SetupWizardModal.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * First-run setup wizard shell (ledger slug swz-setup-wizard,
 * commission row 723). Orchestrates the step machine
 * (`useSetupWizard.ts`) and mounts one step component per
 * `WizardStepId`; owns no domain logic itself — every step writes
 * its own store cell directly (ADR-0012).
 *
 * Genre convention (ADR-0019): numbered step indicator, Back / Skip /
 * Next footer, a distinct Finish on the last step. Escape and the
 * backdrop/× both call `finish()`, not a bare `closeSetupWizard()` —
 * dismissing the wizard at any point is itself "skipping the rest",
 * and per the commission this is a first-RUN wizard: closing it
 * still marks the profile onboarded so it doesn't reappear on the
 * next load. `useModalKeyboard` supplies focus-trap / initial-focus /
 * focus-restoration, same as every other modal in the app.
 */
import { computed, ref } from 'vue';
import { useModalKeyboard } from '../../composables/useModalKeyboard';
import { useSetupWizard, type WizardStepId } from '../../composables/useSetupWizard';
import WizardStepIndicator from './WizardStepIndicator.vue';
import WizardStepTheme from './steps/WizardStepTheme.vue';
import WizardStepEngineUri from './steps/WizardStepEngineUri.vue';
import WizardStepPalette from './steps/WizardStepPalette.vue';
import WizardStepDemoBoard from './steps/WizardStepDemoBoard.vue';
import WizardStepPvAnimation from './steps/WizardStepPvAnimation.vue';
import WizardStepSgfImport from './steps/WizardStepSgfImport.vue';
import WizardStepFinish from './steps/WizardStepFinish.vue';

const wizard = useSetupWizard();
const modalContentRef = ref<HTMLElement | null>(null);

const STEP_COMPONENTS: Record<WizardStepId, unknown> = {
  theme: WizardStepTheme,
  engineUri: WizardStepEngineUri,
  palette: WizardStepPalette,
  demoBoard: WizardStepDemoBoard,
  pvAnimation: WizardStepPvAnimation,
  sgfImport: WizardStepSgfImport,
  finish: WizardStepFinish,
};

const currentStepComponent = computed(() => STEP_COMPONENTS[wizard.stepId.value]);

function handleBackdropClick(e: MouseEvent): void {
  if (e.target === e.currentTarget) wizard.finish();
}

useModalKeyboard(modalContentRef, computed(() => true), wizard.finish);
</script>

<template>
  <div class="modal-backdrop" @click="handleBackdropClick">
    <div ref="modalContentRef" class="wizard-card" role="dialog" aria-modal="true" aria-labelledby="setup-wizard-title" tabindex="-1">
      <div class="wizard-header">
        <h3 id="setup-wizard-title" class="wizard-title">{{ $t(`wizard.step.${wizard.stepId.value}.title`) }}</h3>
        <button type="button" class="close-btn" :title="$t('wizard.button.close')" @click="wizard.finish()">×</button>
      </div>

      <WizardStepIndicator :current-index="wizard.stepIndex.value" @jump="wizard.goTo" />

      <div class="wizard-body">
        <component :is="currentStepComponent" />
      </div>

      <div class="wizard-footer">
        <button type="button" class="btn btn-secondary" :disabled="wizard.isFirstStep.value" @click="wizard.back()">
          {{ $t('wizard.button.back') }}
        </button>
        <div class="footer-spacer"></div>
        <button v-if="!wizard.isLastStep.value" type="button" class="btn btn-secondary" @click="wizard.skip()">
          {{ $t('wizard.button.skip') }}
        </button>
        <button type="button" class="btn btn-primary" @click="wizard.next()">
          {{ wizard.isLastStep.value ? $t('wizard.button.finish') : $t('wizard.button.next') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal);
  /* rgba(0,0,0,0.1): the codebase's modal-backdrop convention
     (MintCardModal / EngineMatchModal). The wizard shipped 0.6 — the
     heavy diffuse-transparent-overlay class the commissioner banned;
     witnessed making dark-theme text unreadable (commission row 748). */
  background: rgba(0, 0, 0, 0.1);
  display: flex; align-items: center; justify-content: center;
}

.wizard-card {
  background: var(--surface-2); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  padding: var(--space-loose); width: 640px; max-width: 92vw; max-height: 88vh; overflow-y: auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
  display: flex; flex-direction: column; gap: var(--space-medium);
}

.wizard-header { display: flex; align-items: center; justify-content: space-between; }
.wizard-title { color: var(--text-0); margin: 0; font-size: var(--text-heading); }
.close-btn {
  background: none; border: none; color: var(--text-2); font-size: var(--text-heading);
  cursor: pointer; line-height: 1; padding: 0 var(--space-tight);
}
.close-btn:hover { color: var(--text-0); }

.wizard-body { min-height: 200px; }

.wizard-footer { display: flex; align-items: center; gap: var(--space-default); }
.footer-spacer { flex: 1; }

.btn {
  padding: var(--space-default) var(--space-medium); font-size: var(--text-emphasis); font-family: inherit;
  border: 1px solid transparent; border-radius: var(--radius-default); cursor: pointer;
}
.btn:disabled { cursor: not-allowed; opacity: var(--alpha-disabled); }
.btn-secondary { background: var(--border-2); border-color: var(--border-3); color: var(--text-1); }
.btn-primary { background: var(--accent-primary); border-color: var(--accent-primary); color: var(--text-0); font-weight: bold; }
</style>
