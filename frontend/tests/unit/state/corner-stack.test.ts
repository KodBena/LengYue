/**
 * tests/unit/state/corner-stack.test.ts
 *
 * Space-owner cure, dispatch L5 (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §1.4). Pins `CornerStack`'s own construction
 * refusals and its `layout()`/`totalHeight()` arithmetic — pure logic,
 * no DOM, Tier 1.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { CornerStack, type CornerStackEntry } from '../../../src/state/corner-stack';
import { measured, px } from '../../../src/state/feasible-layout';

type Region = 'triggers' | 'log' | 'banners';

function entry(region: Region, order: number, preferredPx: number, reserves = false): CornerStackEntry<Region> {
  return {
    region,
    anchor: 'bottom-right',
    order,
    reserves,
    measured: measured({ region, axis: 'v', min: px(0), preferred: px(preferredPx), maxUseful: px(preferredPx) }),
  };
}

describe('CornerStack.build()', () => {
  it('accepts a well-formed set of entries at distinct orders within one anchor', () => {
    const stack = CornerStack.build([entry('triggers', 0, 28, true), entry('log', 1, 0), entry('banners', 2, 0)]);
    expect(stack).toBeInstanceOf(CornerStack);
  });

  it('refuses two entries at the SAME order within the SAME anchor — the review\'s own "unrepresentable overlap" cure', () => {
    expect(() => CornerStack.build([entry('triggers', 0, 28), entry('log', 0, 40)])).toThrow(/two entries at order/);
  });

  it('permits the SAME order value across DIFFERENT anchors (no cross-anchor collision)', () => {
    const a: CornerStackEntry<Region> = { ...entry('triggers', 0, 28), anchor: 'bottom-right' };
    const b: CornerStackEntry<Region> = { ...entry('log', 0, 40), anchor: 'bottom-left' };
    expect(() => CornerStack.build([a, b])).not.toThrow();
  });

  it('refuses an entry whose own Measured axis is not "v"', () => {
    const bad: CornerStackEntry<Region> = {
      region: 'triggers',
      anchor: 'bottom-right',
      order: 0,
      reserves: true,
      measured: measured({ region: 'triggers', axis: 'h', min: px(0), preferred: px(28), maxUseful: px(28) }),
    };
    expect(() => CornerStack.build([bad])).toThrow(/not "v"/);
  });
});

describe('CornerStack.layout()', () => {
  it('gives the lowest-order entry an offset of zero — closest to the anchor edge', () => {
    const stack = CornerStack.build([entry('triggers', 0, 28, true), entry('log', 1, 60)]);
    const offsets = stack.layout(px(4));
    expect(offsets.get('triggers')).toBe(0);
  });

  it("computes each entry's offset as the running sum of every LOWER-order entry's own live height plus one gap — the direct replacement for the hand-guessed +40px", () => {
    const stack = CornerStack.build([entry('triggers', 0, 28, true), entry('log', 1, 60), entry('banners', 2, 30)]);
    const offsets = stack.layout(px(4));
    expect(offsets.get('triggers')).toBe(0);
    expect(offsets.get('log')).toBe(28 + 4); // triggers' own preferred + one gap
    expect(offsets.get('banners')).toBe(28 + 4 + 60 + 4); // triggers + log, each + their own gap
  });

  it('a reserves:false entry currently contributing zero height (measured.preferred = 0) adds nothing to a higher entry\'s offset beyond the gap', () => {
    const stack = CornerStack.build([entry('triggers', 0, 28, true), entry('log', 1, 0), entry('banners', 2, 0)]);
    const offsets = stack.layout(px(4));
    expect(offsets.get('log')).toBe(28 + 4);
    expect(offsets.get('banners')).toBe(28 + 4 + 0 + 4);
  });
});

describe('CornerStack.totalHeight()', () => {
  it('sums every entry\'s own live height plus one gap each', () => {
    const stack = CornerStack.build([entry('triggers', 0, 28, true), entry('log', 1, 60), entry('banners', 2, 30)]);
    expect(stack.totalHeight(px(4))).toBe(28 + 4 + 60 + 4 + 30 + 4);
  });

  it('is zero for an empty stack', () => {
    const stack = CornerStack.build([]);
    expect(stack.totalHeight(px(4))).toBe(0);
  });
});
