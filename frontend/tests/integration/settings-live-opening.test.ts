/**
 * tests/integration/settings-live-opening.test.ts
 *
 * Work item `lyt-settings-live-opening` (ledger rows 2007/2009/2001) —
 * regression coverage for the SettingsTab/TabWidget composition-boundary
 * refactor: `SettingsTab.vue` retired, split into `SettingsSubstrip.vue`
 * (the flow-wrap-capable strip, mounted at the encoding's own
 * `settingsSubstrip` leaf) and `SettingsPane.vue` (the six sub-tab bodies,
 * mounted at `SP_session` (formerly `settingsPane`)) — see `state/lyt-widget-registry.ts`'s
 * updated entries and both components' own headers, read in full before
 * authoring this file.
 *
 * Verifies:
 *   - SettingsSubstrip.vue renders a `TabWidget` in `part="header"`,
 *     `wrap` mode (horizontal orientation, the modeled default) — a real
 *     `role="tablist"` with all six labels, no `.tab-body` rendered by
 *     this instance.
 *   - SettingsPane.vue renders the SAME six tabs' bodies via `TabWidget`
 *     in `part="body"` mode — no `role="tablist"` rendered by this
 *     instance (the strip lives in the sibling component).
 *   - The active sub-tab is SHARED between the two separately-mounted
 *     instances via `useSettingsSubTab.ts`'s own module-singleton ref:
 *     clicking a tab in the strip changes which pane is visible in the
 *     OTHER component instance.
 *   - `TabWidget.vue`'s own `wrap` prop puts `.tab-header--wrap` (CSS
 *     `flex-wrap: wrap`, replacing the horizontal-scroll affordance) on
 *     the strip — the live realization of the flow-envelope ruling (rows
 *     2007/2009): a browser's own flex line-breaking is the SAME greedy
 *     left-to-right packing `research/lyt/flow.py` computes offline.
 *   - DISCLOSED SCOPE NARROWING (vertical orientation): when
 *     `store.session.ui.settingsTabsOrientation === 'vertical'`,
 *     SettingsSubstrip.vue renders NOTHING and SettingsPane.vue renders
 *     the FULL strip+body TabWidget instead (`part="both"`,
 *     `orientation="vertical"`) — both components' own headers name this
 *     narrowing; this suite pins the behavior, not just the disclosure.
 *
 * Real store, real i18n (matching StatusBar-setup-mode-indicator.test.ts's
 * own `global: { plugins: [i18n] }` pattern) — `resetWorkspace()` in
 * `beforeEach` for isolation (tests/CLAUDE.md's own "Resetting the store
 * between tests" gotcha), plus resetting the shared
 * `activeSettingsSubTab` singleton explicitly (a module-scope ref outside
 * the store, `resetWorkspace()` does not touch it — see
 * `useSettingsSubTab.ts`'s own header for why it's a singleton at all).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import SettingsSubstrip from '../../src/components/chrome/SettingsSubstrip.vue';
import SettingsPane from '../../src/components/chrome/SettingsPane.vue';
import { useSettingsSubTab } from '../../src/composables/chrome/useSettingsSubTab';

function resetSharedSubTab() {
  useSettingsSubTab().activeSettingsSubTab.value = 'session';
}

beforeEach(() => {
  resetWorkspace();
  resetSharedSubTab();
});

describe('SettingsSubstrip.vue — the flow-wrap-capable strip', () => {
  it('renders a role="tablist" with all six sub-tab labels, wrap-capable, no body', () => {
    const wrapper = mount(SettingsSubstrip, { global: { plugins: [i18n] } });
    const tablist = wrapper.find('[role="tablist"]');
    expect(tablist.exists()).toBe(true);
    expect(tablist.classes()).toContain('tab-header--wrap');
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.length).toBe(6);
    expect(wrapper.find('.tab-body').exists()).toBe(false);
  });

  it('renders NOTHING when orientation is vertical (disclosed scope narrowing)', () => {
    store.session.ui.settingsTabsOrientation = 'vertical';
    const wrapper = mount(SettingsSubstrip, { global: { plugins: [i18n] } });
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
    expect(wrapper.html().trim()).toBe('<!--v-if-->');
  });
});

describe('SettingsPane.vue — the six sub-tab bodies', () => {
  it('renders a .tab-body with the default (session) pane visible, no role="tablist" of its own', () => {
    const wrapper = mount(SettingsPane, { global: { plugins: [i18n] } });
    expect(wrapper.find('.tab-body').exists()).toBe(true);
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
    expect(wrapper.find('#session-theme-select').exists()).toBe(true);
  });

  it('renders the FULL strip+body (role="tablist" present) when orientation is vertical', () => {
    store.session.ui.settingsTabsOrientation = 'vertical';
    const wrapper = mount(SettingsPane, { global: { plugins: [i18n] } });
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true);
    expect(wrapper.find('.vue-tabs').classes()).toContain('vue-tabs--vertical');
  });
});

describe('Active sub-tab is shared between the two separately-mounted instances', () => {
  it('clicking a tab in the strip changes which pane is visible in the sibling component', async () => {
    const strip = mount(SettingsSubstrip, { global: { plugins: [i18n] } });
    const pane = mount(SettingsPane, { global: { plugins: [i18n] } });

    // Default: session pane visible (keepMounted=true means both panes are
    // in the DOM, v-show toggled — isVisible() is the right check, not
    // exists()).
    expect(pane.find('#session-theme-select').isVisible()).toBe(true);

    // Click the "Analysis Environment" tab (second tab, index 1) in the
    // STRIP instance.
    const tabs = strip.findAll('[role="tab"]');
    await tabs[1].trigger('click');
    await pane.vm.$nextTick();

    // The PANE instance (a completely separate component tree) now shows
    // the Analysis Environment content — proof the shared singleton, not
    // any parent-child prop, carries the selection.
    expect(pane.find('#session-theme-select').isVisible()).toBe(false);
    const forcePersistenceButtons = pane
      .findAll('button')
      .filter((b) => b.text() === i18n.global.t('settings.button.forcePersistence'));
    expect(forcePersistenceButtons.length).toBe(1);
    expect(forcePersistenceButtons[0].isVisible()).toBe(true);
  });
});

describe('Derived overflow ownership (L5b single-scroll-owner realized)', () => {
  it("SettingsPane.vue's driven TabWidget has ownsScroll=false in horizontal mode (the outer LYT leaf cell is the sole scroll owner)", () => {
    const wrapper = mount(SettingsPane, { global: { plugins: [i18n] } });
    // ownsScroll=false => .tab-body carries the derived-overflow class,
    // not a blanket overflow-y:auto of its own (TabWidget.vue's own CSS).
    expect(wrapper.find('.tab-body').classes()).toContain('tab-body--derived-overflow');
  });

  it('reverts to the self-contained default (ownsScroll=true) in vertical mode, matching the retired SettingsTab.vue\'s own self-contained behavior', () => {
    store.session.ui.settingsTabsOrientation = 'vertical';
    const wrapper = mount(SettingsPane, { global: { plugins: [i18n] } });
    expect(wrapper.find('.tab-body').classes()).not.toContain('tab-body--derived-overflow');
  });
});
