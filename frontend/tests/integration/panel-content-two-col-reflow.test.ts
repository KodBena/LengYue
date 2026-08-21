/**
 * tests/integration/panel-content-two-col-reflow.test.ts
 *
 * Resolution roadmap Phase 3 (ledger rows 929/926, audit finding R3):
 * component-level coverage for the `twoColumnReflow` prop LibraryTab.vue
 * and ForestDirectory.vue both now accept from App.vue
 * (`panelContentPolicy.twoColumnReflow`, derived from
 * `getPanelContentPolicy` / `state/layout-model.ts`'s
 * `PANEL_CONTENT_POLICY_BY_WIDTH_CLASS`). This tier asserts only the
 * CLASS APPLICATION the prop drives (`panel-content-two-col` present at
 * wide/vast, absent at compact/standard) — not the resulting pixel
 * geometry, which is a browser layout concern outside jsdom's remit
 * (mirrors `LibraryTable-column-fit.test.ts`'s own restraint: assert
 * the class/structural fact a unit test can pin, not a rendered
 * pixel).
 *
 * Both components' own composables reach `backend-service.ts` /
 * `library-service.ts` at the network boundary; both mocked here per
 * `tests/CLAUDE.md`'s service-boundary-fake convention so this test
 * never touches the network (LibraryTab's `onMounted` unconditionally
 * refreshes; ForestDirectory's own fetch is gated on
 * `auth.isAuthenticated`, false by default in a fresh test store, but
 * mocked anyway for determinism against a future auth-default change).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import LibraryTab from '../../src/components/library/LibraryTab.vue';
import ForestDirectory from '../../src/components/tree/ForestDirectory.vue';

// jsdom ships no ResizeObserver; both components mount one (LibraryTable's
// own height tracker, ForestDirectory's narrow-stack breakpoint via
// useDeferredContainerBreakpoint). This test only asserts static class
// application, never a width-driven callback, so a no-op stub suffices —
// same minimal shape as `render-count/jsdom-stubs.ts`'s own ResizeObserver
// stub, inlined here rather than shared since this file needs none of that
// harness's other (render-count-specific) setup.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let originalResizeObserver: typeof ResizeObserver | undefined;

beforeEach(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
});

afterEach(() => {
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
});

vi.mock('../../src/services/library-service', () => ({
  libraryService: {
    listGames: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
    listPlayers: vi.fn().mockResolvedValue([]),
    getGame: vi.fn().mockResolvedValue(null),
    importGames: vi.fn().mockResolvedValue([]),
  },
}));

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

describe('LibraryTab — panel-content-two-col class application (R3)', () => {
  it('applies the class when twoColumnReflow is true (wide/vast width class)', () => {
    const wrapper = mount(LibraryTab, {
      props: { twoColumnReflow: true },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('.library-tab').classes()).toContain('panel-content-two-col');
  });

  it('omits the class when twoColumnReflow is false (compact/standard width class)', () => {
    const wrapper = mount(LibraryTab, {
      props: { twoColumnReflow: false },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('.library-tab').classes()).not.toContain('panel-content-two-col');
  });

  it('omits the class when the prop is not passed at all (standalone-mount default)', () => {
    const wrapper = mount(LibraryTab, { global: { plugins: [i18n] } });
    expect(wrapper.find('.library-tab').classes()).not.toContain('panel-content-two-col');
  });
});

describe('ForestDirectory (Cards tab) — panel-content-two-col class application (R3)', () => {
  it('applies the class when twoColumnReflow is true (wide/vast width class)', () => {
    const wrapper = mount(ForestDirectory, {
      props: { twoColumnReflow: true },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('.forest-container').classes()).toContain('panel-content-two-col');
  });

  it('omits the class when twoColumnReflow is false (compact/standard width class)', () => {
    const wrapper = mount(ForestDirectory, {
      props: { twoColumnReflow: false },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('.forest-container').classes()).not.toContain('panel-content-two-col');
  });
});
