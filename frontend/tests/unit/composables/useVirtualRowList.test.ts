/**
 * tests/unit/composables/useVirtualRowList.test.ts
 *
 * Unit tests for the fixed-row-height virtual-scroll primitive.
 * Pure logic — no DOM, no fakes, no service mocks. Feeds plain
 * Vue refs through the composable and inspects the computed
 * outputs.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useVirtualRowList } from '../../../src/composables/library/useVirtualRowList';

const ROW = 40;       // px per row in these tests
const CONTAINER = 400; // 10 rows fit fully in the window

describe('useVirtualRowList — empty / unloaded', () => {
  it('emits zero range when totalCount is null', () => {
    const v = useVirtualRowList({
      totalCount: ref<number | null>(null),
      rowHeightPx: ROW,
      containerHeightPx: ref(CONTAINER),
      scrollTopPx: ref(0),
    });
    expect(v.visibleStart.value).toBe(0);
    expect(v.visibleEnd.value).toBe(0);
    expect(v.topSpacerPx.value).toBe(0);
    expect(v.totalHeightPx.value).toBe(0);
  });

  it('emits zero range when totalCount is 0', () => {
    const v = useVirtualRowList({
      totalCount: ref(0),
      rowHeightPx: ROW,
      containerHeightPx: ref(CONTAINER),
      scrollTopPx: ref(0),
    });
    expect(v.visibleEnd.value).toBe(0);
  });
});

describe('useVirtualRowList — top of list', () => {
  it('starts at index 0 when scrollTop is 0', () => {
    const v = useVirtualRowList({
      totalCount: ref(1000),
      rowHeightPx: ROW,
      containerHeightPx: ref(CONTAINER),
      scrollTopPx: ref(0),
      overscan: 5,
    });
    expect(v.visibleStart.value).toBe(0);
    // 10 rows visible + 5 overscan = 15
    expect(v.visibleEnd.value).toBe(15);
    expect(v.topSpacerPx.value).toBe(0);
  });

  it('totalHeightPx equals totalCount × rowHeightPx', () => {
    const v = useVirtualRowList({
      totalCount: ref(1000),
      rowHeightPx: ROW,
      containerHeightPx: ref(CONTAINER),
      scrollTopPx: ref(0),
    });
    expect(v.totalHeightPx.value).toBe(1000 * ROW);
  });
});

describe('useVirtualRowList — mid-scroll', () => {
  it('start = floor(scrollTop / rowHeight) - overscan', () => {
    const scrollTopPx = ref(50 * ROW);  // scrolled past row 50
    const v = useVirtualRowList({
      totalCount: ref(1000),
      rowHeightPx: ROW,
      containerHeightPx: ref(CONTAINER),
      scrollTopPx,
      overscan: 5,
    });
    expect(v.visibleStart.value).toBe(50 - 5);  // 45
    expect(v.visibleEnd.value).toBe(50 + 10 + 5);  // 65
    expect(v.topSpacerPx.value).toBe(45 * ROW);
  });

  it('react to scrollTop change', () => {
    const scrollTopPx = ref(0);
    const v = useVirtualRowList({
      totalCount: ref(1000),
      rowHeightPx: ROW,
      containerHeightPx: ref(CONTAINER),
      scrollTopPx,
      overscan: 5,
    });
    expect(v.visibleStart.value).toBe(0);
    scrollTopPx.value = 100 * ROW;
    expect(v.visibleStart.value).toBe(95);
    expect(v.visibleEnd.value).toBe(115);
  });

  it('non-aligned scroll (between row boundaries) rounds correctly', () => {
    // scrollTop = 50.7 rows — first fully visible is row 50.
    const v = useVirtualRowList({
      totalCount: ref(1000),
      rowHeightPx: ROW,
      containerHeightPx: ref(CONTAINER),
      scrollTopPx: ref(50.7 * ROW),
      overscan: 0,
    });
    expect(v.visibleStart.value).toBe(50);
  });
});

describe('useVirtualRowList — clamping', () => {
  it('clamps visibleStart at 0 (no negative indices)', () => {
    const v = useVirtualRowList({
      totalCount: ref(1000),
      rowHeightPx: ROW,
      containerHeightPx: ref(CONTAINER),
      scrollTopPx: ref(0),
      overscan: 100,
    });
    expect(v.visibleStart.value).toBe(0);
  });

  it('clamps visibleEnd at totalCount', () => {
    const v = useVirtualRowList({
      totalCount: ref(20),
      rowHeightPx: ROW,
      containerHeightPx: ref(CONTAINER),
      scrollTopPx: ref(0),
      overscan: 5,
    });
    // 10 rows visible + 5 overscan = 15, but totalCount = 20
    // so visibleEnd = min(20, 15) = 15
    expect(v.visibleEnd.value).toBe(15);
  });

  it('renders entire small list when totalCount fits in window', () => {
    const v = useVirtualRowList({
      totalCount: ref(5),
      rowHeightPx: ROW,
      containerHeightPx: ref(CONTAINER),
      scrollTopPx: ref(0),
    });
    expect(v.visibleStart.value).toBe(0);
    expect(v.visibleEnd.value).toBe(5);
  });
});

describe('useVirtualRowList — overscan parameter', () => {
  it('default overscan is 5', () => {
    const v = useVirtualRowList({
      totalCount: ref(1000),
      rowHeightPx: ROW,
      containerHeightPx: ref(CONTAINER),
      scrollTopPx: ref(20 * ROW),
    });
    expect(v.visibleStart.value).toBe(15);
    expect(v.visibleEnd.value).toBe(35);
  });

  it('explicit overscan=0 renders only strictly visible rows', () => {
    const v = useVirtualRowList({
      totalCount: ref(1000),
      rowHeightPx: ROW,
      containerHeightPx: ref(CONTAINER),
      scrollTopPx: ref(20 * ROW),
      overscan: 0,
    });
    expect(v.visibleStart.value).toBe(20);
    expect(v.visibleEnd.value).toBe(30);
  });
});

describe('useVirtualRowList — container resize', () => {
  it('reacts to container height change', () => {
    const containerHeightPx = ref(400);  // 10 rows
    const v = useVirtualRowList({
      totalCount: ref(1000),
      rowHeightPx: ROW,
      containerHeightPx,
      scrollTopPx: ref(0),
      overscan: 0,
    });
    expect(v.visibleEnd.value).toBe(10);
    containerHeightPx.value = 800;  // 20 rows
    expect(v.visibleEnd.value).toBe(20);
  });
});
