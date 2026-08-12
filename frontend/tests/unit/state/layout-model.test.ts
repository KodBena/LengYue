/**
 * tests/unit/state/layout-model.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/state/layout-model.ts` — the
 * resolution-roadmap Phase 0/1 `LayoutClass` type and its declared-data
 * policy. No DOM, no store, no Vue component mount: `deriveAxis`,
 * `deriveWidthClass`, `deriveLayoutClass`, `computeControlPanelMinWidthPx`,
 * and `computeForestNarrowThresholdPx` are all pure functions of their
 * own arguments, exported specifically so this module's derivations are
 * testable without mounting anything (mirrors
 * `useResizablePanel.test.ts`'s own tier-1 shape for the drag math).
 *
 * `useDeferredLayoutClass` (the reactive composable, Phase 1's App.vue
 * consumer) is exercised separately in
 * `tests/integration/state/layout-model-deferred.test.ts` — it needs
 * real Vue reactivity (`ref`/`watch`) the way
 * `useDeferredContainerBreakpoint.test.ts` exercises its sibling
 * composable, so it belongs in the integration tier, not here.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import {
  deriveAxis,
  deriveWidthClass,
  deriveLayoutClass,
  AXIS_ASPECT_RATIO_THRESHOLD,
  nearestScreenClassId,
  evaluateScreenClassId,
  LYT_SCREEN_CLASSES,
  SCREEN_CLASS_LOG_ASPECT_HYSTERESIS,
  WIDTH_CLASS_MAX_PX,
  CONTROL_PANEL_TAB_IDS,
  TAB_STRIP_PER_TAB_WIDTH_PX,
  TAB_STRIP_GAP_PX,
  computeControlPanelMinWidthPx,
  CONTROL_PANEL_MIN_WIDTH_PX,
  TREE_PANEL_MIN_WIDTH_PX,
  RESIZER_WIDTH_PX,
  WRAPPER_MIN_WIDTH_PX,
  getPanelGeometryPolicy,
  PANEL_GEOMETRY_POLICY_BY_WIDTH_CLASS,
  FOREST_LEFT_PANEL_NATURAL_WIDTH_PX,
  FOREST_TREE_USABLE_FLOOR_PX,
  computeForestNarrowThresholdPx,
  FOREST_NARROW_THRESHOLD_PX,
  PANEL_CONTENT_READING_MEASURE_CH,
  getPanelContentPolicy,
  PANEL_CONTENT_POLICY_BY_WIDTH_CLASS,
  TREE_PANEL_DEFAULT_WIDTH_FRACTION,
  computeTreePanelDefaultWidthPx,
  computeTreePanelBoundWidth,
  computeUnsetWrapperMaxWidthCss,
  MIN_BOARD_PX,
  TREE_CONTROL_REGION_DEFAULT_WIDTH_FRACTION,
  computeTreeControlRegionDefaultWidthPx,
  TREE_CONTROL_WRAPPER_ROW_GAP_PX,
  computeTreePanelClampedWidthPx,
  resolveWidthConditionalPresence,
  clampTreeWidthForSideColumn,
} from '../../../src/state/layout-model';
import type { LytDemotion, LytTrackShape } from '../../../src/state/lyt-layout-types';

describe('deriveAxis — row/column split, now derived from nearestScreenClassId (W3)', () => {
  it('stays row when width/height is well above the threshold (a wide desktop window)', () => {
    expect(deriveAxis(1920, 1080)).toBe('row');
  });

  it('flips to column when width/height is well below the threshold (a portrait monitor / half-screen tile)', () => {
    expect(deriveAxis(900, 1400)).toBe('column');
  });

  it('a perfectly square window (ratio 1) is row — nearestScreenClassId\'s own boundary (equidistant from both classes\' log-aspect) resolves ties to the FIRST-listed class, landscape', () => {
    expect(deriveAxis(1000, 1000)).toBe('row');
  });

  it('unmeasured or degenerate geometry (zero, negative, NaN, Infinity) defaults to row rather than guessing column', () => {
    expect(deriveAxis(0, 0)).toBe('row');
    expect(deriveAxis(-100, 500)).toBe('row');
    expect(deriveAxis(500, 0)).toBe('row');
    expect(deriveAxis(Number.NaN, 500)).toBe('row');
    expect(deriveAxis(500, Number.NaN)).toBe('row');
    expect(deriveAxis(Number.POSITIVE_INFINITY, 500)).toBe('row');
  });
});

describe('nearestScreenClassId — LYT SPEC.md §6 nearest-neighbor over the two registered classes (W3)', () => {
  it('the two representative points are exactly research/lyt/runner.py\'s own registration (1920x1080 / 1080x1920)', () => {
    expect(LYT_SCREEN_CLASSES).toEqual([
      { id: 'landscape', wPx: 1920, hPx: 1080 },
      { id: 'portrait', wPx: 1080, hPx: 1920 },
    ]);
  });

  it('an exact representative point resolves to its own class', () => {
    expect(nearestScreenClassId(1920, 1080)).toBe('landscape');
    expect(nearestScreenClassId(1080, 1920)).toBe('portrait');
  });

  it('scale-invariance: a half-tile and a large monitor with the SAME aspect ratio resolve identically', () => {
    expect(nearestScreenClassId(900, 1400)).toBe(nearestScreenClassId(2400, 3600));
    expect(nearestScreenClassId(1600, 900)).toBe(nearestScreenClassId(3840, 2160));
  });

  it('a square window (w === h, log-aspect 0) is equidistant from both classes — resolves to the first-listed (landscape), not a throw or a guess', () => {
    expect(nearestScreenClassId(1000, 1000)).toBe('landscape');
  });

  it('non-finite/non-positive geometry defaults to landscape, matching deriveAxis\'s own not-yet-measured convention', () => {
    expect(nearestScreenClassId(0, 0)).toBe('landscape');
    expect(nearestScreenClassId(-100, 500)).toBe('landscape');
    expect(nearestScreenClassId(Number.NaN, 500)).toBe('landscape');
    expect(nearestScreenClassId(Number.POSITIVE_INFINITY, 500)).toBe('landscape');
  });
});

describe('evaluateScreenClassId — hysteresis around the nearest-neighbor boundary (W3)', () => {
  it('a ratio just inside the band, entering from landscape, stays landscape', () => {
    // log-aspect just below 0 (ratio just under 1) — inside the +-0.04 half-band.
    const heightPx = 10000;
    const widthPx = Math.round(heightPx * Math.exp(-SCREEN_CLASS_LOG_ASPECT_HYSTERESIS / 4));
    expect(evaluateScreenClassId(widthPx, heightPx, 'landscape')).toBe('landscape');
  });

  it('a ratio just inside the band, entering from portrait, stays portrait', () => {
    const heightPx = 10000;
    const widthPx = Math.round(heightPx * Math.exp(SCREEN_CLASS_LOG_ASPECT_HYSTERESIS / 4));
    expect(evaluateScreenClassId(widthPx, heightPx, 'portrait')).toBe('portrait');
  });

  it('a ratio well past the band flips regardless of the previous class', () => {
    expect(evaluateScreenClassId(1920, 1080, 'portrait')).toBe('landscape');
    expect(evaluateScreenClassId(1080, 1920, 'landscape')).toBe('portrait');
  });
});

describe('deriveWidthClass — compact/standard/wide/vast from absolute width', () => {
  it('classifies each declared band correctly, including its own boundary', () => {
    expect(deriveWidthClass(320)).toBe('compact');
    expect(deriveWidthClass(WIDTH_CLASS_MAX_PX.compact)).toBe('compact');
    expect(deriveWidthClass(WIDTH_CLASS_MAX_PX.compact + 1)).toBe('standard');
    expect(deriveWidthClass(WIDTH_CLASS_MAX_PX.standard)).toBe('standard');
    expect(deriveWidthClass(WIDTH_CLASS_MAX_PX.standard + 1)).toBe('wide');
    expect(deriveWidthClass(WIDTH_CLASS_MAX_PX.wide)).toBe('wide');
    expect(deriveWidthClass(WIDTH_CLASS_MAX_PX.wide + 1)).toBe('vast');
    expect(deriveWidthClass(3840)).toBe('vast');
  });

  it('non-finite or non-positive width degrades to the narrowest class rather than throwing/NaN-ing', () => {
    expect(deriveWidthClass(0)).toBe('compact');
    expect(deriveWidthClass(-50)).toBe('compact');
    expect(deriveWidthClass(Number.NaN)).toBe('compact');
  });
});

describe('deriveLayoutClass — the discriminated LayoutClass, composed', () => {
  it('composes axis, width, and screenClassId independently (a narrow-but-wide-ratio and a vast-but-tall-ratio window)', () => {
    // WIDTH_CLASS_MAX_PX.wide === 1920, inclusive; screenClassId (W3) is
    // the nearest-neighbor derivation axis is now DERIVED from.
    expect(deriveLayoutClass(1920, 1080)).toEqual({ axis: 'row', width: 'wide', screenClassId: 'landscape' });
    expect(deriveLayoutClass(2400, 1080)).toEqual({ axis: 'row', width: 'vast', screenClassId: 'landscape' });
    expect(deriveLayoutClass(700, 1200)).toEqual({ axis: 'column', width: 'compact', screenClassId: 'portrait' });
  });
});

describe('CONTROL_PANEL_TAB_IDS -> CONTROL_PANEL_MIN_WIDTH_PX — audit finding R2\'s fix', () => {
  it('CONTROL_PANEL_MIN_WIDTH_PX is exactly the tab registry\'s length projected through the formula, not a hand literal', () => {
    expect(CONTROL_PANEL_MIN_WIDTH_PX).toBe(
      CONTROL_PANEL_TAB_IDS.length * TAB_STRIP_PER_TAB_WIDTH_PX + TAB_STRIP_GAP_PX,
    );
  });

  it('the registry has five tabs today (R2: the old hand literal was computed for four)', () => {
    expect(CONTROL_PANEL_TAB_IDS.length).toBe(5);
  });

  it('computeControlPanelMinWidthPx grows monotonically with tab count — a sixth tab moves the floor by construction', () => {
    const fiveTabsPx = computeControlPanelMinWidthPx(5);
    const sixTabsPx = computeControlPanelMinWidthPx(6);
    expect(sixTabsPx).toBeGreaterThan(fiveTabsPx);
    expect(sixTabsPx - fiveTabsPx).toBe(TAB_STRIP_PER_TAB_WIDTH_PX);
  });

  it('G10 fix (opus-uiux-geometry-consult.md): the floor for the CURRENT 5-tab strip clears the WITNESSED natural content need (271.8px, geo-d-overflow-build.md geometry probe) with margin — the old 270px floor sat fractionally BELOW that need, which is exactly what let the last tab clip before TabWidget.vue\'s own overflow-x:auto (R2) ever got a chance to engage', () => {
    const WITNESSED_FIVE_TAB_NATURAL_CONTENT_WIDTH_PX = 271.8;
    expect(CONTROL_PANEL_MIN_WIDTH_PX).toBeGreaterThan(WITNESSED_FIVE_TAB_NATURAL_CONTENT_WIDTH_PX);
  });

  it('computeControlPanelMinWidthPx(4) now exceeds the OLD hand literal (220) — G10 raised the per-tab/gap constants, so the pre-fix reverse-derivation no longer reproduces verbatim (by design: 220 was already shown too tight for real rendered labels)', () => {
    expect(computeControlPanelMinWidthPx(4)).toBeGreaterThan(220);
  });
});

describe('WRAPPER_MIN_WIDTH_PX — still derived, not independently chosen (moved here from useResizablePanel.ts)', () => {
  it('equals TREE_PANEL_MIN_WIDTH_PX + RESIZER_WIDTH_PX + CONTROL_PANEL_MIN_WIDTH_PX', () => {
    expect(WRAPPER_MIN_WIDTH_PX).toBe(TREE_PANEL_MIN_WIDTH_PX + RESIZER_WIDTH_PX + CONTROL_PANEL_MIN_WIDTH_PX);
  });
});

describe('getPanelGeometryPolicy / PANEL_GEOMETRY_POLICY_BY_WIDTH_CLASS — declared data keyed by LayoutClass', () => {
  it('every width class has its own policy entry (all four keys present)', () => {
    expect(Object.keys(PANEL_GEOMETRY_POLICY_BY_WIDTH_CLASS).sort()).toEqual(
      ['compact', 'standard', 'vast', 'wide'].sort(),
    );
  });

  it('getPanelGeometryPolicy looks up strictly by the LayoutClass.width facet (axis does not affect the result)', () => {
    const rowCompact = getPanelGeometryPolicy({ axis: 'row', width: 'compact' });
    const columnCompact = getPanelGeometryPolicy({ axis: 'column', width: 'compact' });
    expect(rowCompact).toBe(columnCompact);
  });

  it('the policy exposes CONTROL_PANEL_MIN_WIDTH_PX and the other named floors consistently with their individual exports', () => {
    const policy = getPanelGeometryPolicy({ axis: 'row', width: 'wide' });
    expect(policy.controlPanelMinWidthPx).toBe(CONTROL_PANEL_MIN_WIDTH_PX);
    expect(policy.treePanelMinWidthPx).toBe(TREE_PANEL_MIN_WIDTH_PX);
    expect(policy.resizerWidthPx).toBe(RESIZER_WIDTH_PX);
    expect(policy.wrapperMinWidthPx).toBe(WRAPPER_MIN_WIDTH_PX);
  });
});

describe('computeForestNarrowThresholdPx — ForestDirectory\'s 479px, re-derived from content facts', () => {
  it('FOREST_NARROW_THRESHOLD_PX equals the declared left-panel width + tree usable floor, minus one', () => {
    expect(FOREST_NARROW_THRESHOLD_PX).toBe(
      computeForestNarrowThresholdPx(FOREST_LEFT_PANEL_NATURAL_WIDTH_PX, FOREST_TREE_USABLE_FLOOR_PX),
    );
  });

  it('reproduces the exact pre-existing literal (479) from the exact pre-existing content facts (280 + 200)', () => {
    expect(computeForestNarrowThresholdPx(280, 200)).toBe(479);
  });

  it('moves when either content fact moves — the whole point of naming them instead of hand-writing the sum', () => {
    expect(computeForestNarrowThresholdPx(300, 200)).toBe(499);
    expect(computeForestNarrowThresholdPx(280, 220)).toBe(499);
  });
});

describe('getPanelContentPolicy / PANEL_CONTENT_POLICY_BY_WIDTH_CLASS — Phase 3, audit finding R3', () => {
  it('every width class has its own policy entry (all four keys present)', () => {
    expect(Object.keys(PANEL_CONTENT_POLICY_BY_WIDTH_CLASS).sort()).toEqual(
      ['compact', 'standard', 'vast', 'wide'].sort(),
    );
  });

  it('compact/standard stay single-column; wide/vast reflow to two columns', () => {
    expect(getPanelContentPolicy({ axis: 'row', width: 'compact' }).twoColumnReflow).toBe(false);
    expect(getPanelContentPolicy({ axis: 'row', width: 'standard' }).twoColumnReflow).toBe(false);
    expect(getPanelContentPolicy({ axis: 'row', width: 'wide' }).twoColumnReflow).toBe(true);
    expect(getPanelContentPolicy({ axis: 'row', width: 'vast' }).twoColumnReflow).toBe(true);
  });

  it('every width class carries the SAME declared reading measure — one figure, not four independently-tuned ones', () => {
    for (const width of ['compact', 'standard', 'wide', 'vast'] as const) {
      expect(getPanelContentPolicy({ axis: 'row', width }).readingMeasureCh).toBe(PANEL_CONTENT_READING_MEASURE_CH);
    }
  });

  it('axis does not affect the result (looked up strictly by the width facet, mirrors getPanelGeometryPolicy)', () => {
    const rowWide = getPanelContentPolicy({ axis: 'row', width: 'wide' });
    const columnWide = getPanelContentPolicy({ axis: 'column', width: 'wide' });
    expect(rowWide).toBe(columnWide);
  });
});

describe('computeTreePanelDefaultWidthPx — Phase 3, audit finding R5 ("stuck at 140px on any screen")', () => {
  it('given a workspace width where the fraction exceeds the floor, returns the declared fraction of it', () => {
    // 2000 * 0.12 = 240, comfortably above the 140px floor.
    expect(computeTreePanelDefaultWidthPx(2000)).toBe(
      Math.round(2000 * TREE_PANEL_DEFAULT_WIDTH_FRACTION),
    );
  });

  it('clamps to TREE_PANEL_MIN_WIDTH_PX on a narrow workspace where the fraction undershoots the floor', () => {
    // 768 * 0.12 ≈ 92px, well under the 140px floor.
    expect(computeTreePanelDefaultWidthPx(768)).toBe(TREE_PANEL_MIN_WIDTH_PX);
  });

  it('grows past the old fixed 140px on a vast (4K-class) workspace — the R5 fix itself', () => {
    const at4k = computeTreePanelDefaultWidthPx(3840);
    expect(at4k).toBeGreaterThan(TREE_PANEL_MIN_WIDTH_PX);
    expect(at4k).toBe(Math.round(3840 * TREE_PANEL_DEFAULT_WIDTH_FRACTION));
  });

  it('non-finite or non-positive workspace width (not yet measured) degrades to the floor, not a guess', () => {
    expect(computeTreePanelDefaultWidthPx(0)).toBe(TREE_PANEL_MIN_WIDTH_PX);
    expect(computeTreePanelDefaultWidthPx(-100)).toBe(TREE_PANEL_MIN_WIDTH_PX);
    expect(computeTreePanelDefaultWidthPx(Number.NaN)).toBe(TREE_PANEL_MIN_WIDTH_PX);
    expect(computeTreePanelDefaultWidthPx(Number.POSITIVE_INFINITY)).toBe(TREE_PANEL_MIN_WIDTH_PX);
  });
});

describe('computeTreePanelBoundWidth — App.vue\'s extracted :style width decision (review follow-up, ledger rows 929/926)', () => {
  it('property (a): a stored width wins VERBATIM over the fraction default, for ANY workspace width, including extremes', () => {
    const storedWidthPx = 314;
    for (const workspaceWidthPx of [0, 1, 140, 768, 1280, 1920, 3840, 10000, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        computeTreePanelBoundWidth({ axisColumn: false, storedWidthPx, workspaceWidthPx }),
      ).toEqual({ mode: 'fixed', widthPx: storedWidthPx });
    }
  });

  it('property (a), a second stored value, to rule out 314 being coincidentally special', () => {
    const storedWidthPx = TREE_PANEL_MIN_WIDTH_PX; // the floor value itself — a stored width AT the floor still wins verbatim, not re-derived
    for (const workspaceWidthPx of [50, 3840]) {
      expect(
        computeTreePanelBoundWidth({ axisColumn: false, storedWidthPx, workspaceWidthPx }),
      ).toEqual({ mode: 'fixed', widthPx: storedWidthPx });
    }
  });

  it('property (b): stored undefined -> the fraction default, clamped to the floor', () => {
    expect(computeTreePanelBoundWidth({ axisColumn: false, storedWidthPx: undefined, workspaceWidthPx: 3840 })).toEqual({
      mode: 'fixed',
      widthPx: computeTreePanelDefaultWidthPx(3840),
    });
    // A narrow workspace where the fraction undershoots — the floor wins.
    expect(computeTreePanelBoundWidth({ axisColumn: false, storedWidthPx: undefined, workspaceWidthPx: 768 })).toEqual({
      mode: 'fixed',
      widthPx: TREE_PANEL_MIN_WIDTH_PX,
    });
  });

  it('property (c): axisColumn -> full-width mode regardless of a stored value', () => {
    expect(computeTreePanelBoundWidth({ axisColumn: true, storedWidthPx: 314, workspaceWidthPx: 3840 })).toEqual({
      mode: 'full',
    });
    expect(computeTreePanelBoundWidth({ axisColumn: true, storedWidthPx: undefined, workspaceWidthPx: 3840 })).toEqual({
      mode: 'full',
    });
  });

  it('property (c), continued: returning to row axis re-yields the SAME stored value untouched — the axis flip never rewrites it', () => {
    const storedWidthPx = 500;
    // Simulates the sequence App.vue's live `treePanelBoundWidth` computed
    // walks through on an axis flip: row -> column -> row. The caller
    // (App.vue) never re-derives `storedWidthPx` from this function's own
    // output — it always re-reads the SAME session.ui.treePanelWidthPx —
    // so this asserts the function's own side of that contract: it never
    // substitutes a different width for the column-axis leg, and the
    // row-axis result is identical before and after.
    const beforeFlip = computeTreePanelBoundWidth({ axisColumn: false, storedWidthPx, workspaceWidthPx: 1920 });
    const duringColumnAxis = computeTreePanelBoundWidth({ axisColumn: true, storedWidthPx, workspaceWidthPx: 1920 });
    const afterFlipBack = computeTreePanelBoundWidth({ axisColumn: false, storedWidthPx, workspaceWidthPx: 1920 });

    expect(beforeFlip).toEqual({ mode: 'fixed', widthPx: storedWidthPx });
    expect(duringColumnAxis).toEqual({ mode: 'full' });
    expect(afterFlipBack).toEqual(beforeFlip);
  });
});

describe('computeUnsetWrapperMaxWidthCss — Phase 3, audit finding R3 (surplus flows back to the board)', () => {
  it('composes a calc() string mixing the px facts and the ch reading measure', () => {
    expect(computeUnsetWrapperMaxWidthCss(200, RESIZER_WIDTH_PX, PANEL_CONTENT_READING_MEASURE_CH)).toBe(
      `calc(200px + ${RESIZER_WIDTH_PX}px + ${PANEL_CONTENT_READING_MEASURE_CH}ch)`,
    );
  });

  it('reflects the tree-default input directly — never independently re-derives it', () => {
    const treeDefault = computeTreePanelDefaultWidthPx(3840);
    const css = computeUnsetWrapperMaxWidthCss(treeDefault, RESIZER_WIDTH_PX, PANEL_CONTENT_READING_MEASURE_CH);
    expect(css).toContain(`${treeDefault}px`);
  });
});

describe('computeTreeControlRegionDefaultWidthPx — init-vs-drag divergence fix (ledger rows 1505/1510)', () => {
  // The property this whole fix exists for: given a viewport width and
  // NO stored positions, #board-area (uncapped, absorbing whatever
  // the wrapper's default did not claim — see
  // useResizablePanel.ts's `effectiveTreeControlRegionWidthPx` and
  // `boardAreaMaxWidthPx`) plus the resizer plus this wrapper default
  // sum to EXACTLY the row width — no slack left unclaimed the way the
  // reported defect (unused band right of the control panel) left it.
  // `#board-area`'s own rendered width is not itself a pure function
  // exported anywhere (it is CSS flex-fill, not JS-computed) — its
  // value IS the complement by construction once uncapped, so the
  // complement is what this test computes and sums back against the
  // row width, across a sweep of plausible viewport widths.
  it('the wrapper default + a resizer + the board complement sum to exactly the row width (no slack), across a width sweep', () => {
    for (const rowWidthPx of [768, 1024, 1280, 1366, 1440, 1600, 1920, 2560, 3440, 3840]) {
      const wrapperPx = computeTreeControlRegionDefaultWidthPx(rowWidthPx);
      const boardComplementPx = rowWidthPx - wrapperPx - RESIZER_WIDTH_PX;
      expect(wrapperPx + RESIZER_WIDTH_PX + boardComplementPx).toBe(rowWidthPx);
      // The board complement never drops below its own floor — the
      // wrapper default never over-claims into the board's protected
      // minimum.
      expect(boardComplementPx).toBeGreaterThanOrEqual(MIN_BOARD_PX);
    }
  });

  it('never claims less than WRAPPER_MIN_WIDTH_PX — the wrapper\'s own content floor', () => {
    // A narrow viewport where the fraction alone would compute well
    // under the content floor.
    expect(computeTreeControlRegionDefaultWidthPx(400)).toBe(WRAPPER_MIN_WIDTH_PX);
  });

  it('never claims more than would leave the board under MIN_BOARD_PX, on a very narrow viewport', () => {
    const rowWidthPx = WRAPPER_MIN_WIDTH_PX; // narrower than any real board+wrapper split could satisfy comfortably
    const wrapperPx = computeTreeControlRegionDefaultWidthPx(rowWidthPx);
    // Degrades gracefully — clamped to whichever of the two bounds
    // actually governs (mirrors computePaneWidthPx's own graceful
    // degradation for an over-constrained viewport).
    expect(wrapperPx).toBeGreaterThanOrEqual(WRAPPER_MIN_WIDTH_PX);
  });

  it('grows with the row width — a vast 4K workspace gets a generously-sized region, not the bare content floor', () => {
    const compact = computeTreeControlRegionDefaultWidthPx(768);
    const vast = computeTreeControlRegionDefaultWidthPx(3840);
    expect(vast).toBeGreaterThan(compact);
    expect(vast).toBe(Math.round(3840 * TREE_CONTROL_REGION_DEFAULT_WIDTH_FRACTION));
  });

  it('non-finite/non-positive input degrades to WRAPPER_MIN_WIDTH_PX, same convention as this module\'s other derive*/compute* functions', () => {
    expect(computeTreeControlRegionDefaultWidthPx(0)).toBe(WRAPPER_MIN_WIDTH_PX);
    expect(computeTreeControlRegionDefaultWidthPx(-100)).toBe(WRAPPER_MIN_WIDTH_PX);
    expect(computeTreeControlRegionDefaultWidthPx(NaN)).toBe(WRAPPER_MIN_WIDTH_PX);
    expect(computeTreeControlRegionDefaultWidthPx(Infinity)).toBe(WRAPPER_MIN_WIDTH_PX);
  });
});

