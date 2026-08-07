/**
 * tests/integration/useSetupWizard.test.ts
 *
 * Integration coverage for the first-run setup wizard's step machine
 * (`useSetupWizard.ts`) and its open/close signal
 * (`useSetupWizardSignal.ts`) — ledger slug swz-setup-wizard.
 *
 * Commissioned acceptance properties covered here:
 *   1. Step sequence / navigation (next, back, skip, goTo).
 *   2. Skip and Next are behaviourally identical (nothing gates
 *      progression — see `useSetupWizard.ts`'s header).
 *   3. Finish writes `profile.settings.onboarding.completed = true`
 *      through the SAME `mutateProfile` seam every other profile
 *      writer uses, and closes the wizard signal.
 *   4. Re-running (`openSetupWizard()`) does NOT reset `completed`.
 *
 * The store is the real reactive singleton (`resetWorkspace()` in
 * `beforeEach` for isolation, per `tests/CLAUDE.md`'s common gotcha).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { store, resetWorkspace } from '../../src/store';
import { useSetupWizard, WIZARD_STEPS } from '../../src/composables/useSetupWizard';
import {
  setupWizardOpen,
  openSetupWizard,
  closeSetupWizard,
} from '../../src/composables/useSetupWizardSignal';

beforeEach(() => {
  resetWorkspace();
  closeSetupWizard();
});

describe('useSetupWizard — step sequence', () => {
  it('starts at step 0 (theme) and exposes the full step list', () => {
    const wizard = useSetupWizard();
    expect(wizard.stepIndex.value).toBe(0);
    expect(wizard.stepId.value).toBe('theme');
    expect(wizard.totalSteps).toBe(WIZARD_STEPS.length);
    expect(wizard.isFirstStep.value).toBe(true);
    expect(wizard.isLastStep.value).toBe(false);
  });

  it('next() walks every step in declared order', () => {
    const wizard = useSetupWizard();
    const seen: string[] = [wizard.stepId.value];
    for (let i = 1; i < WIZARD_STEPS.length; i++) {
      wizard.next();
      seen.push(wizard.stepId.value);
    }
    expect(seen).toEqual([...WIZARD_STEPS]);
    expect(wizard.isLastStep.value).toBe(true);
  });

  it('back() reverses next() and clamps at the first step', () => {
    const wizard = useSetupWizard();
    wizard.next();
    wizard.next();
    expect(wizard.stepIndex.value).toBe(2);
    wizard.back();
    expect(wizard.stepIndex.value).toBe(1);
    wizard.back();
    wizard.back(); // already at 0 — must not go negative
    expect(wizard.stepIndex.value).toBe(0);
  });

  it('goTo() jumps directly and ignores an out-of-range index', () => {
    const wizard = useSetupWizard();
    wizard.goTo(3);
    expect(wizard.stepId.value).toBe('demoBoard');
    wizard.goTo(-1);
    expect(wizard.stepId.value).toBe('demoBoard'); // unchanged
    wizard.goTo(999);
    expect(wizard.stepId.value).toBe('demoBoard'); // unchanged
  });

  it('skip() has the identical effect as next() at every step', () => {
    const a = useSetupWizard();
    const b = useSetupWizard();
    for (let i = 0; i < WIZARD_STEPS.length - 1; i++) {
      a.next();
      b.skip();
      expect(a.stepIndex.value).toBe(b.stepIndex.value);
    }
  });
});

describe('useSetupWizard — finish', () => {
  it('is false by default on a fresh profile (the actual first-run trigger)', () => {
    expect(store.profile.settings.onboarding.completed).toBe(false);
  });

  it('next() from the last step calls finish(): marks the profile onboarded and closes', () => {
    const wizard = useSetupWizard();
    openSetupWizard();
    for (let i = 0; i < WIZARD_STEPS.length - 1; i++) wizard.next();
    expect(wizard.isLastStep.value).toBe(true);

    wizard.next(); // finish from the last step
    expect(store.profile.settings.onboarding.completed).toBe(true);
    expect(setupWizardOpen.value).toBe(false);
  });

  it('an early finish() (e.g. Escape / backdrop dismiss) also marks onboarded', () => {
    const wizard = useSetupWizard();
    openSetupWizard();
    expect(wizard.stepId.value).toBe('theme'); // still on the first step
    wizard.finish();
    expect(store.profile.settings.onboarding.completed).toBe(true);
    expect(setupWizardOpen.value).toBe(false);
  });
});

describe('useSetupWizardSignal — rerun does not reset completion', () => {
  it('re-opening after finish leaves onboarding.completed untouched', () => {
    const wizard = useSetupWizard();
    wizard.finish();
    expect(store.profile.settings.onboarding.completed).toBe(true);

    openSetupWizard();
    expect(setupWizardOpen.value).toBe(true);
    expect(store.profile.settings.onboarding.completed).toBe(true); // unchanged by opening
  });

  it('closeSetupWizard() without finish() leaves completed untouched too', () => {
    expect(store.profile.settings.onboarding.completed).toBe(false);
    openSetupWizard();
    closeSetupWizard();
    expect(setupWizardOpen.value).toBe(false);
    expect(store.profile.settings.onboarding.completed).toBe(false);
  });
});
