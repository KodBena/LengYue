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
 *      (`.claude/dispatch-reports/adr19-audit.md` §S4): the RAW
 *      cluster-12 palette entries `--text-2` (now `--text-disabled` —
 *      see below) / `--accent-primary` were originally bound to both
 *      fail 4.5:1 against `--surface-0`; the OVERRIDE values chosen
 *      for the high-contrast-text block clear it. Pinning both
 *      directions means a future edit to either color can't silently
 *      regress the override back below the WCAG floor without a red
 *      test — the C19 enforcement the audit's own "shortest honest
 *      fix" names.
 *
 *      M26 (audit finding, ledger row 1292) subsequently found that
 *      the raw palette-entry binding was still the DEFAULT (not just
 *      opt-in-fixable) rendering — see
 *      `tests/unit/cluster-secondary-text-contrast.test.ts`, which
 *      reads `theme.css` live and pins that the darkened value ships
 *      BY DEFAULT, in the base `[data-theme="cluster"]` block. The
 *      "RAW palette entries" describe block below keeps asserting the
 *      raw palette entry's own ratio (still true data about
 *      `--cluster-12-6` itself) — it does not describe any live
 *      token's shipped default.
 *
 *      Rows 1478/1479/1481/1497 subsequently RETIRED `--text-1` and
 *      `--text-2` as text-emphasis tiers entirely (theme.css's "Text
 *      tier retirement" docstring): the darkened value below (still
 *      `#685e5d`, unchanged) now lives on as `--text-disabled`
 *      (disabled/inactive-control tone, not a text-emphasis tier), and
 *      is no longer gated behind the `data-contrast-text="on"`
 *      override at all — it is simply the base cluster block's
 *      `--text-disabled` value, same as `cluster-secondary-text-
 *      contrast.test.ts` pins directly. This file's "ON state" describe
 *      block below keeps the historical label (the value predates the
 *      retirement and was never literally re-derived) but the
 *      commentary has been updated so it no longer implies a live
 *      `--text-2` override exists.
 *
 * Hex literals here are copied from `palettes.css` (cluster-12-2,
 * cluster-12-6, cluster-12-9) and from `theme.css`'s override block /
 * `--text-disabled` anchor; a change to either source should be
 * mirrored here deliberately, not silently.
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

describe('cluster theme, RAW palette entries (not any live token\'s shipped default — see M26 / retirement note above)', () => {
  // --surface-0 in [data-theme="cluster"]: var(--cluster-12-9), rgb(254,218,247).
  const surface0 = '#fedaf7';
  // Raw --cluster-12-6, rgb(122,111,109) — the former --text-2's (now
  // --text-disabled's) value BEFORE M26 (ledger row 1292) moved the
  // darkened literal into the base cluster block itself.
  const text2Off = '#7a6f6d';
  // --accent-primary in [data-theme="cluster"] (unmodified — M26 did not touch
  // this token; still gated behind the opt-in overlay): var(--cluster-12-2), rgb(0,167,255).
  const accentPrimaryOff = '#00a7ff';

  it('the raw cluster-12-6 entry on surface-0 fails the 4.5:1 normal-text floor (audit: 3.84:1)', () => {
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

describe('cluster theme, darkened taupe / accent-primary override — clear WCAG AA', () => {
  const surface0 = '#fedaf7';
  // The base cluster block's --text-disabled value (formerly --text-2's
  // M26 darkened default, NEVER actually gated behind the
  // data-contrast-text="on" override — see the file-header note; kept
  // here as a standalone math pin, same value, unchanged by the
  // --text-1/--text-2 retirement).
  const disabledToneValue = '#685e5d';
  // --accent-primary override, [data-theme="cluster"][data-contrast-text="on"]
  // (this one IS a live override, unaffected by the text-tier retirement).
  const accentPrimaryOn = '#0069a1';

  it('the base block\'s --text-disabled value clears 4.5:1 against surface-0 (not required post-retirement, but still true — M26\'s original derivation)', () => {
    const ratio = contrastRatio(disabledToneValue, surface0);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(ratio).toBeCloseTo(4.95, 1);
  });

  it('overridden accent-primary clears 4.5:1 against surface-0 (also clears the 3:1 large/glyph floor)', () => {
    const ratio = contrastRatio(accentPrimaryOn, surface0);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT_OR_GLYPH);
    expect(ratio).toBeCloseTo(4.69, 1);
  });

  it('--text-0 (--cluster-12-4, unmodified, the sole readable-text tier post-retirement) is comfortably above the floor', () => {
    // Included so a reader of this suite sees why it was left alone
    // (theme.css's override-block comment cites the same ~16:1 figure).
    const ratio = contrastRatio('#0b001b', surface0);
    expect(ratio).toBeGreaterThan(15);
  });
});