describe('computeTreePanelClampedWidthPx — W3-fix corrective, the 900x600 clipping regression (lyt-w3-resizers-review.md §2)', () => {
  it('passes the natural width through unchanged when it already fits the region', () => {
    // A never-dragged default (140) comfortably fits any region wide
    // enough to also hold CONTROL_PANEL_MIN_WIDTH_PX + two row gaps.
    const regionWidthPx = TREE_PANEL_MIN_WIDTH_PX + CONTROL_PANEL_MIN_WIDTH_PX + TREE_CONTROL_WRAPPER_ROW_GAP_PX * 2 + 50;
    expect(computeTreePanelClampedWidthPx(TREE_PANEL_MIN_WIDTH_PX, regionWidthPx)).toBe(TREE_PANEL_MIN_WIDTH_PX);
  });

  it('reproduces the reviewed 900x600 regression numbers: a 347px dragged tree width in a 599px region clamps to leave the control panel its own floor', () => {
    // The exact numbers the review's own live measurement produced
    // (`.claude/dispatch-reports/lyt-w3-resizers-review.md` §2):
    // treePanelWidthPx dragged to 347 at a wide viewport, carried
    // verbatim into a 900x600 session where
    // effectiveTreeControlRegionWidthPx (the OUTER region, already
    // clamped by sanitizeTreeControlRegionWidthPx) sanitizes down to
    // 599. Pre-fix, App.vue rendered the wrapper at 347 (tree) + 300
    // (control panel floor) + gaps > 599, clipping #control-panel by
    // ~52px. Post-fix, the tree clamps down so the total fits.
    const naturalWidthPx = 347;
    const regionWidthPx = 599;
    const clamped = computeTreePanelClampedWidthPx(naturalWidthPx, regionWidthPx);
    expect(clamped).toBeLessThan(naturalWidthPx);
    expect(clamped + CONTROL_PANEL_MIN_WIDTH_PX + TREE_CONTROL_WRAPPER_ROW_GAP_PX * 2).toBeLessThanOrEqual(regionWidthPx);
  });

  it('never shrinks the tree panel below its own drag floor (TREE_PANEL_MIN_WIDTH_PX), even in an over-constrained region', () => {
    const clamped = computeTreePanelClampedWidthPx(1000, TREE_PANEL_MIN_WIDTH_PX);
    expect(clamped).toBe(TREE_PANEL_MIN_WIDTH_PX);
  });

  it('a smaller natural width than the available room is never grown — this clamps down only, never up', () => {
    const regionWidthPx = 2000; // far more room than needed
    expect(computeTreePanelClampedWidthPx(TREE_PANEL_MIN_WIDTH_PX, regionWidthPx)).toBe(TREE_PANEL_MIN_WIDTH_PX);
  });

  it('regionWidthPx undefined or not-yet-measured (<=0/non-finite) passes naturalWidthPx through unclamped', () => {
    expect(computeTreePanelClampedWidthPx(347, undefined)).toBe(347);
    expect(computeTreePanelClampedWidthPx(347, 0)).toBe(347);
    expect(computeTreePanelClampedWidthPx(347, -10)).toBe(347);
    expect(computeTreePanelClampedWidthPx(347, NaN)).toBe(347);
  });
});

