/**
 * tests/integration/App-boot.test.ts
 *
 * Boot-restoration mechanism (M2 stage B2b, `.claude/dispatch-reports/
 * lyt-boot-restoration.md`, ledger row 2346). The bug: `lyt-layout.gen.ts`
 * / `lyt-layout-portrait.gen.ts` carry new widget ids (`A_setup`,
 * `A_engine_controls`/`_eval`/`_health`/`_queue`, `SP_session`) that had no
 * `lyt-widget-registry.ts` entry and no `App.vue` slot — every leaf mount
 * in `LytNode.vue` looks up its mounting widget id unconditionally
 * (`lytMountingWidgetId`), so the mismatch crashed the ENTIRE app render,
 * caught by `RootErrorBoundary` (`.reb-overlay` fallback UI), not just the
 * affected leaf's own region.
 *
 * This test mounts the FULL `App.vue` (matching `main.ts`'s own
 * `createApp(App).use(i18n)` shape) against BOTH compiled programs and
 * asserts no error boundary fires and every leaf widget id the program
 * declares resolves to a rendered slot. Screen-class selection
 * (`activeScreenClassId`) is driven by `#split-workspace`'s live
 * `getBoundingClientRect()` via `useResizablePanel`'s ResizeObserver
 * (`resizer-restore-clamp.test.ts`'s own established pattern) — stubbed
 * per-test so one mount exercises landscape, the other portrait.
 *
 * RED-at-base witness: run against `lyt-phase2` at `bc08c39c` (this
 * commission's own base commit, before the registry/App.vue fix below)
 * and both tests fail with the exact `lytMountingWidgetId: no
 * LYT_WIDGET_REGISTRY entry for widget id "A_setup"` throw the
 * measurement-wave dispatch report already diagnosed live — see this
 * commission's own report for the literal captured output.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';

// ── Effectful-service fakes (same preamble as resizer-restore-clamp.test.ts
//    and useReviewSession.test.ts — App.vue's own dependency chain pulls
//    every one of these transitively). ─────────────────────────────────
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
import { LYT_LANDSCAPE } from '../../src/state/lyt-layout.gen';
import { LYT_PORTRAIT } from '../../src/state/lyt-layout-portrait.gen';
import type { LytNodeData, LytProgram } from '../../src/state/lyt-layout-types';
import { lytMountingWidgetId, lytRegistryStatus } from '../../src/state/lyt-widget-registry';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';

// jsdom ships no ResizeObserver; a no-op stand-in lets `useResizablePanel`'s
// onMounted construct one without throwing. It never needs to actually
// FIRE — `attachRowObserver`'s own synchronous `measureRowDims()` call
// (immediately on attach, before any observer callback) is what this test
// drives via the stubbed `getBoundingClientRect` below.
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// Every leaf/blackbox `widget` id the compiled program can carry, walked
// from the program tree — the SAME ids `LytNode.vue`'s own `groups`
// computed resolves via `lytMountingWidgetId`/`lytRegistryStatus`. Mirrors
// `LytNode.vue`'s own recursion shape (Leaf/blackbox terminal; Split and
// Exclusive recurse) rather than re-deriving it independently, so this
// walk asks the exact same question the renderer asks.
function collectWidgetIds(node: LytNodeData): string[] {
  if (node.kind === 'leaf' || node.kind === 'blackbox') return [node.widget];
  if (node.kind === 'split') return node.children.flatMap((c) => collectWidgetIds(c.node));
  // exclusive: include the representative id (DOM-id anchoring only, per
  // LytExclusiveNode's own doc — harmless to also registry-check it) plus
  // every child's own node, recursively.
  return [node.widget, ...node.children.flatMap((c) => collectWidgetIds(c.node))];
}

function widgetIdsOf(program: LytProgram): string[] {
  return collectWidgetIds(program.root);
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
  // Non-network fallback services App.vue's cold-start reads
  // unconditionally (`useAppBootstrap`'s tag-dictionary fetch) — not
  // network-refused like the raw `fetch` stub below, since this one
  // goes through the mocked SERVICE singleton, not `api-client.ts`.
  fakeBackendService.getTags.mockResolvedValue([]);
  installRenderEnvStubs();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopResizeObserver;
  restoreGBCR = Element.prototype.getBoundingClientRect;
  restoreFetch = globalThis.fetch;
  // Boot-time fire-and-forget reads (suggestion-color calibration,
  // qEUBO reconcile, auth auto-login) go through `api-client.ts`'s own
  // `fetch` wrapper, which none of the fakes above substitute (they
  // cover the effectful SERVICE singletons App.vue reads through
  // composables, not the raw HTTP boundary). A network-refused stub
  // keeps every such call an ordinary rejected promise — each site's
  // own catch/fire-and-forget handling is what production relies on
  // when offline anyway, so this is a realistic boot condition, not an
  // artificial one.
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('network disabled in App-boot test'))) as typeof fetch;
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = restoreGBCR;
  globalThis.fetch = restoreFetch;
  removeRenderEnvStubs();
});

describe('App.vue boot — every compiled-program widget id resolves to a rendered slot (M2 stage B2b restoration)', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  it('landscape: mounts without triggering RootErrorBoundary, every leaf widget id renders', async () => {
    // Unmeasured (0x0) `#split-workspace` is `layout-model.ts`'s own
    // documented "not yet measured" default -> landscape — see that
    // file's `nearestScreenClassId`, "today's pre-W3 default".
    stubSplitWorkspaceRect(0, 0);

    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);
    expect(store.workspaceLoadState.kind).toBe('loaded');

    // Completeness half: EVERY leaf/blackbox widget id the compiled
    // program declares must resolve through the registry without
    // throwing — the exact call LytNode.vue's own `groups` computed
    // makes unconditionally for every leaf/blackbox child (see that
    // file's header, "Run-length merge"). The mount succeeding above
    // already proves this for whichever ids are on the DEFAULT-visible
    // path (e.g. the default-active settings sub-tab is `session`, not
    // `SP_session`'s siblings inside a not-yet-opened tab); this direct
    // call additionally covers ids that only appear once a user
    // navigates to a non-default tab (CP-settings/CP-analysis/Other),
    // which a single mount snapshot would not otherwise exercise.
    for (const widgetId of widgetIdsOf(LYT_LANDSCAPE)) {
      expect(() => lytMountingWidgetId(widgetId, 'landscape')).not.toThrow();
      expect(() => lytRegistryStatus(widgetId, 'landscape')).not.toThrow();
    }
  });

  it('portrait: mounts without triggering RootErrorBoundary, every leaf widget id renders', async () => {
    // A tall, narrow rect — `deriveAxis`'s own aspect-ratio test
    // resolves this to the portrait screen class.
    stubSplitWorkspaceRect(400, 900);

    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);

    for (const widgetId of widgetIdsOf(LYT_PORTRAIT)) {
      expect(() => lytMountingWidgetId(widgetId, 'portrait')).not.toThrow();
      expect(() => lytRegistryStatus(widgetId, 'portrait')).not.toThrow();
    }
  });
});
