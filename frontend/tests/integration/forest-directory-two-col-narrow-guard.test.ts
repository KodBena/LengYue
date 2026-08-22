/**
 * tests/integration/forest-directory-two-col-narrow-guard.test.ts
 *
 * Regression coverage for defect (e) (statusbar-cards-completion-build,
 * live-witnessed against `fd2a_cardtree_poorly_utilized_space_when_
 * selecting_card.png` / `5f94_clicking_a_card_hides_tree.png`): clicking
 * a card node in Browse used to squeeze `.chart-wrapper` (the card-tree
 * canvas) down to a live-witnessed ~23px sliver — effectively hiding the
 * tree — because `ForestDirectory.vue`'s `.panel-content-two-col` class
 * was gated ONLY on `props.twoColumnReflow`, itself derived from the
 * WHOLE-WORKSPACE viewport width class (App.vue's `panelContentPolicy`),
 * not from this panel's own rendered width. The Cards surface shares the
 * split layout's right column with the goban, so a wide/vast viewport
 * (`twoColumnReflow: true`) can still leave `.tree-panel` far narrower
 * than the two-column layout needs.
 *
 * The fix (`ForestDirectory.vue`'s `effectiveTwoColumnReflow` computed)
 * ANDs the ancestor's intent with a container-measured guard on
 * `.tree-panel` itself, via `useDeferredContainerBreakpoint` gated on
 * `FOREST_TREE_TWO_COL_THRESHOLD_PX` (state/layout-model.ts, pinned in
 * `tests/unit/state/layout-model.test.ts`). This file exercises the
 * component-level behavior a pure constant test cannot: that a NARROW
 * measured `.tree-panel`, even with `twoColumnReflow: true`, does NOT
 * apply `.panel-content-two-col` — the tree stays full-width instead of
 * being squeezed beside the metadata panel.
 *
 * `panel-content-two-col-reflow.test.ts` (read in full before authoring
 * this file) is the sibling suite this one extends: that file pins the
 * UNMEASURED-width case (a `NoopResizeObserver` stub, `committed` never
 * flips from its `false` default, so `effectiveTwoColumnReflow` reduces
 * to the bare prop — unaffected by this fix, still asserted true/false
 * per the prop alone). This file instead exercises the MEASURED case: a
 * `ResizeObserver` fake that actually delivers a narrow contentRect.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import ForestDirectory from '../../src/components/tree/ForestDirectory.vue';
import { FOREST_TREE_TWO_COL_THRESHOLD_PX } from '../../src/state/layout-model';

// A ResizeObserver fake that ACTUALLY delivers a callback (unlike
// panel-content-two-col-reflow.test.ts's NoopResizeObserver, which never
// fires — this file specifically needs the measured-width path to run).
// Every instance reports the SAME test-controlled width for whatever
// element it observes: `ForestDirectory.vue` stands up three separate
// ResizeObserver instances (forestCqWrapperEl / treePanelEl aspect /
// treePanelEl two-col-width), and this test only needs to control the
// two-col-width one's effective reading — feeding the same width to all
// three is harmless (a genuinely narrow container legitimately narrow-
// stacks too; that's an orthogonal, already-covered concern).
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

describe('ForestDirectory — two-col reflow is guarded by the panel\'s OWN measured width (defect e)', () => {
  it('omits panel-content-two-col when the ancestor says wide (twoColumnReflow: true) but .tree-panel measures NARROWER than FOREST_TREE_TWO_COL_THRESHOLD_PX — the exact live-witnessed repro condition', async () => {
    currentWidthPx = FOREST_TREE_TWO_COL_THRESHOLD_PX - 50; // well inside the "too narrow" band
    const wrapper = mount(ForestDirectory, {
      props: { twoColumnReflow: true },
      global: { plugins: [i18n] },
    });
    await flushPromises();
    expect(wrapper.find('.forest-container').classes()).not.toContain('panel-content-two-col');
  });

  it('applies panel-content-two-col when the ancestor says wide AND .tree-panel measures at/above the threshold — the legitimate two-col case stays intact', async () => {
    currentWidthPx = FOREST_TREE_TWO_COL_THRESHOLD_PX + 200;
    const wrapper = mount(ForestDirectory, {
      props: { twoColumnReflow: true },
      global: { plugins: [i18n] },
    });
    await flushPromises();
    expect(wrapper.find('.forest-container').classes()).toContain('panel-content-two-col');
  });

  it('never applies panel-content-two-col when the ancestor says narrow (twoColumnReflow: false), regardless of measured width — the guard only NARROWS the ancestor\'s intent, never widens it', async () => {
    currentWidthPx = FOREST_TREE_TWO_COL_THRESHOLD_PX + 500; // plenty of room
    const wrapper = mount(ForestDirectory, {
      props: { twoColumnReflow: false },
      global: { plugins: [i18n] },
    });
    await flushPromises();
    expect(wrapper.find('.forest-container').classes()).not.toContain('panel-content-two-col');
  });
});
