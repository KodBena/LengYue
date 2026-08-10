/**
 * src/composables/useSetupWizard.ts
 *
 * Step-machine for the first-run setup wizard (ledger slug
 * swz-setup-wizard, commission row 723). Owns navigation state (which
 * step is showing) — every step writes directly to the real store
 * cell it configures (ADR-0012: the wizard is a VIEW, never a second
 * home for any fact), so "skip" and "next" are behaviourally
 * identical for those steps: there is nothing a step can leave unset
 * that blocks progress, because every cell already carries a sensible
 * default before the wizard ever opens. Both are exposed for the
 * genre-convention affordance (ADR-0019 — wizards show a Skip
 * distinct from Next) even though they call the same underlying
 * `next()`.
 *
 * IRREVERSIBLE-EFFECT EXCEPTION (commission rows 1404/1407/1464/1468,
 * supersedes the VIEW decree above for this one case only): the SGF
 * import step is not a live-preview write like the others — a
 * backend import is a DB mutation with no revert. The commissioner
 * imported a game mid-wizard and it "destructively updated the DB
 * immediately." The fix is a second, narrowly-scoped home: this
 * composable now also owns `importStaging`
 * (`useWizardImportStaging.ts`'s pure-staging core), one per wizard
 * session, matching `stepIndex`/`visitedSteps`'s own per-instance
 * lifetime. `finish()` is the ONLY caller of `importStaging.commit()`
 * — the sole irreversible-effect trigger for the whole wizard, fired
 * once, at the moment the wizard is genuinely finished. `cancel()` —
 * wired to the backdrop/×/Escape dismiss affordances in
 * `SetupWizardModal.vue` — never commits; it just discards the
 * staged plan, so dismissing the wizard mid-import-step leaves zero
 * externally-visible effect. Every OTHER step's reversible
 * live-preview writes (theme, engine URI, palette, PV options) are
 * unchanged by this exception and still write straight to their
 * store cell, per the original VIEW decree.
 *
 * Trigger (see `App.vue`): first run is detected at hydrate via
 * `profile.settings.onboarding.completed === false` — seeded `false`
 * only for a genuinely fresh profile (`store/defaults.ts`); migration
 * 69 → 70 backfills `true` for every blob that predates the wizard
 * (see `store/migrations.ts`). `finish()` and `cancel()` below are the
 * ONLY writers that flip it to `true`; skipping every step and
 * finishing (or dismissing) still marks the profile onboarded (it
 * must — this is a first-RUN wizard, not a "come back later" wizard,
 * and neither browser reload nor a future Tauri relaunch may show it
 * again for the same profile). That onboarding-flag write is
 * unchanged by the exception above — only the SGF import's backend
 * call is gated to `finish()`.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { mutateProfile } from './../store/profile-owner';
import { pushSystemMessage } from '../store';
import { i18n } from '../i18n';
import { closeSetupWizard } from './useSetupWizardSignal';
import { useWizardImportStaging, type WizardImportStaging } from './library/useWizardImportStaging';

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
  /** Steps the user has actually landed on this run (via next/back/
   *  skip/goTo), including the first step shown at open. One home
   *  for "visited" (audit M18, ledger rows 1390/1397) — the Finish
   *  recap reads this to distinguish a step the user set from one
   *  they never saw and is showing its seeded default. Never reset
   *  mid-run; a fresh Set is only minted by a fresh `useSetupWizard()`
   *  call (matches `stepIndex`'s own per-instance lifetime). */
  readonly visitedSteps: Ref<ReadonlySet<WizardStepId>>;
  /** The SGF-import step's pure-staging core (file header:
   *  IRREVERSIBLE-EFFECT EXCEPTION). One instance per wizard session;
   *  `WizardStepSgfImport.vue` reads/writes it via a prop passed down
   *  by `SetupWizardModal.vue`, same pattern as `visitedSteps` for
   *  the Finish step. */
  readonly importStaging: WizardImportStaging;
  /** True for the duration of an in-flight `finish()` commit (the
   *  staged-import network call). `finish()` and `cancel()` both
   *  no-op while this is true, so the primary UI need not itself
   *  re-implement the guard — but `SetupWizardModal.vue` also reads
   *  it to disable the footer so a double-click can't even fire a
   *  second no-op call. */
  readonly isFinishing: Ref<boolean>;
  /** Advance to the next step, or `finish()` from the last. */
  next: () => Promise<void>;
  /** Same effect as `next()` — see file header for why Skip and
   *  Next are behaviourally identical here. Kept as a separate
   *  entry point so the template can label the two affordances
   *  distinctly per ADR-0019 wizard convention. */
  skip: () => Promise<void>;
  back: () => void;
  /** Jump directly to a step via the step-indicator (back-nav only;
   *  forward jumps are not offered since nothing gates progression
   *  anyway — see file header). */
  goTo: (index: number) => void;
  /** The wizard's COMMIT exit path: executes the staged SGF import
   *  (if any) via `importStaging.commit()`, marks the profile
   *  onboarded, and closes. This is the only path that ever sends
   *  the staged plan to the backend — called from the last step's
   *  Next/Finish button (via `next()`). Per-file import failures are
   *  reported loudly via `pushSystemMessage` (ADR-0002: no silent
   *  partial success) rather than blocking completion — the step is
   *  optional, so a failed import shouldn't trap the user in the
   *  wizard. */
  finish: () => Promise<void>;
  /** The wizard's DISCARD exit path: wired to the backdrop click, the
   *  × button, and Escape in `SetupWizardModal.vue`. Drops any staged
   *  SGF import (`importStaging.clear()` — never `commit()`s it) and
   *  otherwise has the same "mark onboarded, close" effect `finish()`
   *  always had for dismissal, preserving the pre-existing "this is a
   *  first-run wizard, don't reappear" contract. Synchronous: unlike
   *  `finish()`, it never awaits a network call. */
  cancel: () => void;
}