/**
 * resolveWidthConditionalPresence — LYT finish-pass wave A completion
 * pass (2026-08-13 dated section, `.claude/dispatch-reports/
 * lyt-wA-width-demotion.md`), closing a disclosed gap from the original
 * wave's own §8 ("not independently unit-tested in this wave"). Every
 * branch is exercised directly, with expectations derived from the
 * function's own documented contract (module header, "Finish-pass wave
 * A: width-conditional demotion") rather than by re-reading its
 * implementation — a demote-null pass-through, a not-yet-measured
 * pass-through, the fits/doesn't-fit boundary (>= wins, matching the
 * compiled program's own >= semantics), and the two user-sovereignty
 * directions (an explicit 'visible' choice the width can't grant is
 * demoted anyway — the `forcedAbsent` disclosure case — but width never
 * promotes a 'hidden' choice to visible).
 */
describe('resolveWidthConditionalPresence — LYT finish-pass wave A (width-conditional demotion)', () => {
  const LANDSCAPE_CONTROL_PANEL_DEMOTE: LytDemotion = { axis: 'h', belowPx: 778 };

  it('demote === null: desiredVisible passes through unchanged, both directions', () => {
    expect(resolveWidthConditionalPresence(300, null, true)).toBe(true);
    expect(resolveWidthConditionalPresence(300, null, false)).toBe(false);
    expect(resolveWidthConditionalPresence(9999, null, true)).toBe(true);
  });

  it('measuredWidthPx <= 0 (not yet measured): desiredVisible passes through unchanged, even with a real demote declared', () => {
    expect(resolveWidthConditionalPresence(0, LANDSCAPE_CONTROL_PANEL_DEMOTE, true)).toBe(true);
    expect(resolveWidthConditionalPresence(-1, LANDSCAPE_CONTROL_PANEL_DEMOTE, true)).toBe(true);
    expect(resolveWidthConditionalPresence(0, LANDSCAPE_CONTROL_PANEL_DEMOTE, false)).toBe(false);
  });

  it('above the threshold: fits, desiredVisible wins verbatim (both true and false)', () => {
    expect(resolveWidthConditionalPresence(900, LANDSCAPE_CONTROL_PANEL_DEMOTE, true)).toBe(true);
    expect(resolveWidthConditionalPresence(900, LANDSCAPE_CONTROL_PANEL_DEMOTE, false)).toBe(false);
  });

  it('exactly AT the threshold: >= is inclusive — fits, same as above-threshold', () => {
    expect(resolveWidthConditionalPresence(778, LANDSCAPE_CONTROL_PANEL_DEMOTE, true)).toBe(true);
  });

  it('one px below the threshold: does not fit — demoted regardless of desiredVisible', () => {
    expect(resolveWidthConditionalPresence(777, LANDSCAPE_CONTROL_PANEL_DEMOTE, true)).toBe(false);
    expect(resolveWidthConditionalPresence(777, LANDSCAPE_CONTROL_PANEL_DEMOTE, false)).toBe(false);
  });

  it('user-sovereignty / forcedAbsent case: an explicit \'visible\' choice the width genuinely cannot grant is demoted, not silently honored', () => {
    // This is the exact case App.vue's own `controlPanelForcedAbsent`
    // (desired && !resolved) is built to disclose in the presence menu.
    const resolved = resolveWidthConditionalPresence(500, LANDSCAPE_CONTROL_PANEL_DEMOTE, true);
    expect(resolved).toBe(false);
  });

  it('width narrows a true down to false, but never promotes a false up to true — the "only ever narrows" contract', () => {
    // A user who explicitly hid the panel (desiredVisible false) stays
    // hidden even at a generously wide measurement; width is a ceiling
    // on presence, never a floor that overrides an explicit hide.
    expect(resolveWidthConditionalPresence(5000, LANDSCAPE_CONTROL_PANEL_DEMOTE, false)).toBe(false);
  });

  it('demote.axis !== "h" throws loudly (ADR-0002) rather than silently measuring the wrong axis', () => {
    const verticalDemote: LytDemotion = { axis: 'v', belowPx: 500 };
    expect(() => resolveWidthConditionalPresence(900, verticalDemote, true)).toThrow(/unsupported demote axis/);
  });
});

