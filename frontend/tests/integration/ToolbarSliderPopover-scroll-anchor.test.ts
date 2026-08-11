/**
 * tests/integration/ToolbarSliderPopover-scroll-anchor.test.ts
 *
 * Regression guard for commission lyt-sliders-popover-defects, review
 * Finding 1 (Major): the D1 occlusion fix moved `.sliders-popover` from
 * `position: absolute` to `position: fixed` with a script-computed
 * anchor. `position: fixed`'s containing block is the viewport, which
 * loses the implicit scroll-tracking a `position: absolute` box gets
 * for free from the browser's own containing-block layout — and
 * `.lyt-toolbar-strip` (the trigger's scrollable ancestor, `App.vue`)
 * does not fire `mouseleave` when it scrolls under a stationary
 * pointer, so the popover could stay open with a stale anchor. The fix
 * registers a capture-phase `window` `scroll` listener + a `window`
 * `resize` listener while open, released on close and on unmount
 * (resource-ownership-at-mutation-sites discipline, frontend/CLAUDE.md).
 * This file guards that lifecycle plus the two Tier-1 CSS facts (D1's
 * `position: fixed`, D2's `color: var(--text-0)`) — see
 * `.claude/dispatch-reports/lyt-sliders-popover-defects.md` and the
 * paired review at `.claude/dispatch-reports/lyt-sliders-popover-
 * review.md` for the full diagnosis and disposition.
 *
 * jsdom runs with `css: false` (`tests/CLAUDE.md`'s stated convention,
 * see `lyt-w4-chrome.test.ts`'s header), so this file cannot measure
 * real pixel geometry — the live Playwright witness in the commission
 * report already confirmed the rendered geometry visually (both
 * themes, both tested viewports). What THIS file pins is the DOM
 * event-listener lifecycle, which jsdom genuinely supports, plus the
 * source-text CSS facts the geometry logic depends on.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { i18n } from '../../src/i18n';
import { resetWorkspace } from '../../src/store';
import ToolbarSliderPopover from '../../src/components/chrome/ToolbarSliderPopover.vue';

function src(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf-8');
}

beforeEach(() => {
  resetWorkspace();
});

// ── Tier 1: source-text CSS facts (matches lyt-w4-chrome.test.ts's shape) ──
describe('ToolbarSliderPopover.vue — D1/D2 CSS facts', () => {
  const sfc = src('src/components/chrome/ToolbarSliderPopover.vue');

  it('D1: .sliders-popover is position: fixed, not absolute', () => {
    const rule = /\.sliders-popover\s*\{[^}]*\}/.exec(sfc)![0];
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).not.toMatch(/position:\s*absolute/);
  });

  it('D2: .sliders-trigger declares color: var(--text-0)', () => {
    const rule = /\.sliders-trigger\s*\{[^}]*\}/.exec(sfc)![0];
    expect(rule).toMatch(/color:\s*var\(--text-0\)/);
  });
});

// ── Tier 3: mounted listener-lifecycle guard (review Finding 1) ──
describe('ToolbarSliderPopover.vue — scroll/resize re-anchor listener lifecycle', () => {
  function mountPopover() {
    return mount(ToolbarSliderPopover, { global: { plugins: [i18n] } });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a capture-phase window scroll listener and a passive window resize listener on open', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const wrapper = mountPopover();

    await wrapper.find('.sliders-metric').trigger('mouseenter');
    await flushPromises(); // let watch(open)'s internal `await nextTick()` settle

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
    await wrapper.find('.sliders-metric').trigger('mouseenter');
    await flushPromises();

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    await wrapper.find('.sliders-metric').trigger('mouseleave');
    await vi.advanceTimersByTimeAsync(200); // past useHoverPopover's 150ms close-grace timer
    await flushPromises();

    expect(removeSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    expect(removeSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it('releases both listeners on unmount while still open (resource-ownership-at-mutation-sites discipline — the watch close branch alone does not fire on unmount)', async () => {
    const wrapper = mountPopover();
    await wrapper.find('.sliders-metric').trigger('mouseenter');
    await flushPromises();

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    wrapper.unmount();

    expect(removeSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    expect(removeSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);
  });

  it('does not stack a second listener pair across repeated open/close cycles (idempotence)', async () => {
    vi.useFakeTimers();
    const wrapper = mountPopover();
    const addSpy = vi.spyOn(window, 'addEventListener');

    await wrapper.find('.sliders-metric').trigger('mouseenter');
    await flushPromises();
    await wrapper.find('.sliders-metric').trigger('mouseleave');
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
    await wrapper.find('.sliders-metric').trigger('mouseenter');
    await flushPromises();

    const scrollRegistrations = addSpy.mock.calls.filter(([type]) => type === 'scroll');
    expect(scrollRegistrations.length).toBe(2); // one per open cycle, not accumulating within a cycle

    wrapper.unmount();
    vi.useRealTimers();
  });

  it('recomputes popoverStyle (via getBoundingClientRect) when the registered scroll handler fires', async () => {
    const wrapper = mountPopover();
    await wrapper.find('.sliders-metric').trigger('mouseenter');
    await flushPromises();

    const popover = wrapper.find('.sliders-popover');
    expect(popover.exists()).toBe(true);
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    const callsBefore = rectSpy.mock.calls.length;

    window.dispatchEvent(new Event('scroll'));
    await flushPromises();

    // The handler re-reads both the trigger's and the popover's rects
    // on every fire — a no-op registration (or a registration that
    // silently lost its callback reference) would leave the call
    // count unchanged.
    expect(rectSpy.mock.calls.length).toBeGreaterThan(callsBefore);

    wrapper.unmount();
  });
});
