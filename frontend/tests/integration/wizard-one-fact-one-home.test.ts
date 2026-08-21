/**
 * tests/integration/wizard-one-fact-one-home.test.ts
 *
 * Proves the wizard's ADR-0012 commitment for real: every control on
 * a wizard step writes the SAME store cell the corresponding
 * non-wizard surface (Settings' RegistryEditor / AnalysisControls /
 * ToolbarSliderPopover) reads and writes — the wizard is a VIEW,
 * never a second home. Mounted with `@vue/test-utils` (precedent:
 * `MintCardModal.test.ts` et al. mount real components for wiring
 * behaviour, not template-output assertions — `tests/CLAUDE.md`'s
 * "components out of scope" note is about asserting render OUTPUT,
 * not about exercising a component's event → store-write wiring).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';
import WizardStepTheme from '../../src/components/wizard/steps/WizardStepTheme.vue';
import WizardStepPalette from '../../src/components/wizard/steps/WizardStepPalette.vue';
import WizardStepDemoBoard from '../../src/components/wizard/steps/WizardStepDemoBoard.vue';
import KnobSlider from '../../src/components/knobs/KnobSlider.vue';

// WizardStepDemoBoard mounts the real BoardWidget (ADR-0010: reuse, don't
// fork), which resolves theme-CSS chrome anchors and constructs a
// ResizeObserver on mount — jsdom provides neither. Same stub pair the
// render-count harness uses (`tests/CLAUDE.md`'s render-count section).
beforeEach(() => {
  resetWorkspace();
  installRenderEnvStubs();
});
afterEach(() => {
  removeRenderEnvStubs();
});

describe('WizardStepTheme — same cell as profile.settings.appearance.theme', () => {
  it('clicking a theme card writes the exact cell RegistryEditor edits', async () => {
    store.profile.settings.appearance.theme = 'dark';
    const wrapper = mount(WizardStepTheme, { global: { plugins: [i18n] } });

    const clusterCard = wrapper.findAll('.theme-card')[1]; // ['dark', 'cluster'] declaration order
    await clusterCard.trigger('click');

    expect(store.profile.settings.appearance.theme).toBe('cluster');
  });

  it('neither option starts pre-selected (commissioner ruling: no preselected favorite)', async () => {
    // Review BLOCKER fix (swz-setup-wizard-review.md finding 1, ledger
    // row 747): the highlight is wizard-LOCAL presentation state, not
    // the live cell — the schema always seeds a theme for fresh
    // profiles, so a cell-derived highlight pre-selects the seeded
    // default the moment the step opens. Neither card may carry
    // is-selected before a click, REGARDLESS of what the cell holds;
    // after a click, exactly the clicked card is highlighted and the
    // cell is written (the one-home write is pinned by the sibling
    // test above).
    store.profile.settings.appearance.theme = 'cluster'; // the seeded default
    const wrapper = mount(WizardStepTheme, { global: { plugins: [i18n] } });
    const cards = wrapper.findAll('.theme-card');
    expect(cards[0].classes()).not.toContain('is-selected'); // dark
    expect(cards[1].classes()).not.toContain('is-selected'); // cluster — seeded, NOT shown as chosen

    await cards[0].trigger('click');
    expect(cards[0].classes()).toContain('is-selected');
    expect(cards[1].classes()).not.toContain('is-selected');
    expect(store.profile.settings.appearance.theme).toBe('dark');
  });
});

describe('WizardStepPalette — same cell as AnalysisControls.vue', () => {
  it('changing the advanced select writes activePaletteId', async () => {
    const wrapper = mount(WizardStepPalette, { global: { plugins: [i18n] } });
    const select = wrapper.find('#wizard-palette-select');
    const otherOption = store.profile.settings.engine.katago.analysis_env.palettes
      .find(p => p.id !== store.profile.settings.engine.katago.analysis_env.activePaletteId)!;

    await select.setValue(otherOption.id);

    expect(store.profile.settings.engine.katago.analysis_env.activePaletteId).toBe(otherOption.id);
  });
});

describe('WizardStepDemoBoard — checkboxes write the real session.ui cells', () => {
  it('toggling the three checkboxes writes showMoveSuggestions / overlayLayers.ownership.*', async () => {
    store.session.ui.showMoveSuggestions = false;
    store.session.ui.overlayLayers.ownership.liveness = false;
    store.session.ui.overlayLayers.ownership.continuous = false;

    const wrapper = mount(WizardStepDemoBoard, { global: { plugins: [i18n] } });
    const boxes = wrapper.findAll('input[type="checkbox"]');
    expect(boxes.length).toBe(3);

    await boxes[0].setValue(true); // move suggestions
    await boxes[1].setValue(true); // liveness
    await boxes[2].setValue(true); // ownership continuous fill

    expect(store.session.ui.showMoveSuggestions).toBe(true);
    expect(store.session.ui.overlayLayers.ownership.liveness).toBe(true);
    expect(store.session.ui.overlayLayers.ownership.continuous).toBe(true);
  });

  it('renders exactly the first five scalar knobs by ascending registry priority', () => {
    const wrapper = mount(WizardStepDemoBoard, { global: { plugins: [i18n] } });
    const sliders = wrapper.findAllComponents(KnobSlider);
    const ids = sliders.map(c => c.props('knobId'));
    expect(ids).toEqual([
      'display.move-filter-threshold',
      'display.ownership-opacity-ceiling',
      'display.ownership-deadband-threshold',
      'display.liveness-threshold',
      'display.hue-offset',
    ]);
  });
});
