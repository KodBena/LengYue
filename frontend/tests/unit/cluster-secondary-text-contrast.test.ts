/**
 * tests/unit/cluster-secondary-text-contrast.test.ts
 *
 * Originally the regression guard for ledger row 1292 (menus-ui-audit
 * finding M26): the `cluster` theme's secondary/help text (`--text-2`
 * — labels, hints, axis text) was bound to the raw `--cluster-12-6`
 * palette entry (taupe, rgb(122,111,109)) in the BASE
 * `[data-theme="cluster"]` block, measuring ~3.84:1 against
 * `--surface-0` — below the WCAG 2.1 AA 4.5:1 normal-text floor, and
 * this was the DEFAULT rendering (no toggle required to see it), not
 * merely an opt-in-fixable state. M26's fix moved an already-derived,
 * darkened same-hue value (`#685E5D`, ~4.95:1 — ADR-0019 audit §S4,
 * ledger rows 1018/1144/1198) into the base block so the default
 * cluster theme cleared the floor without a toggle.
 *
 * UPDATED for rows 1478/1479/1481/1497 (the commissioner's "readable
 * text is always max contrast" ruling — theme.css's "Text tier
 * retirement" docstring): `--text-1`/`--text-2` are RETIRED as
 * text-emphasis tiers entirely. `--text-0` is now the sole tier for
 * readable text (labels, hints, axis text included — the exact
 * category M26 was about), so this test's WCAG-floor assertion is
 * STRENGTHENED, not weakened or dropped: instead of pinning only the
 * former secondary/help-text token, it now pins `--text-0` — the one
 * token every readable-text consumer in the app resolves to post-
 * migration, cluster's own former `--text-1` included, which used the
 * identical value already. M26's darkened taupe survives only as
 * `--text-disabled` (disabled/inactive-control tone), which is
 * deliberately NOT WCAG-floor-tested here: disabled UI text is exempt
 * from the SC 1.4.3 normal-text floor by design (both the WCAG
 * exception for inactive components and this codebase's own
 * commissioner ruling that `--text-disabled` is for controls, never
 * readable prose) — asserting a floor on it would be a new,
 * unjustified requirement this arc has no mandate to impose.
 *
 * Same posture as tests/unit/library-selected-open-contrast.test.ts
 * (Tier 1 — no DOM, no Vue): reads `theme.css` / `palettes.css` live
 * and resolves the actual shipped values for the BASE
 * `[data-theme="cluster"]` block (not the opt-in overlay, and not a
 * hardcoded assumption of what it should be).
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
// concrete hex value — either a direct `#rrggbb` literal (the M26 fix,
// now carried by --text-disabled) or a `var(--cluster-12-N)`
// indirection (every other still-palette-strict anchor, e.g.
// --surface-0, --text-0).
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

describe('cluster theme — readable-text contrast (rows 1478/1479/1481/1497; formerly audit M26, ledger row 1292)', () => {
  it('the base [data-theme="cluster"] block declares no --text-1 or --text-2 anchor at all (the retirement itself)', () => {
    const block = baseClusterBlock(THEME_CSS);
    expect(/--text-1:\s*[^;]+;/.test(block)).toBe(false);
    expect(/--text-2:\s*[^;]+;/.test(block)).toBe(false);
  });

  it('--text-0 (the sole readable-text tier, post-retirement) clears WCAG AA 4.5:1 against --surface-0', () => {
    // Strengthened, not weakened: every former --text-1 AND --text-2
    // readable-text consumer now resolves through this one anchor, so
    // this single assertion covers the full readable-text surface the
    // old test's two separate checks (--text-1 pin + --text-2 pin)
    // used to split across two tokens.
    const bg = resolveBaseClusterAnchor('--surface-0');
    const fg = resolveBaseClusterAnchor('--text-0');
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it('the base block still declares a --text-disabled anchor, carrying M26\'s already-vetted darkened taupe (not WCAG-floor-tested — disabled/inactive-control text is exempt by design)', () => {
    const block = baseClusterBlock(THEME_CSS);
    const m = /--text-disabled:\s*([^;]+);/.exec(block);
    expect(m).not.toBeNull();
    expect(m![1].trim()).toBe('#685E5D');
  });
});
