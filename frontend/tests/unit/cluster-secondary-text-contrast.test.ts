/**
 * tests/unit/cluster-secondary-text-contrast.test.ts
 *
 * Regression guard for ledger row 1292 (menus-ui-audit finding M26):
 * the `cluster` theme's secondary/help text (`--text-2` — labels,
 * hints, axis text) was bound to the raw `--cluster-12-6` palette
 * entry (taupe, rgb(122,111,109)) in the BASE `[data-theme="cluster"]`
 * block, measuring ~3.84:1 against `--surface-0` — below the WCAG 2.1
 * AA 4.5:1 normal-text floor, and this was the DEFAULT rendering (no
 * toggle required to see it), not merely an opt-in-fixable state. A
 * prior fix (ADR-0019 audit §S4, ledger rows 1018/1144/1198) had
 * already derived a darkened, same-hue value for this exact token —
 * `#685E5D`, ~4.95:1 — but shipped it only behind the opt-in
 * `data-contrast-text="on"` overlay, which defaults OFF
 * (`AppSettings.appearance.highContrastText`). M26's fix moves that
 * already-vetted value into the base block itself, so the default
 * cluster theme clears the floor without the user having to discover
 * and enable a toggle.
 *
 * Same posture as tests/unit/library-selected-open-contrast.test.ts
 * (Tier 1 — no DOM, no Vue): reads `theme.css` / `palettes.css` live
 * and resolves the actual shipped `--text-2` value for the BASE
 * `[data-theme="cluster"]` block (not the opt-in overlay, and not a
 * hardcoded assumption of what it should be), so a future edit that
 * silently reverts `--text-2` back to the raw palette entry — or
 * retunes it below the floor — turns this red.
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

// Slice out the BASE `[data-theme="cluster"] { ... }` block body by
// brace-depth scanning from its opening selector. Deliberately anchors
// on the exact selector string (not a substring match) so this can't
// accidentally match the `[data-theme="cluster"][data-contrast-text="on"]`
// overlay block instead — the whole point of this test is to pin the
// BASE block's default, not the opt-in overlay's.
function baseClusterBlock(css: string): string {
  const marker = '[data-theme="cluster"] {';
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`theme.css: no ${marker} block found`);
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

// Resolve an anchor declared inside the base cluster block to a
// concrete hex value — either a direct `#rrggbb` literal (the M26 fix
// for --text-2) or a `var(--cluster-12-N)` indirection (every other
// still-palette-strict anchor, e.g. --surface-0).
function resolveBaseClusterAnchor(anchorName: string): HexColor {
  const block = baseClusterBlock(THEME_CSS);
  const re = new RegExp(`${anchorName}:\\s*([^;]+);`);
  const m = re.exec(block);
  if (!m) throw new Error(`theme.css: [data-theme="cluster"] has no ${anchorName}`);
  const raw = m[1].trim();
  const clusterVarMatch = /^var\((--cluster-12-\d+)\)$/.exec(raw);
  if (clusterVarMatch) return resolveClusterVar(clusterVarMatch[1]);
  const hex6Match = /^(#[0-9a-fA-F]{6})$/.exec(raw);
  if (hex6Match) return hex6Match[1] as HexColor;
  throw new Error(`theme.css: [data-theme="cluster"] ${anchorName} = "${raw}" not statically resolvable`);
}

describe('cluster theme — default secondary-text contrast (audit M26, ledger row 1292)', () => {
  it('the base [data-theme="cluster"] block no longer binds --text-2 to the raw (failing) --cluster-12-6 entry', () => {
    const block = baseClusterBlock(THEME_CSS);
    const m = /--text-2:\s*([^;]+);/.exec(block);
    expect(m).not.toBeNull();
    expect(m![1].trim()).not.toBe('var(--cluster-12-6)');
  });

  it('the shipped default --text-2 clears WCAG AA 4.5:1 against --surface-0', () => {
    const bg = resolveBaseClusterAnchor('--surface-0');
    const fg = resolveBaseClusterAnchor('--text-2');
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(ratio).toBeCloseTo(4.95, 1);
  });

  it('--text-0 / --text-1 (unmodified, deep purple) still comfortably clear the floor', () => {
    const bg = resolveBaseClusterAnchor('--surface-0');
    for (const anchor of ['--text-0', '--text-1']) {
      const ratio = contrastRatio(resolveBaseClusterAnchor(anchor), bg);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    }
  });
});
