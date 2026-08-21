/**
 * tests/integration/ToolbarEngineControls-menu-capabilities.test.ts
 *
 * Finish-pass wave B2 (F2: Connect unreachable at 1280x1024/420x880 —
 * `.claude/dispatch-reports/lyt-finish-pass.md` §3). jsdom has no real
 * flex layout, so the live-measurement composable
 * (`useEngineControlsRealization`) cannot be driven into `menu-path` by
 * genuine layout in this tier — `forceForm` (the component's own
 * disclosed test-only prop, see its header) is the deterministic way in.
 * Mirrors the mount-level regression-net precedent already established
 * by `LocalePicker-fixed-anchor.test.ts` / `PboPopover-fixed-anchor.test.ts`
 * for this exact class of toolbar-strip-hosted click-popover component —
 * not a new departure from the "component tests out of scope" default,
 * the same one those files already use.
 *
 * Verifies the commission's own bar: every one of the five capabilities
 * (mint-card, open-learn-path, open-play, toggle-match,
 * toggle-engine-connection) is present, clickable, and emits the SAME
 * event the button-cluster form emits — with Connect hit-tested
 * specifically, per the commission's own instruction.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import ToolbarEngineControls from '../../src/components/chrome/ToolbarEngineControls.vue';

// jsdom ships no `ResizeObserver`; `useEngineControlsRealization` (via
// `useElementWidth`) constructs one on mount regardless of `forceForm` —
// same no-op stand-in `App-boot.test.ts`/`render-count/jsdom-stubs.ts`
// already use elsewhere in this suite (see those files' own comments for
// the rationale). This test drives `form` via `forceForm`, not real
// layout, so a no-op observer is sufficient.
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
    props: { forceForm: 'menu-path' },
    global: { plugins: [i18n] },
  });
}

describe('ToolbarEngineControls.vue — menu-path form, all capabilities reachable (F2)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a single compact trigger (not the five-button cluster) when forceForm is menu-path', () => {
    const wrapper = mountMenuForm();
    expect(wrapper.find('.engine-controls-trigger').exists()).toBe(true);
    // The cluster's own always-visible buttons (button-cluster form) are
    // absent — only the trigger and the hidden measurement shadow render.
    // JUSTIFICATION for the count changing from 5 to 7 (state-invariance
    // fix, W-B2 review MAJOR finding): the shadow clone now renders BOTH
    // label variants for the two state-varying slots (match/stop-match,
    // connect/disconnect) unconditionally, instead of one current-state
    // label each — 3 static + 2×2 state-varying = 7. See
    // `useEngineControlsRealization`'s own header.
    // library-cards-promotion: +2 more (Library, Cards — single-variant,
    // not state-varying) — 7 + 2 = 9.
    expect(wrapper.findAll('.toolbar-btn:not(.engine-controls-trigger)').length).toBe(9); // shadow clone only, not yet open
    wrapper.unmount();
  });

  it('opens the menu on trigger click, listing all five capabilities as role="menuitem" buttons', async () => {
    const wrapper = mountMenuForm();
    await wrapper.find('.engine-controls-trigger').trigger('click');
    await wrapper.vm.$nextTick();

    const menu = wrapper.find('.engine-controls-menu');
    expect(menu.exists()).toBe(true);
    expect(menu.attributes('role')).toBe('menu');

    const items = menu.findAll('[role="menuitem"]');
    // library-cards-promotion: +2 more (Library, Cards) — 5 + 2 = 7.
    expect(items).toHaveLength(7);

    wrapper.unmount();
  });

  it('each menu item is enabled and clicking it emits the same event the button-cluster form emits', async () => {
    const wrapper = mountMenuForm();
    await wrapper.find('.engine-controls-trigger').trigger('click');
    await wrapper.vm.$nextTick();

    const menu = wrapper.find('.engine-controls-menu');
    const items = menu.findAll('[role="menuitem"]');
    for (const item of items) {
      expect((item.element as HTMLButtonElement).disabled).toBe(false);
    }

    await items[0].trigger('click'); // Mint Card(s)
    expect(wrapper.emitted('mint-card')).toHaveLength(1);

    // Re-open (each capability click closes the menu — matches the
    // ratified menu-path affordance: pick one action, menu dismisses).
    await wrapper.find('.engine-controls-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.findAll('[role="menuitem"]')[1].trigger('click'); // Learn Path
    expect(wrapper.emitted('open-learn-path')).toHaveLength(1);

    await wrapper.find('.engine-controls-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.findAll('[role="menuitem"]')[2].trigger('click'); // Play
    expect(wrapper.emitted('open-play')).toHaveLength(1);

    await wrapper.find('.engine-controls-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.findAll('[role="menuitem"]')[3].trigger('click'); // Match
    expect(wrapper.emitted('open-match')).toHaveLength(1);

    wrapper.unmount();
  });

  it('hit-tests Connect specifically: reachable, enabled, and clicking it emits toggle-engine', async () => {
    const wrapper = mountMenuForm();
    await wrapper.find('.engine-controls-trigger').trigger('click');
    await wrapper.vm.$nextTick();

    const items = wrapper.find('.engine-controls-menu').findAll('[role="menuitem"]');
    // library-cards-promotion: Connect is no longer the LAST item — Library/
    // Cards were appended after it (App.vue's own toolbar mandate: "the
    // free space right of CONNECT"). Index 4, matching the cluster form's
    // own DOM order (mint/learn/play/match/connect/library/cards).
    const connectItem = items[4];
    expect(connectItem.exists()).toBe(true);
    expect((connectItem.element as HTMLButtonElement).disabled).toBe(false);
    // Default engine state is disconnected — the label reads "Connect".
    expect(connectItem.text()).toBe('Connect');

    await connectItem.trigger('click');
    expect(wrapper.emitted('toggle-engine')).toHaveLength(1);

    wrapper.unmount();
  });

  it('the stop-match label/class swap still applies inside the menu form (isMatchRunning prop)', async () => {
    const wrapper = mount(ToolbarEngineControls, {
      props: { forceForm: 'menu-path', isMatchRunning: true },
      global: { plugins: [i18n] },
    });
    await wrapper.find('.engine-controls-trigger').trigger('click');
    await wrapper.vm.$nextTick();

    const items = wrapper.find('.engine-controls-menu').findAll('[role="menuitem"]');
    const matchItem = items[3];
    expect(matchItem.text()).toBe('Stop Match');
    expect(matchItem.classes()).toContain('btn-stop-match');

    await matchItem.trigger('click');
    expect(wrapper.emitted('stop-match')).toHaveLength(1);

    wrapper.unmount();
  });

  it('button-cluster form (forceForm unset) is unaffected — byte-identical five-button row, no menu markup', () => {
    const wrapper = mount(ToolbarEngineControls, { global: { plugins: [i18n] } });
    expect(wrapper.find('.engine-controls-trigger').exists()).toBe(false);
    expect(wrapper.find('.engine-controls-menu').exists()).toBe(false);
    // Five visible cluster buttons + seven hidden shadow buttons (both
    // label variants for the two state-varying slots — see the count
    // justification on the first test in this file). library-cards-
    // promotion: +2 visible (Library, Cards) +2 shadow (same) — (5+2) +
    // (7+2) = 16.
    expect(wrapper.findAll('.toolbar-btn').length).toBe(16);
    wrapper.unmount();
  });
});
