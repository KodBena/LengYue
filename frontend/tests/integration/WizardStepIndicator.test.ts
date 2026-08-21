/**
 * tests/integration/WizardStepIndicator.test.ts
 *
 * Direct coverage of the step-dot row (commission row 748 series,
 * extended by audit M18 / ledger rows 1390/1397): all six dots share
 * one styling apart from the current-step marker, every dot but the
 * current one is clickable in BOTH directions — `useSetupWizard.goTo`
 * accepts any index, nothing gates forward progression — and every
 * dot now also carries its step's NAME (genre convention: macOS
 * Setup Assistant / JetBrains wizards label every step, not just the
 * current one), not just a bare digit.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import WizardStepIndicator from '../../src/components/wizard/WizardStepIndicator.vue';
import { WIZARD_STEPS } from '../../src/composables/useSetupWizard';

// Same source `en` catalog the mounted `i18n` plugin resolves
// `$t('wizard.step.<id>.title')` against — asserting against the
// live catalog value (not a hardcoded string) so this test doesn't
// silently drift from whatever English copy the titles actually ship.
import en from '../../src/locales/en.json';

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

  it('renders every step\'s NAME (title), not just its digit', () => {
    const wrapper = mount(WizardStepIndicator, {
      props: { currentIndex: 0 },
      global: { plugins: [i18n] },
    });
    const labels = wrapper.findAll('.step-label');
    expect(labels.length).toBe(WIZARD_STEPS.length);
    WIZARD_STEPS.forEach((id, i) => {
      const expectedTitle = (en as Record<string, string>)[`wizard.step.${id}.title`];
      expect(expectedTitle).toBeTruthy(); // sanity: the key this test pins is real
      expect(labels[i].text()).toBe(expectedTitle);
    });
  });

  it('never clips a step label with ellipsis (ledger rows 1464/1465: full names must be readable)', () => {
    // Regression witness for the truncation defect ("Try the analysis
    // ov…", "Import your games…"): the label must wrap instead of
    // being clipped, at ANY viewport. jsdom doesn't lay out text, so
    // this can't witness actual line-wrapping pixel geometry — it
    // pins the CSS declarations that make ellipsis-clipping
    // impossible (no `text-overflow: ellipsis`, no `white-space:
    // nowrap`) and, as a companion fact, that the rendered text is
    // never shortened from the source locale string. Visual
    // wrapping/line-count itself is UNEXERCISED here (would need a
    // real browser layout engine).
    const wrapper = mount(WizardStepIndicator, {
      props: { currentIndex: 0 },
      global: { plugins: [i18n] },
    });
    const labels = wrapper.findAll('.step-label');
    for (const label of labels) {
      const style = getComputedStyle(label.element);
      expect(style.textOverflow).not.toBe('ellipsis');
      expect(style.whiteSpace).not.toBe('nowrap');
    }

    // The longest title in the catalog ("Try the analysis overlays &
    // PV playback", 41 chars) is the one that actually ellipsized in
    // the reported defect — assert its full, untruncated text still
    // reaches the DOM.
    const demoBoardIndex = WIZARD_STEPS.indexOf('demoBoard');
    expect(labels[demoBoardIndex].text()).toBe(en['wizard.step.demoBoard.title']);
    expect(labels[demoBoardIndex].text().endsWith('…')).toBe(false);
  });

  it('each dot still shows its 1-based digit alongside the name', () => {
    const wrapper = mount(WizardStepIndicator, {
      props: { currentIndex: 0 },
      global: { plugins: [i18n] },
    });
    const digits = wrapper.findAll('.step-digit');
    expect(digits.length).toBe(WIZARD_STEPS.length);
    digits.forEach((d, i) => expect(d.text()).toBe(String(i + 1)));
  });
});
