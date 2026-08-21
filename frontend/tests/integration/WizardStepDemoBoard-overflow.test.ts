/**
 * tests/integration/WizardStepDemoBoard-overflow.test.ts
 *
 * Defect coverage: the wizard's "Try the analysis overlays & PV
 * playback" step (`WizardStepDemoBoard.vue`) overflowed the setup
 * wizard modal horribly — the side-column stack (toggles + sliders +
 * a stacked PV fieldset) ran to roughly 650px against the card's
 * ~550px height budget and bled content out from under the wizard's
 * own footer buttons. The fix (a) lays the PV region out horizontally
 * as a full-width third row instead of stacking it in the side
 * column, cutting its height contribution from ~310px to ~150px, and
 * (b) gives the step itself a `max-height` budgeted off
 * `SetupWizardModal.vue`'s own `88vh` card cap minus that card's fixed
 * chrome (header + step indicator + footer + padding + gaps), with
 * `overflow-y: auto` as the sane-degradation fallback at small
 * viewports — mirroring the SAME "vh-budget minus known fixed chrome"
 * idiom `AnalysisDashboard.vue` / `AnalysisControls.vue` already use
 * (`calc(100vh - 165px)`), not a novel pattern.
 *
 * jsdom has no layout engine (no real box model, no `vh` resolution),
 * so "does this actually avoid overflow at 1920x1080" cannot be
 * proven by a rendered-geometry assertion here — the same posture
 * `BoardTab-close-guard.test.ts` documents for hit-area sizing. What
 * IS honestly testable from this harness:
 *
 *   1. Source-pinned CSS assertions (read the artifact, not a
 *      simulation of it) that the width-cap rule and the wrap-safety
 *      rules are present and unchanged by any future edit made without
 *      touching this test.
 *   2. A real mount proving the PV region actually renders as ONE
 *      structural row (preview + both selects as `.pv-row` siblings)
 *      rather than the old stacked arrangement — the structural half
 *      of the layout change, which IS DOM-observable without a layout
 *      engine.
 *
 * The step's own `calc(88vh - 156px)` height budget this file used to
 * pin was DELETED (ledger rows 1498/1499/1500): the modal shell now
 * owns the scroll contract via SetupWizardModal.vue's `.wizard-body`
 * (see SetupWizardModal-scroll-contract.test.ts, the mechanism that
 * supersedes this instance guard — including its own grep-style
 * source-pin asserting this step's budget rule stays gone). Re-adding
 * a step-local budget would silently duplicate the modal's real scroll
 * boundary and is exactly the regression that new test polices.
 *
 * UNEXERCISED: no real-browser/visual confirmation that the modal is
 * overflow-free at 1920x1080 or that it degrades sanely at the modal's
 * minimum practical size — that requires an actual layout engine this
 * harness does not have.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';
import WizardStepDemoBoard from '../../src/components/wizard/steps/WizardStepDemoBoard.vue';

// process.cwd() is the `frontend/` package root under Vitest's default
// config — see shared-chrome-css.test.ts's note on why not
// `import.meta.url`-based resolution.
const DEMO_BOARD_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/wizard/steps/WizardStepDemoBoard.vue'),
  'utf-8',
);

beforeEach(() => {
  resetWorkspace();
  installRenderEnvStubs();
});

afterEach(() => {
  removeRenderEnvStubs();
});

describe('WizardStepDemoBoard — overflow fix (source-pinned; jsdom cannot lay these out)', () => {
  it('the board mount caps its width (and thus its square height) instead of growing unbounded', () => {
    const rule = DEMO_BOARD_SOURCE.match(/\.demo-board-mount\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/max-width:\s*min\(380px,\s*calc\(88vh\s*-\s*420px\)\)/);
    expect(rule![0]).toMatch(/min-width:\s*220px/);
  });

  it('the board/controls row and the PV preview/selects row both stay wrap-safe at narrow widths', () => {
    const layoutRule = DEMO_BOARD_SOURCE.match(/\.demo-board-layout\s*\{[^}]*\}/);
    expect(layoutRule).not.toBeNull();
    expect(layoutRule![0]).toMatch(/flex-wrap:\s*wrap/);

    const pvRowRule = DEMO_BOARD_SOURCE.match(/\.pv-row\s*\{[^}]*\}/);
    expect(pvRowRule).not.toBeNull();
    expect(pvRowRule![0]).toMatch(/flex-wrap:\s*wrap/);
  });
});

describe('WizardStepDemoBoard — PV row renders as one horizontal group (structural, DOM-observable)', () => {
  it('mounts the preview and both selects as siblings inside a single .pv-row', async () => {
    const wrapper = mount(WizardStepDemoBoard, { global: { plugins: [i18n] } });
    await nextTick();

    const pvRow = wrapper.find('.pv-row');
    expect(pvRow.exists()).toBe(true);
    expect(pvRow.find('.pv-animation-preview').exists()).toBe(true);
    expect(pvRow.findAll('.pv-select-field')).toHaveLength(2);
    expect(pvRow.find('#wizard-pv-mode').exists()).toBe(true);
    expect(pvRow.find('#wizard-pv-annotation').exists()).toBe(true);

    // The PV fieldset is a sibling of the board/controls layout row,
    // not nested inside it — proves the "third full-width region"
    // shape, not just that a .pv-row exists somewhere in the tree.
    const stepRoot = wrapper.find('.wizard-step-demo-board');
    const children = stepRoot.element.children;
    const classNames = Array.from(children).map((el) => el.className);
    expect(classNames).toContain('demo-board-layout');
    expect(classNames.some((c) => c.includes('pv-group'))).toBe(true);
    // pv-group must NOT be inside demo-board-layout.
    expect(wrapper.find('.demo-board-layout .pv-group').exists()).toBe(false);
  });
});
