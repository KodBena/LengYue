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
} from '../../../src/state/layout-model';

describe('deriveAxis — row/column split from aspect ratio', () => {
  it('stays row when width/height is well above the threshold (a wide desktop window)', () => {
    expect(deriveAxis(1920, 1080)).toBe('row');
  });

  it('flips to column when width/height is well below the threshold (a portrait monitor / half-screen tile)', () => {
    expect(deriveAxis(900, 1400)).toBe('column');
  });

  it('a perfectly square window (ratio 1) stays row — the threshold is strictly below 1', () => {
    expect(deriveAxis(1000, 1000)).toBe('row');
  });

  it('pins the exact threshold boundary: just above AXIS_ASPECT_RATIO_THRESHOLD is row, just below is column', () => {
    const heightPx = 1000;
    const justAboveWidthPx = Math.ceil(AXIS_ASPECT_RATIO_THRESHOLD * heightPx) + 1;
    const justBelowWidthPx = Math.floor(AXIS_ASPECT_RATIO_THRESHOLD * heightPx) - 1;
    expect(deriveAxis(justAboveWidthPx, heightPx)).toBe('row');
    expect(deriveAxis(justBelowWidthPx, heightPx)).toBe('column');
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
  it('composes axis and width independently (a narrow-but-wide-ratio and a vast-but-tall-ratio window)', () => {
    expect(deriveLayoutClass(1920, 1080)).toEqual({ axis: 'row', width: 'wide' }); // WIDTH_CLASS_MAX_PX.wide === 1920, inclusive
    expect(deriveLayoutClass(2400, 1080)).toEqual({ axis: 'row', width: 'vast' });
    expect(deriveLayoutClass(700, 1200)).toEqual({ axis: 'column', width: 'compact' });
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

  it('reproduces the OLD hand literal (220) for the OLD tab count (4) — the formula is a faithful reverse-derivation, not a new number', () => {
    expect(computeControlPanelMinWidthPx(4)).toBe(220);
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
