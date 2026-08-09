/**
 * tests/unit/knob-slider-measure.test.ts
 *
 * Regression guard for menus-ui-audit finding M17 (report.md,
 * `.claude/dispatch-reports/menus-ui-audit/report.md`, ledger row
 * 1290): Knob Registry sliders spanned ~1050px of travel for a 0..1
 * value in the default (non-compact) KnobRegistryEditor layout, with
 * no min/max endpoint labels ("Hue offset: −36" of what range?), and
 * help paragraphs under them ran full-width. Fixed by:
 *
 *   - Bounding the non-compact `.knob-slider-row` (and the
 *     `.knob-registry-editor` container it sits in) at the app's
 *     existing phase-3 reading measure (`PANEL_CONTENT_READING_MEASURE_CH`,
 *     `state/layout-model.ts` — same constant RegistryEditor.vue's own
 *     M6 fix, LibraryTab.vue, and ForestDirectory.vue already cap on;
 *     ADR-0012 one-home-per-fact).
 *   - Rendering `effectiveMin`/`effectiveMax` (the SAME values already
 *     driving the native `<input type="range">`'s own min/max
 *     attributes, so a cross-knob `maxFromKnob` constraint or a
 *     `minFloor` pin is reflected in the labels too) as visible
 *     endpoint labels flanking the track — non-compact rows only, so
 *     `ToolbarSliderPopover`'s compact/dense layout (a
 *     toolbar-popover-owned surface, out of this pass's territory) is
 *     untouched.
 *
 * Source-text assertions for the CSS shape (Tier 1 — no DOM, no Vue,
 * matching this repo's `TabWidget-overflow.test.ts` convention: a
 * computed-style assertion isn't reliable under jsdom's no-layout
 * DOM) plus a real component mount against the app's own seeded
 * `display.move-filter-threshold` knob (range [0, 1],
 * `session.ui.moveFilterThreshold`, `store/defaults.ts`) for the
 * rendered-label behaviour itself.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import KnobSlider from '../../src/components/knobs/KnobSlider.vue';
import KnobRegistryEditor from '../../src/components/KnobRegistryEditor.vue';
import { store } from '../../src/store';
import type { KnobId } from '../../src/types';

const KNOB_SLIDER_SRC = readFileSync(resolve(process.cwd(), 'src/components/knobs/KnobSlider.vue'), 'utf-8');
const KNOB_REGISTRY_EDITOR_SRC = readFileSync(resolve(process.cwd(), 'src/components/KnobRegistryEditor.vue'), 'utf-8');
const THEME_CSS = readFileSync(resolve(process.cwd(), 'src/assets/css/theme.css'), 'utf-8');
const LAYOUT_MODEL_SRC = readFileSync(resolve(process.cwd(), 'src/state/layout-model.ts'), 'utf-8');

function definedTokens(css: string): Set<string> {
  const names = new Set<string>();
  for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) names.add(m[1]);
  return names;
}
function referencedTokens(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/var\((--[a-zA-Z0-9-]+)\)/g)) names.add(m[1]);
  return names;
}

describe('KnobSlider.vue / KnobRegistryEditor.vue — no ghost custom properties', () => {
  const defined = definedTokens(THEME_CSS);
  for (const [path, source] of [
    ['src/components/knobs/KnobSlider.vue', KNOB_SLIDER_SRC],
    ['src/components/KnobRegistryEditor.vue', KNOB_REGISTRY_EDITOR_SRC],
  ] as const) {
    it(`${path}: every var(--x) reference is defined in theme.css`, () => {
      const ghosts = [...referencedTokens(source)].filter((name) => !defined.has(name));
      expect(ghosts).toEqual([]);
    });
  }
});

describe('KnobSlider.vue / KnobRegistryEditor.vue — bounded reading measure (M17)', () => {
  it('both import the app\'s existing phase-3 reading-measure constant rather than a hand-typed literal', () => {
    expect(KNOB_SLIDER_SRC).toMatch(/PANEL_CONTENT_READING_MEASURE_CH/);
    expect(KNOB_REGISTRY_EDITOR_SRC).toMatch(/PANEL_CONTENT_READING_MEASURE_CH/);
    expect(LAYOUT_MODEL_SRC).toMatch(/export const PANEL_CONTENT_READING_MEASURE_CH/);
  });

  it('.knob-slider-row is bounded for the default (non-compact) row only — the compact/toolbar-popover row is excluded', () => {
    const rule = /\.knob-slider-row:not\(\.knob-slider-compact\)\s*\{[^}]*\}/.exec(KNOB_SLIDER_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/max-width:\s*v-bind/);
  });

  it('.knob-registry-editor container is bounded the same way (help paragraphs under knobs get the same cap)', () => {
    const rule = /\.knob-registry-editor\s*\{[^}]*\}/.exec(KNOB_REGISTRY_EDITOR_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/max-width:\s*v-bind/);
  });
});

describe('KnobSlider.vue — min/max endpoint labels (M17)', () => {
  const knobId = 'display.move-filter-threshold' as unknown as KnobId;

  it('non-compact mount renders visible endpoint labels matching the knob\'s own effective range [0, 1]', () => {
    const wrapper = mount(KnobSlider, { props: { knobId }, global: { plugins: [i18n] } });
    const min = wrapper.find('.knob-slider-endpoint-min');
    const max = wrapper.find('.knob-slider-endpoint-max');
    expect(min.exists()).toBe(true);
    expect(max.exists()).toBe(true);
    expect(min.text()).toBe('0.00');
    expect(max.text()).toBe('1.00');
  });

  it('the endpoint labels are the SAME effective bounds already driving the native range input\'s own min/max attributes (never a second, independently-typed source of truth)', () => {
    const wrapper = mount(KnobSlider, { props: { knobId }, global: { plugins: [i18n] } });
    const input = wrapper.find('input[type="range"]');
    const min = wrapper.find('.knob-slider-endpoint-min');
    const max = wrapper.find('.knob-slider-endpoint-max');
    expect(Number(min.text())).toBeCloseTo(Number(input.attributes('min')));
    expect(Number(max.text())).toBeCloseTo(Number(input.attributes('max')));
  });

  it('compact mount (ToolbarSliderPopover\'s own layout) omits the endpoint labels — this pass does not touch that surface', () => {
    const wrapper = mount(KnobSlider, { props: { knobId, compact: true }, global: { plugins: [i18n] } });
    expect(wrapper.find('.knob-slider-endpoint-min').exists()).toBe(false);
    expect(wrapper.find('.knob-slider-endpoint-max').exists()).toBe(false);
  });
});

describe('KnobRegistryEditor.vue — mount smoke test (component mount where cheap)', () => {
  it('renders at least one knob-slider-row from the real seeded registry (store/defaults.ts)', () => {
    expect(Object.keys(store.profile.settings.knobs).length).toBeGreaterThan(0);
    const wrapper = mount(KnobRegistryEditor, { global: { plugins: [i18n] } });
    expect(wrapper.findAll('.knob-slider-row').length).toBeGreaterThan(0);
    // Every rendered row in this (non-compact) editor carries endpoint labels.
    expect(wrapper.findAll('.knob-slider-endpoint-min').length).toBeGreaterThan(0);
  });
});
