/**
 * tests/integration/useSystemLogToggle.test.ts
 *
 * Tier-3 composable-integration test for `useSystemLogToggle.ts` — the
 * D2 fix (`.claude/dispatch-reports/lyt-w5-parity-build.md` Defect D2)
 * restoring the system log's manual open/close affordance. Driven
 * against the REAL store (`resetWorkspace` for isolation), the
 * effectful service singletons faked per `tests/CLAUDE.md`'s
 * documented preamble — same shape as
 * `tests/integration/useLytPresenceMenu.test.ts`.
 *
 * Covers: the default (`false`, `store/defaults.ts`), toggle
 * round-trip read/write through `store.session.ui.systemLogExpanded`,
 * that `touchSession()` fires on every toggle (via `sessionVersion`),
 * and that `expanded` tracks the store even when written from
 * elsewhere (e.g. a future keybinding) rather than only through this
 * composable's own `toggle()`.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Same minimal service-mock preamble useLytPresenceMenu.test.ts uses —
// importing `src/store` pulls the effectful service singletons, which
// must be faked in jsdom.
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

import { store, resetWorkspace, sessionVersion } from '../../src/store';
import { useSystemLogToggle } from '../../src/composables/chrome/useSystemLogToggle';

beforeEach(() => {
  resetWorkspace();
});

describe('useSystemLogToggle — default', () => {
  it('a fresh store (defaults.ts seed) resolves to collapsed', () => {
    const handle = useSystemLogToggle();
    expect(handle.expanded.value).toBe(false);
    expect(store.session.ui.systemLogExpanded).toBe(false);
  });
});

describe('useSystemLogToggle — toggle round-trip + touchSession', () => {
  it('toggle flips the stored value both directions', () => {
    const handle = useSystemLogToggle();
    handle.toggle();
    expect(store.session.ui.systemLogExpanded).toBe(true);
    expect(handle.expanded.value).toBe(true);
    handle.toggle();
    expect(store.session.ui.systemLogExpanded).toBe(false);
    expect(handle.expanded.value).toBe(false);
  });

  it('each toggle bumps sessionVersion (schedules a persist)', () => {
    const handle = useSystemLogToggle();
    const before = sessionVersion.value;
    handle.toggle();
    expect(sessionVersion.value).toBe(before + 1);
    handle.toggle();
    expect(sessionVersion.value).toBe(before + 2);
  });

  it('expanded reflects an external write to the store, not just this handle\'s own toggle()', () => {
    const handle = useSystemLogToggle();
    store.session.ui.systemLogExpanded = true;
    expect(handle.expanded.value).toBe(true);
  });
});