/**
 * clampTreeWidthForSideColumn — LYT finish-pass wave A completion pass,
 * STOP-and-report item 1 (the 2560x1440 clip). Fixtures mirror the
 * REAL compiled facts read directly off `lyt-layout.gen.ts` (landscape)
 * and `lyt-layout-portrait.gen.ts` (portrait) at authoring time, not
 * re-derived from this module's own implementation — a tautology-proof
 * expectation source, per the commission's own instruction.
 */
describe('clampTreeWidthForSideColumn — LYT finish-pass wave A completion (the 2560x1440 clip)', () => {
  // lyt-layout.gen.ts: controlPanel `{ kind: "fixed", px: 664 }`, tree
  // `{ kind: "elastic", minPx: 110, frWeight: 1 }` — landscape's own
  // compiled facts, read at path "2.3.1"/"2.3.0" respectively.
  const LANDSCAPE_CONTROL_PANEL_TRACK: LytTrackShape = { kind: 'fixed', px: 664 };
  const LANDSCAPE_TREE_TRACK: LytTrackShape = { kind: 'elastic', minPx: 110, frWeight: 1 };
  // lyt-layout-portrait.gen.ts: controlPanel `{ kind: "fixed", px: 664 }`,
  // tree `{ kind: "elastic", minPx: 140, frWeight: 1 }` — path "5.1"/"5.0".
  const PORTRAIT_TREE_TRACK: LytTrackShape = { kind: 'elastic', minPx: 140, frWeight: 1 };

  it('a stored/natural width that already fits the available track is left unchanged (no-op on the common/healthy case)', () => {
    // 2000 - (664 + 4) = 1332, comfortably more than the 200px asked for.
    const clamped = clampTreeWidthForSideColumn(
      200,
      2000,
      true,
      LANDSCAPE_CONTROL_PANEL_TRACK,
      LANDSCAPE_TREE_TRACK,
      TREE_CONTROL_WRAPPER_ROW_GAP_PX,
    );
    expect(clamped).toBe(200);
  });

  it('reproduces the exact reported 2560x1440 clip: 307px natural, 819px measured side column, clamps to exactly 151px (which, plus the panel + one gap, sums to precisely the measured track — no overflow, no slack)', () => {
    const naturalTreeWidthPx = 307;
    const sideColumnWidthPx = 819;
    const clamped = clampTreeWidthForSideColumn(
      naturalTreeWidthPx,
      sideColumnWidthPx,
      true,
      LANDSCAPE_CONTROL_PANEL_TRACK,
      LANDSCAPE_TREE_TRACK,
      TREE_CONTROL_WRAPPER_ROW_GAP_PX,
    );
    expect(clamped).toBeLessThan(naturalTreeWidthPx);
    expect(clamped + LANDSCAPE_CONTROL_PANEL_TRACK.px + TREE_CONTROL_WRAPPER_ROW_GAP_PX).toBe(sideColumnWidthPx);
    expect(clamped).toBe(151);
  });

  it('right at the compiled demote boundary (sideColumnWidthPx === belowPx, 778), the available track resolves to EXACTLY the tree\'s own compiled floor — consistent with the threshold\'s own composition (panel + floor + one gap)', () => {
    const clamped = clampTreeWidthForSideColumn(
      9999, // any generous natural/stored width
      778,
      true,
      LANDSCAPE_CONTROL_PANEL_TRACK,
      LANDSCAPE_TREE_TRACK,
      TREE_CONTROL_WRAPPER_ROW_GAP_PX,
    );
    expect(clamped).toBe(LANDSCAPE_TREE_TRACK.minPx);
  });

  it('never shrinks below the tree\'s own compiled floor, even in a track narrower than the floor composition itself allows (the demotion resolver is what actually handles this case in App.vue — this clamp still refuses to go below the floor on its own)', () => {
    const clamped = clampTreeWidthForSideColumn(
      500,
      500, // narrower than 778 -- would never reach this call with controlPanelPresent true in practice
      true,
      LANDSCAPE_CONTROL_PANEL_TRACK,
      LANDSCAPE_TREE_TRACK,
      TREE_CONTROL_WRAPPER_ROW_GAP_PX,
    );
    expect(clamped).toBe(LANDSCAPE_TREE_TRACK.minPx);
  });

  it('never grows a natural width that is already smaller than the available track — clamps down only, never up (ledger row 414\'s standing invariant)', () => {
    const clamped = clampTreeWidthForSideColumn(
      110,
      3000, // far more room than needed
      true,
      LANDSCAPE_CONTROL_PANEL_TRACK,
      LANDSCAPE_TREE_TRACK,
      TREE_CONTROL_WRAPPER_ROW_GAP_PX,
    );
    expect(clamped).toBe(110);
  });

  it('controlPanelPresent === false: no reservation at all — the natural width is only bounded by the raw side-column width itself (the panel\'s absent 664px track renders 0px, so nothing is reserved against it)', () => {
    const clamped = clampTreeWidthForSideColumn(
      600,
      614, // 1920x1080's own reported measured width, panel demoted there
      false,
      LANDSCAPE_CONTROL_PANEL_TRACK,
      LANDSCAPE_TREE_TRACK,
      TREE_CONTROL_WRAPPER_ROW_GAP_PX,
    );
    expect(clamped).toBe(600); // 600 <= 614, fits with no panel reservation
  });

  it('sideColumnWidthPx <= 0 or non-finite (not yet measured) passes naturalTreeWidthPx through unchanged', () => {
    for (const notYetMeasured of [0, -10, NaN]) {
      expect(
        clampTreeWidthForSideColumn(
          307,
          notYetMeasured,
          true,
          LANDSCAPE_CONTROL_PANEL_TRACK,
          LANDSCAPE_TREE_TRACK,
          TREE_CONTROL_WRAPPER_ROW_GAP_PX,
        ),
      ).toBe(307);
    }
  });

  it('portrait\'s own compiled facts (140px tree floor) reproduce its own 808px demote threshold composition the same way landscape\'s 778px does', () => {
    const clamped = clampTreeWidthForSideColumn(
      9999,
      808,
      true,
      LANDSCAPE_CONTROL_PANEL_TRACK, // portrait's controlPanel track is also { fixed, 664 }
      PORTRAIT_TREE_TRACK,
      TREE_CONTROL_WRAPPER_ROW_GAP_PX,
    );
    expect(clamped).toBe(PORTRAIT_TREE_TRACK.minPx);
  });

  it('a non-"fixed" controlPanel track throws loudly (ADR-0002) rather than silently reserving the wrong shape\'s own field', () => {
    const wrongShape: LytTrackShape = { kind: 'elastic', minPx: 0, frWeight: 1 };
    expect(() =>
      clampTreeWidthForSideColumn(307, 819, true, wrongShape, LANDSCAPE_TREE_TRACK, TREE_CONTROL_WRAPPER_ROW_GAP_PX),
    ).toThrow(/controlPanel.*compiled track/);
  });

  it('a non-"elastic" tree track throws loudly (ADR-0002)', () => {
    const wrongShape: LytTrackShape = { kind: 'fixed', px: 140 };
    expect(() =>
      clampTreeWidthForSideColumn(
        307,
        819,
        true,
        LANDSCAPE_CONTROL_PANEL_TRACK,
        wrongShape,
        TREE_CONTROL_WRAPPER_ROW_GAP_PX,
      ),
    ).toThrow(/tree.*compiled track/);
  });
});
