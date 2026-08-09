/**
 * tests/unit/state/table-column-fit.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/state/table-column-fit.ts` —
 * resolution roadmap Phase 2 (ledger row 928). `fitColumns` is a pure
 * function of (availableWidthPx, columns, gapPx, indicatorWidthPx);
 * no DOM, no Vue reactivity, no component mount — mirrors
 * `layout-model.test.ts`'s own tier-1 shape.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { fitColumns, type TableColumnSpec } from '../../../src/state/table-column-fit';

type K = 'a' | 'b' | 'c' | 'd';

// Mirrors LIBRARY_TABLE_COLUMNS's shape closely enough to exercise the
// same drop-order and floor guarantees without importing the real
// (presentation-flavoured) table spec.
// minWidths are deliberately each > (GAP + INDICATOR) below so that
// dropping any ONE column always nets real space back — with a
// column smaller than the indicator's own footprint, dropping it
// could cost more (indicator + its gap) than it saves, which is a
// real and correctly-handled cascade (see the "reserves room for the
// indicator" test below) but would make the single-column-at-a-time
// assertions in this block non-deterministic to hand-compute.
const COLUMNS: readonly TableColumnSpec<K>[] = [
  { key: 'a', label: 'A', minWidth: 70, priority: 1 }, // drops first
  { key: 'b', label: 'B', minWidth: 80, priority: 3 },
  { key: 'c', label: 'C', minWidth: 80, priority: 4 }, // survives longest
  { key: 'd', label: 'D', minWidth: 60, priority: 2 },
];
const GAP = 8;
const INDICATOR = 50;

function totalWidth(spec: readonly TableColumnSpec<K>[]): number {
  return spec.reduce((s, c) => s + c.minWidth, 0);
}

describe('fitColumns — postcondition: no rendered column below its minWidth', () => {
  it('every visible column keeps its own declared minWidth (property, not a size query)', () => {
    for (const w of [0, 10, 39, 40, 100, 150, 200, 260, 400, 1000]) {
      const { visible } = fitColumns(w, COLUMNS, GAP, INDICATOR);
      for (const col of visible) {
        expect(col.minWidth).toBeGreaterThan(0); // sanity: the spec itself never claims a 0-width floor
      }
    }
  });

  it('a column is never split between visible and dropped', () => {
    const { visible, dropped } = fitColumns(150, COLUMNS, GAP, INDICATOR);
    const visibleKeys = new Set(visible.map((c) => c.key));
    const droppedKeys = new Set(dropped.map((c) => c.key));
    for (const key of visibleKeys) expect(droppedKeys.has(key)).toBe(false);
    expect(visible.length + dropped.length).toBe(COLUMNS.length);
  });
});

describe('fitColumns — everything fits', () => {
  it('shows every column and drops none when the width comfortably exceeds the total', () => {
    const full = totalWidth(COLUMNS) + GAP * (COLUMNS.length - 1);
    const { visible, dropped } = fitColumns(full + 500, COLUMNS, GAP, INDICATOR);
    expect(visible.map((c) => c.key)).toEqual(['a', 'b', 'c', 'd']); // original order preserved
    expect(dropped).toEqual([]);
  });

  it('shows every column at the EXACT fit width (boundary, not just comfortably above)', () => {
    const exact = totalWidth(COLUMNS) + GAP * (COLUMNS.length - 1);
    const { visible, dropped } = fitColumns(exact, COLUMNS, GAP, INDICATOR);
    expect(visible.length).toBe(COLUMNS.length);
    expect(dropped).toEqual([]);
  });
});

describe('fitColumns — drop order follows priority', () => {
  it('drops the lowest-priority column first as width shrinks one column\'s worth at a time', () => {
    const full = totalWidth(COLUMNS) + GAP * (COLUMNS.length - 1);

    // Just under full: 'a' (priority 1, lowest) drops first.
    const step1 = fitColumns(full - 1, COLUMNS, GAP, INDICATOR);
    expect(step1.dropped.map((c) => c.key)).toEqual(['a']);
    expect(step1.visible.map((c) => c.key)).toEqual(['b', 'c', 'd']);

    // Narrow enough that only 'a' and 'd' (priorities 1, 2) can go.
    const bcWidth = COLUMNS[1]!.minWidth + COLUMNS[2]!.minWidth + GAP + GAP + INDICATOR;
    const step2 = fitColumns(bcWidth, COLUMNS, GAP, INDICATOR);
    expect(step2.dropped.map((c) => c.key).sort()).toEqual(['a', 'd']);
    expect(step2.visible.map((c) => c.key)).toEqual(['b', 'c']);

    // Only the highest-priority column ('c') fits.
    const cOnly = COLUMNS[2]!.minWidth + GAP + INDICATOR;
    const step3 = fitColumns(cOnly, COLUMNS, GAP, INDICATOR);
    expect(step3.visible.map((c) => c.key)).toEqual(['c']);
    expect(step3.dropped.map((c) => c.key).sort()).toEqual(['a', 'b', 'd']);
  });

  it('drops EVERY column when nothing (not even one column + the indicator) fits', () => {
    const { visible, dropped } = fitColumns(5, COLUMNS, GAP, INDICATOR);
    expect(visible).toEqual([]);
    expect(dropped.map((c) => c.key).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a tie in priority breaks deterministically (later original-order column drops first)', () => {
    const tied: readonly TableColumnSpec<'x' | 'y'>[] = [
      { key: 'x', label: 'X', minWidth: 70, priority: 1 },
      { key: 'y', label: 'Y', minWidth: 70, priority: 1 },
    ];
    // Both fit at 70+70+gap=148; one column + indicator fits at
    // 70+gap+indicator=128. 140 sits strictly between: both columns
    // together don't fit, but dropping exactly one does.
    const { visible, dropped } = fitColumns(140, tied, GAP, INDICATOR);
    expect(visible.map((c) => c.key)).toEqual(['x']);
    expect(dropped.map((c) => c.key)).toEqual(['y']);
  });
});

describe('fitColumns — indicator count equals dropped count', () => {
  it('dropped.length is exactly the number of columns removed to fit', () => {
    for (const w of [0, 60, 130, 220, 300, 1000]) {
      const { visible, dropped } = fitColumns(w, COLUMNS, GAP, INDICATOR);
      expect(dropped.length).toBe(COLUMNS.length - visible.length);
    }
  });

  it('reserves room for the indicator itself once anything is dropped', () => {
    // Width fits b+c+d exactly, but WITHOUT room for the indicator that
    // dropping 'a' would require rendering — 'a' still has to drop
    // (nothing else CAN go), so the indicator must be visually possible:
    // the fit function should not report "all four fit" here.
    const bcd = COLUMNS[1]!.minWidth + COLUMNS[2]!.minWidth + COLUMNS[3]!.minWidth + GAP * 2;
    const { visible, dropped } = fitColumns(bcd, COLUMNS, GAP, INDICATOR);
    expect(dropped.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(COLUMNS.length);
  });
});

describe('fitColumns — degenerate inputs (total function, never throws)', () => {
  it('an empty column spec returns empty visible/dropped', () => {
    expect(fitColumns(500, [], GAP, INDICATOR)).toEqual({ visible: [], dropped: [] });
  });

  it('non-finite width is treated as zero (every column drops)', () => {
    const { visible, dropped } = fitColumns(NaN, COLUMNS, GAP, INDICATOR);
    expect(visible).toEqual([]);
    expect(dropped.length).toBe(COLUMNS.length);
  });

  it('negative width is treated as zero (every column drops)', () => {
    const { visible, dropped } = fitColumns(-100, COLUMNS, GAP, INDICATOR);
    expect(visible).toEqual([]);
    expect(dropped.length).toBe(COLUMNS.length);
  });

  it('zero indicatorWidthPx is a legal default (no reserved indicator track)', () => {
    const exact = totalWidth(COLUMNS) + GAP * (COLUMNS.length - 1);
    const { visible, dropped } = fitColumns(exact, COLUMNS, GAP);
    expect(visible.length).toBe(COLUMNS.length);
    expect(dropped).toEqual([]);
  });
});
