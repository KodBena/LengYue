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
 *   5. `visitedSteps` (audit M18, ledger rows 1390/1397) — the first
 *      step is visited on open with no navigation; every navigation
 *      primitive (next/back/skip/goTo) adds the step it lands ON;
 *      a step never landed on stays out of the set, even after a
 *      forward `goTo` jumps past it.
 *   6. PURE-STAGING SGF IMPORT (commission rows 1404/1407/1464/1468):
 *      a staged-then-cancelled plan makes ZERO calls to
 *      `libraryService.importGames` (spied at the service boundary);
 *      a staged-then-finished plan sends EXACTLY the staged plan; a
 *      per-file `errored` outcome, and a whole-commit throw, both
 *      surface loudly via `pushSystemMessage` (ADR-0002) rather than
 *      being swallowed.
 *
 * The store is the real reactive singleton (`resetWorkspace()` in
 * `beforeEach` for isolation, per `tests/CLAUDE.md`'s common gotcha).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/library-service', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/library-service')>(
    '../../src/services/library-service',
  );
  return {
    ...actual,
    libraryService: {
      importGames: vi.fn(),
    },
  };
});

import { store, resetWorkspace } from '../../src/store';
import { useSetupWizard, WIZARD_STEPS } from '../../src/composables/useSetupWizard';
import {
  setupWizardOpen,
  openSetupWizard,
  closeSetupWizard,
} from '../../src/composables/useSetupWizardSignal';
import { libraryService } from '../../src/services/library-service';

const mockImport = vi.mocked(libraryService.importGames);

function makeFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/plain' });
}

beforeEach(() => {
  resetWorkspace();
  closeSetupWizard();
  mockImport.mockReset();
});

