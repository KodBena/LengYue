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
  computeBoardColumnMaxWidthPx,
  TREE_PANEL_MIN_WIDTH_PX,
  WRAPPER_MIN_WIDTH_PX,
  CONTROL_PANEL_MIN_WIDTH_PX,
  MIN_BOARD_PX,
  RESIZER_WIDTH_PX,
} from '../../../../src/composables/chrome/useResizablePanel';
import {
  CONTROL_PANEL_TAB_IDS,
  computeControlPanelMinWidthPx,
} from '../../../../src/state/layout-model';

// ── INNER bar: the tree panel (session.ui.treePanelWidthPx) ─────────
// A plausible drag-start ceiling for the tree pane within a
// ~1400px-wide wrapper (CONTROL_PANEL_MIN_WIDTH_PX + inner resizer 4
// subtracted; the constant itself is tab-registry-derived — see
// state/layout-model.ts — so this is an illustrative fixed test
// ceiling, not a live re-derivation).
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
    // WRAPPER_MIN_WIDTH_PX itself (not a hardcoded 364 — that literal
    // silently assumed the pre-Phase-0 CONTROL_PANEL_MIN_WIDTH_PX; the
    // floor is now tab-registry-derived, so this pins to the live
    // constant instead of a value that would drift under it).
    for (const dragOriginPx of [WRAPPER_MIN_WIDTH_PX, 500, 1400, 2628, 3348]) {
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
    // CONTROL_PANEL_MIN_WIDTH_PX (audit finding R2's fix, resolution
    // roadmap Phase 0): no longer a hand literal — it's a projection of
    // CONTROL_PANEL_TAB_IDS.length (state/layout-model.ts). Pinning it
    // against that projection, not a bare number, means a tab
    // added/removed from the registry can't silently desync this test
    // from the floor it's meant to guard.
    expect(CONTROL_PANEL_MIN_WIDTH_PX).toBe(computeControlPanelMinWidthPx(CONTROL_PANEL_TAB_IDS.length));
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

// ── commission row 848: board-column width cap ────────────────────────
// "Space should not be wasted" — a HEIGHT-bound #board-column (the
// square is `height: 100%; aspect-ratio: 1/1`) must not claim row WIDTH
// past what its own square can render into; the excess used to become
// dead centered margin around the square while #tree-control-wrapper
// starved at its floor. computeBoardColumnMaxWidthPx is the pure
// function behind the App.vue :style cap on #board-column — see
// useResizablePanel.ts's header, "Board-column width cap", for the full
// mechanism (native flexbox redistributes past a frozen max-width item,
// same idiom the rest of this file's OUTER/INNER bars rely on).
describe('computeBoardColumnMaxWidthPx — the pure function behind the #board-column max-width cap', () => {
  it('equals the row height, floored at MIN_BOARD_PX (a height-bound board can never render wider than the row is tall)', () => {
    expect(computeBoardColumnMaxWidthPx(900)).toBe(900);
    expect(computeBoardColumnMaxWidthPx(1275)).toBe(1275);
  });

  it('never returns below MIN_BOARD_PX, even for a very short row (the board floor composes with the height derivation)', () => {
    expect(computeBoardColumnMaxWidthPx(50)).toBe(MIN_BOARD_PX);
    expect(computeBoardColumnMaxWidthPx(0.1)).toBe(MIN_BOARD_PX);
  });

  it('rounds to a whole pixel (a fractional getBoundingClientRect height must not reach App.vue\'s :style as a fractional CSS length)', () => {
    expect(computeBoardColumnMaxWidthPx(900.6)).toBe(901);
    expect(computeBoardColumnMaxWidthPx(900.4)).toBe(900);
  });

  it('rowHeightPx <= 0 (not yet measured — pre-ResizeObserver-attach, mirrors sanitizeTreeControlRegionWidthPx\'s own not-yet-measured branch) returns undefined, never a spurious floor clamp', () => {
    expect(computeBoardColumnMaxWidthPx(0)).toBeUndefined();
    expect(computeBoardColumnMaxWidthPx(-10)).toBeUndefined();
  });

  it('non-finite input (NaN/Infinity — the same unvalidated-deepMerge reachability class ui-5-3 guards) falls back to undefined rather than NaN/Infinity-poisoning the :style binding', () => {
    expect(computeBoardColumnMaxWidthPx(Number.NaN)).toBeUndefined();
    expect(computeBoardColumnMaxWidthPx(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('a height-bound scenario (row height well under an even width split) caps #board-column strictly BELOW what an uncapped 50/50 flex-fill split would have given it — the "slack flows to the wrapper" claim at the pure-function level', () => {
    const rowWidthPx = 2400;
    const uncappedEvenSharePx = (rowWidthPx - RESIZER_WIDTH_PX) / 2; // ~1198
    const rowHeightPx = 900; // height-bound: well under the even share
    const cappedPx = computeBoardColumnMaxWidthPx(rowHeightPx);
    expect(cappedPx).toBe(900);
    expect(cappedPx as number).toBeLessThan(uncappedEvenSharePx);
    // The slack this frees up is large enough that #tree-control-wrapper
    // can grow well past its own floor once native flexbox redistributes
    // it — not just squeak over by a few px.
    const wrapperRoomPx = rowWidthPx - (cappedPx as number) - RESIZER_WIDTH_PX;
    expect(wrapperRoomPx).toBeGreaterThan(WRAPPER_MIN_WIDTH_PX);
  });

  it('a width-bound scenario (row height far exceeds the row\'s own width) yields a cap that exceeds the entire row — non-binding, the un-height-bound case is unchanged by construction', () => {
    const rowWidthPx = 1200;
    const rowHeightPx = 5000; // taller than the row is wide
    const cappedPx = computeBoardColumnMaxWidthPx(rowHeightPx);
    // A max-width larger than the row itself can never be the tighter
    // constraint — native flexbox still allocates #board-column its full
    // natural share, exactly as before this cap existed.
    expect(cappedPx as number).toBeGreaterThan(rowWidthPx);
  });
});
