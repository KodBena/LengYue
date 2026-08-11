/**
 * tests/integration/LocalePicker-fixed-anchor.test.ts
 *
 * Follow-up (work-status row 1984, the 4th popover-clip class member
 * found by the class sweep in `.claude/dispatch-reports/lyt-popover-clip-class.md`):
 * `LocalePicker.vue`'s `.locale-menu` was routed through
 * `useFixedAnchoredPopover` (the same class of clip-ancestor fix
 * `ToolbarSliderPopover.vue`'s D1 shipped, per
 * `useFixedAnchoredPopover.ts`'s own header). Unlike the composable's
 * three prior consumers (all `useHoverPopover`-driven), LocalePicker is
 * click-toggled — its own `toggle()` handler flips the SAME `open` ref
 * passed to `useFixedAnchoredPopover`. This file is the mount-level
 * regression net for that consumer, mirroring
 * `EngineQueueTooltip-fixed-anchor.test.ts`'s shape but driving `click`
 * on the trigger button instead of `mouseenter`/`mouseleave`, so the
 * suite also stands as the witness that the composable's `open: Ref<boolean>`
 * contract genuinely composes with a click-toggle open source and not
 * only a hover one. The composable's own geometry/clamp math is
 * unit-tested once, generically, at
 * `tests/unit/useFixedAnchoredPopover.test.ts` — this file does not
 * re-derive that math, only that THIS consumer wires the composable
 * correctly.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { i18n } from '../../src/i18n';
import LocalePicker from '../../src/components/chrome/LocalePicker.vue';

function src(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf-8');
}

describe('LocalePicker.vue — clip-ancestor fix CSS fact', () => {
  const sfc = src('src/components/chrome/LocalePicker.vue');

  it('.locale-menu is position: fixed, not absolute', () => {
    const rule = /\.locale-menu\s*\{[^}]*\}/.exec(sfc)![0];
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).not.toMatch(/position:\s*absolute/);
  });
});

describe('LocalePicker.vue — useFixedAnchoredPopover listener lifecycle (click-toggle open source)', () => {
  function mountPicker() {
    return mount(LocalePicker, { global: { plugins: [i18n] } });
  }

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('registers a capture-phase window scroll listener and a passive window resize listener on click-open', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const wrapper = mountPicker();

    await wrapper.find('.locale-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick(); // useFixedAnchoredPopover's watch(open) awaits its own nextTick before attaching

    const scrollCall = addSpy.mock.calls.find(([type]) => type === 'scroll');
    expect(scrollCall).toBeDefined();
    expect(scrollCall![2]).toMatchObject({ capture: true, passive: true });

    const resizeCall = addSpy.mock.calls.find(([type]) => type === 'resize');
    expect(resizeCall).toBeDefined();
    expect(resizeCall![2]).toMatchObject({ passive: true });

    wrapper.unmount();
  });

  it('releases both listeners on click-close (the toggle-off path)', async () => {
    const wrapper = mountPicker();
    await wrapper.find('.locale-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    await wrapper.find('.locale-trigger').trigger('click'); // toggle closed
    await wrapper.vm.$nextTick();

    expect(removeSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    expect(removeSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);

    wrapper.unmount();
  });

  it('releases both listeners on unmount while still open', async () => {
    const wrapper = mountPicker();
    await wrapper.find('.locale-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    wrapper.unmount();

    expect(removeSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    expect(removeSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);
  });

  it('recomputes popoverStyle (via getBoundingClientRect) when the registered scroll handler fires', async () => {
    const wrapper = mountPicker();
    await wrapper.find('.locale-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const menu = wrapper.find('.locale-menu');
    expect(menu.exists()).toBe(true);
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    const callsBefore = rectSpy.mock.calls.length;

    window.dispatchEvent(new Event('scroll'));
    await wrapper.vm.$nextTick();

    expect(rectSpy.mock.calls.length).toBeGreaterThan(callsBefore);

    wrapper.unmount();
  });

  it('does not stack a second listener pair across an outside-pointerdown-close then re-open cycle', async () => {
    // Cross-checks useFixedAnchoredPopover's idempotence guard against
    // LocalePicker's OWN dismiss channel (document pointerdown), which
    // useHoverPopover-driven consumers don't exercise — LocalePicker
    // flips `open` from two independent event sources (the trigger click
    // and the document-level outside-click listener), so this is the one
    // consumer where "does a second open cycle stack listeners" has two
    // distinct paths into `open = true`.
    const wrapper = mountPicker();
    await wrapper.find('.locale-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    // Outside pointerdown closes the menu (LocalePicker's own document
    // listener, not the composable's).
    document.body.appendChild(wrapper.element);
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.locale-menu').exists()).toBe(false);

    const addSpy = vi.spyOn(window, 'addEventListener');
    await wrapper.find('.locale-trigger').trigger('click'); // re-open
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const scrollCalls = addSpy.mock.calls.filter(([type]) => type === 'scroll');
    expect(scrollCalls).toHaveLength(1); // exactly one pair re-attached, not stacked

    wrapper.unmount();
  });
});
