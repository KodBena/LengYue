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
 * Extended (rows 1556/1561, opus-uiux-geometry-consult.md finding G30 —
 * the same M16 class recurring app-wide) for four more witnessed
 * sub-24px families: `.restore-btn` (10x14), checkbox
 * `input[type="checkbox"]` (13x13), `.toolbar-btn` (18px tall, two
 * scoped-CSS copies), and `.move-numbers-btn` (14x10). Same Tier-1
 * source-text-assertion shape as the blocks above; each fixed rule is
 * source-pinned at its shared-style home, never at a call site.
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

describe('KnobSlider.vue compact-row rhythm at the 0.7x thumb (ledger rows 1395/1396)', () => {
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

describe('RegistryEditor.vue — .restore-btn clears 24x24 (G30, rows 1556/1561)', () => {
  // Witnessed 10x14 (16 instances at runtime, one v-for template site).
  const rule = /\.restore-btn\s*\{[^}]*\}/.exec(src('src/components/editors/RegistryEditor.vue'))![0];
  it('carries explicit min-width and min-height >= 24px', () => {
    const w = /min-width:\s*(\d+)px/.exec(rule);
    const h = /min-height:\s*(\d+)px/.exec(rule);
    expect(w).not.toBeNull();
    expect(h).not.toBeNull();
    expect(Number(w![1])).toBeGreaterThanOrEqual(24);
    expect(Number(h![1])).toBeGreaterThanOrEqual(24);
  });
  it('stays visually unpainted (no background/border) so only the hit box grew', () => {
    expect(rule).toMatch(/background:\s*none/);
    expect(rule).toMatch(/border:\s*none/);
  });
});

describe('StatusBar.vue — .move-numbers-btn clears 24x24 (G30, rows 1556/1561)', () => {
  // Witnessed 14x10.
  const rule = /\.move-numbers-btn\s*\{[^}]*\}/.exec(src('src/components/board/StatusBar.vue'))![0];
  it('carries explicit min-width and min-height >= 24px', () => {
    const w = /min-width:\s*(\d+)px/.exec(rule);
    const h = /min-height:\s*(\d+)px/.exec(rule);
    expect(w).not.toBeNull();
    expect(h).not.toBeNull();
    expect(Number(w![1])).toBeGreaterThanOrEqual(24);
    expect(Number(h![1])).toBeGreaterThanOrEqual(24);
  });
  it('stays visually unpainted (transparent background, no border) so only the hit box grew', () => {
    expect(rule).toMatch(/background:\s*transparent/);
    expect(rule).toMatch(/border:\s*none/);
  });
});

describe('.toolbar-btn clears the 24px height floor at both scoped-CSS copies (G30, rows 1556/1561)', () => {
  // Witnessed 18px tall app-wide (widths 20-106px, unaffected). Vue
  // scoped styles can't cross the SFC boundary, so Toolbar.vue and
  // ToolbarMoveNav.vue each carry their own copy of this rule (see
  // ToolbarMoveNav.vue's own header comment) — both must be fixed or
  // half the toolbar regresses silently.
  for (const file of ['src/components/chrome/Toolbar.vue', 'src/components/chrome/ToolbarMoveNav.vue']) {
    describe(file, () => {
      const rule = /(?:^|\n)\.toolbar-btn\s*\{[^}]*\}/.exec(src(file))![0];
      it('carries an explicit min-height >= 24px', () => {
        const m = /min-height:\s*(\d+)px/.exec(rule);
        expect(m).not.toBeNull();
        expect(Number(m![1])).toBeGreaterThanOrEqual(24);
      });
      it('padding/font-size (the visual language) are untouched by this pass', () => {
        expect(rule).toMatch(/padding:\s*1px 5px/);
        expect(rule).toMatch(/font-size:\s*var\(--text-emphasis\)/);
      });
    });
  }
});

describe('style.css — global input[type="checkbox"] rule clears 24x24 effective (G30, rows 1556/1561)', () => {
  // Witnessed 13x13 across 15 instances / 8 files. One document-wide
  // element-selector rule is the shared home for the whole family
  // (P1) rather than per-site padding. Technique: pin the native
  // widget's own paint size to its current 13x13 on an explicit
  // content-box, then let padding grow the invisible border-box (the
  // actual hit-test area) to >=24x24 — the same "visual size
  // preserved, effective hit area >=24" contract as KnobSlider's thumb,
  // using padding instead of a transparent border because native
  // checkbox rendering doesn't reliably keep a CSS border unpainted.
  const rule = /input\[type="checkbox"\]\s*\{[^}]*\}/.exec(src('src/assets/css/style.css'))![0];
  const VISUAL_PX = 13;

  it('pins box-sizing to content-box (so padding cannot eat into the 13px visual)', () => {
    expect(rule).toMatch(/box-sizing:\s*content-box/);
  });
  it('visual (content) size stays pinned at the witnessed 13x13', () => {
    const w = /width:\s*([\d.]+)px/.exec(rule);
    const h = /height:\s*([\d.]+)px/.exec(rule);
    expect(w).not.toBeNull();
    expect(h).not.toBeNull();
    expect(Number(w![1])).toBeCloseTo(VISUAL_PX, 5);
    expect(Number(h![1])).toBeCloseTo(VISUAL_PX, 5);
  });
  it('padding expands the effective (content + padding) target to >= 24x24', () => {
    const w = /width:\s*([\d.]+)px/.exec(rule);
    const padding = /padding:\s*([\d.]+)px/.exec(rule);
    expect(padding).not.toBeNull();
    const effective = Number(w![1]) + 2 * Number(padding![1]);
    expect(effective).toBeGreaterThanOrEqual(24);
  });

  it('MintCardModal.vue does not re-narrow .calibrate-checkbox with a scoped width override', () => {
    // A scoped `.calibrate-checkbox { width: ... }` in MintCardModal.vue
    // carries a [data-v-*] attribute the compiler appends, which
    // out-specifies the global element+attribute selector above and
    // would silently reopen the sub-24px target on this one checkbox —
    // this is a real-cascade claim jsdom's non-layout DOM can't replay,
    // so it's pinned at the source level: the scoped rule must not
    // declare `width` (or `height`) at all.
    const mint = src('src/components/modals/MintCardModal.vue');
    const calibrateRule = /\.calibrate-checkbox\s*\{[^}]*\}/.exec(mint)![0];
    expect(calibrateRule).not.toMatch(/\bwidth\s*:/);
    expect(calibrateRule).not.toMatch(/\bheight\s*:/);
  });
});

describe('UNEXERCISED (jsdom cannot measure real layout/cascade): G30 pointer-target families', () => {
  it('checkbox/.restore-btn/.toolbar-btn/.move-numbers-btn effective hit-box sizes are pinned in source only; real rendered getBoundingClientRect (incl. native checkbox appearance quirks across engines, and CSS cascade/specificity resolution) is not exercised by this jsdom suite — verification of the actual painted/hit geometry rests on the G30 consult screenshots/measurements this fix responds to, not on an assertion in this file', () => {
    expect(true).toBe(true);
  });
});
