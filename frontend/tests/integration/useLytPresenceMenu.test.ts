/**
 * tests/integration/useLytPresenceMenu.test.ts
 *
 * Tier-3 composable-integration test for `useLytPresenceMenu.ts`
 * (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md` §8 W2 item
 * 1) — driven against the REAL store (`resetWorkspace` for isolation),
 * the effectful service singletons faked per `tests/CLAUDE.md`'s
 * documented preamble.
 *
 * Covers: default target list + defaults, toggle read/write through
 * `touchSession()`, the last-remaining-panel guard (never a silent
 * revert — the disabled flag, not the toggle function itself, is what a
 * consuming template relies on; this suite also proves `toggle()`
 * itself defensively no-ops), and the `railStyle`-conditioned exclusion
 * of `boardRail` from the guard's own accounting.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Same minimal service-mock preamble as store-mutators-style tests
// (`migration-store-roundtrip.test.ts`'s own header names this as the
// preamble to mirror) — importing `src/store` pulls the effectful
// service singletons, which must be faked in jsdom.
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

import { store, resetWorkspace } from '../../src/store';
import {
  useLytPresenceMenu,
  LYT_PRESENCE_TARGETS,
  LYT_PRESENCE_DEFAULT,
} from '../../src/composables/chrome/useLytPresenceMenu';

beforeEach(() => {
  resetWorkspace();
});

describe('useLytPresenceMenu — defaults and target list', () => {
  it('exposes exactly the three commissioned targets, in order', () => {
    expect(LYT_PRESENCE_TARGETS).toEqual(['boardRail', 'previewBoard', 'controlPanel']);
  });

  it('a fresh store (defaults.ts seed) resolves to the registration defaults', () => {
    const menu = useLytPresenceMenu();
    const byId = Object.fromEntries(menu.targets.value.map((t) => [t.id, t.visible]));
    expect(byId).toEqual(LYT_PRESENCE_DEFAULT);
  });
});

describe('useLytPresenceMenu — toggle + touchSession', () => {
  it('toggle flips the stored value', () => {
    const menu = useLytPresenceMenu();
    expect(store.session.ui.lytPresence.previewBoard).toBe(false);
    menu.toggle('previewBoard');
    expect(store.session.ui.lytPresence.previewBoard).toBe(true);
    menu.toggle('previewBoard');
    expect(store.session.ui.lytPresence.previewBoard).toBe(false);
  });

  it('toggle preserves sibling entries in the presence map (no clobber)', () => {
    const menu = useLytPresenceMenu();
    menu.toggle('boardRail');
    expect(store.session.ui.lytPresence.boardRail).toBe(true);
    expect(store.session.ui.lytPresence.controlPanel).toBe(true); // untouched default
    expect(store.session.ui.lytPresence.previewBoard).toBe(false); // untouched default
  });
});

describe('useLytPresenceMenu — last-remaining-panel guard (mockup N2 fix, ported semantics)', () => {
  it('with only controlPanel visible (defaults), controlPanel is disabled and both hidden targets are not', () => {
    const menu = useLytPresenceMenu();
    const byId = Object.fromEntries(menu.targets.value.map((t) => [t.id, t.disabled]));
    expect(byId.controlPanel).toBe(true);
    expect(byId.boardRail).toBe(false);
    expect(byId.previewBoard).toBe(false);
  });

  it('toggle() defensively no-ops against the guarded (last-visible) target — not a silent revert, a refusal', () => {
    const menu = useLytPresenceMenu();
    expect(store.session.ui.lytPresence.controlPanel).toBe(true);
    menu.toggle('controlPanel'); // the only visible target — guarded
    expect(store.session.ui.lytPresence.controlPanel).toBe(true); // unchanged
  });

  it('once a second target is visible, the guard releases and either can be hidden', () => {
    const menu = useLytPresenceMenu();
    menu.toggle('boardRail'); // now controlPanel + boardRail both visible
    expect(menu.targets.value.find((t) => t.id === 'controlPanel')!.disabled).toBe(false);
    menu.toggle('controlPanel');
    expect(store.session.ui.lytPresence.controlPanel).toBe(false);
    // boardRail is now the sole visible target — guard re-engages on it.
    expect(menu.targets.value.find((t) => t.id === 'boardRail')!.disabled).toBe(true);
  });
});

describe('useLytPresenceMenu — railStyle conditioning', () => {
  it('setRailStyle writes through and bumps the session counter', () => {
    const menu = useLytPresenceMenu();
    expect(menu.railStyle.value).toBe('slot');
    menu.setRailStyle('popover');
    expect(store.session.ui.railStyle).toBe('popover');
    expect(menu.railStyle.value).toBe('popover');
  });

  it('in \'popover\' rail style, boardRail is excluded from the guard\'s own accounting and permanently disabled', () => {
    const menu = useLytPresenceMenu();
    menu.setRailStyle('popover');
    // Defaults: boardRail=false, previewBoard=false, controlPanel=true.
    // Only controlPanel is "active" (boardRail excluded) and it's the
    // sole visible active target -> guarded. boardRail itself is
    // disabled for the OTHER reason (popover style), not the guard.
    const byId = Object.fromEntries(menu.targets.value.map((t) => [t.id, t.disabled]));
    expect(byId.boardRail).toBe(true);
    expect(byId.controlPanel).toBe(true);
    expect(byId.previewBoard).toBe(false);
  });

  it('toggle() defensively no-ops on boardRail while rail style is \'popover\'', () => {
    const menu = useLytPresenceMenu();
    menu.setRailStyle('popover');
    menu.toggle('boardRail');
    expect(store.session.ui.lytPresence.boardRail).toBe(false); // unchanged
  });
});
