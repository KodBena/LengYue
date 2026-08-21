/**
 * tests/unit/library-selected-open-contrast.test.ts
 *
 * Regression guard for ledger row 1018 (library-ui-audit findings L10
 * and L11), amended by ledger row 1144: two Library sites where a
 * `color` declaration failed the WCAG 2.1 AA 4.5:1 normal-text floor —
 *
 *   - L10: `.preview-btn.primary` (LibraryPreviewPane.vue, "Open in
 *     board") measured 1.84:1 in `cluster` — `color: var(--surface-1)`,
 *     a surface token used as a foreground (the named category-
 *     inversion defect, CLAUDE.md TOKEN LAW rows 681/742).
 *   - L11: `.library-row.selected` (LibraryTable.vue) measured 2.44:1
 *     in `dark` — inherited body text against an --accent-primary
 *     background a prior comment claimed (wrongly) was already fixed.
 *
 * Row 1144 rejected the initial repair (an existing-tokens-only
 * `--border-2` dark-theme override) as still a category mismatch, and
 * amended the brief: `theme.css` now defines `--text-on-accent`, a
 * genuine role-alias anchor for "text sitting directly on an
 * --accent-primary fill," with its own category-correct value in each
 * palette (`#333` in `dark`, `var(--cluster-12-4)` in `cluster` — see
 * theme.css's own definition for the derivation). Both sites now
 * consume that one token directly; no per-theme override lives in the
 * component files anymore.
 *
 * This test is a source-text + theme-table assertion (Tier 1 — no DOM,
 * no Vue), same posture as tests/unit/library-token-integrity.test.ts:
 * it extracts the actual `var(--x)` used at each site from the
 * component source (not a hardcoded assumption of what SHOULD be
 * there), resolves `--text-on-accent` and `--accent-primary` to
 * concrete hex values by reading `src/assets/css/theme.css` per theme
 * (and, for `cluster`'s `--cluster-12-N` indirections,
 * `src/assets/css/palettes.css`), and asserts the resulting
 * `contrastRatio()` clears `WCAG_AA_NORMAL_TEXT` for BOTH fixed sites
 * in BOTH shipped themes. A future edit that silently reintroduces a
 * surface token, or retunes `--text-on-accent` below the floor in
 * either palette, turns this red.
 *
 * Extended by ledger row 1198: the opt-in
 * `[data-theme="cluster"][data-contrast-text="on"]` overlay (see
 * theme.css's own docstring above that block) darkens
 * `--accent-primary` to `#0069A1` but had left `--text-on-accent`
 * un-overridden, so it silently inherited the base `cluster` block's
 * `var(--cluster-12-4)` (deep purple) — 3.43:1 against the darkened
 * accent, below the 4.5:1 floor, even though the un-overlaid `cluster`
 * theme (already covered above) passes. Because a plain `dark` /
 * `cluster` theme-table can't see an attribute-gated overlay of an
 * already-covered theme, the matrix below adds a third row,
 * `'cluster-hc'`, resolved against the overlay selector directly (its
 * own `--accent-primary` and `--text-on-accent`, both declared
 * in-block in theme.css) rather than the base `cluster` block.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  contrastRatio,
  WCAG_AA_NORMAL_TEXT,
  type HexColor,
} from '../../src/utils/contrast-ratio';

const THEME_CSS = readFileSync(
  resolve(process.cwd(), 'src/assets/css/theme.css'),
  'utf-8',
);
const PALETTES_CSS = readFileSync(
  resolve(process.cwd(), 'src/assets/css/palettes.css'),
  'utf-8',
);

type ThemeName = 'dark' | 'cluster' | 'cluster-hc';

// Selector each `ThemeName` resolves to. `cluster-hc` is not a
// `data-theme` value at all — it's the opt-in
// `[data-theme="cluster"][data-contrast-text="on"]` overlay layered on
// top of `cluster` (see theme.css's docstring above that block) — but
// modeling it as its own row lets the matrix below assert the overlay
// selector's OWN resolved values, not the base `cluster` block's.
const THEME_SELECTORS: Record<ThemeName, string> = {
  dark: '[data-theme="dark"]',
  cluster: '[data-theme="cluster"]',
  'cluster-hc': '[data-theme="cluster"][data-contrast-text="on"]',
};

// Slice out a theme selector's `{ ... }` block body by brace-depth
// scanning from the opening selector — simple and correct for this
// file's flat (non-nested) custom-property declarations.
function themeBlock(css: string, theme: ThemeName): string {
  const marker = `${THEME_SELECTORS[theme]} {`;
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`theme.css: no ${THEME_SELECTORS[theme]} block found`);
  const bodyStart = start + marker.length;
  let depth = 1;
  let i = bodyStart;
  for (; i < css.length && depth > 0; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
  }
  return css.slice(bodyStart, i - 1);
}

// `--cluster-12-N: rgba(r, g, b, 1);` -> #rrggbb
function resolveClusterVar(name: string): HexColor {
  const re = new RegExp(`${name}:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+)`);
  const m = re.exec(PALETTES_CSS);
  if (!m) throw new Error(`palettes.css: ${name} not found`);
  const [, r, g, b] = m;
  const hex = [r, g, b]
    .map((v) => Number(v).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}` as HexColor;
}

// Resolve a base anchor (`--accent-primary`, `--text-on-accent`, ...)
// declared inside a specific theme's block to a concrete hex value —
// one level of `var(--cluster-12-N)` indirection (cluster) or a direct
// `#rrggbb`/`#rgb` literal (dark).
function resolveAnchor(theme: ThemeName, anchorName: string): HexColor {
  const block = themeBlock(THEME_CSS, theme);
  const re = new RegExp(`${anchorName}:\\s*([^;]+);`);
  const m = re.exec(block);
  if (!m) throw new Error(`theme.css: ${THEME_SELECTORS[theme]} has no ${anchorName}`);
  const raw = m[1].trim();
  const clusterVarMatch = /^var\((--cluster-12-\d+)\)$/.exec(raw);
  if (clusterVarMatch) return resolveClusterVar(clusterVarMatch[1]);
  const hex6Match = /^(#[0-9a-fA-F]{6})$/.exec(raw);
  if (hex6Match) return hex6Match[1] as HexColor;
  // #rgb shorthand (theme.css's dark block uses e.g. `#333`) expands
  // by doubling each nibble, per the CSS Color spec.
  const hex3Match = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(raw);
  if (hex3Match) {
    const [, r, g, b] = hex3Match;
    return `#${r}${r}${g}${g}${b}${b}` as HexColor;
  }
  throw new Error(`theme.css: ${THEME_SELECTORS[theme]} ${anchorName} = "${raw}" not statically resolvable`);
}

// Confirm a selector's rule block in a component source actually
// references the given token via a bare `var(--x)` (not, say, a
// leftover fallback chain or a different token entirely) before
// trusting theme.css's resolution of that token for the assertion —
// keeps this test honest about what the SHIPPED rule says, not what
// it's assumed to say.
function assertRuleUsesToken(source: string, selectorRuleRegex: RegExp, tokenName: string): void {
  const ruleMatch = selectorRuleRegex.exec(source);
  if (!ruleMatch) throw new Error(`source: selector rule not found (pattern ${selectorRuleRegex})`);
  const usesToken = new RegExp(`color:\\s*var\\(${tokenName}\\)`).test(ruleMatch[0]);
  if (!usesToken) {
    throw new Error(`source: expected "color: var(${tokenName})" in matched rule, got: ${ruleMatch[0]}`);
  }
}

const PREVIEW_PANE_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/library/LibraryPreviewPane.vue'),
  'utf-8',
);
const TABLE_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/library/LibraryTable.vue'),
  'utf-8',
);

const THEMES: ThemeName[] = ['dark', 'cluster', 'cluster-hc'];
const TEXT_ON_ACCENT = '--text-on-accent';

describe('Library — "Open in board" primary label contrast (audit L10, ledger rows 1018/1144)', () => {
  const buttonRuleRe = /\.preview-btn\.primary\s*\{[^}]*\}/;

  it('the shipped rule actually uses --text-on-accent (not a stale fallback chain)', () => {
    assertRuleUsesToken(PREVIEW_PANE_SRC, buttonRuleRe, TEXT_ON_ACCENT);
  });

  for (const theme of THEMES) {
    it(`clears WCAG AA 4.5:1 in the "${theme}" theme`, () => {
      const bg = resolveAnchor(theme, '--accent-primary');
      const fg = resolveAnchor(theme, TEXT_ON_ACCENT);
      const ratio = contrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });
  }
});

describe('Library — selected-row text contrast (audit L11, ledger rows 1018/1144)', () => {
  const rowRuleRe = /\.library-row\.selected\s*\{[^}]*\}/;

  it('the shipped rule actually uses --text-on-accent (not a stale fallback chain)', () => {
    assertRuleUsesToken(TABLE_SRC, rowRuleRe, TEXT_ON_ACCENT);
  });

  for (const theme of THEMES) {
    it(`clears WCAG AA 4.5:1 in the "${theme}" theme`, () => {
      const bg = resolveAnchor(theme, '--accent-primary');
      const fg = resolveAnchor(theme, TEXT_ON_ACCENT);
      const ratio = contrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });
  }
});
