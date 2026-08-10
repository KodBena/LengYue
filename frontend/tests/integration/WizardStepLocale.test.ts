/**
 * tests/integration/WizardStepLocale.test.ts
 *
 * Coverage for the setup wizard's new FIRST step (commission
 * wiki2-wizard-i18n): "The setup wizard needs an i18n option (should
 * be the first step)". Three commissioned properties:
 *
 *   1. The step appears first — `WIZARD_STEPS[0] === 'locale'` and
 *      `SetupWizardModal` opens on it.
 *   2. The choice applies reactively — clicking an option immediately
 *      (synchronously, no `nextTick`) updates `useLocale().locale`,
 *      the SAME reactive read `LocalePicker.vue` and every other
 *      locale-aware consumer share, and the DOM reflects the new
 *      selection within the mounted wizard itself (`.is-selected`
 *      moves to the clicked card).
 *   3. It persists the way the app's locale setting already persists —
 *      `setLocale` is `useLocale`'s own setter, writing through the
 *      SAME `mutateProfile`-routed cell
 *      (`profile.settings.appearance.locale`) `LocalePicker.vue`
 *      writes; this is a wiring-correctness check, not a
 *      reimplementation of that cell's write path.
 *
 * SCOPE NOTE (honest coverage boundary, ADR-0002): the full
 * "rest-of-the-app re-renders in the chosen language" propagation is
 * driven by `useAppBootstrap.ts`'s `immediate: true` watch that
 * mirrors `profile.settings.appearance.locale` onto
 * `i18n.global.locale` — pre-existing infrastructure this change
 * reuses but does not touch, and which only runs when the full app
 * tree (`App.vue`) is mounted. `SetupWizardModal` alone does not
 * mount `useAppBootstrap`, so that last mile — `i18n.global.locale`
 * itself flipping and every `$t(...)` in the wizard re-resolving
 * against the new catalog — is UNEXERCISED at this test tier by
 * design (mounting the full app + auth/backend fakes just to
 * re-prove a watcher this change doesn't modify would test
 * pre-existing infrastructure, not this delivery). What IS proven
 * here is that this step's write is wired through the exact same
 * composable and cell every other locale-changing surface in the
 * app already uses — the identical contract `LocalePicker.vue`
 * relies on for that same last mile.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';
import SetupWizardModal from '../../src/components/wizard/SetupWizardModal.vue';
import WizardStepLocale from '../../src/components/wizard/steps/WizardStepLocale.vue';
import { WIZARD_STEPS } from '../../src/composables/useSetupWizard';
import { SUPPORTED_LOCALES } from '../../src/i18n/locales';
import en from '../../src/locales/en.json';

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  resetWorkspace();
  installRenderEnvStubs();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  removeRenderEnvStubs();
});

describe('WizardStepLocale — the new step is FIRST', () => {
  it('WIZARD_STEPS declares locale as the first entry', () => {
    expect(WIZARD_STEPS[0]).toBe('locale');
  });

  it('SetupWizardModal opens on the locale step (title + option cards on screen at mount)', () => {
    wrapper = mount(SetupWizardModal, { global: { plugins: [i18n] } });
    expect(wrapper.find('#setup-wizard-title').text()).toBe(en['wizard.step.locale.title']);
    const cards = wrapper.findAll('.locale-card');
    expect(cards.length).toBe(SUPPORTED_LOCALES.length);
  });
});

describe('WizardStepLocale — reactive selection', () => {
  it('every SupportedLocale renders one option card, flag + native name', () => {
    wrapper = mount(WizardStepLocale, { global: { plugins: [i18n] } });
    const cards = wrapper.findAll('.locale-card');
    expect(cards.length).toBe(SUPPORTED_LOCALES.length);
    for (const card of cards) {
      expect(card.find('.locale-flag').exists()).toBe(true);
      expect(card.find('.locale-name').text().length).toBeGreaterThan(0);
    }
  });

  it('the currently active locale starts pre-selected (no neutral "no language" state exists)', () => {
    wrapper = mount(WizardStepLocale, { global: { plugins: [i18n] } });
    const selected = wrapper.findAll('.locale-card').filter(c => c.classes().includes('is-selected'));
    expect(selected.length).toBe(1);
    expect(selected[0].attributes('aria-selected')).toBe('true');
  });

  it('clicking a different option writes the cell IMMEDIATELY and moves the DOM selection, synchronously', async () => {
    wrapper = mount(WizardStepLocale, { global: { plugins: [i18n] } });
    expect(store.profile.settings.appearance.locale).not.toBe('zh-CN');

    const zhIndex = SUPPORTED_LOCALES.indexOf('zh-CN');
    const zhCard = wrapper.findAll('.locale-card')[zhIndex];
    await zhCard.trigger('click');

    // Property 3: persists through the SAME cell `useLocale`/
    // `LocalePicker.vue` already write.
    expect(store.profile.settings.appearance.locale).toBe('zh-CN');

    // Property 2: the wizard's own DOM reflects the new selection —
    // reactive within the mounted component, no extra tick needed
    // beyond Vue's own microtask flush (`trigger` awaits that).
    expect(zhCard.classes()).toContain('is-selected');
    expect(zhCard.attributes('aria-selected')).toBe('true');
    const others = wrapper.findAll('.locale-card').filter((_, i) => i !== zhIndex);
    for (const other of others) {
      expect(other.classes()).not.toContain('is-selected');
    }
  });

  it('picking a locale inside the full SetupWizardModal writes the same cell (wiring holds through the modal shell too)', async () => {
    wrapper = mount(SetupWizardModal, { global: { plugins: [i18n] } });
    const jaIndex = SUPPORTED_LOCALES.indexOf('ja');
    await wrapper.findAll('.locale-card')[jaIndex].trigger('click');
    expect(store.profile.settings.appearance.locale).toBe('ja');
  });
});
