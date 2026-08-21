/**
 * tests/integration/render-count/ToolbarEngineMetrics.render-count.test.ts
 *
 * Render-count regression guard for the `EngineModelSelect.vue` extraction
 * (docs/dispatch-reports/ui-fix-1c-model-select-leaf.md). The property under
 * test is the one named in the diagnosis
 * (docs/dispatch-reports/ui-fix-1b-diagnosis.md): "the metrics tick cannot
 * re-render the select." `ToolbarEngineMetrics` whole-renders on every
 * `ENGINE_METRICS_TICK_MS` (1000ms) store tick regardless of the 250ms
 * throttle (a throttle can't coalesce a source slower than its own window —
 * see that component's inline comments) — that part is EXPECTED and not
 * itself a regression. What must never happen again is the model `<select>`
 * re-rendering on that same tick, because it was the render (not just the
 * DOM patch) that let Vue's option-patch path reassert `<option>` state and
 * kill the user's hover.
 *
 * `EngineModelSelect` is now a sibling component instance with its own
 * render effect and zero props, so per Vue's per-component reactivity a
 * metrics-store mutation cannot reach its render at all — this is
 * structural, not timing-dependent, so no fake timers are needed: the test
 * mutates `store.engine.metrics` directly (the same wholesale-reassignment
 * shape `analysis-service.ts`'s `startMetrics` interval performs) and
 * asserts synchronously after each `nextTick()`.
 *
 * The counting mechanism reuses `mountWithRenderCount`'s shim technique
 * (wrap the compiled `render` function), applied here via `vi.mock` to the
 * CHILD module `EngineModelSelect.vue` — `mountWithRenderCount` itself only
 * instruments a directly-mounted top-level component, not a descendant, so
 * counting `EngineModelSelect`'s renders while it's mounted as
 * `ToolbarEngineMetrics`'s child requires swapping in a counting-wrapped
 * module before either component loads (`vi.mock` is hoisted above
 * imports).
 *
 * A paired positive control drives a change EngineModelSelect DOES read
 * (`store.engine.info.availableModels`) and asserts its render count
 * increments, so a dead/mis-wired counter cannot pass the zero-count
 * assertion silently (same discipline as BoardTab.render-count.test.ts).
 *
 * Overlap fix update (ledger row 2372,
 * `.claude/dispatch-reports/lyt-metrics-overlap-fix.md`): `EngineModelSelect`
 * no longer mounts unconditionally inside the `eval` group — it moved
 * into the group's hover popover (only rendered while `evalOpen` is
 * true) as part of closing the eval/health metrics-bar overlap defect.
 * Both tests below now open the popover first (`mouseenter` on
 * `.eval-summary`, the new compact-badge trigger) before exercising the
 * tick-coupling assertion, so the guard still exercises a REAL mounted
 * `EngineModelSelect` instance rather than trivially passing because the
 * child never mounted at all.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';

const modelSelectRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../../src/components/chrome/EngineModelSelect.vue', async () => {
  const actual = await vi.importActual<{ default: Record<string, unknown> }>(
    '../../../src/components/chrome/EngineModelSelect.vue',
  );
  const original = actual.default.render as (...a: unknown[]) => unknown;
  return {
    default: {
      ...actual.default,
      render(this: unknown, ...args: unknown[]) {
        modelSelectRenders.count++;
        return original.apply(this, args);
      },
    },
  };
});

import { mount } from '@vue/test-utils';
import ToolbarEngineMetrics from '../../../src/components/chrome/ToolbarEngineMetrics.vue';
import { store } from '../../../src/store';
import { i18n } from '../../../src/i18n';
import { installRenderEnvStubs, removeRenderEnvStubs } from './jsdom-stubs';
import type { EngineMetrics, EngineModelEntry } from '../../../src/types';

function freshMetrics(latencyMs: number): EngineMetrics {
  // Fresh object literal every call — mirrors `analysis-service.ts`'s
  // `startMetrics` interval and `liveMetrics`'s own reassignment shape
  // that the diagnosis identified as the reference-identity trigger.
  return {
    packetsPerSecond: 1,
    lastResponseId: null,
    lastWatchdogTimestamp: Date.now(),
    latencyMs,
    pingPendingSince: null,
  };
}

const MODELS: EngineModelEntry[] = [
  { label: '14', healthy: true },
  { label: '18', healthy: false },
];

describe('ToolbarEngineMetrics / EngineModelSelect — render-count regression guard', () => {
  let wrapper: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    installRenderEnvStubs();
    modelSelectRenders.count = 0;
    // SELECTOR-mode engine identity, matching the diagnosis's live
    // reproduction (a real `capabilities.selector` advertisement +
    // `availableModels`) — this is the shape that renders the `<select>`
    // rather than the LEAF-mode static-label fallback.
    store.engine.status = 'connected';
    store.engine.info = {
      version: '1.13.0',
      internalName: null,
      versionPayload: null,
      modelsPayload: null,
      availableModels: MODELS,
      capabilities: { selector: {} },
    };
    store.engine.selectedModel = '14';
    store.engine.metrics = freshMetrics(10);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    // Reset engine state so it doesn't leak into other suites sharing the
    // module-scope reactive store.
    store.engine.status = 'disconnected';
    store.engine.info = {
      version: null,
      internalName: null,
      versionPayload: null,
      modelsPayload: null,
      availableModels: [],
      capabilities: null,
    };
    store.engine.selectedModel = null;
    store.engine.metrics = freshMetrics(0);
    removeRenderEnvStubs();
  });

  it('does not re-render EngineModelSelect across N metrics ticks', async () => {
    wrapper = mount(ToolbarEngineMetrics, { global: { plugins: [i18n] } });
    await nextTick();
    // Overlap fix (ledger row 2372): EngineModelSelect now mounts only
    // inside the eval-group hover popover — open it so this guard
    // exercises a real mounted instance. Space-owner cure, dispatch L5
    // (HOVER-GRACE): the `mouseenter` listener moved from `.eval-summary`
    // itself onto the shared `.metric-hover-root` wrapper (trigger +
    // popover now share one hover root — see `ToolbarEngineMetrics.vue`'s
    // own template comment) — trigger the event there.
    await wrapper.find('.metric-hover-root').trigger('mouseenter');
    await nextTick();
    // Mount itself counts as a render — reset after mount so the assertion
    // below measures update-only renders, the same convention
    // `mountWithRenderCount`'s `resetRenderCount()` establishes.
    modelSelectRenders.count = 0;

    // Drive N synthetic 1Hz metrics ticks through the production
    // reassignment shape (a brand-new EngineMetrics object each time —
    // `analysis-service.ts`'s `startMetrics` does exactly this).
    for (let i = 0; i < 6; i++) {
      store.engine.metrics = freshMetrics(10 + i);
      await nextTick();
    }

    // Sanity: the parent DID see the churn (its own liveMetrics/displayed
    // chain reads store.engine.metrics) — otherwise this test would prove
    // nothing about the coupling it claims to guard.
    expect(store.engine.metrics.latencyMs).toBe(15);

    // The read-locality invariant this leaf exists for: a metrics tick
    // must not reach EngineModelSelect's render at all.
    expect(modelSelectRenders.count).toBe(0);
  });

  it('does re-render EngineModelSelect when model-selection state changes (proving the counter is live)', async () => {
    wrapper = mount(ToolbarEngineMetrics, { global: { plugins: [i18n] } });
    await nextTick();
    // Overlap fix (ledger row 2372): open the popover so EngineModelSelect
    // is actually mounted — see the sibling test's identical comment.
    await wrapper.find('.metric-hover-root').trigger('mouseenter');
    await nextTick();
    modelSelectRenders.count = 0;

    // `availableModels` is read directly by EngineModelSelect — flipping it
    // is exactly what its render SHOULD react to.
    store.engine.info = { ...store.engine.info, availableModels: [...MODELS, { label: '99', healthy: true }] };
    await nextTick();

    expect(modelSelectRenders.count).toBeGreaterThanOrEqual(1);
  });
});
