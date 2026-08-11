/**
 * tests/integration/resizer-restore-clamp.test.ts
 *
 * ui-5-3 regression test — "the board comes back minimized after
 * upgrading". Reproduces the actual hydrate path: a persisted
 * `session.ui.treeControlRegionWidthPx` (a store snapshot, exactly
 * what `updateFromRemote` would apply on load) that was saved against
 * a WIDE viewport is hydrated on a NARROW one. Before the ui-5-3 fix,
 * App.vue's `#tree-control-wrapper` width binding read that raw store
 * number directly, so `#board-area` (pure flex-fill, absorbs
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
import { computeTreeControlRegionDefaultWidthPx } from '../../src/state/layout-model';

// The row `useResizablePanel`'s onMounted hook measures. Stubbing its
// rendered width (and, for the board-area width-cap tests below,
// height) is how this test controls "the current viewport". `heightPx`
// defaults to 0 (unmeasured) so every pre-existing call site — none of
// which cares about height — is unaffected.
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

  it('a workspace that was NEVER dragged gets the init-vs-drag-divergence-fix default once measured — fresh installs are unaffected by the STORED-value clamp above, but are no longer left undefined either (ledger rows 1505/1510)', () => {
    expect(store.session.ui.treeControlRegionWidthPx).toBeUndefined();

    mountSplitWorkspace(1024);
    const panel = withSetup(() => useResizablePanel());

    // Before the fix this was `undefined` (flex-fill branch, capped
    // independently by boardAreaMaxWidthPx AND unsetWrapperMaxWidthCss
    // — the two-cap defect). Now it's the SAME explicit default a
    // settled drag would produce, so #board-area's own cap
    // self-disables (see the "board-area width cap" describe block
    // below) and absorbs the true remainder — no more dead space.
    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(computeTreeControlRegionDefaultWidthPx(1024));
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
  it('a NaN persisted value falls back to the never-dragged default (same as no stored value) instead of NaN-poisoning the clamp', () => {
    store.session.ui.treeControlRegionWidthPx = Number.NaN;

    mountSplitWorkspace(1024);
    const panel = withSetup(() => useResizablePanel());

    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(computeTreeControlRegionDefaultWidthPx(1024));
  });

  it('an Infinity persisted value likewise falls back to the never-dragged default', () => {
    store.session.ui.treeControlRegionWidthPx = Number.POSITIVE_INFINITY;

    mountSplitWorkspace(1024);
    const panel = withSetup(() => useResizablePanel());

    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(computeTreeControlRegionDefaultWidthPx(1024));
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

  // W3 rewire (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
  // §8 W3): the composable's own dormant `store.session.ui.treeExpanded`
  // read is removed here — the LYT skeleton's `tree` leaf is
  // unconditionally `@fixed`-present in both screen classes (SPEC.md
  // §11's own "only a bare leaf... release toggle" scoping excludes it),
  // so the floor is now ALWAYS the tree-expanded value regardless of
  // `treeExpanded` — the field itself is untouched (blind-mode review UI
  // owns its remaining semantics; this composable no longer reads it).
  it('always reports the tree-expanded floor — treeExpanded no longer affects it (W3: chrome-side dormant read removed)', () => {
    store.session.ui.treeExpanded = true;
    const panelExpanded = withSetup(() => useResizablePanel());
    expect(panelExpanded.freshTreeControlWrapperMinWidthPx.value).toBe(WRAPPER_MIN_WIDTH_PX);

    store.session.ui.treeExpanded = false;
    const panelCollapsed = withSetup(() => useResizablePanel());
    expect(panelCollapsed.freshTreeControlWrapperMinWidthPx.value).toBe(WRAPPER_MIN_WIDTH_PX);
  });

  // The load-bearing claim: at a fresh-profile first paint (no dragged
  // or restored width — the flex-fill branch), #control-panel's own
  // right edge can never exceed the row's right edge at any of the
  // commission's required widths (1366 / 1920 / 2560), because the CSS
  // `min-width` floor this test pins forces the browser's flex
  // allocation to give the wrapper at least enough room for its own
  // content BEFORE #board-area's flex-fill share is computed — the
  // two together always exactly fill the row with no overflow. Encoded
  // here as the arithmetic invariant browser flexbox guarantees once
  // the floor is applied: floor + outer resizer + MIN_BOARD_PX must fit
  // under the narrowest required viewport, so #board-area is never
  // squeezed into negative/overflowing territory even before the row's
  // own chrome (sidebar, toolbar padding) is subtracted.
  it.each([1366, 1920, 2560])(
    'a %dpx viewport leaves #board-area at least MIN_BOARD_PX after reserving the fresh-paint floor',
    (viewportWidthPx) => {
      const floorPx = freshTreeControlWrapperFloorPx(true); // worst case: tree also expanded
      const boardRoomPx = viewportWidthPx - floorPx - RESIZER_WIDTH_PX;
      expect(boardRoomPx).toBeGreaterThanOrEqual(MIN_BOARD_PX);
    },
  );
});

/**
 * commission row 848 ("space should not be wasted"): a HEIGHT-bound
 * `#board-area` (the square is `height: 100%; aspect-ratio: 1/1`)
 * must not claim row WIDTH past what its own square can render into —
 * the excess became dead centered margin around the square while
 * `#tree-control-wrapper` starved at its floor. `boardAreaMaxWidthPx`
 * (returned by `useResizablePanel`) is the reactive cap App.vue binds
 * as `#board-area`'s `:style` `max-width`; `computeBoardAreaMaxWidthPx`
 * (tested at the pure-function tier in `tests/unit/composables/chrome/
 * useResizablePanel.test.ts`) is the arithmetic behind it.
 *
 * NARROWED SCOPE (init-vs-drag divergence fix, ledger rows 1505/1510):
 * this cap USED TO also engage for every never-dragged render, at the
 * SAME TIME `unsetWrapperMaxWidthCss` capped the wrapper — two
 * independently-computed caps on the row's only two flex-grow parties
 * that could both saturate below the row's actual width, leaving the
 * remainder as dead space to the right of the control panel (the
 * reported defect). `effectiveTreeControlRegionWidthPx` now resolves to
 * an explicit default (`computeTreeControlRegionDefaultWidthPx`,
 * state/layout-model.ts) the instant the row is measured, so this cap's
 * own `!== undefined` guard now fires on every steady-state render —
 * the cap is only ever live for the single pre-measurement frame (see
 * the last test below, which is the only one still exercising it).
 */
