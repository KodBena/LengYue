/**
 * tests/integration/WizardStepIndicator.test.ts
 *
 * Direct coverage of the step-dot row (commission row 748 series):
 * all seven dots share one styling apart from the current-step
 * marker, and every dot but the current one is clickable in BOTH
 * directions — `useSetupWizard.goTo` accepts any index, nothing
 * gates forward progression.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import WizardStepIndicator from '../../src/components/wizard/WizardStepIndicator.vue';
import { WIZARD_STEPS } from '../../src/composables/useSetupWizard';

describe('WizardStepIndicator', () => {
  it('gives every non-current dot the same class set', () => {
    const wrapper = mount(WizardStepIndicator, {
      props: { currentIndex: 2 },
      global: { plugins: [i18n] },
    });
    const dots = wrapper.findAll('.step-dot');
    expect(dots.length).toBe(WIZARD_STEPS.length);

    const nonCurrent = dots.filter((_, i) => i !== 2);
    expect(nonCurrent.length).toBeGreaterThan(0);
    const classSets = nonCurrent.map(d => [...d.classes()].sort().join(' '));
    expect(new Set(classSets).size).toBe(1); // uniform across every non-current dot
    for (const classes of classSets) {
      expect(classes).not.toContain('is-current');
      expect(classes).not.toContain('is-done'); // old filled-slab class must be gone
    }

    expect(dots[2].classes()).toContain('is-current');
  });

  it('clicking a LATER dot (forward jump) emits jump with that index', async () => {
    const wrapper = mount(WizardStepIndicator, {
      props: { currentIndex: 1 },
      global: { plugins: [i18n] },
    });
    await wrapper.findAll('.step-dot')[4].trigger('click');
    expect(wrapper.emitted('jump')).toEqual([[4]]);
  });

  it('clicking an EARLIER dot (back jump) emits jump with that index', async () => {
    const wrapper = mount(WizardStepIndicator, {
      props: { currentIndex: 4 },
      global: { plugins: [i18n] },
    });
    await wrapper.findAll('.step-dot')[1].trigger('click');
    expect(wrapper.emitted('jump')).toEqual([[1]]);
  });

  it('clicking the current dot does not emit jump', async () => {
    const wrapper = mount(WizardStepIndicator, {
      props: { currentIndex: 3 },
      global: { plugins: [i18n] },
    });
    await wrapper.findAll('.step-dot')[3].trigger('click');
    expect(wrapper.emitted('jump')).toBeUndefined();
  });

  it('no dot carries the disabled attribute', () => {
    const wrapper = mount(WizardStepIndicator, {
      props: { currentIndex: 0 },
      global: { plugins: [i18n] },
    });
    for (const dot of wrapper.findAll('.step-dot')) {
      expect((dot.element as HTMLButtonElement).disabled).toBe(false);
    }
  });
});
