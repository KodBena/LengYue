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
 * backdrop/× call `cancel()`, NOT `finish()` (commission rows
 * 1404/1407/1464/1468) — dismissing the wizard at any point is still
 * "skipping the rest" and still marks the profile onboarded so it
 * doesn't reappear on the next load (that part is unchanged), but it
 * must NOT commit a staged-but-not-reviewed SGF import to the
 * backend; only the last step's own Next/Finish button — the genuine
 * "I'm done" affordance — calls `finish()` and thereby commits it.
 * See `useSetupWizard.ts`'s header for the full irreversible-effect
 * rationale. `useModalKeyboard` supplies focus-trap / initial-focus /
 * focus-restoration, same as every other modal in the app.
 *
 * The Finish step alone also needs `wizard.visitedSteps` (audit M18,
 * ledger rows 1390/1397) to distinguish a value the user set from a
 * seeded default they never saw, and a staged-import count (commission
 * rows 1404/1407/1464/1468) so its recap doesn't claim an import
 * already happened. The SGF-import step alone needs
 * `wizard.importStaging` to drive its pick/drop UI. Both are passed
 * in conditionally by step id rather than to every step, since
 * they're single-step-only props the other steps don't declare.
 */
import { computed, ref } from 'vue';
import { useModalKeyboard } from '../../composables/useModalKeyboard';
import { useSetupWizard, type WizardStepId } from '../../composables/useSetupWizard';
import WizardStepIndicator from './WizardStepIndicator.vue';
import WizardStepLocale from './steps/WizardStepLocale.vue';
import WizardStepTheme from './steps/WizardStepTheme.vue';
import WizardStepEngineUri from './steps/WizardStepEngineUri.vue';
import WizardStepPalette from './steps/WizardStepPalette.vue';
import WizardStepDemoBoard from './steps/WizardStepDemoBoard.vue';
import WizardStepSgfImport from './steps/WizardStepSgfImport.vue';
import WizardStepFinish from './steps/WizardStepFinish.vue';

const wizard = useSetupWizard();
const modalContentRef = ref<HTMLElement | null>(null);

const STEP_COMPONENTS: Record<WizardStepId, unknown> = {
  locale: WizardStepLocale,
  theme: WizardStepTheme,
  engineUri: WizardStepEngineUri,
  palette: WizardStepPalette,
  demoBoard: WizardStepDemoBoard,
  sgfImport: WizardStepSgfImport,
  finish: WizardStepFinish,
};

const currentStepComponent = computed(() => STEP_COMPONENTS[wizard.stepId.value]);

function handleBackdropClick(e: MouseEvent): void {
  if (e.target === e.currentTarget) wizard.cancel();
}

useModalKeyboard(modalContentRef, computed(() => true), wizard.cancel);
</script>

<template>
  <div class="modal-backdrop" @click="handleBackdropClick">
    <div ref="modalContentRef" class="wizard-card" role="dialog" aria-modal="true" aria-labelledby="setup-wizard-title" tabindex="-1">
      <div class="wizard-header">
        <h3 id="setup-wizard-title" class="wizard-title">{{ $t(`wizard.step.${wizard.stepId.value}.title`) }}</h3>
        <button type="button" class="close-btn" :title="$t('wizard.button.close')" @click="wizard.cancel()">×</button>
      </div>

      <WizardStepIndicator :current-index="wizard.stepIndex.value" @jump="wizard.goTo" />

      <div class="wizard-body">
        <component
          :is="currentStepComponent"
          v-bind="
            wizard.stepId.value === 'finish'
              ? { visitedSteps: wizard.visitedSteps.value, stagedImportCount: wizard.importStaging.plan.value.length }
              : wizard.stepId.value === 'sgfImport'
                ? { staging: wizard.importStaging }
                : {}
          "
        />
      </div>

      <div class="wizard-footer">
        <button type="button" class="btn btn-secondary" :disabled="wizard.isFirstStep.value || wizard.isFinishing.value" @click="wizard.back()">
          {{ $t('wizard.button.back') }}
        </button>
        <div class="footer-spacer"></div>
        <button v-if="!wizard.isLastStep.value" type="button" class="btn btn-secondary" :disabled="wizard.isFinishing.value" @click="wizard.skip()">
          {{ $t('wizard.button.skip') }}
        </button>
        <button type="button" class="btn btn-primary" :disabled="wizard.isFinishing.value" @click="wizard.next()">
          {{ wizard.isLastStep.value ? $t('wizard.button.finish') : $t('wizard.button.next') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal);
  /* NO backdrop tint — commissioner ruling (commission row 748,
     restated verbatim 2026-08-07: "*NO* backdrop"): diffuse
     transparent overlays are banned, at ANY opacity. The element
     remains only as the centering/click-capture container. */
  background: transparent;
  display: flex; align-items: center; justify-content: center;
}

