/**
 * tests/integration/ToolbarEngineControls-menu-dismissal.test.ts
 *
 * Space-owner cure, dispatch L5 discharge (`.claude/dispatch-reports/
 * lyt-space-owner-l5-review.md`). The review's own named gap: this
 * component's `menu-path` popover — a real, commonly-reached surface
 * (its own header states the `menu-path` form is selected even at idle
 * 1920×1080 after the state-invariance correction) — was migrated off
 * the deleted `useClickTogglePopover.ts` onto `useDismissiblePopover`/
 * `overlayContract()` (see `ToolbarEngineControls.vue`'s own header,
 * "Space-owner cure, dispatch L5 discharge") but had NO dismissal-
 * channel test of its own; `ToolbarEngineControls-menu-capabilities.test.ts`
 * covers open + each capability's own click, not close.
 *
 * This file pins the three dismissal channels
 * `useDismissiblePopover()` gives this popover by construction
 * (`overlayContract({dismissal:{escape:true, outsideClick:true,
 * explicitCloseControl:true}})`, all three `true` — no exception
 * declared for this site, matching every other click-toggle popover
 * this dispatch migrated except `DebugMenu.vue`'s disclosed
 * `outsideClick: false`).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import ToolbarEngineControls from '../../src/components/chrome/ToolbarEngineControls.vue';

// Same no-op ResizeObserver stand-in `ToolbarEngineControls-menu-
// capabilities.test.ts` already uses (this component's
// `useEngineControlsRealization` constructs one on mount regardless of
// `forceForm`).
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
beforeAll(() => {
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopResizeObserver;
  }
});

function mountMenuForm() {
  return mount(ToolbarEngineControls, {
    // Attached to document.body — required for the outside-click
    // scenario below, whose `pointerdown` listener is installed on
    // `document` and checks containment against the mounted root.
    attachTo: document.body,
    props: { forceForm: 'menu-path' },
    global: { plugins: [i18n] },
  });
}

describe('ToolbarEngineControls.vue — menu-path popover dismissal (dispatch L5 discharge)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Escape closes the open menu', async () => {
    const wrapper = mountMenuForm();
    await wrapper.find('.engine-controls-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.engine-controls-menu').exists()).toBe(true);

    // `useDismissiblePopover`'s own Escape listener is document-level
    // (matching every other click-toggle popover's pre-dispatch idiom),
    // not window-level — dispatch there.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.engine-controls-menu').exists()).toBe(false);

    wrapper.unmount();
  });

  it('a pointerdown outside the component closes the open menu', async () => {
    const wrapper = mountMenuForm();
    await wrapper.find('.engine-controls-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.engine-controls-menu').exists()).toBe(true);

    // Genuinely outside the mounted component's own root — a sibling
    // element in document.body, matching the outside-click contract's
    // own "landed outside the popover's root subtree" check.
    const outsideEl = document.createElement('div');
    document.body.appendChild(outsideEl);
    outsideEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.engine-controls-menu').exists()).toBe(false);

    wrapper.unmount();
  });

  it('a pointerdown INSIDE the menu (e.g. on a menuitem before its own click handler runs) does not close it prematurely', async () => {
    const wrapper = mountMenuForm();
    await wrapper.find('.engine-controls-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    const menu = wrapper.find('.engine-controls-menu');
    expect(menu.exists()).toBe(true);

    const item = menu.findAll('[role="menuitem"]')[0];
    item.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.engine-controls-menu').exists()).toBe(true);

    wrapper.unmount();
  });

  it('re-clicking the trigger (explicitCloseControl) toggles the menu closed', async () => {
    const wrapper = mountMenuForm();
    const trigger = wrapper.find('.engine-controls-trigger');
    await trigger.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.engine-controls-menu').exists()).toBe(true);

    await trigger.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.engine-controls-menu').exists()).toBe(false);

    wrapper.unmount();
  });
});
