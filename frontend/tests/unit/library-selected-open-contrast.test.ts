/**
 * tests/unit/library-selected-open-contrast.test.ts
 *
 * Regression guard for ledger row 1018 (library-ui-audit findings L10
 * and L11): two Library sites where a `color` declaration failed the
 * WCAG 2.1 AA 4.5:1 normal-text floor —
 *
 *   - L10: `.preview-btn.primary` (LibraryPreviewPane.vue, "Open in
 *     board") measured 1.84:1 in `cluster` — `color: var(--surface-1)`,
 *     a surface token used as a foreground (the named category-
 *     inversion defect, CLAUDE.md TOKEN LAW rows 681/742).
 *   - L11: `.library-row.selected` (LibraryTable.vue) measured 2.44:1
 *     in `dark` — inherited body text against an --accent-primary
 *     background a prior comment claimed (wrongly) was already fixed.
 *
 * Both were repaired the same way: an explicit `color` using
 * `var(--library-*-text, var(--text-0))` — `--text-0` for `cluster`
 * (and any theme without an override) — with a `dark`-only override
 * (mirroring TreeWidget.vue's `--tree-node-black-fill` technique, an
 * unscoped <style> block keying off `[data-theme="dark"]`, which lives
 * on <html>, outside a scoped block's reach) setting the custom
 * property to `--border-2`. Dark's own `text-*` tier (#fff/#aaa/#666)
 * cannot clear 4.5:1 against dark's --accent-primary (#4aaef0) — see
 * the two components' own comments at the fixed rules for the full
 * derivation.
 *
 * This test is a source-text + theme-table assertion (Tier 1 — no DOM,
 * no Vue), same posture as tests/unit/library-token-integrity.test.ts:
 * it extracts the actual `var(--x)` chain used at each site from the
 * component source (not a hardcoded assumption of what SHOULD be
 * there), resolves each named custom property to a concrete hex value
 * by reading `src/assets/css/theme.css` (and, for `cluster`'s
 * `--cluster-12-N` indirections, `src/assets/css/palettes.css`), and
 * asserts the resulting `contrastRatio()` clears `WCAG_AA_NORMAL_TEXT`
 * for BOTH fixed sites in BOTH shipped themes. A future edit that
 * silently reintroduces a surface token, or swaps `--border-2` for a
 * lighter anchor, turns this red.
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

type ThemeName = 'dark' | 'cluster';

// Slice out a `[data-theme="X"] { ... }` block's body by brace-depth
// scanning from the opening selector — simple and correct for this
// file's flat (non-nested) custom-property declarations.
function themeBlock(css: string, theme: ThemeName): string {
  const marker = `[data-theme="${theme}"] {`;
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`theme.css: no [data-theme="${theme}"] block found`);
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

// Resolve a base anchor (`--accent-primary`, `--text-0`, `--border-2`,
// ...) declared inside a specific theme's block to a concrete hex
// value — one level of `var(--cluster-12-N)` indirection (cluster) or
// a direct `#rrggbb` literal (dark).
function resolveAnchor(theme: ThemeName, anchorName: string): HexColor {
  const block = themeBlock(THEME_CSS, theme);
  const re = new RegExp(`${anchorName}:\\s*([^;]+);`);
  const m = re.exec(block);
  if (!m) throw new Error(`theme.css: [data-theme="${theme}"] has no ${anchorName}`);
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
  throw new Error(`theme.css: [data-theme="${theme}"] ${anchorName} = "${raw}" not statically resolvable`);
}

// A component-local custom property with a fallback, e.g.
// `var(--library-open-btn-text, var(--text-0))`, resolved for a given
// theme: the dark-only unscoped-<style> override if present for that
// theme, else the fallback anchor.
function resolveLocalTextVar(
  source: string,
  selectorRuleRegex: RegExp,
  localVarName: string,
  theme: ThemeName,
): HexColor {
  const ruleMatch = selectorRuleRegex.exec(source);
  if (!ruleMatch) throw new Error(`source: selector rule not found (pattern ${selectorRuleRegex})`);
  const fallbackMatch = new RegExp(
    `var\\(${localVarName},\\s*var\\((--[a-zA-Z0-9-]+)\\)\\)`,
  ).exec(ruleMatch[0]);
  if (!fallbackMatch) throw new Error(`source: ${localVarName} fallback chain not found in matched rule`);
  const fallbackAnchor = fallbackMatch[1];

  if (theme === 'dark') {
    const overrideRe = new RegExp(
      `\\[data-theme="dark"\\][^{]*\\{[^}]*${localVarName}:\\s*var\\((--[a-zA-Z0-9-]+)\\)`,
    );
    const overrideMatch = overrideRe.exec(source);
    if (overrideMatch) return resolveAnchor('dark', overrideMatch[1]);
  }
  return resolveAnchor(theme, fallbackAnchor);
}

const PREVIEW_PANE_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/library/LibraryPreviewPane.vue'),
  'utf-8',
);
const TABLE_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/library/LibraryTable.vue'),
  'utf-8',
);

const THEMES: ThemeName[] = ['dark', 'cluster'];

describe('Library — "Open in board" primary label contrast (audit L10, ledger row 1018)', () => {
  const buttonRuleRe = /\.preview-btn\.primary\s*\{[^}]*\}/;

  for (const theme of THEMES) {
    it(`clears WCAG AA 4.5:1 in the "${theme}" theme`, () => {
      const bg = resolveAnchor(theme, '--accent-primary');
      const fg = resolveLocalTextVar(
        PREVIEW_PANE_SRC,
        buttonRuleRe,
        '--library-open-btn-text',
        theme,
      );
      const ratio = contrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });
  }
});

describe('Library — selected-row text contrast (audit L11, ledger row 1018)', () => {
  const rowRuleRe = /\.library-row\.selected\s*\{[^}]*\}/;

  for (const theme of THEMES) {
    it(`clears WCAG AA 4.5:1 in the "${theme}" theme`, () => {
      const bg = resolveAnchor(theme, '--accent-primary');
      const fg = resolveLocalTextVar(
        TABLE_SRC,
        rowRuleRe,
        '--library-selected-row-text',
        theme,
      );
      const ratio = contrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });
  }
});
