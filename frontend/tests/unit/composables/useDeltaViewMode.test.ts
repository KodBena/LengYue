/**
 * tests/unit/composables/useDeltaViewMode.test.ts
 *
 * Tier 1 (pure logic) coverage for `useDeltaViewMode.ts` — the
 * delta-analysis panel's three-mode view cycle (ledger row 418). Three
 * properties, matching the commission's test list:
 *
 *   1. The mode union + cycle order: shared → black → white → shared,
 *      and nowhere else (a 4th mode or a skipped step would be a real
 *      regression against the commissioned cycle order).
 *   2. `seriesForMode` is the hit-testable-payload property under test —
 *      "in black-only mode the white series is absent from the
 *      option/hit-test payload (and vice versa)". This is the SAME
 *      function `MergedDeltaPanel`'s `mergedSeries` (chart build) and
 *      `colorAt` (click dispatch) both read through, so asserting on it
 *      directly observes the property the commission asks for — "what a
 *      click CAN hit" — without mounting ECharts under jsdom.
 *   3. The shared-mode regression lock: `seriesForMode(black, white,
 *      'shared')` returns the two inputs BY REFERENCE — the strongest
 *      available guarantee that shared mode's series config is
 *      unchanged from today (a reference-equality pass rules out even an
 *      accidental copy/reshape, which a deep-equality check would miss).
 *
 * No DOM, no fakes, no Vue reactivity — pure functions over plain
 * `EnrichedSeries` fixtures, per `tests/CLAUDE.md`'s Tier 1 contract.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import {
  DELTA_VIEW_MODE_CYCLE,
  DELTA_VIEW_MODE_LABEL,
  nextDeltaViewMode,
  isColorVisibleInMode,
  seriesForMode,
  type DeltaViewMode,
} from '../../../src/composables/analysis/useDeltaViewMode';
import type { EnrichedSeries } from '../../../src/composables/analysis/enriched-accumulator';

const blackFixture: EnrichedSeries[] = [{ name: 'Black Delta', data: [[0, 1.5], [1, -0.5]] }];
const whiteFixture: EnrichedSeries[] = [{ name: 'White Delta', data: [[0, 2.0], [1, 0.0]] }];

describe('useDeltaViewMode — the mode union and cycle order', () => {
  it('the cycle is exactly [shared, black, white], no other mode', () => {
    expect(DELTA_VIEW_MODE_CYCLE).toEqual(['shared', 'black', 'white']);
  });

  it('cycles shared → black → white → shared and stops repeating there', () => {
    const seen: DeltaViewMode[] = [];
    let mode: DeltaViewMode = 'shared';
    for (let i = 0; i < 4; i++) {
      seen.push(mode);
      mode = nextDeltaViewMode(mode);
    }
    expect(seen).toEqual(['shared', 'black', 'white', 'shared']);
    // The 4th step returns to the 1st mode — confirms the wrap, not a
    // 4-element cycle.
    expect(mode).toBe('black');
  });

  it('every cycle mode has a human-facing label', () => {
    for (const mode of DELTA_VIEW_MODE_CYCLE) {
      expect(typeof DELTA_VIEW_MODE_LABEL[mode]).toBe('string');
      expect(DELTA_VIEW_MODE_LABEL[mode].length).toBeGreaterThan(0);
    }
  });
});

describe('useDeltaViewMode — isColorVisibleInMode', () => {
  it('shared shows both colours', () => {
    expect(isColorVisibleInMode('shared', 'B')).toBe(true);
    expect(isColorVisibleInMode('shared', 'W')).toBe(true);
  });

  it('black mode shows only black; white mode shows only white', () => {
    expect(isColorVisibleInMode('black', 'B')).toBe(true);
    expect(isColorVisibleInMode('black', 'W')).toBe(false);
    expect(isColorVisibleInMode('white', 'B')).toBe(false);
    expect(isColorVisibleInMode('white', 'W')).toBe(true);
  });
});

describe('useDeltaViewMode — seriesForMode (the click-path hit-test payload)', () => {
  it("black-only mode: white's series is absent (an empty array, not a filtered copy)", () => {
    const result = seriesForMode(blackFixture, whiteFixture, 'black');
    expect(result.white).toEqual([]);
    expect(result.black).toBe(blackFixture); // unfiltered colour passes through unchanged
  });

  it("white-only mode: black's series is absent", () => {
    const result = seriesForMode(blackFixture, whiteFixture, 'white');
    expect(result.black).toEqual([]);
    expect(result.white).toBe(whiteFixture);
  });

  it('a click can never resolve to the hidden colour: no data point survives the projection', () => {
    // Simulate the click-dispatch scan `colorAt` performs: find any
    // datum in the projected series. In black-only mode, no white datum
    // is reachable through the projection at all.
    const { white } = seriesForMode(blackFixture, whiteFixture, 'black');
    const anyWhiteDatum = white.flatMap(s => s.data).find(([, v]) => v != null);
    expect(anyWhiteDatum).toBeUndefined();
  });

  describe('shared mode — regression lock: today\'s series config is unchanged', () => {
    it('returns both inputs BY REFERENCE (not a copy, not a reshape)', () => {
      const result = seriesForMode(blackFixture, whiteFixture, 'shared');
      expect(result.black).toBe(blackFixture);
      expect(result.white).toBe(whiteFixture);
    });

    it('is insensitive to input shape — empty, single, or multi-series arrays pass through identically', () => {
      const empty: EnrichedSeries[] = [];
      const multi: EnrichedSeries[] = [
        { name: 'a', data: [[0, 1]] },
        { name: 'b', data: [[1, 2]] },
      ];
      expect(seriesForMode(empty, whiteFixture, 'shared').black).toBe(empty);
      expect(seriesForMode(multi, whiteFixture, 'shared').black).toBe(multi);
    });
  });
});
