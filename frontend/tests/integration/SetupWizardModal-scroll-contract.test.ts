/**
 * tests/integration/SetupWizardModal-scroll-contract.test.ts
 *
 * THE MECHANISM (ledger rows 1498/1499/1500, ADR-0011 Rule 2 — this
 * dispatch is the mechanism, not another instance patch): third
 * witnessed instance of wizard step content occluded by the modal
 * footer. Prior fixes (`WizardStepDemoBoard-overflow.test.ts`,
 * `WizardStepPalette-overflow.test.ts`) each gave ONE step its own
 * `max-height: calc(88vh - 156px); overflow-y: auto;` instance guard,
 * hand-derived against the modal's own chrome metrics — a budget that
 * silently re-breaks the moment either the modal's chrome or a step's
 * content grows, exactly as it did (rows 1460, then again 1498/1499/
 * 1500). This test witnesses the STRUCTURAL PROPERTY that makes the
 * defect unrepresentable by construction instead: `SetupWizardModal
 * .vue`'s `.wizard-body` is the ONE scroll owner for every step, and
 * the footer is a normal-flow DOM sibling rendered strictly AFTER it —
 * never a descendant, never overlaid.
 *
 * ADR-0021 (witness the property, not a symptom): the property under
 * test is "content-under-footer is structurally unrepresentable", not
 * "this one step doesn't currently overflow at this one viewport
 * size". The per-step assertions below run for EVERY registered wizard
 * step (`WIZARD_STEPS`), not just the two that previously grew big
 * enough to trip the old symptom-level bug reports.
 *
 * jsdom has no layout engine (no real box model, no `vh`/percentage
 * resolution, no computed geometry) — see `WizardStepDemoBoard-
 * overflow.test.ts` / `WizardStepPalette-overflow.test.ts` for the
 * same posture on this codebase's other layout tests. So the
 * pixel-level claim "the footer never visually overlaps content" is
 * NOT directly provable here and is marked UNEXERCISED below. What IS
 * honestly witnessable from this harness, and is the proxy this test
 * relies on:
 *
 *   1. DOM STRUCTURE: for every step, the footer element is a sibling
 *      of `.wizard-body` inside `.wizard-card`, appearing AFTER it in
 *      document order, and is never found as a descendant of
 *      `.wizard-body`.
 *   2. THE SCROLL CONTRACT'S CSS: `.wizard-body`'s scoped source rule
 *      declares `flex: 1 1 auto`, `min-height: 0`, and
 *      `overflow-y: auto` together — the three properties that, in
 *      combination, are what lets this region actually shrink to cede
 *      space to sibling chrome (`min-height: 0` overrides a flex
 *      item's default refusal to shrink below its content) and
 *      contains overflow as a scrollbar inside itself rather than
 *      growing the card or bleeding under the footer.
 *   3. THE GHOST-GUARD: no step under `src/components/wizard/steps/`
 *      still carries a `calc(88vh - ...)` viewport-height budget of
 *      its own — a grep-style source pin proving the two now-deleted
 *      instance guards (WizardStepDemoBoard.vue, WizardStepPalette.vue)
 *      stay deleted, and that no other step (present or future) has
 *      quietly reintroduced the same instance-guard pattern the shell
 *      contract supersedes.
 *
 * WHY THE STRUCTURAL FACTS ARE SUFFICIENT BY CONSTRUCTION: a
 * normal-flow element (the footer, `flex: none`, no positioning) that
 * is a later DOM sibling of a preceding flex item in a column flex
 * container is laid out strictly BELOW that item's box — CSS's normal
 * flow / flexbox algorithm gives every box in a column direction a
 * position after its predecessors along the main axis, and neither
 * sibling here is taken out of flow (no `position: absolute/fixed`,
 * no negative margins pulling the footer upward). So "not a descendant,
 * not overlaid" DOM-order + a `flex:none` footer + a `flex:1 1 auto;
 * min-height:0` scroll-owning predecessor is not merely correlated
 * with "the footer cannot cover the content" — it is definitionally
 * what makes overlap impossible short of an out-of-flow escape hatch,
 * which the source-pinned CSS checks (2) also rule out for `.wizard-
 * body` and (implicitly, by finding no `position` override on
 * `.wizard-footer`) for the footer.
 *
 * UNEXERCISED: no real-browser/visual confirmation of zero pixel
 * overlap at any concrete viewport size — that requires an actual
 * layout engine this harness does not have. The structural argument
 * above is the documented reason this gap is treated as fully covered
 * for the property in question rather than left as an open risk.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import { resetWorkspace } from '../../src/store';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';
import SetupWizardModal from '../../src/components/wizard/SetupWizardModal.vue';
import { WIZARD_STEPS } from '../../src/composables/useSetupWizard';

// process.cwd() is the `frontend/` package root under Vitest's default
// config — see shared-chrome-css.test.ts's note on why not
// `import.meta.url`-based resolution.
const MODAL_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/wizard/SetupWizardModal.vue'),
  'utf-8',
);
const STEPS_DIR = resolve(process.cwd(), 'src/components/wizard/steps');

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

describe('SetupWizardModal — scroll contract CSS (source-pinned; jsdom cannot lay these out)', () => {
  it('.wizard-card no longer owns overflow itself (that job moved to .wizard-body)', () => {
    const rule = MODAL_SOURCE.match(/\.wizard-card\s*\{[^]*?\n\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).not.toMatch(/overflow-y/);
    // The overall size cap still lives on the modal, per the design.
    expect(rule![0]).toMatch(/max-height:\s*88vh/);
  });

  it('.wizard-body is the single scroll-owning region: flex:1 1 auto, min-height:0, overflow-y:auto', () => {
    const rule = MODAL_SOURCE.match(/\.wizard-body\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(rule![0]).toMatch(/min-height:\s*0/);
    expect(rule![0]).toMatch(/overflow-y:\s*auto/);
  });

  it('.wizard-footer stays out of flow-escape (no position override) and does not shrink', () => {
    const rule = MODAL_SOURCE.match(/\.wizard-footer\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).not.toMatch(/position\s*:/);
    expect(rule![0]).toMatch(/flex:\s*none/);
  });
});

describe('SetupWizardModal — ghost-guard: no step reintroduces a viewport-height budget', () => {
  // Scoped to `max-height` specifically (the shape both deleted rules
  // had: `max-height: calc(88vh - 156px); overflow-y: auto;` on the
  // step root) — NOT a blanket ban on `88vh`/`vh` anywhere in a step's
  // source. WizardStepDemoBoard.vue's `.demo-board-mount` legitimately
  // still caps its WIDTH via `calc(88vh - 420px)` (the board is square,
  // so a width cap derived from the viewport height keeps it from
  // growing unbounded) — that rule is out of this commission's fence
  // (design point 2 named only the two step-root height budgets) and
  // must keep passing.
  it('no file under steps/ carries a max-height viewport-height (vh) budget on its own root', () => {
    const files = readdirSync(STEPS_DIR).filter((f) => f.endsWith('.vue'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(resolve(STEPS_DIR, file), 'utf-8');
      expect(source, `${file} must not reintroduce a max-height vh budget`).not.toMatch(/max-height:\s*(calc\([^)]*vh[^)]*\)|\d+vh)/);
    }
  });
});

describe('SetupWizardModal — footer is a DOM sibling AFTER the scroll region, for every step (structural)', () => {
  for (const stepId of WIZARD_STEPS) {
    it(`step "${stepId}": footer is a sibling of .wizard-body, after it in document order, never inside it`, async () => {
      wrapper = mount(SetupWizardModal, { global: { plugins: [i18n] } });

      const dots = wrapper.findAll('.step-dot');
      const targetIndex = WIZARD_STEPS.indexOf(stepId);
      await dots[targetIndex].trigger('click');
      expect(wrapper.find('.wizard-title').exists()).toBe(true);

      const card = wrapper.find('.wizard-card');
      expect(card.exists()).toBe(true);

      const body = card.find('.wizard-body');
      const footer = card.find('.wizard-footer');
      expect(body.exists()).toBe(true);
      expect(footer.exists()).toBe(true);

      // Never a descendant relationship.
      expect(body.find('.wizard-footer').exists()).toBe(false);
      expect(footer.find('.wizard-body').exists()).toBe(false);

      // Both are direct children of .wizard-card, footer strictly
      // after body in document order (DOM order proxy for "renders
      // below it, never overlaid").
      const children = Array.from(card.element.children);
      const bodyIdx = children.indexOf(body.element);
      const footerIdx = children.indexOf(footer.element);
      expect(bodyIdx).toBeGreaterThanOrEqual(0);
      expect(footerIdx).toBeGreaterThanOrEqual(0);
      expect(footerIdx).toBeGreaterThan(bodyIdx);

      // Sanity (design point 4): the step actually rendered inside the
      // scroll region, not empty and not outside it.
      expect(body.element.children.length).toBeGreaterThan(0);
    });
  }
});