export function useSetupWizard(): SetupWizard {
  const stepIndex = ref(0);
  // Seeded with the first step: it's on screen the instant the wizard
  // opens, so it counts as visited even before any navigation call.
  const visitedSteps = ref<Set<WizardStepId>>(new Set([WIZARD_STEPS[0]]));
  // One staging core per wizard session — see file header's
  // IRREVERSIBLE-EFFECT EXCEPTION.
  const importStaging = useWizardImportStaging();
  // Re-entrancy guard for the commit window (fresh-context review
  // finding, ledger-equivalent: a double-click on Finish, or a
  // backdrop/×/Escape dismiss racing an in-flight `finish()`, could
  // otherwise either send the staged plan to `libraryService` twice,
  // or close the wizard out from under an upload the user believed
  // they'd cancelled). `finish()` and `cancel()` both no-op while
  // this is true — see their own comments below.
  const isFinishing = ref(false);

  const stepId = computed<WizardStepId>(() => WIZARD_STEPS[stepIndex.value]);
  const isFirstStep = computed(() => stepIndex.value === 0);
  const isLastStep = computed(() => stepIndex.value === WIZARD_STEPS.length - 1);

  function markOnboardedAndClose(): void {
    mutateProfile((profile) => {
      profile.settings.onboarding.completed = true;
    });
    closeSetupWizard();
  }

  /**
   * The sole imperative-shell trigger for the staged SGF import
   * (file header). No-op — zero `libraryService` calls — when
   * nothing is staged, mirroring `WizardImportStaging.commit()`'s own
   * empty-plan short-circuit. Per-file `errored` outcomes and a
   * chunk-level throw are both reported via `pushSystemMessage`
   * (ADR-0002 fail-loudly: a partial or total import failure must be
   * visible, never swallowed) rather than blocking wizard completion
   * — this step is explicitly optional.
   */
  async function commitStagedImport(): Promise<void> {
    if (importStaging.plan.value.length === 0) return;
    const t = i18n.global.t;
    try {
      const outcomes = await importStaging.commit();
      const erroredCount = outcomes.filter(o => o.status === 'errored').length;
      if (erroredCount > 0) {
        pushSystemMessage(
          'error',
          t('wizard.sgfImport.result.errored', { count: erroredCount, total: outcomes.length }),
        );
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      pushSystemMessage('error', t('wizard.sgfImport.result.failed', { detail }));
    }
  }

  async function finish(): Promise<void> {
    // No-op while a commit is already in flight: a double-click on
    // Finish (or Enter fired twice) must not send the staged plan to
    // `libraryService.importGames` a second time.
    if (isFinishing.value) return;
    isFinishing.value = true;
    try {
      await commitStagedImport();
      markOnboardedAndClose();
    } finally {
      isFinishing.value = false;
    }
  }

  function cancel(): void {
    // No-op while `finish()`'s commit is in flight: a backdrop/×/
    // Escape dismiss that races an already-started `finish()` must
    // not close the wizard out from under an upload the user has no
    // way to know is still running — closing it read as "cancelled"
    // even though the already-in-flight `commit()` would complete
    // regardless. Once `finish()` settles, `isFinishing` drops back
    // to `false` and a subsequent cancel (or the wizard having
    // already closed itself) proceeds normally.
    if (isFinishing.value) return;
    importStaging.clear();
    markOnboardedAndClose();
  }

  async function next(): Promise<void> {
    if (isLastStep.value) {
      await finish();
      return;
    }
    stepIndex.value++;
    visitedSteps.value.add(stepId.value);
  }

  function back(): void {
    if (stepIndex.value > 0) stepIndex.value--;
    visitedSteps.value.add(stepId.value);
  }

  function goTo(index: number): void {
    if (index >= 0 && index < WIZARD_STEPS.length) {
      stepIndex.value = index;
      visitedSteps.value.add(stepId.value);
    }
  }

  return {
    stepIndex,
    stepId,
    isFirstStep,
    isLastStep,
    totalSteps: WIZARD_STEPS.length,
    visitedSteps,
    importStaging,
    isFinishing,
    next,
    skip: next,
    back,
    goTo,
    finish,
    cancel,
  };
}
