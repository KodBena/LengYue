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

describe('ui-5-3, superseded by sovereignty (dispatch L3): hydrating a wide-viewport width on a narrow one is DIAGNOSED, never resisted', () => {
  it('RED (documents the pre-fix symptom, unchanged since dispatch L3 does not touch the arithmetic fact): the raw persisted value alone gives the board no room on the narrower viewport', () => {
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

  // SUPERSEDED (dispatch L3, SCOPE item 3): this test used to pin
  // `effectiveTreeControlRegionWidthPx` CLAMPING the hydrated value down
  // so the board kept its floor — the exact "resist the drag/restore"
  // shape sovereignty (commissioner ledger rows 2379(3)/2443, "never drag
  // resistance") exists to close. The stored value now wins VERBATIM;
  // `outerRowSovereignDiagnostic` reports the starved board instead of
  // silently absorbing it into a clamp. Old assertion embodied exactly
  // the disease this dispatch cures — updated per SCOPE item 5.
  //
  // Evidentiary condition (ledger row 2511 review, `.claude/dispatch-
  // reports/lyt-disease-repair-review.md`, defect 1): `effectiveTree-
  // ControlRegionWidthPx`, the composable computed this test exercises,
  // is NO LONGER what App.vue reads for the landscape render path —
  // App.vue's own `rootSplitLayout` (consuming `resolveRootSplitLiveLayout`,
  // `state/feasible-layout.ts`) owns that now, and DOES clamp a stored
  // override down to the current geometry's board-floor-reserving
  // ceiling (see that resolver's own "Sovereign (revised)" doc). This
  // test therefore pins the COMPOSABLE's own store-layer contract
  // (still real, still exercised by the OUTER bar's raw pass-through and
  // by portrait, where no root-split concept exists) — it is NOT
  // evidence that a 3490px override renders unclamped on a real
  // landscape screen. `tests/unit/state/feasible-layout.test.ts`'s own
  // "sovereign clamp" describe block is the test that actually pins the
  // live render-path clamp; `tests/integration/lyt-root-split-live.test.ts`
  // proves that resolver's output reaches the real grid track.
  it('GREEN (sovereignty, composable/store layer only — see the evidentiary condition above): effectiveTreeControlRegionWidthPx passes the hydrated value through VERBATIM; outerRowSovereignDiagnostic reports the starved board instead', () => {
    updateFromRemote({
      schemaVersion: 67,
      activeBoardIndex: 0,
      boards: [],
      profile: {},
      session: { ui: { treeControlRegionWidthPx: 3490 } },
    } as any);

    mountSplitWorkspace(1024);
    const panel = withSetup(() => useResizablePanel());

    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(3490);
    const diagnostics = panel.outerRowSovereignDiagnostic.value;
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].location).toBe('wrapper');
    expect(diagnostics[0].starved.map((s) => s.region)).toEqual(['board']);
    expect(diagnostics[0].message).toContain('board');
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
  it('a composable mounted BEFORE the element exists still resolves VERBATIM (sovereignty) once the workspace loads, and the starvation is diagnosed', async () => {
    store.session.ui.treeControlRegionWidthPx = 5000; // starves a 1024 row's board

    // No #split-workspace in the DOM yet (loading state).
    store.workspaceLoadState = { kind: 'loading' } as any;
    const panel = withSetup(() => useResizablePanel());

    // Pre-load: geometry unknown — the raw value passes through
    // (finite-guarded), NOT a clamp against a fantasy 0-width row.
    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(5000);
    expect(panel.outerRowSovereignDiagnostic.value).toEqual([]); // nothing to diagnose pre-measurement

    // Workspace loads; element appears; watcher attaches next tick.
    mountSplitWorkspace(1024);
    store.workspaceLoadState = { kind: 'loaded' } as any;
    await nextTick(); // watcher fires
    await nextTick(); // attach callback's own nextTick

    // Sovereignty (dispatch L3): the value is UNCHANGED by measurement —
    // no clamp against the real row now, only a diagnostic.
    expect(panel.effectiveTreeControlRegionWidthPx.value).toBe(5000);
    expect(panel.outerRowSovereignDiagnostic.value.length).toBe(1);
    expect(panel.outerRowSovereignDiagnostic.value[0].starved[0].region).toBe('board');
  });

  it('pre-load pass-through still refuses non-finite persisted values', () => {
    store.session.ui.treeControlRegionWidthPx = Number.NaN;
    store.workspaceLoadState = { kind: 'loading' } as any;
    const panel = withSetup(() => useResizablePanel());
    expect(panel.effectiveTreeControlRegionWidthPx.value).toBeUndefined();
  });
});

// HISTORICAL, deleted by dispatch L3 (`.claude/dispatch-reports/
// lyt-space-owner-spec.md` §3 step 3): `freshTreeControlWrapperFloorPx`
// (the flex-era first-paint floor for App.vue's never-dragged
// `flex: '1 1 0'` branch) is DELETED — CSS-Grid tracks (LytNode.vue, W3)
// already took over sizing this region before this dispatch; the
// function's own return value (`useResizablePanel()`'s
// `freshTreeControlWrapperMinWidthPx`) had no App.vue reader. Full text
// transcribed in `.claude/dispatch-reports/lyt-space-owner-l3-build.md`'s
// "Transcribed disclosures" section, per ADR-0002 Rule 6.


// HISTORICAL, deleted by dispatch L3: `computeBoardAreaMaxWidthPx` /
// `boardAreaMaxWidthPx` (the commission-row-848 `#board-area` max-width
// cap) are DELETED — already unconsumed by App.vue since the W3
// CSS-Grid rewire. Full text transcribed in `.claude/dispatch-reports/
// lyt-space-owner-l3-build.md`'s "Transcribed disclosures" section.
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

