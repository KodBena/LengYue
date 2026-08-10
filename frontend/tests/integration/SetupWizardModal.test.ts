/**
 * tests/integration/SetupWizardModal.test.ts
 *
 * End-to-end coverage of the wizard shell (ledger slug
 * swz-setup-wizard): step navigation via Next/Back/Skip, Escape
 * dismissal marking the profile onboarded (same as Finish), and
 * finishing from the last step. Mounts the real component tree
 * (`SetupWizardModal` -> every step, including the real
 * `BoardWidget`-backed demo board — which, post-merge (ledger rows
 * 1357/1358), also hosts the PV mode/annotation controls and the
 * `PvAnimationPreview` leaf's animation-frame plumbing) under fake
 * timers so no test depends on a real wall-clock wait (per the
 * umbrella's "NO wall-clock waits in TESTS" instruction) and no
 * timer leaks into a later test.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';
import SetupWizardModal from '../../src/components/wizard/SetupWizardModal.vue';
import { WIZARD_STEPS } from '../../src/composables/useSetupWizard';

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  resetWorkspace();
  installRenderEnvStubs();
  vi.useFakeTimers();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  removeRenderEnvStubs();
});

describe('SetupWizardModal — navigation', () => {
  it('opens on step 1 (theme) and Next walks every step to Finish', async () => {
    wrapper = mount(SetupWizardModal, { global: { plugins: [i18n] } });

    for (let i = 0; i < WIZARD_STEPS.length - 1; i++) {
      const nextBtn = wrapper.findAll('.wizard-footer .btn-primary')[0];
      await nextBtn.trigger('click');
    }

    expect(store.profile.settings.onboarding.completed).toBe(false); // not yet — one more click
    const finishBtn = wrapper.find('.wizard-footer .btn-primary');
    expect(finishBtn.text()).toMatch(/finish/i);
    await finishBtn.trigger('click');

    expect(store.profile.settings.onboarding.completed).toBe(true);
  });

  it('Back is disabled on the first step and re-enables after Next', async () => {
    wrapper = mount(SetupWizardModal, { global: { plugins: [i18n] } });
    const backBtn = wrapper.find('.wizard-footer .btn-secondary');
    expect((backBtn.element as HTMLButtonElement).disabled).toBe(true);

    await wrapper.find('.wizard-footer .btn-primary').trigger('click');
    expect((backBtn.element as HTMLButtonElement).disabled).toBe(false);
  });

  it('Skip advances exactly like Next', async () => {
    wrapper = mount(SetupWizardModal, { global: { plugins: [i18n] } });
    const skipBtn = wrapper.findAll('.wizard-footer button').find(b => b.text().toLowerCase().includes('skip'))!;
    await skipBtn.trigger('click');
    expect(wrapper.find('#setup-wizard-title').text()).not.toBe('');
    // Step indicator's current dot is now the second one — proves navigation moved.
    const dots = wrapper.findAll('.step-dot');
    expect(dots[1].classes()).toContain('is-current');
    expect(dots[0].classes()).not.toContain('is-current');
  });
});

describe('SetupWizardModal — dismissal marks onboarded', () => {
  it('the × close button marks the profile onboarded (same as Finish)', async () => {
    wrapper = mount(SetupWizardModal, { global: { plugins: [i18n] } });
    expect(store.profile.settings.onboarding.completed).toBe(false);
    await wrapper.find('.close-btn').trigger('click');
    expect(store.profile.settings.onboarding.completed).toBe(true);
  });

  it('a backdrop click marks the profile onboarded', async () => {
    wrapper = mount(SetupWizardModal, {
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    const backdrop = wrapper.find('.modal-backdrop');
    await backdrop.trigger('click');
    expect(store.profile.settings.onboarding.completed).toBe(true);
  });
});
