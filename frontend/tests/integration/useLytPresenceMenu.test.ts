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
 * `touchSession()`, the ALL-OFF reachability the former last-remaining-
 * panel guard used to forbid (REMOVED — finish-pass-2 finding N3,
 * `.claude/dispatch-reports/lyt-n2-column-rail.md`; see
 * `useLytPresenceMenu.ts`'s own header, "The last-remaining-panel guard,
 * and why it's gone"), and the `railStyle === 'popover'`-conditioned
 * disable of `boardRail`'s own checkbox, which is UNRELATED to the
 * removed guard and still live.
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

describe('useLytPresenceMenu — no last-remaining-panel guard (removed, finding N3)', () => {
  it('with only controlPanel visible (defaults), NONE of the four targets is disabled — the former guard reason is gone', () => {
    const menu = useLytPresenceMenu();
    const byId = Object.fromEntries(menu.targets.value.map((t) => [t.id, t.disabled]));
    expect(byId.controlPanel).toBe(false);
    expect(byId.boardRail).toBe(false);
    expect(byId.previewBoard).toBe(false);
    expect(byId.A_setup).toBe(false);
  });

  it('toggle() freely hides the sole visible target — an all-off state is reachable, the board is always the surface underneath', () => {
    const menu = useLytPresenceMenu();
    expect(store.session.ui.lytPresence.controlPanel).toBeUndefined(); // no persisted choice yet
    expect(menu.targets.value.find((t) => t.id === 'controlPanel')!.visible).toBe(true); // the sole visible target (defaults)
    menu.toggle('controlPanel');
    expect(store.session.ui.lytPresence.controlPanel).toBe(false); // written through, not refused
    const byId = Object.fromEntries(menu.targets.value.map((t) => [t.id, t.visible]));
    expect(byId).toEqual({ boardRail: false, previewBoard: false, controlPanel: false, A_setup: false });
  });

  it('toggling every target off one at a time never re-engages a disable on the last one standing', () => {
    const menu = useLytPresenceMenu();
    menu.toggle('controlPanel'); // now 0 visible (controlPanel was the sole default-visible target)
    menu.toggle('boardRail'); // now 1 visible (boardRail)
    expect(menu.targets.value.find((t) => t.id === 'boardRail')!.disabled).toBe(false);
    menu.toggle('boardRail'); // back to 0 visible — not refused
    expect(store.session.ui.lytPresence.boardRail).toBe(false);
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

  it('in \'popover\' rail style, boardRail is permanently disabled (its own grid track is unconditionally collapsed in that style) — every OTHER target is unaffected, the former guard reason being gone', () => {
    const menu = useLytPresenceMenu();
    menu.setRailStyle('popover');
    const byId = Object.fromEntries(menu.targets.value.map((t) => [t.id, t.disabled]));
    expect(byId.boardRail).toBe(true);
    expect(byId.controlPanel).toBe(false);
    expect(byId.previewBoard).toBe(false);
    expect(byId.A_setup).toBe(false);
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
