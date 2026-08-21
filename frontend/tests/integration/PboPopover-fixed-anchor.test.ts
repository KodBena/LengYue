/**
 * tests/integration/PboPopover-fixed-anchor.test.ts
 *
 * Commission lyt-popover-clip-class (ratified program row 1937):
 * `PboPopover.vue` was routed through `useFixedAnchoredPopover` (the
 * same class of clip-ancestor fix `ToolbarSliderPopover.vue`'s D1
 * shipped, per `useFixedAnchoredPopover.ts`'s own header and this
 * commission's report at
 * `.claude/dispatch-reports/lyt-popover-clip-class.md`). This
 * component could not be visually re-witnessed for the clip itself
 * (its root carries `v-if="visible"`, gated on
 * `q.calibrationEnabled && q.experimentExists`, which requires a live
 * backend qEUBO experiment — unreachable under this commission's own
 * isolation posture, dead-pinned ports, no live backend), so this file
 * is the mount-level regression net the commission's item 4 requires
 * for a newly-routed consumer: the listener-lifecycle contract
 * `useFixedAnchoredPopover` owns, mirroring
 * `ToolbarSliderPopover-scroll-anchor.test.ts`'s shape. The
 * `qeubo-service` HTTP boundary is mocked (per `tests/CLAUDE.md`'s
 * fake pattern) purely to drive `useQeubo().bootstrap()` past the
 * `visible` gate so the component's template renders at all — the
 * qEUBO domain logic itself is out of scope here (see
 * `qeubo-apply-bookmark.test.ts` / `qeubo-knob-reconcile.test.ts` for
 * that). The composable's own geometry/clamp math is unit-tested once,
 * generically, at `tests/unit/useFixedAnchoredPopover.test.ts` — this
 * file does not re-derive that math, only that THIS consumer wires the
 * composable correctly.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/services/qeubo-service', () => ({
  qeuboService: {
    getStatus: vi.fn(),
    getPair: vi.fn(),
    createExperiment: vi.fn(),
    deleteExperiment: vi.fn(),
    submitPreference: vi.fn(),
    getBest: vi.fn(),
  },
}));

import { mount, flushPromises } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { i18n } from '../../src/i18n';
import { resetWorkspace } from '../../src/store';
import { useQeubo } from '../../src/composables/useQeubo';
import { qeuboService } from '../../src/services/qeubo-service';
import PboPopover from '../../src/components/qeubo/PboPopover.vue';
import type { QeuboStatus } from '../../src/types/qeubo';

function src(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf-8');
}

const FAKE_STATUS: QeuboStatus = {
  experimentId: 'exp-1',
  phase: 'init',
  initIndex: 0,
  numInitQueries: 4,
  iteration: 0,
  numAlgoQueries: 20,
  totalResponses: 0,
  hasPending: false, // avoids needing a getPair mock too
};

beforeEach(async () => {
  resetWorkspace();
  vi.mocked(qeuboService.getStatus).mockResolvedValue(FAKE_STATUS);
  await useQeubo().bootstrap(); // drives calibrationEnabled=true, experimentExists=true -> `visible`
});

describe('PboPopover.vue — clip-ancestor fix CSS fact', () => {
  const sfc = src('src/components/qeubo/PboPopover.vue');

  it('.pbo-popover is position: fixed, not absolute', () => {
    const rule = /\.pbo-popover\s*\{[^}]*\}/.exec(sfc)![0];
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).not.toMatch(/position:\s*absolute/);
  });
});

describe('PboPopover.vue — useFixedAnchoredPopover listener lifecycle', () => {
  function mountPopover() {
    return mount(PboPopover, { global: { plugins: [i18n] } });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders once visible (the qEUBO gate) is satisfied', () => {
    const wrapper = mountPopover();
    expect(wrapper.find('.pbo-metric').exists()).toBe(true);
    wrapper.unmount();
  });

  it('registers a capture-phase window scroll listener and a passive window resize listener on open', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const wrapper = mountPopover();

    await wrapper.find('.pbo-metric').trigger('mouseenter');
    await flushPromises();

    const scrollCall = addSpy.mock.calls.find(([type]) => type === 'scroll');
    expect(scrollCall).toBeDefined();
    expect(scrollCall![2]).toMatchObject({ capture: true, passive: true });

    const resizeCall = addSpy.mock.calls.find(([type]) => type === 'resize');
    expect(resizeCall).toBeDefined();
    expect(resizeCall![2]).toMatchObject({ passive: true });

    wrapper.unmount();
  });

  it('releases both listeners on close (the mouseleave grace-timer path)', async () => {
    vi.useFakeTimers();
    const wrapper = mountPopover();
    await wrapper.find('.pbo-metric').trigger('mouseenter');
    await flushPromises();

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    await wrapper.find('.pbo-metric').trigger('mouseleave');
    await vi.advanceTimersByTimeAsync(200); // past useHoverPopover's 150ms close-grace timer
    await flushPromises();

    expect(removeSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    expect(removeSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it('releases both listeners on unmount while still open', async () => {
    const wrapper = mountPopover();
    await wrapper.find('.pbo-metric').trigger('mouseenter');
    await flushPromises();

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    wrapper.unmount();

    expect(removeSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    expect(removeSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);
  });

  it('recomputes popoverStyle (via getBoundingClientRect) when the registered scroll handler fires', async () => {
    const wrapper = mountPopover();
    await wrapper.find('.pbo-metric').trigger('mouseenter');
    await flushPromises();

    const popover = wrapper.find('.pbo-popover');
    expect(popover.exists()).toBe(true);
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    const callsBefore = rectSpy.mock.calls.length;

    window.dispatchEvent(new Event('scroll'));
    await flushPromises();

    expect(rectSpy.mock.calls.length).toBeGreaterThan(callsBefore);

    wrapper.unmount();
  });
});
