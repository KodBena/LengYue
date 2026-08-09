/**
 * tests/integration/CardSetEditor-name-and-destructive-style.test.ts
 *
 * Regression guard for menus-ui-audit finding M25 (report.md, ledger
 * row 1251): the Card Sets detail heading rendered the raw entity id
 * ("default") while the Name field and sidebar row both already
 * showed the human name ("Standard") — one entity, two names, one
 * screen. Also asserts the source-text fix for the id-name fallback
 * and the Delete button's token-only destructive styling (was a
 * hardcoded, near-invisible-in-light-themes #5a1a1a border).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import CardSetEditor from '../../src/components/editors/CardSetEditor.vue';
import type { CardSet } from '../../src/types/cards';

function makeCardSet(overrides: Partial<CardSet> = {}): CardSet {
  return {
    id: 'default',
    name: 'Standard',
    description: '',
    pipeline: [],
    hyperparameters: [],
    ...overrides,
  };
}

describe('CardSetEditor.vue — detail heading shows the Name, not the id (M25)', () => {
  it('renders "Standard" (the name), never the raw id "default"', () => {
    const cardSets = { default: makeCardSet() };
    const wrapper = mount(CardSetEditor, {
      props: { cardSets, activeCardSetId: 'default' },
      global: { plugins: [i18n] },
    });
    const heading = wrapper.find('.detail-header h3');
    expect(heading.text()).toBe('Standard');
    expect(heading.text()).not.toBe('default');
  });

  it('falls back to the id only if the name is genuinely empty (never renders blank)', () => {
    const cardSets = { blank_id: makeCardSet({ id: 'blank_id', name: '' }) };
    const wrapper = mount(CardSetEditor, {
      props: { cardSets, activeCardSetId: 'blank_id' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('.detail-header h3').text()).toBe('blank_id');
  });
});

describe('CardSetEditor.vue — Delete carries real, token-only destructive styling (M25)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/editors/CardSetEditor.vue'), 'utf-8');
  const rule = /\.del-btn\s*\{[^}]*\}/.exec(source)![0];

  it('border color is the --state-error token, not a hardcoded hex literal', () => {
    expect(rule).toMatch(/border:\s*1px solid var\(--state-error\)/);
    expect(rule).not.toMatch(/#5a1a1a/);
  });

  it('has a visible hover-fill state (matches ResetAllKeybindingsModal\'s .btn-destructive idiom)', () => {
    const hoverRule = /\.del-btn:hover\s*\{[^}]*\}/.exec(source);
    expect(hoverRule).not.toBeNull();
    expect(hoverRule![0]).toMatch(/background:\s*var\(--state-error\)/);
  });
});
