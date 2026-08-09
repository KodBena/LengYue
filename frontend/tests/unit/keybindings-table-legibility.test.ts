/**
 * tests/unit/keybindings-table-legibility.test.ts
 *
 * Regression guard for menus-ui-audit finding M5 (report.md,
 * `.claude/dispatch-reports/menus-ui-audit/report.md`, ledger row
 * 1251): the Keybindings table's chord column was centred per-row —
 * each of the six domain sections rendered its own <table>, so an
 * auto-layout table computed independent column widths per section
 * from that section's own content, landing the "same" visual column
 * at a different x-position depending which section a row was in.
 * Edit/Reset also abutted with zero gap next to a destructive action,
 * traced to two ghost custom properties (--space-tiny, --space-small)
 * that were never defined in theme.css — same defect class as ledger
 * row 1014's library-token-integrity fix.
 *
 * Source-text assertions only (Tier 1 — no DOM, no Vue), matching
 * this repo's own stated convention (TabWidget-overflow.test.ts:
 * "Computed style assertion isn't reliable under jsdom (no real
 * layout engine)"): the fix is asserted against the actual shipped
 * CSS text, not a simulated layout.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const THEME_CSS = readFileSync(resolve(process.cwd(), 'src/assets/css/theme.css'), 'utf-8');
const ROW_SRC = readFileSync(resolve(process.cwd(), 'src/components/KeybindingRow.vue'), 'utf-8');
const VIEW_SRC = readFileSync(resolve(process.cwd(), 'src/components/KeybindingsView.vue'), 'utf-8');

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

describe('KeybindingRow.vue / KeybindingsView.vue — no ghost custom properties (same defect class as ledger row 1014)', () => {
  const defined = definedTokens(THEME_CSS);
  for (const [path, source] of [
    ['src/components/KeybindingRow.vue', ROW_SRC],
    ['src/components/KeybindingsView.vue', VIEW_SRC],
  ] as const) {
    it(`${path}: every var(--x) reference is defined in theme.css`, () => {
      const ghosts = [...referencedTokens(source)].filter((name) => !defined.has(name));
      expect(ghosts).toEqual([]);
    });
  }
});

describe('KeybindingsView.vue — chord column is a genuine shared column (M5)', () => {
  it('every section renders through one table CSS rule with table-layout: fixed (identical column widths regardless of section content)', () => {
    const rule = /\.keybindings-table\s*\{[^}]*\}/.exec(VIEW_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/table-layout:\s*fixed/);
  });
});

describe('KeybindingRow.vue — chord column left-aligned, not per-row-centred (M5)', () => {
  it('.action-key is text-align: left (not centred, not right)', () => {
    const rule = /\.action-key\s*\{[^}]*\}/.exec(ROW_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/text-align:\s*left/);
  });

  it('.action-key carries a fixed width, so it is the same absolute column across every section', () => {
    const rule = /\.action-key\s*\{[^}]*\}/.exec(ROW_SRC);
    expect(rule![0]).toMatch(/width:\s*\d+px/);
  });
});

describe('KeybindingRow.vue — Edit/Reset get real spacing, not zero-gap abutment (M5)', () => {
  it('the adjacent-button rule uses a real (non-ghost) spacing token', () => {
    const rule = /\.action-buttons \.row-btn \+ \.row-btn\s*\{[^}]*\}/.exec(ROW_SRC);
    expect(rule).not.toBeNull();
    const m = /margin-left:\s*var\((--[a-zA-Z0-9-]+)\)/.exec(rule![0]);
    expect(m).not.toBeNull();
    expect(definedTokens(THEME_CSS).has(m![1])).toBe(true);
  });
});

describe('KeybindingRow.vue — row legibility rules match the Library table in-repo precedent (M5)', () => {
  it('row border-bottom uses --border-1, the same token LibraryTable.vue\'s .library-row uses', () => {
    const rule = /\.keybinding-row td\s*\{[^}]*\}/.exec(ROW_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/border-bottom:\s*1px solid var\(--border-1\)/);

    const libSrc = readFileSync(resolve(process.cwd(), 'src/components/library/LibraryTable.vue'), 'utf-8');
    const libRule = /\.library-row\s*\{[^}]*\}/.exec(libSrc);
    expect(libRule![0]).toMatch(/border-bottom:\s*1px solid var\(--border-1\)/);
  });

  it('rows carry a hover state (scanning aid), matching the Library table precedent', () => {
    expect(ROW_SRC).toMatch(/\.keybinding-row:hover td\s*\{[^}]*background:/);
  });
});
