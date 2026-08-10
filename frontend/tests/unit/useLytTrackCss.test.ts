/**
 * tests/unit/useLytTrackCss.test.ts
 *
 * Tier-1 pure-logic test for `trackCssValue` (`src/composables/chrome/
 * useLytTrackCss.ts`), focused on the W2 `leadingReservedPx` parameter
 * (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md` §8 W2 —
 * generalizing the board-priority-clamp formula for a now-toggleable
 * boardRail). See that module's own header for the full derivation.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { trackCssValue, gapCssFor } from '../../src/composables/chrome/useLytTrackCss';
import type { LytTrackShape } from '../../src/state/lyt-layout.gen';

describe('trackCssValue — fixed/elastic/elastic-capped (unchanged by W2)', () => {
  it('fixed', () => {
    expect(trackCssValue({ kind: 'fixed', px: 42 })).toBe('42px');
  });
  it('elastic', () => {
    expect(trackCssValue({ kind: 'elastic', minPx: 10, frWeight: 2 })).toBe('minmax(10px, 2fr)');
  });
  it('elastic-capped', () => {
    expect(trackCssValue({ kind: 'elastic-capped', minPx: 10, maxPx: 100 })).toBe('minmax(10px, 100px)');
  });
});

describe('trackCssValue — board-priority-clamp, leadingReservedPx generalization (W2)', () => {
  const shape: LytTrackShape = {
    kind: 'board-priority-clamp',
    minPx: 480,
    maxPx: 820,
    naturalBoardCrossUnit: 'vh',
    fixedSiblingSumPx: 52,
    parentGapPx: 12,
  };

  it('defaults to 0 reservation, reproducing the pre-W2 formula byte-for-byte', () => {
    const withDefault = trackCssValue(shape);
    const withExplicitZero = trackCssValue(shape, 0);
    expect(withDefault).toBe(withExplicitZero);
    expect(withDefault).toBe('clamp(480px, calc(100% - (calc(100vh - 52px)) - 12px), 820px)');
  });

  it('subtracts a nonzero leadingReservedPx as an additional term (boardRail visible: 168px + 12px gap)', () => {
    const reserved = 168 + 12; // boardRail's own fixed px + one split gap
    const out = trackCssValue(shape, reserved);
    expect(out).toBe('clamp(480px, calc(100% - (calc(100vh - 52px)) - 12px - 180px), 820px)');
  });

  it('a zero-reservation call and a positive-reservation call differ only in the trailing subtraction term', () => {
    const zero = trackCssValue(shape, 0);
    const nonzero = trackCssValue(shape, 180);
    expect(nonzero).toBe(zero.replace(') - 12px)', ') - 12px - 180px)'));
  });
});

describe('gapCssFor (unchanged)', () => {
  it('h axis: column-gap carries, row-gap is 0', () => {
    expect(gapCssFor('h', 12)).toEqual({ columnGap: '12px', rowGap: '0px' });
  });
  it('v axis: row-gap carries, column-gap is 0', () => {
    expect(gapCssFor('v', 4)).toEqual({ columnGap: '0px', rowGap: '4px' });
  });
});
