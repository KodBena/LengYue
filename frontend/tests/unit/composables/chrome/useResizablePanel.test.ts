/**
 * tests/unit/composables/chrome/useResizablePanel.test.ts
 *
 * Tier-1 (pure-logic) tests for the nested-splitter drag math in
 * `src/composables/chrome/useResizablePanel.ts`:
 *
 *   - resizer-rearch (replaces the two-writer, discontinuous drag
 *     ADR-0019 audit Finding S2 indicted —
 *     `.claude/dispatch-reports/adr19-audit.md`)
 *   - extended to a nested-splitter tree, charter amendment ledger
 *     row 391, geometry per maintainer constraint ledger row 414
 *     (the tree pane's width changes through EXACTLY the INNER bar,
 *     never automatically)
 *   - shape corrected per the live diagnostic
 *     (.claude/dispatch-reports/panel-weirdness-live-investigation.md
 *     §3/§6), which showed a flatter derivation let a resizer bar
 *     decouple from the cursor by up to 541px
 *
 * No DOM, no store, no Vue reactivity — `computeTreePanelWidthPx`
 * (INNER bar) and `computeTreeControlRegionWidthPx` (OUTER bar) are
 * both thin wrappers over the shared `computePaneWidthPx`, exported
 * from the composable module specifically so the drag math is
 * testable without mounting anything.
 *
 * Four properties the rearch's contract requires, each its own
 * `describe` block below (exercised against `computeTreePanelWidthPx`
 * first, then mirrored against `computeTreeControlRegionWidthPx`):
 *   - continuity (a dense sweep with a bounded per-step delta — the
 *     ADR-0019-proposed continuity rule's own drag-sweep probe)
 *   - monotonicity
 *   - range pinning at both ends
 *   - no drag-start clobber (the function's value at zero
 *     displacement always equals the rendered geometry it started
 *     from, for ANY starting geometry — not just a "clean" one)
 *
 * "Red legs against the old composable" (commission requirement):
 * the pre-rearch code had no such regime-independent pure function to
 * compare against — its two-writer drag (`store.session.ui.
 * boardSquareMaxWidthPx` + the ui-fix-56 `controlPanelWidthPx` local
 * ref) was branch-shaped (`computeBoardTargetPx` /
 * `computeControlPanelWidthPx`, git history 1e246e6d), so there is no
 * single old function whose old *outputs* this new function could be
 * diffed against directly. The red leg is expressed instead the way
 * the old shape is falsifiable: the "no drag-start clobber" and
 * "continuity across the old jump neighbourhood" tests below encode
 * the exact scenario the audit measured against the OLD code
 * (dragOriginPx read from a value ≠ the persisted target) and would
 * fail against a re-introduction of that read.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  computeTreePanelWidthPx,
  computeTreeControlRegionWidthPx,
  computePaneWidthPx,
  sanitizeTreeControlRegionWidthPx,
  TREE_PANEL_MIN_WIDTH_PX,
  WRAPPER_MIN_WIDTH_PX,
  CONTROL_PANEL_MIN_WIDTH_PX,
  MIN_BOARD_PX,
  RESIZER_WIDTH_PX,
} from '../../../../src/composables/chrome/useResizablePanel';

// ── INNER bar: the tree panel (session.ui.treePanelWidthPx) ─────────
// A plausible drag-start ceiling for the tree pane within a
// ~1400px-wide wrapper (control floor 220 + inner resizer 4 subtracted).
const MAX_TREE = 1176;

describe('computeTreePanelWidthPx — continuity', () => {
  it('a dense drag sweep across the WHOLE range produces bounded per-step deltas (the ADR-0019 drag-sweep probe)', () => {
    const dragOriginPx = 300;
    const values: number[] = [];
    for (let delta = -1500; delta <= 1500; delta += 1) {
      values.push(computeTreePanelWidthPx(dragOriginPx, delta, MAX_TREE));
    }
    for (let i = 1; i < values.length; i++) {
      const step = Math.abs(values[i] - values[i - 1]);
      // Each mousemove is a 1px cursor step; the rendered value must
      // move by at most 1px per step — a bound violation is exactly a
      // discontinuity.
      expect(step).toBeLessThanOrEqual(1);
    }
  });

  it('is continuous through a wide starting-origin sweep (mirrors the audit\'s measured discontinuity class)', () => {
    const dragOriginPx = 900;
    let prev = computeTreePanelWidthPx(dragOriginPx, 0, 4096);
    for (let delta = 1; delta <= 1300; delta++) {
      const next = computeTreePanelWidthPx(dragOriginPx, delta, 4096);
      expect(Math.abs(next - prev)).toBeLessThanOrEqual(1);
      prev = next;
    }
  });
});

describe('computeTreePanelWidthPx — monotonicity (sign = +1: the tree panel sits to #resizer-inner\'s LEFT)', () => {
  it('is non-decreasing as totalDeltaPx increases (drag right GROWS the tree pane — opposite of the control-panel-side bar, by construction: see computePaneWidthPx\'s sign doc)', () => {
    const dragOriginPx = 500;
    let prev = computeTreePanelWidthPx(dragOriginPx, -500, MAX_TREE);
    for (let delta = -499; delta <= 500; delta++) {
      const next = computeTreePanelWidthPx(dragOriginPx, delta, MAX_TREE);
      expect(next).toBeGreaterThanOrEqual(prev);
      prev = next;
    }
  });

  it('is non-increasing as totalDeltaPx decreases (drag left shrinks the tree pane)', () => {
    const dragOriginPx = 500;
    let prev = computeTreePanelWidthPx(dragOriginPx, 500, MAX_TREE);
    for (let delta = 499; delta >= -500; delta--) {
      const next = computeTreePanelWidthPx(dragOriginPx, delta, MAX_TREE);
      expect(next).toBeLessThanOrEqual(prev);
      prev = next;
    }
  });
});

describe('computeTreePanelWidthPx — range pinning', () => {
  it('pins at TREE_PANEL_MIN_WIDTH_PX when dragged far past the low end (large NEGATIVE delta, sign = +1)', () => {
    expect(computeTreePanelWidthPx(500, -100000, MAX_TREE)).toBe(TREE_PANEL_MIN_WIDTH_PX);
  });

  it('pins at maxTreePanelWidthPx when dragged far past the high end (large POSITIVE delta, sign = +1)', () => {
    expect(computeTreePanelWidthPx(500, 100000, MAX_TREE)).toBe(MAX_TREE);
  });

  it('stays pinned (no further change) for any further displacement past a pinned end', () => {
    const atFloor = computeTreePanelWidthPx(500, 100000, MAX_TREE);
    const pastFloor = computeTreePanelWidthPx(500, 200000, MAX_TREE);
    expect(pastFloor).toBe(atFloor);
  });

  it('degrades gracefully when maxTreePanelWidthPx < TREE_PANEL_MIN_WIDTH_PX (viewport too narrow for both floors)', () => {
    const narrowMax = 100; // less than TREE_PANEL_MIN_WIDTH_PX (140)
    // sign = +1: a large NEGATIVE delta (drag left) is what pushes
    // this pane toward its low end.
    const result = computeTreePanelWidthPx(120, -100000, narrowMax);
    expect(result).toBe(narrowMax);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('computeTreePanelWidthPx — no drag-start clobber', () => {
  it('at zero displacement, returns exactly the rendered geometry the drag started from, for an arbitrary starting value', () => {
    for (const dragOriginPx of [140, 200, 300, 500, 900, 1176]) {
      const maxTree = Math.max(dragOriginPx, MAX_TREE, 1500);
      expect(computeTreePanelWidthPx(dragOriginPx, 0, maxTree)).toBe(dragOriginPx);
    }
  });

  it('never depends on a stored/persisted value — only on the two explicit arguments', () => {
    const a = computeTreePanelWidthPx(400, 0, MAX_TREE);
    const b = computeTreePanelWidthPx(400, 0, MAX_TREE);
    expect(a).toBe(b);
    expect(a).toBe(400);
  });
});

// ── OUTER bar: the tree+control wrapper (session.ui.treeControlRegionWidthPx) ──
const MAX_REGION = 3348; // a plausible ceiling: rowWidth 3672 - MIN_BOARD_PX 300 - resizer 4 (roughly)

describe('computeTreeControlRegionWidthPx — continuity', () => {
  it('a dense drag sweep across the WHOLE range produces bounded per-step deltas', () => {
    const dragOriginPx = 1400;
    const values: number[] = [];
    for (let delta = -2000; delta <= 2000; delta += 1) {
      values.push(computeTreeControlRegionWidthPx(dragOriginPx, delta, MAX_REGION));
    }
    for (let i = 1; i < values.length; i++) {
      expect(Math.abs(values[i] - values[i - 1])).toBeLessThanOrEqual(1);
    }
  });
});

describe('computeTreeControlRegionWidthPx — monotonicity', () => {
  it('is non-increasing as totalDeltaPx increases (drag right narrows the region)', () => {
    const dragOriginPx = 1400;
    let prev = computeTreeControlRegionWidthPx(dragOriginPx, -500, MAX_REGION);
    for (let delta = -499; delta <= 500; delta++) {
      const next = computeTreeControlRegionWidthPx(dragOriginPx, delta, MAX_REGION);
      expect(next).toBeLessThanOrEqual(prev);
      prev = next;
    }
  });
});

describe('computeTreeControlRegionWidthPx — range pinning', () => {
  it('pins at WRAPPER_MIN_WIDTH_PX when dragged far past the low end', () => {
    expect(computeTreeControlRegionWidthPx(1400, 100000, MAX_REGION)).toBe(WRAPPER_MIN_WIDTH_PX);
  });

  it('pins at maxRegionWidthPx when dragged far past the high end', () => {
    expect(computeTreeControlRegionWidthPx(1400, -100000, MAX_REGION)).toBe(MAX_REGION);
  });
});

describe('computeTreeControlRegionWidthPx — no drag-start clobber', () => {
  it('at zero displacement, returns exactly the rendered geometry the drag started from', () => {
    for (const dragOriginPx of [364, 500, 1400, 2628, 3348]) {
      const maxRegion = Math.max(dragOriginPx, MAX_REGION);
      expect(computeTreeControlRegionWidthPx(dragOriginPx, 0, maxRegion)).toBe(dragOriginPx);
    }
  });
});

describe('WRAPPER_MIN_WIDTH_PX — derived, not independently chosen', () => {
  it('equals TREE_PANEL_MIN_WIDTH_PX + resizer(4) + CONTROL_PANEL_MIN_WIDTH_PX', () => {
    expect(WRAPPER_MIN_WIDTH_PX).toBe(TREE_PANEL_MIN_WIDTH_PX + 4 + CONTROL_PANEL_MIN_WIDTH_PX);
  });
});

describe('resizer-rearch: the two bars are independent (ADR-0012 one-home-per-fact)', () => {
  it('computeTreePanelWidthPx and computeTreeControlRegionWidthPx are pure functions of their own three arguments only — neither reads or implies the other pane\'s value', () => {
    // There is no fourth argument through which one pane's value
    // could leak into the other's computation; this is the
    // structural half of "not derived from the other's" — the type
    // signature itself has no seam for it.
    expect(computeTreePanelWidthPx.length).toBe(3);
    expect(computeTreeControlRegionWidthPx.length).toBe(3);
  });

  it('TREE_PANEL_MIN_WIDTH_PX and CONTROL_PANEL_MIN_WIDTH_PX are independent constants', () => {
    expect(TREE_PANEL_MIN_WIDTH_PX).toBe(140);
    expect(CONTROL_PANEL_MIN_WIDTH_PX).toBe(220);
    expect(TREE_PANEL_MIN_WIDTH_PX).not.toBe(CONTROL_PANEL_MIN_WIDTH_PX);
  });
});

describe('computePaneWidthPx — the shared generic both wrappers delegate to', () => {
  it('computeTreePanelWidthPx agrees with computePaneWidthPx given sign = +1 (tree sits LEFT of #resizer-inner)', () => {
    expect(computeTreePanelWidthPx(400, 50, MAX_TREE))
      .toBe(computePaneWidthPx(400, 50, TREE_PANEL_MIN_WIDTH_PX, MAX_TREE, 1));
  });

  it('computeTreeControlRegionWidthPx agrees with computePaneWidthPx given sign = -1 (wrapper sits RIGHT of #resizer-outer)', () => {
    expect(computeTreeControlRegionWidthPx(1400, 50, MAX_REGION))
      .toBe(computePaneWidthPx(1400, 50, WRAPPER_MIN_WIDTH_PX, MAX_REGION, -1));
  });
});

describe('sanity: the board floor composes with both bars\' max-clamp derivation', () => {
  it('MIN_BOARD_PX is the floor the OUTER bar\'s caller (startResizeOuter) reserves for the board', () => {
    // Documents the contract between this pure function and its
    // caller: regionMaxWidthPx is derived by the caller as
    // rowWidth - MIN_BOARD_PX - RESIZER_WIDTH_PX, so the board can
    // never be squeezed below its own floor by the outer drag. This
    // test just pins the constant's value so a change is a visible
    // diff here.
    expect(MIN_BOARD_PX).toBe(300);
  });
});

// ── ui-5-3: restore-time board-visibility clamp ──────────────────────
// "The board comes back minimized after upgrading" — a persisted
// treeControlRegionWidthPx saved against one viewport, hydrated
// verbatim against a narrower one, used to leave #board-column far
// below MIN_BOARD_PX because only an in-progress DRAG clamped against
// live geometry. sanitizeTreeControlRegionWidthPx re-derives that same
// clamp from the row's CURRENT width at render time — RED against the
// raw store read (a 3490px region on a 1024px-wide row leaves the
// board around -2170px, i.e. it doesn't exist), GREEN through this
// function (the board keeps its full MIN_BOARD_PX floor).
describe('sanitizeTreeControlRegionWidthPx — ui-5-3 restore-time clamp', () => {
  it('RED (documents the bug): the raw persisted value alone gives the board no room at all on a narrower viewport', () => {
    const staleWidePx = 3490; // plausible pre-rearch / wide-screen save
    const narrowRowWidthPx = 1024;
    const boardRoomPx = narrowRowWidthPx - staleWidePx - RESIZER_WIDTH_PX;
    expect(boardRoomPx).toBeLessThan(MIN_BOARD_PX);
    expect(boardRoomPx).toBeLessThan(0); // the reported symptom: no board at all
  });

  it('GREEN: sanitizes the same stale/wide value down so the board keeps at least MIN_BOARD_PX', () => {
    const staleWidePx = 3490;
    const narrowRowWidthPx = 1024;
    const sanitized = sanitizeTreeControlRegionWidthPx(staleWidePx, narrowRowWidthPx);
    expect(sanitized).toBeDefined();
    const boardRoomPx = narrowRowWidthPx - (sanitized as number) - RESIZER_WIDTH_PX;
    expect(boardRoomPx).toBeGreaterThanOrEqual(MIN_BOARD_PX);
  });

  it('a value that already leaves the board plenty of room passes through unchanged (no-op on the common case)', () => {
    expect(sanitizeTreeControlRegionWidthPx(500, 1600)).toBe(500);
  });

  it('undefined (never dragged) stays undefined — fresh installs are unaffected', () => {
    expect(sanitizeTreeControlRegionWidthPx(undefined, 1024)).toBeUndefined();
    expect(sanitizeTreeControlRegionWidthPx(undefined, 0)).toBeUndefined();
  });

  it('a garbage negative value is floored at WRAPPER_MIN_WIDTH_PX, same as the drag clamp', () => {
    expect(sanitizeTreeControlRegionWidthPx(-500, 1600)).toBe(WRAPPER_MIN_WIDTH_PX);
  });

  it('rowWidthPx = 0 (no live measurement yet, e.g. before the first ResizeObserver callback) clamps to the wrapper floor rather than trusting the raw value', () => {
    expect(sanitizeTreeControlRegionWidthPx(3490, 0)).toBe(WRAPPER_MIN_WIDTH_PX);
  });

  it('degrades gracefully on a viewport too narrow for even the wrapper floor (never returns a value below WRAPPER_MIN_WIDTH_PX, never NaN/Infinity)', () => {
    const sanitized = sanitizeTreeControlRegionWidthPx(3490, 200);
    expect(sanitized).toBe(WRAPPER_MIN_WIDTH_PX);
    expect(Number.isFinite(sanitized as number)).toBe(true);
  });

  it('agrees with a zero-displacement drag through computeTreeControlRegionWidthPx given the same derived max', () => {
    const rowWidthPx = 1600;
    const maxRegionWidthPx = Math.max(WRAPPER_MIN_WIDTH_PX, rowWidthPx - MIN_BOARD_PX - RESIZER_WIDTH_PX);
    expect(sanitizeTreeControlRegionWidthPx(900, rowWidthPx))
      .toBe(computeTreeControlRegionWidthPx(900, 0, maxRegionWidthPx));
  });
});