describe('useSetupWizard — step sequence', () => {
  it('starts at step 0 (locale) and exposes the full step list', () => {
    const wizard = useSetupWizard();
    expect(wizard.stepIndex.value).toBe(0);
    expect(wizard.stepId.value).toBe('locale');
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
    wizard.goTo(4);
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

describe('useSetupWizard — visitedSteps', () => {
  it('seeds with only the first step, before any navigation', () => {
    const wizard = useSetupWizard();
    expect([...wizard.visitedSteps.value]).toEqual(['locale']);
  });

  it('next() adds each step it lands on, in order', () => {
    const wizard = useSetupWizard();
    wizard.next(); // -> theme
    expect(wizard.visitedSteps.value.has('theme')).toBe(true);
    expect(wizard.visitedSteps.value.has('engineUri')).toBe(false);
    wizard.next(); // -> engineUri
    expect(wizard.visitedSteps.value.has('engineUri')).toBe(true);
    expect([...wizard.visitedSteps.value]).toEqual(['locale', 'theme', 'engineUri']);
  });

  it('skip() adds the landed-on step exactly like next()', () => {
    const wizard = useSetupWizard();
    wizard.skip(); // -> theme
    expect(wizard.visitedSteps.value.has('theme')).toBe(true);
  });

  it('back() adds the step it returns to', () => {
    const wizard = useSetupWizard();
    wizard.goTo(4); // -> demoBoard, skipping theme/engineUri/palette entirely
    expect(wizard.visitedSteps.value.has('palette')).toBe(false);
    wizard.back(); // -> palette
    expect(wizard.visitedSteps.value.has('palette')).toBe(true);
    expect(wizard.visitedSteps.value.has('engineUri')).toBe(false); // still never landed on
  });

  it('a forward goTo() jump leaves the skipped-over steps unvisited', () => {
    const wizard = useSetupWizard();
    wizard.goTo(6); // -> finish, straight from locale
    expect([...wizard.visitedSteps.value].sort()).toEqual(['finish', 'locale']);
    expect(wizard.visitedSteps.value.has('theme')).toBe(false);
    expect(wizard.visitedSteps.value.has('engineUri')).toBe(false);
    expect(wizard.visitedSteps.value.has('palette')).toBe(false);
    expect(wizard.visitedSteps.value.has('demoBoard')).toBe(false);
    expect(wizard.visitedSteps.value.has('sgfImport')).toBe(false);
  });

  it('an out-of-range goTo() is a no-op and adds nothing', () => {
    const wizard = useSetupWizard();
    wizard.goTo(999);
    wizard.goTo(-1);
    expect([...wizard.visitedSteps.value]).toEqual(['locale']);
  });
});

describe('useSetupWizard — finish', () => {
  it('is false by default on a fresh profile (the actual first-run trigger)', () => {
    expect(store.profile.settings.onboarding.completed).toBe(false);
  });

  it('next() from the last step calls finish(): marks the profile onboarded and closes', async () => {
    const wizard = useSetupWizard();
    openSetupWizard();
    for (let i = 0; i < WIZARD_STEPS.length - 1; i++) wizard.next();
    expect(wizard.isLastStep.value).toBe(true);

    await wizard.next(); // finish from the last step — awaited: finish() is async
    // (it awaits the staged-import commit, a no-op here since nothing was staged).
    expect(store.profile.settings.onboarding.completed).toBe(true);
    expect(setupWizardOpen.value).toBe(false);
  });

  it('an explicit finish() also marks onboarded', async () => {
    const wizard = useSetupWizard();
    openSetupWizard();
    expect(wizard.stepId.value).toBe('locale'); // still on the first step
    await wizard.finish();
    expect(store.profile.settings.onboarding.completed).toBe(true);
    expect(setupWizardOpen.value).toBe(false);
  });
});

// cancel() is the dismiss path (backdrop/×/Escape, wired in
// SetupWizardModal.vue) — commission rows 1404/1407/1464/1468 split
// it from finish() specifically so a dismissal never commits a staged
// SGF import. Its "mark onboarded and close" side effect is otherwise
// identical to finish()'s, preserving the pre-existing "first-run
// wizard never reappears" contract regardless of how it was left.
describe('useSetupWizard — cancel (dismiss: backdrop/×/Escape)', () => {
  it('marks onboarded and closes, synchronously, from any step', () => {
    const wizard = useSetupWizard();
    openSetupWizard();
    expect(wizard.stepId.value).toBe('locale'); // still on the first step
    wizard.cancel();
    expect(store.profile.settings.onboarding.completed).toBe(true);
    expect(setupWizardOpen.value).toBe(false);
  });
});

describe('useSetupWizardSignal — rerun does not reset completion', () => {
  it('re-opening after finish leaves onboarding.completed untouched', async () => {
    const wizard = useSetupWizard();
    await wizard.finish();
    expect(store.profile.settings.onboarding.completed).toBe(true);

    openSetupWizard();
    expect(setupWizardOpen.value).toBe(true);
    expect(store.profile.settings.onboarding.completed).toBe(true); // unchanged by opening
  });

  it('re-opening after cancel leaves onboarding.completed untouched', () => {
    const wizard = useSetupWizard();
    wizard.cancel();
    expect(store.profile.settings.onboarding.completed).toBe(true);

    openSetupWizard();
    expect(setupWizardOpen.value).toBe(true);
    expect(store.profile.settings.onboarding.completed).toBe(true); // unchanged by opening
  });

  it('closeSetupWizard() without finish()/cancel() leaves completed untouched too', () => {
    expect(store.profile.settings.onboarding.completed).toBe(false);
    openSetupWizard();
    closeSetupWizard();
    expect(setupWizardOpen.value).toBe(false);
    expect(store.profile.settings.onboarding.completed).toBe(false);
  });
});

// The commissioned property itself: no irreversible external effect
// (a `libraryService` call) before wizard finish, on either exit
// path, with per-file failure surfaced loudly rather than swallowed.
// Denomination: effects are counted at the service-call boundary
// (`mockImport`), same as `useLibraryImport.test.ts`'s own convention.
describe('useSetupWizard — staged SGF import is atomic with the wizard', () => {
  it('staged-then-cancelled makes ZERO calls to libraryService.importGames', async () => {
    const wizard = useSetupWizard();
    openSetupWizard();
    await wizard.importStaging.stageFiles([makeFile('a.sgf', '(;FF[4])')]);
    expect(wizard.importStaging.plan.value.length).toBe(1);

    wizard.cancel();

    expect(mockImport).not.toHaveBeenCalled();
    expect(store.profile.settings.onboarding.completed).toBe(true); // dismiss still onboards
  });

  it('staged-then-finished sends EXACTLY the staged plan, once', async () => {
    mockImport.mockResolvedValueOnce([
      { status: 'created', gameId: 1 as never, clientGameId: 'x' as never, displayOrdinal: 1 as never },
    ]);
    const wizard = useSetupWizard();
    openSetupWizard();
    await wizard.importStaging.stageFiles([makeFile('a.sgf', '(;FF[4])')]);

    await wizard.finish();

    expect(mockImport).toHaveBeenCalledTimes(1);
    expect(mockImport.mock.calls[0][0]).toEqual([{ rawContent: '(;FF[4])', sourcePath: null }]);
  });

  it('an empty plan never calls libraryService.importGames, even on finish()', async () => {
    const wizard = useSetupWizard();
    openSetupWizard();
    await wizard.finish();
    expect(mockImport).not.toHaveBeenCalled();
  });

  it('a per-file errored outcome surfaces loudly via a system message, but still finishes', async () => {
    mockImport.mockResolvedValueOnce([
      { status: 'created', gameId: 1 as never, clientGameId: 'x' as never, displayOrdinal: 1 as never },
      { status: 'errored', error: 'malformed SGF' },
    ]);
    const wizard = useSetupWizard();
    openSetupWizard();
    await wizard.importStaging.stageFiles([
      makeFile('a.sgf', '(;FF[4])'),
      makeFile('b.sgf', '(;FF[4])'),
    ]);

    await wizard.finish();

    expect(store.profile.settings.onboarding.completed).toBe(true); // optional step: failure doesn't trap the user
    expect(setupWizardOpen.value).toBe(false);
    const errorMsg = store.engine.messages.find(m => m.type === 'error' && m.text.includes('1'));
    expect(errorMsg).toBeDefined();
  });

  it('a chunk-level throw surfaces loudly via a system message, but still finishes', async () => {
    mockImport.mockRejectedValueOnce(new Error('network down'));
    const wizard = useSetupWizard();
    openSetupWizard();
    await wizard.importStaging.stageFiles([makeFile('a.sgf', '(;FF[4])')]);

    await wizard.finish();

    expect(store.profile.settings.onboarding.completed).toBe(true);
    const errorMsg = store.engine.messages.find(m => m.type === 'error' && m.text.includes('network down'));
    expect(errorMsg).toBeDefined();
  });

  // Re-entrancy guard (fresh-context review finding): a double-click
  // on Finish must not send the staged plan to libraryService twice,
  // and a dismiss racing an in-flight commit must not close the
  // wizard out from under an upload the user has no way to know is
  // still running.
  it('a second finish() call while the first is still committing is a no-op — exactly one importGames call', async () => {
    let resolveImport!: (v: unknown) => void;
    mockImport.mockReturnValueOnce(new Promise(resolve => { resolveImport = resolve; }));
    const wizard = useSetupWizard();
    openSetupWizard();
    await wizard.importStaging.stageFiles([makeFile('a.sgf', '(;FF[4])')]);

    const firstFinish = wizard.finish();
    expect(wizard.isFinishing.value).toBe(true);
    const secondFinish = wizard.finish(); // double-click: must no-op, not re-send

    resolveImport([]);
    await firstFinish;
    await secondFinish;

    expect(mockImport).toHaveBeenCalledTimes(1);
    expect(wizard.isFinishing.value).toBe(false);
  });

  it('cancel() during an in-flight finish() no-ops — the wizard does not close out from under the commit', async () => {
    let resolveImport!: (v: unknown) => void;
    mockImport.mockReturnValueOnce(new Promise(resolve => { resolveImport = resolve; }));
    const wizard = useSetupWizard();
    openSetupWizard();
    await wizard.importStaging.stageFiles([makeFile('a.sgf', '(;FF[4])')]);

    const finishing = wizard.finish();
    expect(wizard.isFinishing.value).toBe(true);

    wizard.cancel(); // races the in-flight commit — must not close early
    expect(setupWizardOpen.value).toBe(true); // still open: cancel() no-opped

    resolveImport([]);
    await finishing;

    expect(setupWizardOpen.value).toBe(false); // finish() itself closes once it settles
    expect(mockImport).toHaveBeenCalledTimes(1);
  });
});
