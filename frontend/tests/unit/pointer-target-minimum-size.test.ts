/**
 * tests/unit/pointer-target-minimum-size.test.ts
 *
 * Regression guard for menus-ui-audit finding M16 (report.md, ledger
 * row 1251): WCAG 2.5.8 requires a 24x24px effective pointer-target
 * floor. The audit measured four sub-minimum sites — `.tab-header li`
 * (49.7 x 18px), keybinding Edit/Reset (~22x11px), slider thumbs
 * (~18x8px), and Analysis Layout's up/down/x buttons (~20x18px) — all
 * repaired via padding/explicit sizing, never font blowup.
 *
 * Source-text assertions (Tier 1), matching this repo's stated
 * jsdom-layout-is-unreliable convention (see
 * TabWidget-overflow.test.ts).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function src(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf-8');
}

describe('TabWidget.vue — .tab-header li clears 24x24 (M16)', () => {
  const rule = /\.tab-header li\s*\{[^}]*\}/.exec(src('src/components/chrome/TabWidget.vue'))![0];
  it('carries an explicit min-height >= 24px', () => {
    const m = /min-height:\s*(\d+)px/.exec(rule);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(24);
  });
  it('no longer uses the old 1px vertical hugging padding', () => {
    expect(rule).not.toMatch(/padding:\s*1px/);
  });
});

describe('KeybindingRow.vue — Edit/Reset (.row-btn) clears 24x24 (M16)', () => {
  // Anchored to line-start so this doesn't match the tail of the
  // compound `.action-buttons .row-btn + .row-btn { ... }` selector
  // above it in the same file.
  const rule = /(?:^|\n)\.row-btn\s*\{[^}]*\}/.exec(src('src/components/KeybindingRow.vue'))![0];
  it('carries explicit min-height and min-width >= 24px', () => {
    const h = /min-height:\s*(\d+)px/.exec(rule);
    const w = /min-width:\s*(\d+)px/.exec(rule);
    expect(h).not.toBeNull();
    expect(w).not.toBeNull();
    expect(Number(h![1])).toBeGreaterThanOrEqual(24);
    expect(Number(w![1])).toBeGreaterThanOrEqual(24);
  });
});

describe('AnalysisTabsEditor.vue — .icon-btn (Analysis Layout arrows/x) clears 24x24 (M16)', () => {
  const rule = /\.icon-btn\s*\{[^}]*\}/.exec(src('src/components/editors/AnalysisTabsEditor.vue'))![0];
  it('width and height are both >= 24px (was 22px)', () => {
    const w = /width:\s*(\d+)px/.exec(rule);
    const h = /height:\s*(\d+)px/.exec(rule);
    expect(w).not.toBeNull();
    expect(h).not.toBeNull();
    expect(Number(w![1])).toBeGreaterThanOrEqual(24);
    expect(Number(h![1])).toBeGreaterThanOrEqual(24);
  });
});

describe('KnobSlider.vue — thumb pseudo-elements clear 24x24 (M16)', () => {
  const source = src('src/components/knobs/KnobSlider.vue');
  for (const selector of ['::-webkit-slider-thumb', '::-moz-range-thumb']) {
    it(`${selector} sets width and height >= 24px`, () => {
      const re = new RegExp(`\\.knob-slider-input${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\{[^}]*\\}`);
      const rule = re.exec(source);
      expect(rule).not.toBeNull();
      const w = /width:\s*(\d+)px/.exec(rule![0]);
      const h = /height:\s*(\d+)px/.exec(rule![0]);
      expect(w).not.toBeNull();
      expect(h).not.toBeNull();
      expect(Number(w![1])).toBeGreaterThanOrEqual(24);
      expect(Number(h![1])).toBeGreaterThanOrEqual(24);
    });
  }
});
