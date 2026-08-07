/**
 * tests/integration/WizardStepPvAnimation.test.ts
 *
 * Coverage for commission row 795: the wizard's PV-display step used
 * to cycle its mode with a ‹/› button pair AND a 4-second
 * setInterval auto-advance (jarring, commissioner verbatim). Both are
 * replaced by a `<select>` dropdown that lives in the PARENT
 * (`WizardStepPvAnimation.vue`), never in the animated leaf
 * (`PvAnimationPreview.vue`) — see that pair's header comments for
 * why the split is load-bearing under ADR-0010.
 *
 * Three properties:
 *
 *   1. No auto-advance survives — the mode never changes on its own,
 *      no matter how much fake-timer time elapses.
 *   2. Picking a mode from the dropdown writes
 *      `store.session.ui.pvAnimation.mode` (ADR-0012: the same cell
 *      `usePvAnimation`'s `getConfig` reads everywhere else) and
 *      restarts the preview animation in the new mode — proven by the
 *      staged reveal resetting to fully-invisible immediately on
 *      switch, rather than continuing the old mode's schedule.
 *   3. Render-isolation guard: the parent's render function — which
 *      is what hosts the mode `<select>` now — never re-runs on an
 *      animation-frame tick (a staged `setVisible` write inside the
 *      leaf's `usePvAnimation` instance). A positive control proves
 *      the counter is live by driving a change the parent DOES read
 *      (picking a new mode).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import WizardStepPvAnimation from '../../src/components/wizard/steps/WizardStepPvAnimation.vue';
import { mountWithRenderCount } from './render-count/render-count';

beforeEach(() => {
  resetWorkspace();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WizardStepPvAnimation — no auto-advance survives the dropdown migration', () => {
  it('the mode never changes on its own, however much fake-timer time elapses', async () => {
    vi.useFakeTimers();
    store.session.ui.pvAnimation.mode = 'sequential';

    const wrapper = mount(WizardStepPvAnimation, { global: { plugins: [i18n] } });
    await vi.advanceTimersByTimeAsync(0);

    const modeBefore = store.session.ui.pvAnimation.mode;
    expect(modeBefore).toBe('sequential');

    // Five old auto-advance periods (4000ms each) and then some — if any
    // interval survived the migration this would have rotated the mode
    // at least once by now.
    await vi.advanceTimersByTimeAsync(25_000);

    expect(store.session.ui.pvAnimation.mode).toBe('sequential');
    wrapper.unmount();
  });

  it('no ‹/› nav-button pair remains in the DOM', () => {
    const wrapper = mount(WizardStepPvAnimation, { global: { plugins: [i18n] } });
    expect(wrapper.find('.nav-btn').exists()).toBe(false);
    expect(wrapper.find('.mode-switcher').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('WizardStepPvAnimation — mode dropdown writes the store cell and restarts the preview', () => {
  it('selecting a mode writes session.ui.pvAnimation.mode (the cell usePvAnimation reads everywhere)', async () => {
    store.session.ui.pvAnimation.mode = 'instant';
    const wrapper = mount(WizardStepPvAnimation, { global: { plugins: [i18n] } });

    const select = wrapper.find('#wizard-pv-mode');
    await select.setValue('window');

    expect(store.session.ui.pvAnimation.mode).toBe('window');
    wrapper.unmount();
  });

  it('restarts the preview in the new mode (stale reveal from the old mode does not survive the switch)', async () => {
    vi.useFakeTimers();
    store.session.ui.pvAnimation.mode = 'instant';

    const wrapper = mount(WizardStepPvAnimation, { global: { plugins: [i18n] } });
    // 'instant' fades every stone in together, NEXT_TICK_DEFER_MS (1ms) after start.
    await vi.advanceTimersByTimeAsync(5);
    const stonesBefore = wrapper.findAll('.pv-stone');
    expect(stonesBefore.length).toBeGreaterThan(0);
    stonesBefore.forEach(s => expect(s.attributes('style')).toContain('opacity: 1'));

    // Switch to 'sequential' — a staged reveal that resets visibility to
    // empty at the start of its own schedule. If the switch didn't
    // restart the animation (just relabeled it), the stones inherited
    // from 'instant' would still show opacity 1 right after the switch.
    const select = wrapper.find('#wizard-pv-mode');
    await select.setValue('sequential');
    await nextTick();

    const stonesAfter = wrapper.findAll('.pv-stone');
    expect(stonesAfter.length).toBeGreaterThan(0);
    stonesAfter.forEach(s => expect(s.attributes('style')).toContain('opacity: 0'));

    wrapper.unmount();
  });

  it('shows the selected mode\'s description line', async () => {
    store.session.ui.pvAnimation.mode = 'instant';
    const wrapper = mount(WizardStepPvAnimation, { global: { plugins: [i18n] } });
    expect(wrapper.find('.mode-settings').text()).toBe(i18n.global.t('wizard.pvAnimation.mode.instant.settings'));

    await wrapper.find('#wizard-pv-mode').setValue('window');
    expect(wrapper.find('.mode-settings').text()).toBe(i18n.global.t('wizard.pvAnimation.mode.window.settings'));
    wrapper.unmount();
  });
});

describe('WizardStepPvAnimation — render-isolation guard (ADR-0010)', () => {
  it('an animation-frame tick never re-renders the parent (which hosts the mode <select>)', async () => {
    vi.useFakeTimers();
    store.session.ui.pvAnimation.mode = 'sequential';

    const harness = mountWithRenderCount(WizardStepPvAnimation, { global: { plugins: [i18n] } });
    await vi.advanceTimersByTimeAsync(0);
    // Mount itself counts as a render — reset so the assertion below
    // measures update-only renders (mountWithRenderCount's convention).
    harness.resetRenderCount();

    // Drive several staged reveal ticks through the PRODUCTION timer
    // schedule ('sequential' fades stones in one by one, stepDelayMs
    // apart) — each is a `setVisible` write inside the leaf's
    // `usePvAnimation` instance, exactly the class of high-frequency
    // animation-frame tick this step's leaf split exists to isolate.
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(350);
    }

    // Sanity: the leaf DID see the churn — otherwise this test proves
    // nothing about the coupling it claims to guard.
    const stones = harness.wrapper.findAll('.pv-stone');
    expect(stones.some(s => s.attributes('style')?.includes('opacity: 1'))).toBe(true);

    expect(harness.renderCount()).toBe(0);
    harness.unmount();
  });

  it('DOES re-render the parent when the mode select changes (proving the counter is live)', async () => {
    store.session.ui.pvAnimation.mode = 'instant';
    const harness = mountWithRenderCount(WizardStepPvAnimation, { global: { plugins: [i18n] } });
    await nextTick();
    harness.resetRenderCount();

    await harness.wrapper.find('#wizard-pv-mode').setValue('window');

    expect(harness.renderCount()).toBeGreaterThanOrEqual(1);
    harness.unmount();
  });
});
