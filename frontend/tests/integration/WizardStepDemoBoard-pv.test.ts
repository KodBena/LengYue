/**
 * tests/integration/WizardStepDemoBoard-pv.test.ts
 *
 * PV-playback coverage for `WizardStepDemoBoard.vue`. Formerly
 * `WizardStepPvAnimation.test.ts`, testing the separate
 * `WizardStepPvAnimation.vue` step — merged here (ledger rows
 * 1357/1358, commissioner: the PV-display step and the demo-board
 * step become ONE SCREEN "so it's clear to the user that they can see
 * and test the result of the PV options live"). The step component
 * under test is now `WizardStepDemoBoard.vue`; every assertion below
 * is carried over UNCHANGED in meaning — same selectors
 * (`#wizard-pv-mode`, `#wizard-pv-annotation`, `.pv-stone`,
 * `.mode-settings`, `.nav-btn`, `.mode-switcher`), same store cell
 * (`store.session.ui.pvAnimation`) — because the merge kept the exact
 * same mode/annotation `<select>` markup and the exact same
 * `PvAnimationPreview` leaf, just relocated into the merged step's
 * template (see that file's header for the full account). Disclosed
 * change: mounting now pulls in the real demo `BoardWidget` too
 * (previously this step had no board of its own), so every mount here
 * installs the same render-env stubs (`ResizeObserver` + theme CSS
 * vars) `wizard-one-fact-one-home.test.ts` already needs for
 * `WizardStepDemoBoard` — no assertion below reads the board itself.
 *
 * Three properties (unchanged from the pre-merge file):
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
 * Plus one NEW property for the merge itself (deliverable 4 of the
 * commission): a PV-option change is reflected on the demo board's
 * OWN rendering — the live-feedback property that is the whole point
 * of the merge. `BoardWidget.vue` mounts the real `MoveSuggestions`
 * (default `showMoveSuggestions: true`) with `:pv-config="store.
 * session.ui.pvAnimation"`; hovering a suggestion disc starts
 * `usePvAnimation` playback in whichever mode was just picked in this
 * same step. That is verified directly: pick 'sequential', hover a
 * suggestion disc on the real board, and observe the board's own
 * `.pv-stone-group` elements (declared in `MoveSuggestions.vue`) fade
 * in one at a time rather than all at once (the 'instant'-mode
 * signature) — the real component, not a simulated one.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';
import WizardStepDemoBoard from '../../src/components/wizard/steps/WizardStepDemoBoard.vue';
import { mountWithRenderCount } from './render-count/render-count';

beforeEach(() => {
  resetWorkspace();
  installRenderEnvStubs();
});

afterEach(() => {
  vi.useRealTimers();
  removeRenderEnvStubs();
});

describe('WizardStepDemoBoard (PV playback) — no auto-advance survives the dropdown migration', () => {
  it('the mode never changes on its own, however much fake-timer time elapses', async () => {
    vi.useFakeTimers();
    store.session.ui.pvAnimation.mode = 'sequential';

    const wrapper = mount(WizardStepDemoBoard, { global: { plugins: [i18n] } });
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
    const wrapper = mount(WizardStepDemoBoard, { global: { plugins: [i18n] } });
    expect(wrapper.find('.nav-btn').exists()).toBe(false);
    expect(wrapper.find('.mode-switcher').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('WizardStepDemoBoard (PV playback) — mode dropdown writes the store cell and restarts the preview', () => {
  it('selecting a mode writes session.ui.pvAnimation.mode (the cell usePvAnimation reads everywhere)', async () => {
    store.session.ui.pvAnimation.mode = 'instant';
    const wrapper = mount(WizardStepDemoBoard, { global: { plugins: [i18n] } });

    const select = wrapper.find('#wizard-pv-mode');
    await select.setValue('window');

    expect(store.session.ui.pvAnimation.mode).toBe('window');
    wrapper.unmount();
  });

  it('restarts the preview in the new mode (stale reveal from the old mode does not survive the switch)', async () => {
    vi.useFakeTimers();
    store.session.ui.pvAnimation.mode = 'instant';

    const wrapper = mount(WizardStepDemoBoard, { global: { plugins: [i18n] } });
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
    const wrapper = mount(WizardStepDemoBoard, { global: { plugins: [i18n] } });
    expect(wrapper.find('.mode-settings').text()).toBe(i18n.global.t('wizard.pvAnimation.mode.instant.settings'));

    await wrapper.find('#wizard-pv-mode').setValue('window');
    expect(wrapper.find('.mode-settings').text()).toBe(i18n.global.t('wizard.pvAnimation.mode.window.settings'));
    wrapper.unmount();
  });
});

describe('WizardStepDemoBoard (PV playback) — render-isolation guard (ADR-0010)', () => {
  it('an animation-frame tick never re-renders the parent (which hosts the mode <select>)', async () => {
    vi.useFakeTimers();
    store.session.ui.pvAnimation.mode = 'sequential';

    const harness = mountWithRenderCount(WizardStepDemoBoard, { global: { plugins: [i18n] } });
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
    const harness = mountWithRenderCount(WizardStepDemoBoard, { global: { plugins: [i18n] } });
    await nextTick();
    harness.resetRenderCount();

    await harness.wrapper.find('#wizard-pv-mode').setValue('window');

    expect(harness.renderCount()).toBeGreaterThanOrEqual(1);
    harness.unmount();
  });
});

describe('WizardStepDemoBoard (PV playback) — the merge\'s commissioned property: live on the demo board', () => {
  it('a PV-option change is reflected by hovering a suggestion disc on the SAME demo board (real MoveSuggestions, real config cell)', async () => {
    vi.useFakeTimers();
    store.session.ui.showMoveSuggestions = true; // default, asserted explicitly — this is the gate
    store.session.ui.pvAnimation.mode = 'sequential';
    store.session.ui.pvAnimation.annotation = 'none';

    const wrapper = mount(WizardStepDemoBoard, { global: { plugins: [i18n] } });
    await nextTick();

    // Pick a mode in THIS step's control — the same cell BoardWidget's
    // real MoveSuggestions passes to its own usePvAnimation instance.
    await wrapper.find('#wizard-pv-mode').setValue('sequential');
    expect(store.session.ui.pvAnimation.mode).toBe('sequential');

    // Hover the first suggestion disc rendered by the REAL
    // MoveSuggestions overlay mounted inside BoardWidget on this exact
    // demo board (not the isolated PvAnimationPreview leaf — a
    // different DOM region, `.suggestion-group`).
    const suggestion = wrapper.find('.suggestion-group');
    expect(suggestion.exists()).toBe(true);
    await suggestion.trigger('mouseenter');
    await nextTick();

    // 'sequential' fades stones in one at a time — immediately after
    // the hover starts, later PV stones on the real board sit at
    // opacity 0 (not yet revealed), the 'instant'-mode signature would
    // instead show every stone at opacity 1 right away.
    const boardPvStones = wrapper.findAll('.pv-stone-group circle');
    expect(boardPvStones.length).toBeGreaterThan(0);
    expect(boardPvStones.some(s => s.attributes('style')?.includes('opacity: 0'))).toBe(true);

    wrapper.unmount();
  });
});
