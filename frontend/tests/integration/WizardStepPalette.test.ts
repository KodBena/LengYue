/**
 * tests/integration/WizardStepPalette.test.ts
 *
 * Coverage for commission rows 1202/1203: WizardStepPalette becomes a
 * BASIC/ADVANCED palette guide. Properties exercised:
 *
 *   1. Basic default: 'traditional' (→ activePaletteId 'score') is
 *      preselected on a fresh profile, matching store/defaults.ts's own
 *      default — a live-cell-derived highlight, not a wizard-local
 *      "nothing chosen yet" state (unlike WizardStepTheme's anti-
 *      imposition ruling, row 725 — a DIFFERENT ruling for a DIFFERENT
 *      step; here the task explicitly specifies preselection).
 *   2. Picking 'fuzzy' writes activePaletteId 'quality' — the SAME cell
 *      AnalysisControls.vue reads (wizard-one-fact-one-home.test.ts
 *      pins the advanced select's side of this contract).
 *   3. Advanced aggregation change writes the SELECTED palette's
 *      summary_fn, via the same field-keyed mutation shape
 *      PaletteEditor.vue's updatePaletteField uses.
 *   4. A custom (user-authored) summary_fn shows the 'custom' state and
 *      survives being merely displayed — only an explicit pick of
 *      mean/min/median overwrites it.
 *   5. Basic and advanced are coherent views of the same two cells:
 *      picking in one is reflected in the other.
 *   6. Advanced renders a per-palette description for each of the four
 *      seeded palettes (score/quality/rank/default) and a pointer to
 *      the Analysis Environment settings tab (copy refinement, ledger
 *      rows 1349/1350).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import WizardStepPalette from '../../src/components/wizard/steps/WizardStepPalette.vue';
import en from '../../src/locales/en.json';

beforeEach(() => {
  resetWorkspace();
});

function mountStep() {
  return mount(WizardStepPalette, { global: { plugins: [i18n] } });
}

describe('WizardStepPalette — basic view', () => {
  it('traditional (score) is preselected on a fresh profile', () => {
    expect(store.profile.settings.engine.katago.analysis_env.activePaletteId).toBe('score');

    const wrapper = mountStep();
    const cards = wrapper.findAll('.basic-card');
    expect(cards.length).toBe(2);
    expect(cards[0].classes()).toContain('is-selected'); // traditional/score, declaration order
    expect(cards[1].classes()).not.toContain('is-selected'); // fuzzy/quality
  });

  it('picking fuzzy writes activePaletteId "quality"', async () => {
    const wrapper = mountStep();
    const cards = wrapper.findAll('.basic-card');

    await cards[1].trigger('click'); // fuzzy/quality

    expect(store.profile.settings.engine.katago.analysis_env.activePaletteId).toBe('quality');
    expect(cards[1].classes()).toContain('is-selected');
    expect(cards[0].classes()).not.toContain('is-selected');
  });
});

describe('WizardStepPalette — advanced aggregation control', () => {
  it('shows the selected palette\'s current summary_fn (score → mean, quality → median, defaults)', async () => {
    const wrapper = mountStep();
    expect((wrapper.find('#wizard-palette-aggregation').element as HTMLSelectElement).value).toBe('mean_summary'); // 'score' default

    const cards = wrapper.findAll('.basic-card');
    await cards[1].trigger('click'); // switch to quality
    expect((wrapper.find('#wizard-palette-aggregation').element as HTMLSelectElement).value).toBe('median_summary');
  });

  it('changing the aggregation control writes the SELECTED palette\'s summary_fn', async () => {
    const wrapper = mountStep();
    // activePaletteId defaults to 'score'.
    const aggSelect = wrapper.find('#wizard-palette-aggregation');

    await aggSelect.setValue('min_summary');

    const score = store.profile.settings.engine.katago.analysis_env.palettes.find(p => p.id === 'score')!;
    expect(score.summary_fn).toBe('min_summary');
    // Untouched sibling palette proves the write is scoped to the
    // SELECTED palette, not a blanket rewrite.
    const quality = store.profile.settings.engine.katago.analysis_env.palettes.find(p => p.id === 'quality')!;
    expect(quality.summary_fn).toBe('median_summary');
  });

  it('a custom (user-authored) summary_fn shows the custom state and is not stomped by mere display', async () => {
    const scoreIdx = store.profile.settings.engine.katago.analysis_env.palettes.findIndex(p => p.id === 'score');
    store.profile.settings.engine.katago.analysis_env.palettes[scoreIdx].summary_fn = 'my_custom_fn';

    const wrapper = mountStep();
    const aggSelect = wrapper.find('#wizard-palette-aggregation');
    expect((aggSelect.element as HTMLSelectElement).value).toBe('custom');
    // The cell itself is untouched merely by rendering the custom state.
    expect(store.profile.settings.engine.katago.analysis_env.palettes[scoreIdx].summary_fn).toBe('my_custom_fn');

    // An explicit pick DOES overwrite it.
    await aggSelect.setValue('mean_summary');
    expect(store.profile.settings.engine.katago.analysis_env.palettes[scoreIdx].summary_fn).toBe('mean_summary');
  });
});

describe('WizardStepPalette — basic/advanced coherence (same two cells)', () => {
  it('picking fuzzy in basic is reflected in the advanced select', async () => {
    const wrapper = mountStep();
    const cards = wrapper.findAll('.basic-card');
    await cards[1].trigger('click'); // fuzzy → quality

    expect((wrapper.find('#wizard-palette-select').element as HTMLSelectElement).value).toBe('quality');
  });

  it('picking a palette in advanced is reflected in the basic cards', async () => {
    const wrapper = mountStep();
    const advancedSelect = wrapper.find('#wizard-palette-select');

    await advancedSelect.setValue('quality');

    const cards = wrapper.findAll('.basic-card');
    expect(cards[1].classes()).toContain('is-selected'); // fuzzy/quality
    expect(cards[0].classes()).not.toContain('is-selected');
  });
});

describe('WizardStepPalette — advanced per-palette descriptions and editor pointer (copy refinement, rows 1349/1350)', () => {
  it('renders a name + description for each of the four seeded palettes', () => {
    const wrapper = mountStep();
    const names = wrapper.findAll('.palette-table .palette-name').map((n) => n.text());
    const bodies = wrapper.findAll('.palette-table .description-text').map((n) => n.text());

    expect(names).toEqual([
      en['wizard.palette.describe.score.name'],
      en['wizard.palette.describe.quality.name'],
      en['wizard.palette.describe.rank.name'],
      en['wizard.palette.describe.default.name'],
    ]);
    expect(bodies).toEqual([
      en['wizard.palette.describe.score.body'],
      en['wizard.palette.describe.quality.body'],
      en['wizard.palette.describe.rank.body'],
      en['wizard.palette.describe.default.body'],
    ]);
    // Sanity: every seeded palette got a non-empty description, none
    // are placeholder/copy-paste duplicates of each other.
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it('the aggregation label uses summary-aggregation language, not "combine"', () => {
    const wrapper = mountStep();
    const label = wrapper.find('label[for="wizard-palette-aggregation"]').text();
    expect(label).toBe(en['wizard.palette.aggregation.label']);
    expect(label.toLowerCase()).not.toContain('combine');
  });

  it('renders a pointer to the Analysis Environment settings tab for free-form editing', () => {
    const wrapper = mountStep();
    expect(wrapper.text()).toContain(en['wizard.palette.editorPointer']);
    expect(en['wizard.palette.editorPointer']).toContain('Analysis Environment');
  });
});

describe('WizardStepPalette — formal definitions under each description (row 1378)', () => {
  it('renders the live delta_fn/summary_fn for every described palette, sourced from the store, not a static string', () => {
    const wrapper = mountStep();
    const defs = wrapper.findAll('.palette-definition');
    expect(defs.length).toBe(4); // score, quality, rank, default

    // Rendering order matches PALETTE_DESCRIPTIONS declaration order
    // (score, quality, rank, default) — index-correlated, NOT a text
    // search, because two palettes (quality/default) legitimately
    // share the same delta_fn (quality_delta) with different
    // summary_fn, so a delta_fn-text lookup would ambiguously match
    // either block.
    const palettes = store.profile.settings.engine.katago.analysis_env.palettes;
    const symbols = store.profile.settings.engine.katago.analysis_env.symbols;
    const order = ['score', 'quality', 'rank', 'default'];
    order.forEach((id, i) => {
      const p = palettes.find((p) => p.id === id)!;
      const block = defs[i];
      expect(block.text()).toContain(`delta_fn: ${p.delta_fn}`);
      expect(block.text()).toContain(`summary_fn: ${p.summary_fn}`);
      const body = symbols[p.delta_fn];
      if (body) expect(block.text()).toContain(body);
    });
  });

  it("the 'score' palette's definition reflects the root-delta rewire (delta_fn: scoreLead_root_loss)", () => {
    const wrapper = mountStep();
    const scoreBlock = wrapper.findAll('.palette-definition')[0]; // score is declaration order 0
    expect(scoreBlock.text()).toContain('delta_fn: scoreLead_root_loss');
    expect(scoreBlock.text()).toContain('summary_fn: mean_summary');
  });
});

describe('WizardStepPalette — DESCRIPTION | DEFINITION table structure (ledger row 1464 amendment)', () => {
  it('renders a genre-standard table: one thead row with two column headers, one tbody row per described palette', () => {
    const wrapper = mountStep();
    const table = wrapper.find('table.palette-table');
    expect(table.exists()).toBe(true);

    const headerCells = table.findAll('thead th').map((n) => n.text());
    expect(headerCells).toEqual([
      en['wizard.palette.table.descriptionHeader'],
      en['wizard.palette.definitionLabel'],
    ]);

    const rows = table.findAll('tbody tr');
    expect(rows).toHaveLength(4); // score, quality, rank, default
    rows.forEach((row) => {
      expect(row.findAll('td')).toHaveLength(2);
    });
  });

  it('each row pairs the SAME palette\'s description (first cell) with its definition (second cell)', () => {
    const wrapper = mountStep();
    const rows = wrapper.findAll('table.palette-table tbody tr');
    const order = ['score', 'quality', 'rank', 'default'] as const;
    const palettes = store.profile.settings.engine.katago.analysis_env.palettes;

    order.forEach((id, i) => {
      const p = palettes.find((pal) => pal.id === id)!;
      const cells = rows[i].findAll('td');
      expect(cells[0].text()).toContain(en[`wizard.palette.describe.${id}.name` as keyof typeof en]);
      expect(cells[1].text()).toContain(`delta_fn: ${p.delta_fn}`);
      expect(cells[1].text()).toContain(`summary_fn: ${p.summary_fn}`);
    });
  });

  it('the table lives inside a horizontally-scrollable wrapper so wide code lines never overflow the step', () => {
    const wrapper = mountStep();
    const scrollWrapper = wrapper.find('.palette-table-scroll');
    expect(scrollWrapper.exists()).toBe(true);
    expect(scrollWrapper.find('table.palette-table').exists()).toBe(true);
  });
});
