/**
 * src/composables/useSetupWizard.ts
 *
 * Step-machine for the first-run setup wizard (ledger slug
 * swz-setup-wizard, commission row 723). Owns ONLY navigation state
 * (which step is showing) — every step writes directly to the real
 * store cell it configures (ADR-0012: the wizard is a VIEW, never a
 * second home for any fact), so "skip" and "next" are behaviourally
 * identical: there is nothing a step can leave unset that blocks
 * progress, because every cell already carries a sensible default
 * before the wizard ever opens. Both are exposed for the genre-
 * convention affordance (ADR-0019 — wizards show a Skip distinct
 * from Next) even though they call the same underlying `advance()`.
 *
 * Trigger (see `App.vue`): first run is detected at hydrate via
 * `profile.settings.onboarding.completed === false` — seeded `false`
 * only for a genuinely fresh profile (`store/defaults.ts`); migration
 * 69 → 70 backfills `true` for every blob that predates the wizard
 * (see `store/migrations.ts`). `finish()` below is the ONLY writer
 * that flips it to `true`; skipping every step and finishing still
 * marks the profile onboarded (it must — this is a first-RUN wizard,
 * not a "come back later" wizard, and neither browser reload nor a
 * future Tauri relaunch may show it again for the same profile).
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { mutateProfile } from './../store/profile-owner';
import { closeSetupWizard } from './useSetupWizardSignal';

export const WIZARD_STEPS = [
  'theme',
  'engineUri',
  'palette',
  'demoBoard',
  'sgfImport',
  'finish',
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number];

export interface SetupWizard {
  readonly stepIndex: Ref<number>;
  readonly stepId: ComputedRef<WizardStepId>;
  readonly isFirstStep: ComputedRef<boolean>;
  readonly isLastStep: ComputedRef<boolean>;
  readonly totalSteps: number;
  /** Advance to the next step, or finish from the last. */
  next: () => void;
  /** Same effect as `next()` — see file header for why Skip and
   *  Next are behaviourally identical here. Kept as a separate
   *  entry point so the template can label the two affordances
   *  distinctly per ADR-0019 wizard convention. */
  skip: () => void;
  back: () => void;
  /** Jump directly to a step via the step-indicator (back-nav only;
   *  forward jumps are not offered since nothing gates progression
   *  anyway — see file header). */
  goTo: (index: number) => void;
  /** Marks the profile onboarded and closes the wizard. Idempotent —
   *  safe to call from Finish, from an explicit dismiss, or from the
   *  last step's Next. */
  finish: () => void;
}

export function useSetupWizard(): SetupWizard {
  const stepIndex = ref(0);

  const stepId = computed<WizardStepId>(() => WIZARD_STEPS[stepIndex.value]);
  const isFirstStep = computed(() => stepIndex.value === 0);
  const isLastStep = computed(() => stepIndex.value === WIZARD_STEPS.length - 1);

  function finish(): void {
    mutateProfile((profile) => {
      profile.settings.onboarding.completed = true;
    });
    closeSetupWizard();
  }

  function next(): void {
    if (isLastStep.value) {
      finish();
      return;
    }
    stepIndex.value++;
  }

  function back(): void {
    if (stepIndex.value > 0) stepIndex.value--;
  }

  function goTo(index: number): void {
    if (index >= 0 && index < WIZARD_STEPS.length) stepIndex.value = index;
  }

  return {
    stepIndex,
    stepId,
    isFirstStep,
    isLastStep,
    totalSteps: WIZARD_STEPS.length,
    next,
    skip: next,
    back,
    goTo,
    finish,
  };
}
