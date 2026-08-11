/**
 * tests/integration/EngineQueueTooltip-fixed-anchor.test.ts
 *
 * Commission lyt-popover-clip-class (ratified program row 1937):
 * `EngineQueueTooltip.vue` was routed through `useFixedAnchoredPopover`
 * (the same class of clip-ancestor fix `ToolbarSliderPopover.vue`'s D1
 * shipped, per `useFixedAnchoredPopover.ts`'s own header and this
 * commission's report at
 * `.claude/dispatch-reports/lyt-popover-clip-class.md`). This
 * component could not be visually re-witnessed for the clip itself
 * (its badge mounts only while `useEngineControls().isConnected` is
 * true, which this commission's isolation posture — dead-pinned ports,
 * no live engine — cannot provide), so this file is the mount-level
 * regression net the commission's item 4 requires for a newly-routed
 * consumer: the listener-lifecycle contract `useFixedAnchoredPopover`
 * owns, mirroring `ToolbarSliderPopover-scroll-anchor.test.ts`'s
 * shape. The composable's own geometry/clamp math is unit-tested once,
 * generically, at `tests/unit/useFixedAnchoredPopover.test.ts` — this
 * file does not re-derive that math, only that THIS consumer wires the
 * composable correctly.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { i18n } from '../../src/i18n';
import { resetWorkspace } from '../../src/store';
import EngineQueueTooltip from '../../src/components/chrome/EngineQueueTooltip.vue';

function src(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf-8');
}

beforeEach(() => {
  resetWorkspace();
});

describe('EngineQueueTooltip.vue — clip-ancestor fix CSS fact', () => {
  const sfc = src('src/components/chrome/EngineQueueTooltip.vue');

  it('.queue-popover is position: fixed, not absolute', () => {
    const rule = /\.queue-popover\s*\{[^}]*\}/.exec(sfc)![0];
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).not.toMatch(/position:\s*absolute/);
  });
});

describe('EngineQueueTooltip.vue — useFixedAnchoredPopover listener lifecycle', () => {
  function mountPopover() {
    return mount(EngineQueueTooltip, { global: { plugins: [i18n] } });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a capture-phase window scroll listener and a passive window resize listener on open', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const wrapper = mountPopover();

    await wrapper.find('.queue-metric').trigger('mouseenter');
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
    await wrapper.find('.queue-metric').trigger('mouseenter');
    await flushPromises();

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    await wrapper.find('.queue-metric').trigger('mouseleave');
    await vi.advanceTimersByTimeAsync(200); // past useHoverPopover's 150ms close-grace timer
    await flushPromises();

    expect(removeSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    expect(removeSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it('releases both listeners on unmount while still open', async () => {
    const wrapper = mountPopover();
    await wrapper.find('.queue-metric').trigger('mouseenter');
    await flushPromises();

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    wrapper.unmount();

    expect(removeSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    expect(removeSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);
  });

  it('recomputes popoverStyle (via getBoundingClientRect) when the registered scroll handler fires', async () => {
    const wrapper = mountPopover();
    await wrapper.find('.queue-metric').trigger('mouseenter');
    await flushPromises();

    const popover = wrapper.find('.queue-popover');
    expect(popover.exists()).toBe(true);
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    const callsBefore = rectSpy.mock.calls.length;

    window.dispatchEvent(new Event('scroll'));
    await flushPromises();

    expect(rectSpy.mock.calls.length).toBeGreaterThan(callsBefore);

    wrapper.unmount();
  });
});
