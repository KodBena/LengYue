/**
 * tests/integration/forest-directory-two-col-narrow-guard.test.ts
 *
 * Regression coverage for defect (e) (statusbar-cards-completion-build,
 * live-witnessed against `fd2a_cardtree_poorly_utilized_space_when_
 * selecting_card.png` / `5f94_clicking_a_card_hides_tree.png`): clicking
 * a card node in Browse used to squeeze `.chart-wrapper` (the card-tree
 * canvas) down to a live-witnessed ~23px sliver — effectively hiding the
 * tree — because `ForestDirectory.vue`'s `.panel-content-two-col` class
 * was gated on `props.twoColumnReflow`, itself derived from the
 * WHOLE-WORKSPACE viewport width class (App.vue's `panelContentPolicy`),
 * not from this panel's own rendered width. The Cards surface shares the
 * split layout's right column with the goban, so a wide/vast viewport
 * (`twoColumnReflow: true`) could still leave `.tree-panel` far narrower
 * than the two-column layout needs.
 *
 * two-col-class-closure-build (ADR-0000 Rule 2(a) closure, ledger rows
 * 2564/2565): the first patch (this file's prior revision) ANDed the
 * ancestor's `twoColumnReflow` intent with a container-measured guard —
 * the commissioner ruled that insufficient, because the wrong-currency
 * signal stayed representable at the seam (`getPanelContentPolicy`,
 * since deleted from `src/state/layout-model.ts` — see that module's
 * HISTORICAL note above `PANEL_CONTENT_READING_MEASURE_CH`'s
 * declaration). `ForestDirectory.vue` no longer accepts a
 * `twoColumnReflow` prop at all: `effectiveTwoColumnReflow` now reduces
 * to the container-measured guard ALONE
 * (`!treePanelTooNarrowForTwoCol.value`).
 *
 * The invariant this file now pins is single-input: `.panel-content-two-col`
 * applies IFF `.tree-panel`'s own measured width is at/above
 * `FOREST_TREE_TWO_COL_THRESHOLD_PX` (state/layout-model.ts) — no ancestor
 * operand exists to narrow or widen that decision any more.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import ForestDirectory from '../../src/components/tree/ForestDirectory.vue';
import { FOREST_TREE_TWO_COL_THRESHOLD_PX } from '../../src/state/layout-model';

// A ResizeObserver fake that ACTUALLY delivers a callback. Every instance
// reports the SAME test-controlled width for whatever element it
// observes: `ForestDirectory.vue` stands up three separate ResizeObserver
// instances (forestCqWrapperEl / treePanelEl aspect / treePanelEl
// two-col-width), and this test only needs to control the two-col-width
// one's effective reading — feeding the same width to all three is
// harmless (a genuinely narrow container legitimately narrow-stacks too;
// that's an orthogonal, already-covered concern).
let currentWidthPx = 1000;

class FakeResizeObserver {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    // Synchronous delivery — @vue/test-utils' `mount()` runs onMounted
    // synchronously, and the observer's own `evaluate()`/`commitIfIdle()`
    // (useDeferredContainerBreakpoint.ts) apply the reading immediately
    // when `isAnyPanelResizing` is false (its default, unset here).
    this.cb(
      [{ contentRect: { width: currentWidthPx, height: 100 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

let originalResizeObserver: typeof ResizeObserver | undefined;

beforeEach(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
});

afterEach(() => {
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
  currentWidthPx = 1000;
});

vi.mock('../../src/services/backend-service', () => ({
  backendService: {
    getForestStats: vi.fn().mockResolvedValue([]),
    fetchTreeByRoot: vi.fn().mockResolvedValue(null),
    queryForest: vi.fn().mockResolvedValue([]),
    resolveRoots: vi.fn().mockResolvedValue({}),
    fetchCard: vi.fn().mockResolvedValue(null),
    updateCardMetadata: vi.fn().mockResolvedValue(null),
  },
}));

describe('ForestDirectory — two-col reflow is driven ONLY by the panel\'s own measured width (defect e, closed in full)', () => {
  it('omits panel-content-two-col when .tree-panel measures NARROWER than FOREST_TREE_TWO_COL_THRESHOLD_PX — the exact live-witnessed repro condition', async () => {
    currentWidthPx = FOREST_TREE_TWO_COL_THRESHOLD_PX - 50; // well inside the "too narrow" band
    const wrapper = mount(ForestDirectory, {
      global: { plugins: [i18n] },
    });
    await flushPromises();
    expect(wrapper.find('.forest-container').classes()).not.toContain('panel-content-two-col');
  });

  it('applies panel-content-two-col when .tree-panel measures at/above the threshold', async () => {
    currentWidthPx = FOREST_TREE_TWO_COL_THRESHOLD_PX + 200;
    const wrapper = mount(ForestDirectory, {
      global: { plugins: [i18n] },
    });
    await flushPromises();
    expect(wrapper.find('.forest-container').classes()).toContain('panel-content-two-col');
  });
});
