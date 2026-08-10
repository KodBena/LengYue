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

describe('KnobSlider.vue — thumb pseudo-elements: 0.7x visual, >=24x24 EFFECTIVE target (M16 + ledger rows 1395/1396)', () => {
  // ledger rows 1395/1396 (commissioner): the M16 24x24 VISUAL thumb
  // read huge against the popover's compact text. Cut to 0.7x
  // (16.8px) visually while PRESERVING the WCAG 2.5.8 24x24 floor as
  // an EFFECTIVE (not visual) target via the standard transparent-
  // border technique: `border` is part of the pseudo-element's
  // interactive hit box (like padding on a normal element) but
  // `background-clip: content-box` keeps it unpainted, so the
  // draggable region stays 24x24 while only the visible circle
  // shrinks. A test that measured only the visual width/height (the
  // pre-existing shape of this suite) would now wrongly regress
  // green->red on a deliberate, accessibility-preserving shrink; it
  // is updated here to measure the EFFECTIVE box (content + border)
  // instead of the visual box — the property WCAG 2.5.8 actually
  // cares about — while separately pinning the 0.7 visual scale so a
  // future edit can't quietly regrow the circle by inflating the
  // border instead.
  const source = src('src/components/knobs/KnobSlider.vue');
  const VISUAL_PX = 16.8; // 24 * 0.7
  const BORDER_PX = 3.6; // (24 - 16.8) / 2, transparent, expands the hit box only
  const EFFECTIVE_PX = VISUAL_PX + 2 * BORDER_PX; // content + both borders

  for (const selector of ['::-webkit-slider-thumb', '::-moz-range-thumb']) {
    const re = new RegExp(`\\.knob-slider-input${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\{[^}]*\\}`);
    const rule = re.exec(source);

    it(`${selector} rule exists`, () => {
      expect(rule).not.toBeNull();
    });

    it(`${selector} visual (content) size is scaled to 0.7x (16.8px)`, () => {
      const w = /width:\s*([\d.]+)px/.exec(rule![0]);
      const h = /height:\s*([\d.]+)px/.exec(rule![0]);
      expect(w).not.toBeNull();
      expect(h).not.toBeNull();
      expect(Number(w![1])).toBeCloseTo(VISUAL_PX, 5);
      expect(Number(h![1])).toBeCloseTo(VISUAL_PX, 5);
    });

    it(`${selector} uses a transparent border (not padding) to expand the hit box, clipped out of the paint`, () => {
      const border = /border:\s*([\d.]+)px\s+solid\s+transparent/.exec(rule![0]);
      expect(border).not.toBeNull();
      expect(Number(border![1])).toBeCloseTo(BORDER_PX, 5);
      expect(rule![0]).toMatch(/background-clip:\s*content-box/);
      expect(rule![0]).toMatch(/box-sizing:\s*content-box/);
    });

    it(`${selector} EFFECTIVE target (content + border) is >= 24x24`, () => {
      const w = /width:\s*([\d.]+)px/.exec(rule![0]);
      const border = /border:\s*([\d.]+)px/.exec(rule![0]);
      const effective = Number(w![1]) + 2 * Number(border![1]);
      expect(effective).toBeCloseTo(EFFECTIVE_PX, 5);
      expect(effective).toBeGreaterThanOrEqual(24);
    });
  }
});

describe('ToolbarSliderPopover.vue — compact-row rhythm at the 0.7x thumb (ledger rows 1395/1396)', () => {
  // The commissioner's own diagnosis (rows 1395/1396): the popover's
  // row spacing already reads large relative to the label/value text
  // — the thumbs were the oversized element, not the gaps. The M16
  // fix's EFFECTIVE (border-expanded) hit box stays 24x24 total,
  // unchanged from before this pass, so it cannot be the source of
  // *new* overlap; only the PAINTED circle shrank (24px -> 16.8px
  // visual), which is what a viewer's eye registers as "overlap".
  // Shrinking the visible circle by 30% removes ~3.6px of visible
  // bleed above and below the track on each side (7.2px of new
  // clearance between adjacent rows' painted circles) without
  // touching `.knob-slider-compact`'s row-gap/margin-bottom, per the
  // commissioner's own "shrink, don't add space" preference.
  //
  // This is a real-layout claim (thumb bleed vs. row box height) that
  // jsdom's non-layout DOM cannot honestly measure (see this file's
  // header note on the jsdom-layout-is-unreliable convention) — a
  // getBoundingClientRect-based assertion here would be theater, not
  // a witness. Marked UNEXERCISED for that reason; the claim rests on
  // the source-pinned 0.7x scale above plus visual verification
  // (screenshot/manual) outside this suite, not on a jsdom assertion.
  //
  // What IS honestly pinnable in source: that `.knob-slider-compact`'s
  // row spacing was deliberately left untouched by this pass (no
  // margin-bottom/row-gap inflation), so a future diff that silently
  // adds compact-row spacing "to fix overlap" is a signal the 0.7x
  // shrink assumption above needs re-examination, not a diff to wave
  // through silently.
  it('UNEXERCISED (jsdom cannot measure real thumb-bleed-vs-row-box overlap): compact row-gap/margin-bottom stay at the pre-existing tight rhythm, not inflated to paper over an overlap the visual shrink is relied on to resolve', () => {
    const source = src('src/components/knobs/KnobSlider.vue');
    const rule = /\.knob-slider-compact\s*\{[^}]*\}/.exec(source);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/row-gap:\s*0/);
    expect(rule![0]).toMatch(/margin-bottom:\s*var\(--space-tight\)/);
  });
});
