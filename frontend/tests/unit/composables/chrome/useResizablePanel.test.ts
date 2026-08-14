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
  TREE_PANEL_MIN_WIDTH_PX,
  WRAPPER_MIN_WIDTH_PX,
  CONTROL_PANEL_MIN_WIDTH_PX,
  MIN_BOARD_PX,
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
  it('equals TREE_PANEL_MIN_WIDTH_PX + resizer(1) + CONTROL_PANEL_MIN_WIDTH_PX', () => {
    // The literal 1 (not RESIZER_WIDTH_PX) is deliberate: importing the
    // constant would make this assertion the definition restated. The
    // literal pins the commissioner-ruled hairline width (2026-08-10,
    // 4px -> 2px -> 1px; grab area stays ~4px via the CSS overhang in
    // App.vue) so an unratified drift of either the constant or the
    // derivation fails audibly here.
    expect(WRAPPER_MIN_WIDTH_PX).toBe(TREE_PANEL_MIN_WIDTH_PX + 1 + CONTROL_PANEL_MIN_WIDTH_PX);
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

// Sovereignty (dispatch L3, SCOPE item 3): `startResizeOuter`'s own
// `regionMaxWidthPx` no longer reserves `MIN_BOARD_PX` against the OUTER
// bar's own drag range — a drag that would squeeze `#board-area` below
// its floor is diagnosed (`outerRowSovereignDiagnostic`,
// `useResizablePanel.ts`), never resisted at the drag-math level. This
// describe block used to pin the OLD reservation contract; it now pins
// `MIN_BOARD_PX`'s own value only, since the constant itself still
// exists (as the `board` region's own `Measured.min` in the sovereignty
// diagnostic), just no longer as a drag-range ceiling.
describe('sanity: MIN_BOARD_PX still names the board\'s own floor (now a diagnostic input, not a drag-range reservation)', () => {
  it('MIN_BOARD_PX is unchanged — consumed by outerRowSovereignDiagnostic as the board region\'s own Measured.min, not by startResizeOuter\'s own drag-range ceiling (deleted by sovereignty)', () => {
    expect(MIN_BOARD_PX).toBe(300);
  });
});

// HISTORICAL, deleted by dispatch L3 (`.claude/dispatch-reports/
// lyt-space-owner-spec.md` §3 step 3, ledger rows 2447/2450/2460/2461):
// `sanitizeTreeControlRegionWidthPx` (the ui-5-3 restore-time clamp) and
// `computeBoardAreaMaxWidthPx` (the flex-era `#board-area` max-width cap,
// already unconsumed by App.vue since the W3 CSS-Grid rewire) used to be
// pinned by two `describe` blocks here. Both functions are DELETED —
// `sanitizeTreeControlRegionWidthPx`'s protective intent (never leave
// `#board-area` starved by a stale/wide hydrated width) is now discharged
// by sovereignty: `useResizablePanel.ts`'s own `outerRowSovereignDiagnostic`
// diagnoses a starved board via `resolveSovereignOverrides`
// (`state/feasible-layout.ts`) instead of resisting the stored value —
// see `tests/unit/state/feasible-layout.test.ts` (dispatch L1/L3) for
// `resolveSovereignOverrides`'s own pinned contract, and
// `tests/integration/resizer-restore-clamp.test.ts`'s own updated ui-5-3
// suite for the new mechanism's integration-level coverage (both updated
// in the SAME dispatch, per SCOPE item 5's "update with justification"
// requirement — the old assertions embodied exactly the "resist, don't
// diagnose" shape sovereignty exists to close).
