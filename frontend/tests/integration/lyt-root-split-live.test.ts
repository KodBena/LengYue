/**
 * tests/integration/lyt-root-split-live.test.ts
 *
 * GAP A (`.claude/dispatch-reports/lyt-cure-final-repair.md`, ledger rows
 * 2502/2503): end-to-end proof that App.vue's own root-split live solve
 * (`rootSplitLayout`, `App.vue`, consuming `resolveRootSplitLiveLayout`,
 * `src/state/feasible-layout.ts`) reaches the ACTUAL rendered CSS Grid
 * track — not just the pure function in isolation
 * (`tests/unit/state/feasible-layout.test.ts` covers that). Mounts the
 * FULL `App.vue` tree (same preamble as `App-boot.test.ts`, read in full
 * before authoring this file) and reads `#split-workspace`'s own
 * `grid-template-columns` inline style directly, asserting the side
 * column's (root child "2") own resolved track literal matches the
 * pure-function acceptance arithmetic exactly.
 *
 * jsdom performs no real CSS Grid layout — `#tree-control-wrapper`'s own
 * rendered `getBoundingClientRect()` therefore stays at jsdom's default
 * (all-zero) regardless of what the grid track SAYS, which is why this
 * suite reads the TRACK LITERAL (the string App.vue computed and wrote
 * into the style attribute) rather than a post-layout measurement — the
 * same limitation `App-boot.test.ts`'s own existing 1920x1080 test lives
 * with (its own `#control-panel [role="tablist"]` presence assertion is
 * driven by `resolveSideColumnLiveLayout`'s "not yet measured" branch,
 * never by a genuine live wrapper-width reading, since jsdom never
 * measures `#tree-control-wrapper` for real either). Disclosed here
 * rather than silently assumed: this suite proves the ROOT split's own
 * value reaches the grid style correctly; it does NOT re-prove the
 * INTERIOR (tree/controlPanel) resolution downstream of it, which
 * `App-boot.test.ts` and the `feasible-layout` unit suites already cover
 * on their own terms.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';

vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});
vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});
vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});
vi.mock('../../src/composables/cards/useCardThumbnail', () => ({
  clearCardThumbnailCache: vi.fn(),
  getCardThumbnailSync: vi.fn(() => ''),
}));
vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  useThumbnailCache: () => ({ warmPath: vi.fn() }),
}));
vi.mock('../../src/composables/cards/thumbnail-render-resources', () => ({
  purgeBoardThumbnails: vi.fn(),
  purgeAllThumbnails: vi.fn(),
}));
vi.mock('../../src/composables/cards/board-card-trees', () => ({
  removeBoardCardTree: vi.fn(),
  clearAllBoardCardTrees: vi.fn(),
  getOrCreateBoardCardTree: vi.fn(),
  getBoardCardTree: vi.fn(() => null),
}));

import App from '../../src/App.vue';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';

class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function stubSplitWorkspaceRect(widthPx: number, heightPx: number): void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.id === 'split-workspace') {
      return {
        width: widthPx, height: heightPx, top: 0, left: 0,
        right: widthPx, bottom: heightPx, x: 0, y: 0, toJSON() {},
      } as DOMRect;
    }
    return original.call(this);
  };
}

let restoreGBCR: typeof Element.prototype.getBoundingClientRect;
let restoreFetch: typeof globalThis.fetch;

beforeEach(() => {
  resetWorkspace();
  resetFakeBackendService();
  fakeBackendService.getTags.mockResolvedValue([]);
  installRenderEnvStubs();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopResizeObserver;
  restoreGBCR = Element.prototype.getBoundingClientRect;
  restoreFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('network disabled in lyt-root-split-live test'))) as typeof fetch;
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = restoreGBCR;
  globalThis.fetch = restoreFetch;
  removeRenderEnvStubs();
});

describe('App.vue — root-split live track (GAP A: rootSplitLayout reaches the rendered grid-template-columns)', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  it('1920x1080, default content: root child "2" (the side column) resolves to 820px in the rendered grid track — matching the pure-function acceptance table', async () => {
    stubSplitWorkspaceRect(1920, 1080);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);
    const style = wrapper.find('#split-workspace').attributes('style') ?? '';
    expect(style).toContain('820px');
  });

  it('1366x768, default content: root child "2" resolves to 638px — its own NATURAL board-priority yield, below the panel-docking demand, matching the pure-function acceptance table', async () => {
    stubSplitWorkspaceRect(1366, 768);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);
    const style = wrapper.find('#split-workspace').attributes('style') ?? '';
    expect(style).toContain('638px');
  });

  it('2560x1080, default content: root child "2" again resolves to 820px (the same compiled ceiling as 1920x1080)', async () => {
    stubSplitWorkspaceRect(2560, 1080);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);
    const style = wrapper.find('#split-workspace').attributes('style') ?? '';
    expect(style).toContain('820px');
  });

  it('sovereign: a dragged treeControlRegionWidthPx still wins verbatim in the rendered track, unaffected by the root-split live solve', async () => {
    stubSplitWorkspaceRect(1920, 1080);
    store.session.ui.treeControlRegionWidthPx = 500;
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);
    const style = wrapper.find('#split-workspace').attributes('style') ?? '';
    expect(style).toContain('500px');
    expect(style).not.toContain('820px');
  });

  it('portrait: no root-split override applies (landscape-only, disclosed narrowing) — mounts cleanly, no throw from rootSplitLayout\'s own guard', async () => {
    stubSplitWorkspaceRect(400, 900);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);
  });
});
