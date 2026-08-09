/**
 * tests/integration/HyperparameterPanel-constraints-labels.test.ts
 *
 * Regression guard for menus-ui-audit finding M25 (report.md, ledger
 * row 1251): Card Sets' "Constraints" column held two unlabelled
 * inputs (min/max of a hyperparameter's bind-time range) with no
 * accessible name beyond a placeholder that disappears once typed,
 * and the "Type" select truncated its own selected option
 * ("numbe") because nothing gave the column room to grow.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import HyperparameterPanel from '../../src/components/editors/HyperparameterPanel.vue';
import type { HyperparamDecl } from '../../src/types/cards';

describe('HyperparameterPanel.vue — Constraints inputs are individually, distinctly labeled (M25)', () => {
  it('min and max inputs each carry a real, per-hyperparameter aria-label naming which bound they set', () => {
    const decls: HyperparamDecl[] = [{ name: 'visit_count', type: 'number', default: 0, range: [1, 500] }];
    const wrapper = mount(HyperparameterPanel, {
      props: { modelValue: decls },
      global: { plugins: [i18n] },
    });
    const inputs = wrapper.findAll('input.narrow');
    expect(inputs.length).toBe(2);
    const [minInput, maxInput] = inputs;
    expect(minInput.attributes('aria-label')).toContain('visit_count');
    expect(minInput.attributes('aria-label')?.toLowerCase()).toContain('min');
    expect(maxInput.attributes('aria-label')).toContain('visit_count');
    expect(maxInput.attributes('aria-label')?.toLowerCase()).toContain('max');
    // The two labels must actually differ from each other — "two
    // distinct facts under one heading" per the finding.
    expect(minInput.attributes('aria-label')).not.toBe(maxInput.attributes('aria-label'));
  });
});

describe('HyperparameterPanel.vue — Type select sized to its longest option (M25)', () => {
  it('the shipped CSS gives .type-select room for its longest option ("number"/"string", 6 chars)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/editors/HyperparameterPanel.vue'), 'utf-8');
    const rule = /\.type-select\s*\{[^}]*\}/.exec(source);
    expect(rule).not.toBeNull();
    const m = /min-width:\s*([\d.]+)ch/.exec(rule![0]);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(6);
  });

  it('the Type <select> in the DOM carries the .type-select class', () => {
    const decls: HyperparamDecl[] = [{ name: 'p', type: 'number', default: 0 }];
    const wrapper = mount(HyperparameterPanel, {
      props: { modelValue: decls },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('select.type-select').exists()).toBe(true);
  });
});
