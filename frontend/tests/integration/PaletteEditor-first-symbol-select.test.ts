/**
 * tests/integration/PaletteEditor-first-symbol-select.test.ts
 *
 * Regression guard for menus-ui-audit finding M24 (report.md, ledger
 * row 1251): Analysis Environment opened onto a dead pane — 12 raw
 * symbol names in the master column, "Select an item to edit" filling
 * ~85% of the detail pane. Genre precedent (macOS System Settings,
 * Thunderbird accounts, Sabaki's engine manager) selects the first
 * row on arrival; this suite mounts the real PaletteEditor and
 * witnesses that behaviour plus the plain-language intro sentence the
 * fix added to the symbol detail view.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n } from '../../src/i18n';
import PaletteEditor from '../../src/components/editors/PaletteEditor.vue';
import type { AnalysisEnvironment } from '../../src/types/analysis-env';

function makeEnv(overrides: Partial<AnalysisEnvironment> = {}): AnalysisEnvironment {
  return {
    symbols: { alpha: '0.0', beta: '1.0' },
    parameters: {},
    palettes: [],
    activePaletteId: '',
    ...overrides,
  };
}

function mountEditor(env: AnalysisEnvironment) {
  return mount(PaletteEditor, {
    props: { env },
    global: { plugins: [i18n] },
  });
}

describe('PaletteEditor.vue — first symbol auto-selected on arrival (M24)', () => {
  it('selects the first symbol without any click, so the detail pane never opens dead', async () => {
    const wrapper = mountEditor(makeEnv());
    // onMounted's select() call schedules a reactive update rather
    // than patching the DOM synchronously — the same reason
    // TabWidget-overflow.test.ts's own suite awaits Vue's scheduler
    // for post-mount effects. flush once before reading the DOM.
    await nextTick();
    const active = wrapper.find('.item-list li.active');
    expect(active.exists()).toBe(true);
    expect(active.text()).toBe('alpha');
    expect(wrapper.find('.empty-state').exists()).toBe(false);
  });

  it('does not crash and shows the empty state when there are no symbols at all', async () => {
    const wrapper = mountEditor(makeEnv({ symbols: {} }));
    await nextTick();
    expect(wrapper.find('.empty-state').exists()).toBe(true);
  });

  it('renders a plain-language intro sentence explaining what a symbol is', async () => {
    const wrapper = mountEditor(makeEnv());
    await nextTick();
    const intro = wrapper.find('.symbol-intro');
    expect(intro.exists()).toBe(true);
    expect(intro.text().length).toBeGreaterThan(0);
  });
});

describe('PaletteEditor.vue — the "+" sits adjacent to the Symbols heading, not the far edge (M24)', () => {
  it('the Symbols section header uses the tight (adjacent) layout, not space-between', () => {
    const wrapper = mountEditor(makeEnv());
    const headers = wrapper.findAll('.section-header');
    expect(headers[0].classes()).toContain('section-header-tight');
  });
});