/**
 * W3: `effectiveTreePanelWidthPx` — the INNER bar's own "effective width",
 * mirroring `effectiveTreeControlRegionWidthPx`'s stored-value-wins-
 * verbatim-else-default precedence via the SAME pure function
 * (`computeTreePanelBoundWidth`, state/layout-model.ts) the pre-W3 App.vue
 * template ternary called directly.
 */
describe('effectiveTreePanelWidthPx (W3): the INNER bar\'s stored-value-wins-else-default fact', () => {
  it('a stored width wins verbatim, independent of the measured row width', () => {
    store.session.ui.treePanelWidthPx = 314;
    mountSplitWorkspace(2000);
    const panel = withSetup(() => useResizablePanel());
    expect(panel.effectiveTreePanelWidthPx.value).toBe(314);
  });

  it('no stored width falls back to the R5 fraction default of the measured row width', () => {
    mountSplitWorkspace(2000);
    const panel = withSetup(() => useResizablePanel());
    expect(panel.effectiveTreePanelWidthPx.value).toBe(panel.treePanelDefaultWidthPx.value);
  });
});

describe('board-area width cap (commission row 848): narrowed to the pre-measurement frame by the init-vs-drag divergence fix', () => {
  it('RED (documents the ORIGINAL pre-848 symptom this cap was built against): with no cap at all, a height-bound board-area would keep claiming an even flex-fill share past what its own square can use', () => {
    const rowWidthPx = 2400;
    const rowHeightPx = 900; // height-bound: the square can use at most 900px
    // Pre-848, #board-area (`flex: 1 1 auto`) and #tree-control-wrapper
    // (`flex: 1 1 0`) split free row space evenly (both grow-factor 1);
    // the naive share is well past what the height-bound square needs.
    const naiveUncappedSharePx = (rowWidthPx - RESIZER_WIDTH_PX) / 2;
    expect(naiveUncappedSharePx).toBeGreaterThan(rowHeightPx);
  });

  it('once the row is measured, a never-dragged workspace now gets the explicit default width (not undefined) and the height-cap self-disables — #board-area is free to absorb the true remainder instead of being double-capped alongside the wrapper', () => {
    const rowWidthPx = 2400;
    const rowHeightPx = 900; // height-bound geometry — the OLD dual-cap scenario
    mountSplitWorkspace(rowWidthPx, rowHeightPx);
    const panel = withSetup(() => useResizablePanel());

    // Renamed from controlsExpanded (lyt-w2-presence, migration 75 -> 76).
    expect(store.session.ui.lytPresence.controlPanel).toBe(true);
    // No longer undefined/flex-fill — the explicit default (init-vs-drag
    // divergence fix) takes over the instant the row is measured.
    const wrapperPx = panel.effectiveTreeControlRegionWidthPx.value;
    expect(wrapperPx).toBe(computeTreeControlRegionDefaultWidthPx(rowWidthPx));

    // The height-cap self-disables (same guard as the explicit-drag
    // case below) — #board-area absorbs literally everything the
    // wrapper default didn't claim, height-bound or not, exactly what a
    // settled OUTER-bar drag already produced.
    expect(panel.boardAreaMaxWidthPx.value).toBeUndefined();

    const boardComplementPx = rowWidthPx - (wrapperPx as number) - RESIZER_WIDTH_PX;
    expect(boardComplementPx + (wrapperPx as number) + RESIZER_WIDTH_PX).toBe(rowWidthPx); // no slack
    expect(boardComplementPx).toBeGreaterThanOrEqual(MIN_BOARD_PX);
  });

  it('width-bound geometry (a row taller than it is wide) is likewise governed by the same explicit default — the cap remains disabled regardless of rowHeightPx once measured', () => {
    const rowWidthPx = 1200;
    const rowHeightPx = 5000; // taller than the row is wide
    mountSplitWorkspace(rowWidthPx, rowHeightPx);
    const panel = withSetup(() => useResizablePanel());

    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(computeTreeControlRegionDefaultWidthPx(rowWidthPx));
    expect(panel.boardAreaMaxWidthPx.value).toBeUndefined();
  });

  it('an explicit (dragged or restored) treeControlRegionWidthPx disables the cap entirely — the user\'s own drag settings still win, same guard the never-dragged default above also engages', () => {
    store.session.ui.treeControlRegionWidthPx = 500; // an explicit, already-sane width
    mountSplitWorkspace(2400, 900);
    const panel = withSetup(() => useResizablePanel());

    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(500); // explicit-width branch engaged
    expect(panel.boardAreaMaxWidthPx.value).toBeUndefined(); // cap does not apply
  });

  it('lytPresence.controlPanel false disables the cap — no competing #tree-control-wrapper flex-grow party to hand slack to (renamed from controlsExpanded, lyt-w2-presence)', () => {
    store.session.ui.lytPresence.controlPanel = false;
    mountSplitWorkspace(2400, 900);
    const panel = withSetup(() => useResizablePanel());

    expect(panel.boardAreaMaxWidthPx.value).toBeUndefined();
  });

  it('not yet measured (rowHeightPx still 0, mirrors the pre-ResizeObserver-attach window) does not spuriously cap the board to its floor — the ONE window this cap (and the flex-fill CSS branch it pairs with) still governs', () => {
    // No mountSplitWorkspace call: #split-workspace never appears, so
    // the composable's row observer never attaches and rowWidthPx/
    // rowHeightPx stay 0 — effectiveTreeControlRegionWidthPx's own
    // `rowWidthPx.value <= 0` branch passes the (here undefined) raw
    // value through unmodified, so this is the one case where it's
    // still `undefined` and the height-cap's guard still reaches
    // computeBoardAreaMaxWidthPx — which itself returns undefined for
    // an unmeasured rowHeightPx.
    const panel = withSetup(() => useResizablePanel());
    expect(panel.effectiveTreeControlRegionWidthPx.value).toBeUndefined();
    expect(panel.boardAreaMaxWidthPx.value).toBeUndefined();
  });
});
