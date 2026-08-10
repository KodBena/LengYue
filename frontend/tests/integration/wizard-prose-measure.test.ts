/**
 * tests/integration/wizard-prose-measure.test.ts
 *
 * Resolution roadmap Phase 4, R7 (ledger row 930, audit finding R7):
 * the setup wizard's explanation/prose paragraphs used to run
 * ~101-107ch/line against the wizard card's full content width — no
 * reading-measure cap at all. Every `WizardStep*.vue` prose container
 * (`.step-description` plus the odd sibling hint/settings paragraph)
 * now caps at `WIZARD_PROSE_MEASURE_CH` (`state/layout-model.ts`),
 * the SAME measure vocabulary Phase 3 established for
 * `PANEL_CONTENT_READING_MEASURE_CH` (a declared constant, not a
 * scattered CSS literal).
 *
 * The actual cap is a CSS `max-width: v-bind(...)` binding (same
 * idiom as `LibraryTab.vue`'s `librarySplitMaxWidthCss` /
 * `ForestDirectory.vue`'s `cardMetadataMaxWidthCss`) — but this
 * repo's `vite.config.ts` sets `test.css = false`, so vitest's jsdom
 * environment never receives the compiled `<style>` block and cannot
 * observe a `v-bind`-driven CSS custom property (verified directly:
 * mounting a wizard step with `attachTo: document.body` produces no
 * `style` attribute and no injected `<style>` tag at all). Each prose
 * element therefore ALSO carries a `data-prose-measure-ch` attribute
 * bound to the same `WIZARD_PROSE_MEASURE_CH` import, giving this
 * test a DOM-visible handle on the real constant — not a hardcoded
 * `'68'` duplicate — without depending on jsdom CSS support this
 * harness doesn't have.
 *
 * Mounts the real `SetupWizardModal` and walks every step via the
 * Next button exactly like `SetupWizardModal.test.ts` does (fake
 * timers + render-env stubs so the demo-board/PV-animation steps'
 * real BoardWidget and animation-frame plumbing mount cleanly) —
 * reusing that file's own navigation idiom rather than mounting each
 * `WizardStep*.vue` in isolation with a second, parallel set of
 * per-step mocks.
 *
 * Review follow-up (fresh-context reviewer, live mutation): the
 * original per-step assertion only checked `length > 0` and the
 * aggregate only checked `>= WIZARD_STEPS.length` (7) against a true
 * total of 10 — stripping `data-prose-measure-ch` from any ONE
 * multi-element step's second/third paragraph (e.g. EngineUri's
 * `.field-hint`, leaving `.step-description` capped) stayed green.
 * `EXPECTED_CAPPED_COUNT_BY_STEP` below pins the EXACT count per step
 * (verified against each `WizardStep*.vue`'s own template: EngineUri
 * has `.step-description` + `.field-hint` + the "How the connection
 * works" disclosure's `.details-content` wrapper = 3 (copy-rewrite
 * follow-up, ledger rows 1361/1362/1365/1366 — one shared
 * `data-prose-measure-ch` on the disclosure wrapper rather than one
 * per `<p>`); Finish has `.step-description` + `.finish-hint` = 2;
 * Palette has `.step-description` + four `.description-text` (one per
 * seeded palette, now a DESCRIPTION|DEFINITION table cell per the
 * row-1464 overflow-fix amendment, still one per seeded palette, copy
 * refinement rows 1349/1350) + `.field-hint` (the PaletteEditor
 * pointer) = 6, all counted
 * regardless of any `<details>` disclosure's open/closed state since
 * jsdom's querySelectorAll doesn't filter on computed visibility; and
 * the aggregate is pinned to the sum of that table, not a floor — so
 * losing any single element's cap now fails both the per-step and
 * the aggregate assertion.
 *
 * Merge update (ledger rows 1357/1358): the former `demoBoard` and
 * `pvAnimation` steps became ONE step, still named `demoBoard`. Its
 * prose count is the SUM of the two former steps' counts (nothing was
 * dropped): 1 + 2 = 3. The step total (`WIZARD_STEPS.length`) was 6;
 * the aggregate element count was the table's sum — 16 after the
 * palette copy refinement, the PV/demo merge, and the engine-URI
 * copy rewrite (prose moved and added, none silently removed).
 *
 * Locale-step update (commission wiki2-wizard-i18n): a new `locale`
 * step landed as WIZARD_STEPS' first entry, contributing exactly one
 * `.step-description` (its only prose element — an option-card list
 * carries no further capped prose). The step total is now 7; the
 * aggregate is now 17. `EXPECTED_CAPPED_COUNT_BY_STEP`'s own `reduce`
 * derives the total automatically — only the per-step table below
 * needed the new row.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import { resetWorkspace } from '../../src/store';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';
import SetupWizardModal from '../../src/components/wizard/SetupWizardModal.vue';
import { WIZARD_STEPS, type WizardStepId } from '../../src/composables/useSetupWizard';
import { WIZARD_PROSE_MEASURE_CH } from '../../src/state/layout-model';

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

// Exact expected count of `[data-prose-measure-ch]` elements per step —
// see file header for the per-file accounting. Total across all seven
// steps is 17 (palette copy refinement added five; the PV/demo merge
// moved two into demoBoard; the engine-URI rewrite added the
// disclosure wrapper; the locale step added its one description).
const EXPECTED_CAPPED_COUNT_BY_STEP: Record<WizardStepId, number> = {
  locale: 1,
  theme: 1,
  engineUri: 3,
  palette: 6,
  demoBoard: 3, // merged demoBoard(1) + former pvAnimation(2) — see file header
  sgfImport: 1,
  finish: 2,
};
const EXPECTED_TOTAL_CAPPED_COUNT = Object.values(EXPECTED_CAPPED_COUNT_BY_STEP)
  .reduce((sum, n) => sum + n, 0);

describe('wizard prose measure (R7) — every step\'s prose carries the declared constant', () => {
  it('every step in the walk has EXACTLY its expected [data-prose-measure-ch] count, all bound to WIZARD_PROSE_MEASURE_CH', async () => {
    wrapper = mount(SetupWizardModal, { global: { plugins: [i18n] } });

    let proseElementsSeen = 0;

    for (let i = 0; i < WIZARD_STEPS.length; i++) {
      const stepId = WIZARD_STEPS[i];
      const proseEls = wrapper.findAll('[data-prose-measure-ch]');
      // Exact, not a floor — a stripped attribute on any ONE element
      // of a multi-element step (e.g. EngineUri's .field-hint) must
      // turn this red, not stay silently absorbed by a >0 check.
      expect(proseEls.length).toBe(EXPECTED_CAPPED_COUNT_BY_STEP[stepId]);

      for (const el of proseEls) {
        // Bound from the SAME `WIZARD_PROSE_MEASURE_CH` import this
        // test also imports — not a hardcoded '68' duplicate. A
        // literal CSS/text change to the constant's value moves both
        // sides of this assertion together.
        expect(el.attributes('data-prose-measure-ch')).toBe(String(WIZARD_PROSE_MEASURE_CH));
      }
      proseElementsSeen += proseEls.length;

      if (i < WIZARD_STEPS.length - 1) {
        await wrapper.findAll('.wizard-footer .btn-primary')[0].trigger('click');
      }
    }

    // Exact total (17), not a floor — see file header.
    expect(proseElementsSeen).toBe(EXPECTED_TOTAL_CAPPED_COUNT);
  });

  it('WIZARD_PROSE_MEASURE_CH is a distinct, narrower figure than the panel-content reading measure', async () => {
    // Guards against the "wizard-specific declared constant" collapsing
    // back into a duplicate of `PANEL_CONTENT_READING_MEASURE_CH` by
    // accident — the R7 charter's point was a SEPARATE, audited figure
    // for the fixed-width wizard card, not a reuse of the resizable
    // panel's own measure.
    const { PANEL_CONTENT_READING_MEASURE_CH } = await import('../../src/state/layout-model');
    expect(WIZARD_PROSE_MEASURE_CH).not.toBe(PANEL_CONTENT_READING_MEASURE_CH);
    expect(WIZARD_PROSE_MEASURE_CH).toBeGreaterThan(0);
  });
});
