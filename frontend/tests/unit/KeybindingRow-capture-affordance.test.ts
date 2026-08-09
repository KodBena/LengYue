/**
 * tests/unit/KeybindingRow-capture-affordance.test.ts
 *
 * Regression guard for M8(c) (menus-ui audit row 1291): "Keybinding
 * capture swallows every keypress in the app, signalled only by
 * 'Press a key…' in ~11px italic pale-pink inside one 14px row."
 * KeybindingRow.vue now gives the capturing row an opaque, whole-row
 * highlight (`.row-capturing`) proportionate to what it's actually
 * doing (a window-level listener intercepting every keydown in the
 * app) — this pins the row-level half of the fix; the app-wide banner
 * (App.vue's `#keybinding-capture-banner`, gated on the same
 * `captureMode` this row sets) is the other half, covering the case
 * where the user's attention isn't on this row/tab at all.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import KeybindingRow from '../../src/components/KeybindingRow.vue';
import { KEYBINDINGS_REGISTRY } from '../../src/composables/keybindings-catalog';
import { cancelCapture } from '../../src/lib/keybindings-capture';

describe('KeybindingRow — capturing state gets an opaque, whole-row affordance (M8(c))', () => {
  afterEach(() => {
    cancelCapture();
  });

  it('idle: no .row-capturing class, no capture prompt visible', () => {
    const action = KEYBINDINGS_REGISTRY[0];
    const wrapper = mount(KeybindingRow, { props: { action }, global: { plugins: [i18n] } });

    expect(wrapper.find('tr').classes()).not.toContain('row-capturing');
    expect(wrapper.find('.capture-prompt').exists()).toBe(false);
  });

  it('clicking Edit enters capture: the row carries an opaque, whole-row highlight class', async () => {
    const action = KEYBINDINGS_REGISTRY[0];
    const wrapper = mount(KeybindingRow, { props: { action }, global: { plugins: [i18n] } });

    await wrapper.find('button').trigger('click'); // Edit is the first idle-state button
    await wrapper.vm.$nextTick();

    expect(wrapper.find('tr').classes()).toContain('row-capturing');
    expect(wrapper.find('.capture-prompt').exists()).toBe(true);
  });

  it('Cancel returns to idle: the row-capturing class is removed', async () => {
    const action = KEYBINDINGS_REGISTRY[0];
    const wrapper = mount(KeybindingRow, { props: { action }, global: { plugins: [i18n] } });

    await wrapper.find('button').trigger('click'); // Edit
    expect(wrapper.find('tr').classes()).toContain('row-capturing');

    // Second button in capturing state is Cancel (Unbind, Cancel).
    const buttons = wrapper.findAll('button');
    await buttons[buttons.length - 1].trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('tr').classes()).not.toContain('row-capturing');
  });
});
