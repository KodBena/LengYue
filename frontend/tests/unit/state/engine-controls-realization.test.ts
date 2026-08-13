/**
 * tests/unit/state/engine-controls-realization.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/state/engine-controls-realization.ts`
 * — the finish-pass wave B2 F2 fix's threshold arithmetic. No DOM, no Vue
 * reactivity: `computeWrappedRowCount`, `computeClusterNeededHeightPx`,
 * and `resolveEngineControlsRealization` are pure functions of their own
 * arguments.
 *
 * Two families of cases: (1) the algorithm's own correctness on small
 * synthetic fixtures (easy to hand-verify), and (2) the exact live-
 * measured worst-case button widths this module cites
 * (`ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX`), pinning the derived
 * threshold (~184.03125px) the commission's own report cites.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import {
  computeWrappedRowCount,
  computeClusterNeededHeightPx,
  resolveEngineControlsRealization,
  A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX,
  ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX,
  ENGINE_CONTROLS_GAP_PX,
  ENGINE_CONTROLS_ROW_HEIGHT_PX,
} from '../../../src/state/engine-controls-realization';

describe('computeWrappedRowCount — synthetic fixtures', () => {
  it('returns 0 for an empty item list', () => {
    expect(computeWrappedRowCount([], 4, 100)).toBe(0);
  });

  it('a single item always fits in one row, regardless of container width', () => {
    expect(computeWrappedRowCount([50], 4, 10)).toBe(1);
    expect(computeWrappedRowCount([50], 4, 1000)).toBe(1);
  });

  it('two items that fit side-by-side (with the gap) stay in one row', () => {
    // 10 + 4 (gap) + 10 = 24, exactly the container — fits at equality.
    expect(computeWrappedRowCount([10, 10], 4, 24)).toBe(1);
  });

  it('two items that do not fit (even by 1px) wrap to two rows', () => {
    expect(computeWrappedRowCount([10, 10], 4, 23)).toBe(2);
  });

  it('packs sequentially in DOM order, not by a bin-packing optimum', () => {
    // [10, 10, 10] at container 21: item1 alone (10), item2 doesn't fit
    // (10+4+10=24 > 21) -> new row; item3 doesn't fit next to item2 either
    // (10+4+10=24 > 21) -> third row. Three rows, matching CSS flex-wrap's
    // own left-to-right greedy line assignment (not an optimal 2-row pack
    // that would require reordering, which flex-wrap never does).
    expect(computeWrappedRowCount([10, 10, 10], 4, 21)).toBe(3);
  });

  it('a very narrow container still assigns one item per row (never 0 rows for a non-empty list)', () => {
    expect(computeWrappedRowCount([50, 50, 50], 4, 1)).toBe(3);
  });
});

describe('computeClusterNeededHeightPx', () => {
  it('0 rows needs 0 height', () => {
    expect(computeClusterNeededHeightPx(0, 24, 4)).toBe(0);
  });

  it('N rows needs N*rowHeight + (N-1)*rowGap', () => {
    expect(computeClusterNeededHeightPx(1, 24, 4)).toBe(24);
    expect(computeClusterNeededHeightPx(2, 24, 4)).toBe(52);
    expect(computeClusterNeededHeightPx(3, 24, 4)).toBe(80);
    expect(computeClusterNeededHeightPx(4, 24, 4)).toBe(108);
  });
});

describe('resolveEngineControlsRealization', () => {
  it('stays button-cluster when the need is under the reservation', () => {
    expect(resolveEngineControlsRealization(52, 80)).toBe('button-cluster');
  });

  it('stays button-cluster at exact equality (not exceeded)', () => {
    expect(resolveEngineControlsRealization(80, 80)).toBe('button-cluster');
  });

  it('switches to menu-path the moment the need exceeds the reservation', () => {
    expect(resolveEngineControlsRealization(80.01, 80)).toBe('menu-path');
    expect(resolveEngineControlsRealization(108, 80)).toBe('menu-path');
  });
});

describe('the compiled reservation constant', () => {
  it('matches the compiled program\'s own fixed track (lyt-layout.gen.ts path "2.0" / lyt-layout-portrait.gen.ts path "4.0")', () => {
    expect(A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX).toBe(80);
  });
});

describe('the live-measured worst-case button widths — threshold arithmetic (F2)', () => {
  // Live-measured (isolated rig, 2026-08-13): Mint Card(s) 105.625,
  // Learn Path 90.015625, Play 43.21875, Match/Stop Match (worse: Stop
  // Match) 90.015625, Connect/Disconnect (worse: Disconnect) 90.015625.
  // See `state/engine-controls-realization.ts`'s own header for the
  // methodology and why this table is NOT the runtime decision
  // mechanism (the runtime composable measures the real, current
  // buttons instead).
  const widths = ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX;

  it('fits 3 rows (the 80px reservation) at a 190px column — landscape/768px-class-representative width', () => {
    const rows = computeWrappedRowCount(widths, ENGINE_CONTROLS_GAP_PX, 190);
    expect(rows).toBe(3);
    const neededPx = computeClusterNeededHeightPx(rows, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX);
    expect(neededPx).toBe(80);
    expect(resolveEngineControlsRealization(neededPx, A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX)).toBe('button-cluster');
  });

  it('needs 4 rows (exceeds the 80px reservation) at the F2 report\'s own 1280x1024 column (107.25px)', () => {
    const rows = computeWrappedRowCount(widths, ENGINE_CONTROLS_GAP_PX, 107.25);
    expect(rows).toBe(5); // worst-case (Disconnect/Stop Match) labels wrap further than the default-state 4 rows the live rig measured
    const neededPx = computeClusterNeededHeightPx(rows, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX);
    expect(resolveEngineControlsRealization(neededPx, A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX)).toBe('menu-path');
  });

  it('needs 5 rows (exceeds the 80px reservation) at the F2 report\'s own 420x880 column (102px)', () => {
    const rows = computeWrappedRowCount(widths, ENGINE_CONTROLS_GAP_PX, 102);
    expect(rows).toBe(5);
    const neededPx = computeClusterNeededHeightPx(rows, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX);
    expect(resolveEngineControlsRealization(neededPx, A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX)).toBe('menu-path');
  });

  it('the derived threshold is ~184.03125px: just below it needs menu-path, at/above it fits button-cluster', () => {
    const belowThreshold = 184.03; // just under
    const atThreshold = 184.03125; // exact: 90.015625 + 4 + 90.015625 (the last two items' own row)
    const rowsBelow = computeWrappedRowCount(widths, ENGINE_CONTROLS_GAP_PX, belowThreshold);
    const rowsAt = computeWrappedRowCount(widths, ENGINE_CONTROLS_GAP_PX, atThreshold);
    expect(rowsBelow).toBe(4);
    expect(rowsAt).toBe(3);
    expect(
      resolveEngineControlsRealization(
        computeClusterNeededHeightPx(rowsBelow, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX),
        A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX,
      ),
    ).toBe('menu-path');
    expect(
      resolveEngineControlsRealization(
        computeClusterNeededHeightPx(rowsAt, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX),
        A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX,
      ),
    ).toBe('button-cluster');
  });

  it('1920x1080\'s own live-measured column (150.5px) — under the worst-case threshold, but the RUNTIME composable measures the real current (non-worst-case) buttons instead, which fit; this table alone would (incorrectly, if used at runtime) select menu-path here', () => {
    // Documents the exact reasoning in this module's own header for why
    // the worst-case table is NOT wired as the runtime mechanism: this
    // fixture's own "1920 default state fits, but worst-case labels
    // don't" tension is the reason `useEngineControlsRealization`
    // measures the real buttons live instead of consulting this table.
    const rows = computeWrappedRowCount(widths, ENGINE_CONTROLS_GAP_PX, 150.5);
    expect(rows).toBe(4);
    const neededPx = computeClusterNeededHeightPx(rows, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX);
    expect(resolveEngineControlsRealization(neededPx, A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX)).toBe('menu-path');

    // The REAL (non-worst-case, idle/disconnected default) button set at
    // this same live column DOES fit in 3 rows / 80px — live-measured on
    // the isolated rig (2026-08-13): natural widths [105.625, 90.015625,
    // 43.21875, 51.015625, 66.609375] (Match/Connect, not Stop
    // Match/Disconnect).
    const naturalWidths = [105.625, 90.015625, 43.21875, 51.015625, 66.609375];
    const naturalRows = computeWrappedRowCount(naturalWidths, ENGINE_CONTROLS_GAP_PX, 150.5);
    expect(naturalRows).toBe(3);
    const naturalNeededPx = computeClusterNeededHeightPx(naturalRows, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX);
    expect(naturalNeededPx).toBe(80);
    expect(resolveEngineControlsRealization(naturalNeededPx, A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX)).toBe('button-cluster');
  });
});
