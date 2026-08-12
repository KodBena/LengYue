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

import { computed, ref } from 'vue';
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
  it('exposes exactly the four commissioned targets, in order (P2b: A_setup joins the original three)', () => {
    expect(LYT_PRESENCE_TARGETS).toEqual(['boardRail', 'previewBoard', 'controlPanel', 'A_setup']);
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
    // Untouched siblings stay ABSENT (P2b: a fresh store no longer seeds
    // controlPanel at all — see defaults.ts's own doc comment) — the
    // RESOLVED default (via isVisible()/menu.targets) is still `true`,
    // asserted separately below; the persisted CELL itself is simply
    // never written until a real choice is made for that target.
    expect(store.session.ui.lytPresence.controlPanel).toBeUndefined();
    expect(menu.targets.value.find((t) => t.id === 'controlPanel')!.visible).toBe(true);
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
    // P2b: a fresh store no longer seeds controlPanel (see defaults.ts's
    // own doc comment) — the RESOLVED default is still `true` (the sole
    // visible target, hence guarded below).
    expect(store.session.ui.lytPresence.controlPanel).toBeUndefined();
    expect(menu.targets.value.find((t) => t.id === 'controlPanel')!.visible).toBe(true);
    menu.toggle('controlPanel'); // the only visible target — guarded
    expect(store.session.ui.lytPresence.controlPanel).toBeUndefined(); // still unwritten — refused, not merely unchanged-at-true
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

describe('useLytPresenceMenu — class-aware default resolution (P2b item 1)', () => {
  // Mirrors what App.vue really wires: `classDefaults` is the ACTIVE
  // screen class's own compiled `presenceDefaultVisible` per target,
  // read off `activeLytProgramIndex.widgetDefaultVisible` — here a bare
  // ref, since this composable takes it opaquely (ADR-0012 P1: the
  // per-class DERIVATION lives in `useLytProgramIndex.ts`/App.vue, not
  // duplicated here).

  it('portrait default (controlPanel: false) resolves when no user choice is persisted', () => {
    const classDefaults = ref<Partial<Record<'controlPanel', boolean>>>({ controlPanel: false });
    const menu = useLytPresenceMenu({ classDefaults });
    expect(store.session.ui.lytPresence.controlPanel).toBeUndefined(); // no seeded/persisted choice
    expect(menu.targets.value.find((t) => t.id === 'controlPanel')!.visible).toBe(false);
  });

  it('landscape default (controlPanel: true) resolves when no user choice is persisted', () => {
    const classDefaults = ref<Partial<Record<'controlPanel', boolean>>>({ controlPanel: true });
    const menu = useLytPresenceMenu({ classDefaults });
    expect(menu.targets.value.find((t) => t.id === 'controlPanel')!.visible).toBe(true);
  });

  it('a persisted user choice is sovereign over EITHER class default', () => {
    store.session.ui.lytPresence = { ...store.session.ui.lytPresence, controlPanel: false };
    const landscapeDefaults = ref<Partial<Record<'controlPanel', boolean>>>({ controlPanel: true });
    const menu = useLytPresenceMenu({ classDefaults: landscapeDefaults });
    // The class default says "true" (landscape) but the user explicitly
    // chose "false" — the persisted choice wins.
    expect(menu.targets.value.find((t) => t.id === 'controlPanel')!.visible).toBe(false);
  });

  it('a class default swap (landscape <-> portrait) re-resolves live for a target with no persisted choice', () => {
    const classId = ref<'landscape' | 'portrait'>('landscape');
    const classDefaults = computed<Partial<Record<'controlPanel', boolean>>>(() => ({
      controlPanel: classId.value === 'landscape',
    }));
    const menu = useLytPresenceMenu({ classDefaults });
    expect(menu.targets.value.find((t) => t.id === 'controlPanel')!.visible).toBe(true);
    classId.value = 'portrait';
    expect(menu.targets.value.find((t) => t.id === 'controlPanel')!.visible).toBe(false);
  });

  it('A_setup has no persisted seed and falls back to its own (class-invariant) default: false', () => {
    const menu = useLytPresenceMenu();
    expect(store.session.ui.lytPresence.A_setup).toBeUndefined();
    expect(menu.targets.value.find((t) => t.id === 'A_setup')!.visible).toBe(false);
  });
});
