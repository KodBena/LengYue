/**
 * tests/integration/WizardStepPalette-overflow.test.ts
 *
 * Defect coverage (ledger row 1460, commissioner screenshot): the
 * wizard's "Default palette" step (`WizardStepPalette.vue`) overflowed
 * the setup wizard modal — the per-palette DEFINITION lines added by
 * row 1378 (a formal `delta_fn`/`summary_fn` line under each of the
 * four seeded palettes' prose description, inside the ADVANCED
 * `<details>` disclosure) made an already-tall advanced section taller
 * still, and once expanded the step's content ran under the wizard's
 * own footer — the Back button visually overlapped the "Standard
 * Evaluation" description text.
 *
 * The fix mirrors the just-merged `WizardStepDemoBoard.vue` overflow
 * fix exactly: the step budgets its own `max-height` off
 * `SetupWizardModal.vue`'s `.wizard-card`'s `88vh` cap minus that
 * card's fixed chrome (header + step indicator + footer + padding +
 * gaps ≈ 156px — the SAME modal-chrome constant the demo-board fix
 * used, since that chrome is a property of the modal shell, not of
 * either step), with `overflow-y: auto` as the contained-scroll
 * fallback once the advanced disclosure is expanded on a short
 * viewport.
 *
 * jsdom has no layout engine (no real box model, no `vh` resolution),
 * so "does this actually avoid overflow at 1920x1080" cannot be proven
 * by a rendered-geometry assertion here — same posture
 * `WizardStepDemoBoard-overflow.test.ts` documents. What IS honestly
 * testable from this harness: source-pinned CSS assertions (read the
 * artifact, not a simulation of it) for the rules below that are still
 * live.
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
 * overflow-free at 1920x1080, nor that it degrades sanely at the
 * modal's minimum practical size (92vw × 88vh at a small viewport) —
 * that requires an actual layout engine this harness does not have.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// process.cwd() is the `frontend/` package root under Vitest's default
// config — see shared-chrome-css.test.ts's note on why not
// `import.meta.url`-based resolution.
const PALETTE_STEP_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/wizard/steps/WizardStepPalette.vue'),
  'utf-8',
);

describe('WizardStepPalette — overflow fix (source-pinned; jsdom cannot lay these out)', () => {
  // Row 1464 amendment (DESCRIPTION | DEFINITION table): wide-content
  // discipline — the table must never grow the step (or the modal)
  // wider; a genuinely unbreakable definition token is contained by a
  // dedicated horizontal-scroll wrapper, not by letting the step itself
  // overflow. Source-pinned for the same jsdom-has-no-layout-engine
  // reason as the height-budget rule above.
  it('the palette table sits inside its own horizontal-scroll wrapper, capped to the step width', () => {
    const rule = PALETTE_STEP_SOURCE.match(/\.palette-table-scroll\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/overflow-x:\s*auto/);
    expect(rule![0]).toMatch(/max-width:\s*100%/);
  });

  it('the table uses fixed layout so a long definition line wraps/scrolls in its own cell instead of stretching the table', () => {
    const tableRule = PALETTE_STEP_SOURCE.match(/\.palette-table\s*\{[^}]*\}/);
    expect(tableRule).not.toBeNull();
    expect(tableRule![0]).toMatch(/table-layout:\s*fixed/);

    const defRule = PALETTE_STEP_SOURCE.match(/\.palette-definition\s*\{[^}]*\}/);
    expect(defRule).not.toBeNull();
    expect(defRule![0]).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
