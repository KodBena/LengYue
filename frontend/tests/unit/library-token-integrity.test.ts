/**
 * tests/unit/library-token-integrity.test.ts
 *
 * Regression guard for ledger row 1014 (library-ui-audit finding L1):
 * the five Library components referenced eight custom properties
 * (`--space-tiny`, `--space-small`, `--space-large`, `--text-small`,
 * `--text-default`, `--text-muted`, `--border-subtle`, `--z-dropdown`)
 * that were defined nowhere in the codebase. CSS drops a declaration
 * whose `var()` fails to resolve in silence, so ~58 declarations
 * across these five files never painted — no row separators, no
 * hover feedback, flat 10px typography, an 11px-tall primary button,
 * a borderless drop zone.
 *
 * This test is a source-text assertion (Tier 1 — no DOM, no Vue), same
 * posture as tests/unit/shared-chrome-css.test.ts: it extracts every
 * custom-property NAME defined in src/assets/css/theme.css (the
 * project's SSOT for chrome tokens — see that file's own header) and
 * every `var(--x)` REFERENCE inside the five library components'
 * `<style>` blocks, then asserts the reference set is a subset of the
 * definition set. It would have caught L1 outright, and it will catch
 * the next ghost token the same way — in any of the library
 * components, not just the eight this pass fixed.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const THEME_CSS = readFileSync(
  resolve(process.cwd(), 'src/assets/css/theme.css'),
  'utf-8',
);

const LIBRARY_COMPONENTS = [
  'src/components/library/LibraryTable.vue',
  'src/components/library/LibraryPreviewPane.vue',
  'src/components/library/LibraryTab.vue',
  'src/components/library/LibraryImportPanel.vue',
  'src/components/library/LibraryPlayerFilter.vue',
];

// Every custom property DEFINED in theme.css, regardless of which
// `[data-theme="..."]` block or `:root` it lives in — a token counts
// as "real" if any theme block declares it.
function definedTokens(css: string): Set<string> {
  const names = new Set<string>();
  for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) names.add(m[1]);
  return names;
}

// Every custom property referenced via a BARE `var(--x)` — no second
// (fallback) argument — inside a file's `<style>` block(s). Deliberately
// whole-file rather than isolating the <style> tag's contents — these
// five components have exactly one scoped <style> block each and no
// `--x` appears in <script>/<template> text, so scanning the whole
// source is equivalent and simpler.
//
// A `var(--x, fallback)` call is EXCLUDED on purpose: CSS's own
// fallback mechanism means a missing `--x` degrades to `fallback`
// rather than being silently dropped (the L1 failure mode this test
// guards against), so it isn't a ghost-token defect the same way a
// bare, fallback-less `var(--x)` is. Two sites in this codebase
// (`--accent-positive`, `--accent-negative` in LibraryImportPanel.vue)
// use exactly this pattern deliberately and are out of this pass's
// scope (not among the eight tokens ledger row 1014 named).
function referencedTokens(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/var\((--[a-zA-Z0-9-]+)\)/g)) names.add(m[1]);
  return names;
}

describe('library components — every referenced CSS custom property resolves (ledger row 1014)', () => {
  const defined = definedTokens(THEME_CSS);

  it('theme.css actually defines a non-trivial token set (sanity check on the extractor)', () => {
    expect(defined.size).toBeGreaterThan(20);
  });

  for (const path of LIBRARY_COMPONENTS) {
    it(`${path}: every var(--x) reference is defined in theme.css`, () => {
      const source = readFileSync(resolve(process.cwd(), path), 'utf-8');
      const referenced = referencedTokens(source);
      const ghosts = [...referenced].filter((name) => !defined.has(name));
      expect(ghosts).toEqual([]);
    });
  }
});
