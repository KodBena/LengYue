/**
 * tests/integration/App-library-cards-promotion.test.ts
 *
 * Mandate (library-cards-promotion): Library and Cards, previously two
 * of the control panel's five tab-strip members, are relocated to
 * toolbar-level primary entries (`ToolbarEngineControls.vue`, in the
 * free space right of CONNECT) and now render as a full-width overlay
 * over the control panel's own box (App.vue's `rightPanelMode`
 * computed + the `#exclusive-controlPanel` slot's
 * `.right-panel-surface-overlay`), rather than as TabWidget panes. The
 * compiled program's `controlPanel` Exclusive keeps exactly three tabs
 * (Settings/Analysis/Other) — see `lyt-layout.gen.ts`'s own inline
 * comment on that node for the disclosed bypass.
 *
 * This suite mounts the FULL `App.vue` (same preamble as
 * `App-boot.test.ts` — read in full before authoring this file) and
 * verifies the tab-activation re-pointing end to end:
 *   - the control-panel tab strip has exactly three tabs (Settings/
 *     Analysis/Other), never Library/Cards;
 *   - clicking the toolbar's Library entry shows LibraryTab as the
 *     right-side surface and marks that entry active;
 *   - clicking the toolbar's Cards entry shows ForestDirectory instead,
 *     and marks THAT entry active (mutually exclusive with Library and
 *     with the control-panel tabs — "one active right-side surface at
 *     a time");
 *   - clicking a control-panel tab (e.g. Settings) while an overlay is
 *     showing closes the overlay and shows that tab's own pane
 *     (coherent toggling, all through the SAME `activeTab` cell);
 *   - the store's default `activeTab: 'cards'` (the pre-relocation
 *     "lands on Cards" default this codebase's own default seed and
 *     the historical SR/database-tabs merge migration establish — see
 *     `store/defaults.ts` and `store/archived-migrations.ts`'s 16→17
 *     migration) still lands on the Cards surface on a fresh boot,
 *     unaffected by the relocation.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';

// ── Effectful-service fakes (verbatim preamble from App-boot.test.ts —
//    App.vue's own dependency chain pulls every one of these
//    transitively; read that file in full before touching this list). ──
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
// Unlike App-boot.test.ts (whose default `activeTab: 'cards'` never
// actually mounts LibraryTab), this suite explicitly clicks the
// toolbar's Library entry, which mounts LibraryTab for real —
// `onMounted` there fires `useLibraryQuery`/`useLibraryPlayerSuggest`,
// both going through `library-service.ts`'s own `listGames`/
// `listPlayers`. The blanket network-disabled `fetch` stub
// (`beforeEach` below) would leave those as unhandled rejections
// (fire-and-forget reads, same class as App-boot.test.ts's own
// documented boot-time reads) — faked here at the service boundary
// instead, same "fakes at the service boundary" shape every other
// integration test in this tree uses, so the promise resolves cleanly.
vi.mock('../../src/services/library-service', () => ({
  libraryService: {
    listGames: vi.fn(async () => ({ rows: [], totalCount: 0 })),
    listPlayers: vi.fn(async () => []),
  },
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
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('network disabled in App-library-cards-promotion test'))) as typeof fetch;
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = restoreGBCR;
  globalThis.fetch = restoreFetch;
  removeRenderEnvStubs();
});

// Find a toolbar button by its exact rendered label text among the
// action-button cluster's own `.toolbar-btn`s (mirrors the label-based
// lookup `ToolbarEngineControls-menu-capabilities.test.ts` already uses
// for this same component's buttons — no dedicated test-id exists for
// these, matching every sibling button in that cluster).
function findToolbarBtn(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('.engine-controls .toolbar-btn').find((b) => b.text() === label);
}

describe('App.vue — Library/Cards toolbar relocation (library-cards-promotion)', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  it('the control-panel tab strip has exactly three tabs — Settings/Analysis/Other — never Library/Cards', async () => {
    stubSplitWorkspaceRect(1920, 1080);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);
    const tabs = wrapper.findAll('#control-panel > .vue-tabs [role="tab"]');
    expect(tabs.map((t) => t.text())).toEqual(['Settings', 'Analysis', 'Other']);
  });

  it('default boot lands on the Cards surface (the pre-relocation "SR flow lands on Cards" default is preserved)', async () => {
    stubSplitWorkspaceRect(1920, 1080);
    // store/defaults.ts seeds session.ui.activeTab: 'cards' — resetWorkspace()
    // (beforeEach) restores that default; asserted explicitly here so this
    // test fails loudly if that default is ever silently changed.
    expect(store.session.ui.activeTab).toBe('cards');

    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.right-panel-surface-overlay').exists()).toBe(true);
    expect(wrapper.find('.forest-cq-wrapper').exists()).toBe(true); // ForestDirectory's own root
    expect(wrapper.find('.library-tab').exists()).toBe(false);
    expect(findToolbarBtn(wrapper, 'Cards')?.classes()).toContain('btn-surface-active');
  });

  it('clicking the toolbar Library entry shows LibraryTab as the full right-side surface and marks it active', async () => {
    stubSplitWorkspaceRect(1920, 1080);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    const libraryBtn = findToolbarBtn(wrapper, 'Library');
    expect(libraryBtn?.exists()).toBe(true);
    await libraryBtn!.trigger('click');
    await flushPromises();

    expect(wrapper.find('.right-panel-surface-overlay').exists()).toBe(true);
    expect(wrapper.find('.library-tab').exists()).toBe(true);
    expect(wrapper.find('.forest-cq-wrapper').exists()).toBe(false);
    expect(store.session.ui.activeTab).toBe('library');
    expect(findToolbarBtn(wrapper, 'Library')?.classes()).toContain('btn-surface-active');
    expect(findToolbarBtn(wrapper, 'Cards')?.classes()).not.toContain('btn-surface-active');
  });

  it('clicking the toolbar Cards entry after Library replaces the overlay (one active right-side surface at a time)', async () => {
    stubSplitWorkspaceRect(1920, 1080);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    await findToolbarBtn(wrapper, 'Library')!.trigger('click');
    await flushPromises();
    expect(wrapper.find('.library-tab').exists()).toBe(true);

    await findToolbarBtn(wrapper, 'Cards')!.trigger('click');
    await flushPromises();
    expect(wrapper.find('.library-tab').exists()).toBe(false);
    expect(wrapper.find('.forest-cq-wrapper').exists()).toBe(true);
    expect(store.session.ui.activeTab).toBe('cards');
  });

  it('activating a control-panel tab (Settings) while an overlay is showing closes the overlay and renders Settings — control panel still renders Settings/Analysis/Other', async () => {
    stubSplitWorkspaceRect(1920, 1080);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    // Boot default is Cards (overlay showing) — switch to it explicitly
    // for clarity even though it's already the default.
    await findToolbarBtn(wrapper, 'Cards')!.trigger('click');
    await flushPromises();
    expect(wrapper.find('.right-panel-surface-overlay').exists()).toBe(true);

    const settingsTab = wrapper.findAll('#control-panel > .vue-tabs [role="tab"]').find((t) => t.text() === 'Settings');
    expect(settingsTab?.exists()).toBe(true);
    await settingsTab!.trigger('click');
    await flushPromises();

    expect(store.session.ui.activeTab).toBe('settings');
    // rightPanelMode falls back to 'controlPanel' for any non-library/
    // cards activeTab value — the overlay div is gone (v-if false), the
    // strip's own Settings pane shows through underneath.
    expect(wrapper.find('.right-panel-surface-overlay').exists()).toBe(false);
    expect(wrapper.find('#control-panel > .vue-tabs [role="tab"].active').text()).toBe('Settings');

    // Analysis and Other both remain independently reachable tabs.
    const tabTexts = wrapper.findAll('#control-panel > .vue-tabs [role="tab"]').map((t) => t.text());
    expect(tabTexts).toContain('Analysis');
    expect(tabTexts).toContain('Other');
  });
});
