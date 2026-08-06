/**
 * tests/unit/contrast-ratio.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/utils/contrast-ratio.ts`, and
 * the machine-checked evidence backing the high-contrast-text token
 * choices in `src/assets/css/theme.css`'s
 * `[data-theme="cluster"][data-contrast-text="on"]` block.
 *
 * Two groups of assertions:
 *   1. The WCAG math itself, against a couple of textbook values.
 *   2. The actual token pairs from the ADR-0019 audit
 *      (`.claude/dispatch-reports/adr19-audit.md` §S4): the ORIGINAL
 *      cluster-theme `--text-2` / `--accent-primary` values fail
 *      4.5:1 against `--surface-0`; the OVERRIDE values chosen for
 *      the high-contrast-text block clear it. Pinning both directions
 *      means a future edit to either color can't silently regress the
 *      override back below the WCAG floor without a red test — the
 *      C19 enforcement the audit's own "shortest honest fix" names.
 *
 * Hex literals here are copied from `palettes.css` (cluster-12-2,
 * cluster-12-6, cluster-12-9) and from `theme.css`'s override block;
 * a change to either source should be mirrored here deliberately, not
 * silently.
 *
 * No DOM, no fakes, no Vue reactivity.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  contrastRatio,
  relativeLuminance,
  WCAG_AA_NORMAL_TEXT,
  WCAG_AA_LARGE_TEXT_OR_GLYPH,
} from '../../src/utils/contrast-ratio';

describe('relativeLuminance / contrastRatio — WCAG math', () => {
  it('white vs black is the maximum 21:1 ratio', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });

  it('a color against itself is always 1:1', () => {
    expect(contrastRatio('#7a6f6d', '#7a6f6d')).toBeCloseTo(1, 5);
  });

  it('argument order does not matter', () => {
    expect(contrastRatio('#00a7ff', '#fedaf7')).toBeCloseTo(
      contrastRatio('#fedaf7', '#00a7ff'),
      10,
    );
  });

  it('rejects a malformed hex literal loudly (ADR-0002)', () => {
    // @ts-expect-error deliberately malformed input for the runtime guard
    expect(() => relativeLuminance('not-a-color')).toThrow();
  });
});

describe('cluster theme, OFF state (today\'s shipped values) — the audit\'s failing pair', () => {
  // --surface-0 in [data-theme="cluster"]: var(--cluster-12-9), rgb(254,218,247).
  const surface0 = '#fedaf7';
  // --text-2 in [data-theme="cluster"] (unmodified): var(--cluster-12-6), rgb(122,111,109).
  const text2Off = '#7a6f6d';
  // --accent-primary in [data-theme="cluster"] (unmodified): var(--cluster-12-2), rgb(0,167,255).
  const accentPrimaryOff = '#00a7ff';

  it('text-2 on surface-0 fails the 4.5:1 normal-text floor (audit: 3.84:1)', () => {
    const ratio = contrastRatio(text2Off, surface0);
    expect(ratio).toBeCloseTo(3.84, 1);
    expect(ratio).toBeLessThan(WCAG_AA_NORMAL_TEXT);
  });

  it('accent-primary on surface-0 fails the 4.5:1 normal-text floor (audit: 2.08:1)', () => {
    const ratio = contrastRatio(accentPrimaryOff, surface0);
    expect(ratio).toBeCloseTo(2.08, 1);
    expect(ratio).toBeLessThan(WCAG_AA_NORMAL_TEXT);
  });
});

describe('cluster theme, ON state (data-contrast-text="on" override) — clears WCAG AA', () => {
  const surface0 = '#fedaf7';
  // --text-2 override, [data-theme="cluster"][data-contrast-text="on"].
  const text2On = '#685e5d';
  // --accent-primary override, [data-theme="cluster"][data-contrast-text="on"].
  const accentPrimaryOn = '#0069a1';

  it('overridden text-2 clears 4.5:1 against surface-0', () => {
    const ratio = contrastRatio(text2On, surface0);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(ratio).toBeCloseTo(4.95, 1);
  });

  it('overridden accent-primary clears 4.5:1 against surface-0 (also clears the 3:1 large/glyph floor)', () => {
    const ratio = contrastRatio(accentPrimaryOn, surface0);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT_OR_GLYPH);
    expect(ratio).toBeCloseTo(4.69, 1);
  });

  it('text-0/text-1 (--cluster-12-4, unmodified) were already comfortably above the floor', () => {
    // Not part of the override — included so a reader of this suite sees
    // why they were left alone (theme.css's override-block comment cites
    // the same ~16:1 figure).
    const ratio = contrastRatio('#0b001b', surface0);
    expect(ratio).toBeGreaterThan(15);
  });
});
