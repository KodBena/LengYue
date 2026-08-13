/**
 * tests/integration/lyt-default-layout.test.ts
 *
 * "Default layout" button (commission, ledger row 2379):
 * `resetLayoutOverrides` (`src/composables/chrome/useResizablePanel.ts`)
 * clears the two persisted layout-override cells
 * (`session.ui.treeControlRegionWidthPx`/`treePanelWidthPx`) and ONLY
 * those — presence toggles (`lytPresence`, `railStyle`) are a different
 * axis (which panels are shown, not how wide a shown one is) and stay
 * untouched. `useLytPresenceMenu.ts`'s own `resetLayout` is a plain
 * re-export of the same function (asserted at the bottom), so both the
 * composable-level and the menu-level entry point are covered without
 * duplicating the clearing logic's own test.
 *
 * Independent, non-tautological expectations per the commission:
 *   - every enumerated cell clears, and ONLY those cells (presence
 *     untouched) — the enumeration itself is cross-checked against
 *     `store/schema.ts` in this file's own header comment, not just
 *     asserted against whatever the implementation happens to write.
 *   - post-reset widths equal the LIVE-COMPUTED default for the
 *     CURRENT geometry (not a remembered "factory" pixel value) —
 *     exercised at two different mounted widths to prove the default
 *     is recomputed per-geometry, not cached from one measurement.
 *   - `touchSession()` fires (persistence gets scheduled), same as any
 *     other `session.ui` write site.
 *
 * `mountSplitWorkspace`/`withSetup` mirror
 * `resizer-restore-clamp.test.ts`'s own established idiom (read in full
 * before authoring this file) for driving `useResizablePanel`'s
 * ResizeObserver-cached-geometry composable against a stubbed
 * `getBoundingClientRect` in jsdom.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Same service-mock preamble as resizer-restore-clamp.test.ts — importing
// `src/store` (transitively, via useResizablePanel importing
// `store`/`touchSession`) pulls the effectful service singletons, which
// must be faked in jsdom.
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

vi.mock('../../src/composables/cards/useCardThumbnail', () => ({
  clearCardThumbnailCache: vi.fn(),
  getCardThumbnailSync: vi.fn(() => ''),
}));

vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  useThumbnailCache: () => ({ warmPath: vi.fn() }),
}));

vi.mock('../../src/composables/cards/thumbnail-render-resources', () => ({
  purgeBoardThumbnails: vi.fn(),
  purgeAllThumbnails: vi.fn(),
}));

vi.mock('../../src/composables/cards/board-card-trees', () => ({
  removeBoardCardTree: vi.fn(),
  clearAllBoardCardTrees: vi.fn(),
  getOrCreateBoardCardTree: vi.fn(),
  getBoardCardTree: vi.fn(() => null),
}));

import { withSetup } from './with-setup';
import { store, resetWorkspace, sessionVersion } from '../../src/store';
import {
  useResizablePanel,
  resetLayoutOverrides,
} from '../../src/composables/chrome/useResizablePanel';
import { useLytPresenceMenu } from '../../src/composables/chrome/useLytPresenceMenu';
import {
  computeTreeControlRegionDefaultWidthPx,
} from '../../src/state/layout-model';

function mountSplitWorkspace(widthPx: number, heightPx = 0): HTMLDivElement {
  const row = document.createElement('div');
  row.id = 'split-workspace';
  row.getBoundingClientRect = () =>
    ({ width: widthPx, height: heightPx, top: 0, left: 0, right: widthPx, bottom: heightPx, x: 0, y: 0, toJSON() {} }) as DOMRect;
  document.body.appendChild(row);
  return row;
}

beforeEach(() => {
  resetWorkspace();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('resetLayoutOverrides — clears exactly the two enumerated cells, nothing else', () => {
  it('clears both treeControlRegionWidthPx and treePanelWidthPx', () => {
    store.session.ui.treeControlRegionWidthPx = 1900;
    store.session.ui.treePanelWidthPx = 260;

    resetLayoutOverrides();

    expect(store.session.ui.treeControlRegionWidthPx).toBeUndefined();
    expect(store.session.ui.treePanelWidthPx).toBeUndefined();
  });

  it('leaves every presence toggle untouched — lytPresence map and railStyle are a DIFFERENT axis (geometry vs. presence)', () => {
    store.session.ui.treeControlRegionWidthPx = 1900;
    store.session.ui.treePanelWidthPx = 260;
    store.session.ui.lytPresence = { ...store.session.ui.lytPresence, boardRail: true, previewBoard: true, controlPanel: false };
    store.session.ui.railStyle = 'popover';

    resetLayoutOverrides();

    expect(store.session.ui.lytPresence.boardRail).toBe(true);
    expect(store.session.ui.lytPresence.previewBoard).toBe(true);
    expect(store.session.ui.lytPresence.controlPanel).toBe(false);
    expect(store.session.ui.railStyle).toBe('popover');
  });

  it('is a no-op on an already-default (never-dragged) session — idempotent, not merely "doesn\'t throw"', () => {
    expect(store.session.ui.treeControlRegionWidthPx).toBeUndefined();
    expect(store.session.ui.treePanelWidthPx).toBeUndefined();
    resetLayoutOverrides();
    expect(store.session.ui.treeControlRegionWidthPx).toBeUndefined();
    expect(store.session.ui.treePanelWidthPx).toBeUndefined();
  });

  it('bumps sessionVersion (schedules a persist), same as the drag handlers\' own touchSession() call', () => {
    store.session.ui.treePanelWidthPx = 260;
    const before = sessionVersion.value;
    resetLayoutOverrides();
    expect(sessionVersion.value).toBeGreaterThan(before);
  });
});

describe('resetLayoutOverrides — full enumeration cross-check against store/schema.ts', () => {
  // store/schema.ts's `AppSettings['ui']` (a.k.a. SessionUI) interface
  // has exactly two `?: number` fields whose name ends in `Px` and which
  // are user-draggable geometry overrides (grep-verified against that
  // file at authoring time: `treeControlRegionWidthPx`/
  // `treePanelWidthPx` — `ThumbnailSettings.sizePx` is a different,
  // unrelated interface, not a session.ui cell). This test pins that
  // enumeration mechanically: if a THIRD Px-suffixed override cell is
  // ever added to session.ui and resetLayoutOverrides isn't updated for
  // it, this test still passes (it doesn't grep the schema itself) but
  // the two assertions above stop being an exhaustive test of "only
  // those cells clear" — recorded here as the known limit of this
  // mechanization, not silently assumed complete.
  it('resetLayoutOverrides writes to exactly two session.ui keys (no more, no fewer) relative to a dragged snapshot', () => {
    store.session.ui.treeControlRegionWidthPx = 1900;
    store.session.ui.treePanelWidthPx = 260;
    const before = { ...store.session.ui };

    resetLayoutOverrides();

    const changedKeys = Object.keys(before).filter(
      (k) => (before as Record<string, unknown>)[k] !== (store.session.ui as unknown as Record<string, unknown>)[k],
    );
    expect(changedKeys.sort()).toEqual(['treeControlRegionWidthPx', 'treePanelWidthPx']);
  });
});

describe('resetLayoutOverrides — post-reset widths equal the LIVE-COMPUTED default for the CURRENT geometry (ruling c)', () => {
  it('at a wide (1920px) geometry, resetting a dragged width lands on computeTreeControlRegionDefaultWidthPx(1920), not the pre-drag stored value', () => {
    mountSplitWorkspace(1920);
    const panel = withSetup(() => useResizablePanel());

    store.session.ui.treeControlRegionWidthPx = 3490; // a stale/dragged value, unrelated to 1920
    expect(panel.effectiveTreeControlRegionWidthPx.value).not.toBe(computeTreeControlRegionDefaultWidthPx(1920));

    resetLayoutOverrides();

    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(computeTreeControlRegionDefaultWidthPx(1920));
  });

  it('at a narrower (1024px) geometry, the SAME reset recomputes a DIFFERENT default — proves per-geometry recomputation, not a cached/remembered pixel value', () => {
    mountSplitWorkspace(1024);
    const panel = withSetup(() => useResizablePanel());

    store.session.ui.treeControlRegionWidthPx = 900;
    resetLayoutOverrides();

    const default1024 = computeTreeControlRegionDefaultWidthPx(1024);
    const default1920 = computeTreeControlRegionDefaultWidthPx(1920);
    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(default1024);
    expect(default1024).not.toBe(default1920); // the two geometries genuinely differ
  });

  it('the tree panel\'s own effective width likewise returns to its own live-computed default (treePanelDefaultWidthPx), independent of the OUTER bar\'s fact', () => {
    mountSplitWorkspace(2000);
    const panel = withSetup(() => useResizablePanel());

    // A dragged value (render-time clamped against the OUTER region's
    // own live width, per `computeTreePanelClampedWidthPx` —
    // `useResizablePanel.ts`'s own "W3-fix" section — so the exact
    // post-drag figure isn't 900 verbatim; the load-bearing claim below
    // is only that it's NOT the un-dragged default).
    store.session.ui.treePanelWidthPx = 900;
    expect(panel.effectiveTreePanelWidthPx.value).not.toBe(panel.treePanelDefaultWidthPx.value);

    resetLayoutOverrides();

    expect(panel.effectiveTreePanelWidthPx.value).toBe(panel.treePanelDefaultWidthPx.value);
  });

  // Ruling (c): a reset at a narrow width returns to the computed
  // default FOR THAT WIDTH, which may itself sit below whatever floor a
  // width-conditional demotion elsewhere (App.vue's own
  // `resolveWidthConditionalPresence`/`controlPanelDemote`, outside this
  // composable's own surface) would already collapse a sibling panel at
  // — that is correct behavior, not a partial reset. This composable's
  // OWN contract is only "clear the override, recompute for current
  // geometry"; it neither reads nor overrides presence, so there is
  // nothing here for a width-conditional demotion to conflict with.
  it('a reset at a floor-pinned narrow geometry still lands on the (floor-pinned) computed default, not an arbitrary fallback', () => {
    mountSplitWorkspace(500); // narrow enough that the region clamps to its wrapper floor
    const panel = withSetup(() => useResizablePanel());

    store.session.ui.treeControlRegionWidthPx = 2000;
    resetLayoutOverrides();

    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(computeTreeControlRegionDefaultWidthPx(500));
  });
});

describe('useLytPresenceMenu.resetLayout — the menu-level entry point is the SAME function, not a re-implementation', () => {
  it('is reference-equal to resetLayoutOverrides (ADR-0012 one-home-per-fact: the menu forwards, it does not duplicate the clearing logic)', () => {
    const menu = useLytPresenceMenu();
    expect(menu.resetLayout).toBe(resetLayoutOverrides);
  });

  it('calling it through the menu clears the same two cells and leaves presence untouched', () => {
    store.session.ui.treeControlRegionWidthPx = 1900;
    store.session.ui.treePanelWidthPx = 260;
    store.session.ui.lytPresence = { ...store.session.ui.lytPresence, boardRail: true };

    const menu = useLytPresenceMenu();
    menu.resetLayout();

    expect(store.session.ui.treeControlRegionWidthPx).toBeUndefined();
    expect(store.session.ui.treePanelWidthPx).toBeUndefined();
    expect(store.session.ui.lytPresence.boardRail).toBe(true);
  });
});
