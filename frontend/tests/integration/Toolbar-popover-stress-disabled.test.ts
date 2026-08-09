/**
 * tests/integration/Toolbar-popover-stress-disabled.test.ts
 *
 * Regression guard for M8(a) (menus-ui audit row 1291, found not
 * assumed): "POPOVER turns green and produces no visible popover
 * anywhere." Root cause: the dev-only popover-stress harness
 * (useAutoPopoverPerf) forces open the queue-tooltip popover, but
 * EngineQueueTooltip mounts only inside ToolbarEngineMetrics
 * (`v-if="isConnected"`) — so while disconnected, the harness has no
 * DOM target and toggling it on can never produce a visible effect.
 * The button is now disabled while disconnected (unless already
 * running, so an in-flight run can still be stopped) rather than
 * offering a control that silently does nothing observable.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import Toolbar from '../../src/components/chrome/Toolbar.vue';
import { store } from '../../src/store';

function mountToolbar(): VueWrapper {
  return mount(Toolbar, { global: { plugins: [i18n] } });
}

function popoverStressButton(wrapper: VueWrapper) {
  return wrapper.findAll('button').find((b) => b.text().includes('Queue-Popover Stress'));
}

describe('Toolbar — POPOVER stress button honesty (M8(a))', () => {
  afterEach(() => {
    store.engine.status = 'disconnected';
  });

  it('disabled while disconnected — its only target never mounts without a connection', () => {
    store.engine.status = 'disconnected';
    const wrapper = mountToolbar();

    const btn = popoverStressButton(wrapper);
    expect(btn).toBeDefined();
    expect(btn!.attributes('disabled')).toBeDefined();
    expect(btn!.text()).toContain('Off');
  });

  it('enabled while connected', () => {
    store.engine.status = 'connected';
    const wrapper = mountToolbar();

    const btn = popoverStressButton(wrapper);
    expect(btn).toBeDefined();
    expect(btn!.attributes('disabled')).toBeUndefined();
  });

  it('clicking while connected flips the label to the explicit "On" state, not hue alone', async () => {
    store.engine.status = 'connected';
    const wrapper = mountToolbar();

    const btn = popoverStressButton(wrapper)!;
    await btn.trigger('click');
    await wrapper.vm.$nextTick();

    const running = popoverStressButton(wrapper)!;
    expect(running.text()).toContain('On');
    expect(running.classes()).toContain('btn-connected');
  });
});
