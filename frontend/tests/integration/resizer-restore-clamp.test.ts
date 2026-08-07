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
import { nextTick } from 'vue';

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
  WRAPPER_MIN_WIDTH_PX,
  CONTROL_PANEL_MIN_WIDTH_PX,
  TREE_PANEL_MIN_WIDTH_PX,
  freshTreeControlWrapperFloorPx,
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

  // Review BLOCKER (ui-5-3-restore-clamp-review.md finding 1): a
  // non-finite persisted value — reachable via updateFromRemote's
  // unvalidated deepMerge — must not NaN-poison the clamp and reach
  // App.vue's :style as an invalid CSS length (the exact minimized-board
  // symptom). Treated as never-dragged: flex-fill default.
  it('a NaN persisted value falls back to the flex-fill default instead of NaN-poisoning the clamp', () => {
    store.session.ui.treeControlRegionWidthPx = Number.NaN;

    mountSplitWorkspace(1024);
    const panel = withSetup(() => useResizablePanel());

    expect(panel.effectiveTreeControlRegionWidthPx.value).toBeUndefined();
  });

  it('an Infinity persisted value likewise falls back to the flex-fill default', () => {
    store.session.ui.treeControlRegionWidthPx = Number.POSITIVE_INFINITY;

    mountSplitWorkspace(1024);
    const panel = withSetup(() => useResizablePanel());

    expect(panel.effectiveTreeControlRegionWidthPx.value).toBeUndefined();
  });
});

describe('ui-5-3 live regression (2026-08-07): cold-load gate vs the row observer', () => {
  // #split-workspace sits behind App.vue's cold-load v-if
  // (workspaceLoadState 'loaded'), so at composable mount time the
  // element typically does NOT exist. The original mount-only attach
  // silently never observed: rowWidthPx stayed 0 and the clamp pinned
  // the region to its minimum — witnessed live as "the divider stopped
  // dragging". The two-phase attach watches workspaceLoadState and
  // attaches one tick after the workspace renders.
  it('a composable mounted BEFORE the element exists still clamps once the workspace loads', async () => {
    store.session.ui.treeControlRegionWidthPx = 5000; // needs clamping on a 1024 row

    // No #split-workspace in the DOM yet (loading state).
    store.workspaceLoadState = { kind: 'loading' } as any;
    const panel = withSetup(() => useResizablePanel());

    // Pre-load: geometry unknown — the raw value passes through
    // (finite-guarded), NOT a clamp against a fantasy 0-width row.
    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(5000);

    // Workspace loads; element appears; watcher attaches next tick.
    mountSplitWorkspace(1024);
    store.workspaceLoadState = { kind: 'loaded' } as any;
    await nextTick(); // watcher fires
    await nextTick(); // attach callback's own nextTick

    const v = panel.effectiveTreeControlRegionWidthPx.value;
    expect(v).toBeDefined();
    expect(v!).toBeLessThan(1024); // clamped against the real row now
  });

  it('pre-load pass-through still refuses non-finite persisted values', () => {
    store.session.ui.treeControlRegionWidthPx = Number.NaN;
    store.workspaceLoadState = { kind: 'loading' } as any;
    const panel = withSetup(() => useResizablePanel());
    expect(panel.effectiveTreeControlRegionWidthPx.value).toBeUndefined();
  });
});

/**
 * ledger row 802 — "the SPA is barely usable" at a fresh-profile first
 * paint on a common-width viewport (commissioner-witnessed clipping of
 * the Cards tab header and action buttons at ~1920, root-caused live at
 * a 1366×768 first paint — see useResizablePanel.ts's
 * freshTreeControlWrapperFloorPx doc for the exact mechanism: the
 * `flex: '1 1 0'` branch App.vue binds when
 * `effectiveTreeControlRegionWidthPx` is undefined (never dragged, no
 * persisted save to restore) previously had no width floor, so
 * #control-panel could be allocated less than its own content needs and
 * overflow past the wrapper — and past the viewport, since nothing
 * clips or scrolls horizontally. `freshTreeControlWrapperMinWidthPx`
 * (bound as this branch's CSS `min-width`) is the fix; these tests pin
 * its value and the viewport-fit arithmetic it guarantees.
 */
describe('fresh-profile first-paint floor (ledger row 802): the flex-fill branch never leaves the control panel narrower than its own content', () => {
  it('freshTreeControlWrapperFloorPx mirrors WRAPPER_MIN_WIDTH_PX when the tree panel is also expanded', () => {
    expect(freshTreeControlWrapperFloorPx(true)).toBe(WRAPPER_MIN_WIDTH_PX);
    // Sanity: the floor is exactly the sum of what's actually rendered
    // inside the wrapper on this paint — tree + inner resizer + control
    // — never a magic number independently drifting from those three.
    expect(freshTreeControlWrapperFloorPx(true)).toBe(
      TREE_PANEL_MIN_WIDTH_PX + RESIZER_WIDTH_PX + CONTROL_PANEL_MIN_WIDTH_PX,
    );
  });

  it('freshTreeControlWrapperFloorPx drops to CONTROL_PANEL_MIN_WIDTH_PX alone when the tree panel is collapsed (no over-reservation for a hidden tree panel)', () => {
    expect(freshTreeControlWrapperFloorPx(false)).toBe(CONTROL_PANEL_MIN_WIDTH_PX);
    expect(freshTreeControlWrapperFloorPx(false)).toBeLessThan(freshTreeControlWrapperFloorPx(true));
  });

  it('the composable exposes the floor reactively off store.session.ui.treeExpanded', () => {
    store.session.ui.treeExpanded = true;
    const panel = withSetup(() => useResizablePanel());
    expect(panel.freshTreeControlWrapperMinWidthPx.value).toBe(WRAPPER_MIN_WIDTH_PX);

    store.session.ui.treeExpanded = false;
    expect(panel.freshTreeControlWrapperMinWidthPx.value).toBe(CONTROL_PANEL_MIN_WIDTH_PX);
  });

  // The load-bearing claim: at a fresh-profile first paint (no dragged
  // or restored width — the flex-fill branch), #control-panel's own
  // right edge can never exceed the row's right edge at any of the
  // commission's required widths (1366 / 1920 / 2560), because the CSS
  // `min-width` floor this test pins forces the browser's flex
  // allocation to give the wrapper at least enough room for its own
  // content BEFORE #board-column's flex-fill share is computed — the
  // two together always exactly fill the row with no overflow. Encoded
  // here as the arithmetic invariant browser flexbox guarantees once
  // the floor is applied: floor + outer resizer + MIN_BOARD_PX must fit
  // under the narrowest required viewport, so #board-column is never
  // squeezed into negative/overflowing territory even before the row's
  // own chrome (sidebar, toolbar padding) is subtracted.
  it.each([1366, 1920, 2560])(
    'a %dpx viewport leaves #board-column at least MIN_BOARD_PX after reserving the fresh-paint floor',
    (viewportWidthPx) => {
      const floorPx = freshTreeControlWrapperFloorPx(true); // worst case: tree also expanded
      const boardRoomPx = viewportWidthPx - floorPx - RESIZER_WIDTH_PX;
      expect(boardRoomPx).toBeGreaterThanOrEqual(MIN_BOARD_PX);
    },
  );
});
