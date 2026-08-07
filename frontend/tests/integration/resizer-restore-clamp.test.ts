/**
 * tests/integration/resizer-restore-clamp.test.ts
 *
 * ui-5-3 regression test — "the board comes back minimized after
 * upgrading". Reproduces the actual hydrate path: a persisted
 * `session.ui.treeControlRegionWidthPx` (a store snapshot, exactly
 * what `updateFromRemote` would apply on load) that was saved against
 * a WIDE viewport is hydrated on a NARROW one. Before the ui-5-3 fix,
 * App.vue's `#tree-control-wrapper` width binding read that raw store
 * number directly, so `#board-column` (pure flex-fill, absorbs
 * whatever the wrapper doesn't claim) was left with little or no
 * room. `useResizablePanel`'s `effectiveTreeControlRegionWidthPx` —
 * what App.vue now actually binds to — re-clamps the persisted value
 * against `#split-workspace`'s live width on every render, not just
 * mid-drag.
 *
 * `withSetup` (`./with-setup.ts`) gives the composable's `onMounted`
 * (which measures `#split-workspace`) a real component instance. A
 * `<div id="split-workspace">` is attached to `document.body` with
 * `getBoundingClientRect` stubbed, since jsdom's layout engine always
 * reports a zero-size box — this is the DOM-measurement half of the
 * "imperative-escape" idiom the composable uses in production.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Same service-mock preamble as resizer-persistence-roundtrip.test.ts —
// importing `src/store` (transitively, via useResizablePanel importing
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
import { store, resetWorkspace, updateFromRemote } from '../../src/store';
import {
  useResizablePanel,
  MIN_BOARD_PX,
  RESIZER_WIDTH_PX,
} from '../../src/composables/chrome/useResizablePanel';

// The row `useResizablePanel`'s onMounted hook measures. Stubbing its
// rendered width is how this test controls "the current viewport".
function mountSplitWorkspace(widthPx: number): HTMLDivElement {
  const row = document.createElement('div');
  row.id = 'split-workspace';
  row.getBoundingClientRect = () =>
    ({ width: widthPx, height: 0, top: 0, left: 0, right: widthPx, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
  document.body.appendChild(row);
  return row;
}

beforeEach(() => {
  resetWorkspace();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ui-5-3: hydrating a wide-viewport width on a narrow one always leaves the board a usable width', () => {
  it('RED (documents the pre-fix symptom): the raw persisted value alone gives the board no room on the narrower viewport', () => {
    // Store snapshot as `updateFromRemote` would apply it on load —
    // e.g. saved on a 3840px-wide monitor.
    updateFromRemote({
      schemaVersion: 67,
      activeBoardIndex: 0,
      boards: [],
      profile: {},
      session: { ui: { treeControlRegionWidthPx: 3490 } },
    } as any);
    expect(store.session.ui.treeControlRegionWidthPx).toBe(3490);

    // Now hydrated on a 1024px-wide viewport (a laptop, or the same
    // monitor windowed smaller).
    const narrowRowWidthPx = 1024;
    const rawBoardRoomPx = narrowRowWidthPx - store.session.ui.treeControlRegionWidthPx! - RESIZER_WIDTH_PX;
    expect(rawBoardRoomPx).toBeLessThan(MIN_BOARD_PX);
    expect(rawBoardRoomPx).toBeLessThan(0); // negative: the board literally has no box
  });

  it('GREEN: effectiveTreeControlRegionWidthPx clamps the same hydrated value so the board keeps MIN_BOARD_PX', () => {
    updateFromRemote({
      schemaVersion: 67,
      activeBoardIndex: 0,
      boards: [],
      profile: {},
      session: { ui: { treeControlRegionWidthPx: 3490 } },
    } as any);

    mountSplitWorkspace(1024);
    const panel = withSetup(() => useResizablePanel());

    const effectiveWidthPx = panel.effectiveTreeControlRegionWidthPx.value;
    expect(effectiveWidthPx).toBeDefined();
    const boardRoomPx = 1024 - (effectiveWidthPx as number) - RESIZER_WIDTH_PX;
    expect(boardRoomPx).toBeGreaterThanOrEqual(MIN_BOARD_PX);
  });

  it('a workspace that was NEVER dragged (undefined) keeps its flex-fill default — fresh installs are unaffected', () => {
    expect(store.session.ui.treeControlRegionWidthPx).toBeUndefined();

    mountSplitWorkspace(1024);
    const panel = withSetup(() => useResizablePanel());

    expect(panel.effectiveTreeControlRegionWidthPx.value).toBeUndefined();
  });

  it('a value already comfortably narrower than the row is left unchanged (no-op on the common/healthy case)', () => {
    store.session.ui.treeControlRegionWidthPx = 500;

    mountSplitWorkspace(1600);
    const panel = withSetup(() => useResizablePanel());

    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(500);
  });
});