.wizard-card {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default); /* surface-0 per rows 681/742; was surface-2 = page-bg pink on cluster */
  padding: var(--space-loose); width: 640px; max-width: 92vw; max-height: 88vh;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
  display: flex; flex-direction: column; gap: var(--space-medium);
  /* The overall size cap (88vh) lives here, on the modal — never on a
     step. This card is deliberately NOT scrollable itself: the card
     is not the scroll contract owner. That job belongs solely to
     `.wizard-body` below (ledger rows 1498/1499/1500, ADR-0011 Rule 2
     mechanism dispatch, third witnessed instance of step content
     occluded by the footer). A step growing past its share of the
     card's height must scroll INSIDE `.wizard-body`, never bleed the
     whole card — which previously dragged the footer out of view
     along with the content instead of keeping it pinned below a
     contained scroll region. */
}

.wizard-header { display: flex; align-items: center; justify-content: space-between; flex: none; }
.wizard-title { color: var(--text-0); margin: 0; font-size: var(--text-heading); }
.close-btn {
  background: none; border: none; color: var(--text-disabled); font-size: var(--text-heading);
  cursor: pointer; line-height: 1; padding: 0 var(--space-tight);
}
.close-btn:hover { color: var(--text-0); }

/* THE SCROLL CONTRACT (ledger rows 1498/1499/1500): the ONE region
   that scrolls. `flex: 1 1 auto` lets it claim/yield space as the
   step's own content and the surrounding chrome (header, step
   indicator, footer) demand; `min-height: 0` is load-bearing — without
   it a flex item's default `min-height: auto` refuses to shrink below
   its content's natural height, which is exactly the failure mode that
   let content run under the footer in all three prior instances.
   `overflow-y: auto` makes overflow a contained scrollbar INSIDE this
   region instead of a card-wide scroll (which dragged the footer out
   of view) or a step-local budget (which the two now-deleted
   `calc(88vh - 156px)` rules in WizardStepDemoBoard.vue /
   WizardStepPalette.vue tried and re-broke on the next content growth
   — an instance guard, not a structural guarantee). The footer below
   is a DOM sibling rendered AFTER this region, `flex: none` so it
   never shrinks, and normal document flow puts it below the scroll
   region's box — never overlaid on top of it. */
.wizard-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }

.wizard-footer { display: flex; align-items: center; gap: var(--space-default); flex: none; }
.footer-spacer { flex: 1; }

.btn {
  padding: var(--space-default) var(--space-medium); font-size: var(--text-emphasis); font-family: inherit;
  border: 1px solid transparent; border-radius: var(--radius-default); cursor: pointer;
}
.btn:disabled { cursor: not-allowed; opacity: var(--alpha-disabled); }
.btn-secondary { background: var(--surface-0); border-color: var(--border-2); color: var(--text-0); /* rows 681/742: surface bg + border edge */ }
.btn-primary { background: var(--surface-0); border-color: var(--border-2); color: var(--accent-primary); font-weight: bold; /* standard SPA button shape (rows 609/681): NOT an accent-filled slab — commissioner directive 2026-08-07 */ }
</style>
