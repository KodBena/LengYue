/**
 * tests/unit/token-integrity-appwide.test.ts
 *
 * App-wide extension of tests/unit/library-token-integrity.test.ts's
 * mechanism (ledger row 1014; folds in the filed backlog item
 * `token-integrity-test-appwide`) — this is the ADR-0011 net for the
 * `--text-1`/`--text-2` retirement (rows 1478/1479/1481/1497,
 * theme.css's "Text tier retirement" docstring): every bare
 * `var(--x)` reference in `frontend/src/**.vue` / shared CSS, and
 * every `themeColor('--x')` call in `frontend/src/**.ts`, must
 * resolve to a token actually declared in theme.css (or palettes.css,
 * theme.css's own dependency for the `--cluster-12-N` entries).
 *
 * If `--text-1` or `--text-2` is ever reintroduced at a consumer site
 * — by a revert, a bad merge, or a future edit reaching for the
 * "obvious" name without checking it still exists — this test fails
 * red the same way the L1 finding this mechanism is modeled on did:
 * a ghost custom property that silently drops its declaration rather
 * than erroring, so the only way to catch it is a static sweep like
 * this one, not the running app (CSS doesn't throw).
 *
 * Two kinds of DISCLOSED, explicitly-allowlisted exception — both
 * allowlisted by exact file + exact token name, so a NEW ghost
 * reference anywhere else, including a different token in these same
 * files, still fails red:
 *
 *   1. `DISCLOSED_FENCE_EXCEPTIONS` — two fenced files a concurrent
 *      builder still owns (dispatch brief: "if they consume
 *      --text-1/--text-2, report the sites instead of editing them" —
 *      crossing the fence to fix them was refused per this same
 *      brief's STOP-and-report-on-collision rule):
 *        - src/components/chrome/TabWidget.vue:173 (`var(--text-2)`)
 *        - src/components/wizard/steps/WizardStepSgfImport.vue:38
 *          (`.step-description { color: var(--text-1); ... }`)
 *
 *   2. `PRE_EXISTING_GHOST_TOKENS` — five files referencing
 *      `--text-small` / `--space-small` / `--text-muted` /
 *      `--space-tiny`, none of which this arc introduced or touched.
 *      Surfaced incidentally by running this mechanism app-wide for
 *      the first time — the same way library-token-integrity.test.ts's
 *      L1 finding surfaced eight ghost tokens in the Library
 *      components. Left unfixed deliberately: each is currently
 *      silently DROPPED (not merely mis-rendered), so the affected
 *      elements render at their inherited size today; picking a real
 *      token to route them to is a visible rendering decision this
 *      arc has no spec for. See both allowlists' own code comments
 *      for the per-entry citation, and
 *      .claude/dispatch-reports/labels-text0-sweep-build.md for the
 *      full writeup.
 *
 * Tier 1 (source-text assertion, no DOM, no Vue) — same posture as
 * `library-token-integrity.test.ts` and `shared-chrome-css.test.ts`.
 * Comments (CSS/JS block comments, HTML template comments, `//` line
 * comments) are stripped before scanning —
 * a docstring illustrating `var(--name)` as a placeholder, or
 * paraphrasing a real (fallback-guarded) usage without the fallback,
 * is prose, not the consumer contract this test enforces; both were
 * caught as false positives while building this test (theme-color.ts,
 * ToolbarEngineMetrics.vue) and fixed by stripping comments, not by
 * touching the app code they were describing. A file's own
 * locally-declared custom properties (`--x: value;` in its own scoped
 * <style>, or a `:style`-bound object key) are excluded from the
 * ghost check for that file — a component threading a computed value
 * through a scoped CSS custom property (BoardTab.vue's `--tab-width`,
 * ToolbarEngineMetrics.vue's `--watchdog-animation-ms`) is a local
 * variable, not a theme.css substrate reference.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SRC_ROOT = resolve(process.cwd(), 'src');

const THEME_CSS = readFileSync(resolve(SRC_ROOT, 'assets/css/theme.css'), 'utf-8');
const PALETTES_CSS = readFileSync(resolve(SRC_ROOT, 'assets/css/palettes.css'), 'utf-8');

// Two fenced sites a concurrent builder still owns — see file header.
// Keyed by repo-relative path; each entry lists the exact ghost token
// names that file is allowed to still reference (nothing else).
const DISCLOSED_FENCE_EXCEPTIONS: Record<string, Set<string>> = {
};

// PRE-EXISTING ghost tokens, unrelated to the --text-1/--text-2
// retirement this test was built to guard — surfaced incidentally by
// running this mechanism app-wide for the first time (the same way
// the original library-token-integrity.test.ts's L1 finding surfaced
// eight of them in the Library components). Fixing them requires a
// real design decision this arc was not chartered to make: e.g.
// `--text-small` has been silently DROPPED (not merely mis-rendered)
// everywhere it's used, so the affected elements currently inherit
// body-size text (10px) — picking a real token to route it to (the
// obvious `--text-tiny` at 9px is smaller, not a no-op) is a visible
// rendering change with no spec behind it here. Allowlisted and
// reported rather than silently fixed or silently hidden — see
// .claude/dispatch-reports/labels-text0-sweep-build.md, "Pre-existing
// ghost tokens (new findings, out of scope)" — filed for a dedicated
// follow-up pass, NOT swept into this arc's scope.
const PRE_EXISTING_GHOST_TOKENS: Record<string, Set<string>> = {
  'src/components/editors/AnalysisTabsEditor.vue': new Set(['--text-small']),
  'src/components/charts/MergedDeltaPanel.vue': new Set(['--text-small']),
  'src/components/charts/StabilityCrossCorrelationPanel.vue': new Set(['--text-small']),
  'src/components/charts/StabilityPanel.vue': new Set(['--text-small']),
  'src/components/modals/PlayEngineModal.vue': new Set([
    '--space-small', '--text-muted', '--space-tiny',
  ]),
};

// Every custom property DEFINED anywhere in the substrate — theme.css
// (the SSOT) plus palettes.css (theme.css's own `--cluster-12-N`
// dependency; not itself a token consumers reach for directly today,
// but included so the defined-set is complete and correct rather than
// coincidentally sufficient).
function definedTokens(): Set<string> {
  const names = new Set<string>();
  for (const css of [THEME_CSS, PALETTES_CSS]) {
    for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) names.add(m[1]);
  }
  return names;
}

// Strip `/* ... */` block comments, `<!-- ... -->` template comments,
// and `//` line comments before scanning for references. Without
// this, a DOCSTRING example (`\`var(--name)\`` in a JSDoc, `` var(--foo)
// `` in a code-comment illustration) reads as a real reference and
// false-positives as a ghost token the first time the doc happens not
// to name a real anchor — caught concretely while building this test:
// theme-color.ts's own header docstring illustrates the accessor with
// `` var(--name) `` as a placeholder, and ToolbarEngineMetrics.vue's
// header comment paraphrases its own (real, fallback-guarded) usage
// without the fallback. Comments are prose, not the consumer contract
// this test enforces; only live code should be graded.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

// Every bare `var(--x)` reference — no fallback argument. See
// library-token-integrity.test.ts's docstring for why a
// `var(--x, fallback)` call is deliberately excluded (CSS's own
// fallback mechanism means a missing `--x` degrades gracefully rather
// than silently dropping the declaration — not the L1 failure mode
// this test guards against).
function referencedVarTokens(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/var\((--[a-zA-Z0-9-]+)\)/g)) names.add(m[1]);
  return names;
}

// Every `themeColor('--x')` / `themeColor("--x")` call — the runtime
// accessor's own consumers (ECharts adapter configs, SVG presentation
// attributes) don't go through `var()` at all.
function referencedThemeColorTokens(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/themeColor\(\s*['"](--[a-zA-Z0-9-]+)['"]\s*\)/g)) {
    names.add(m[1]);
  }
  return names;
}

// Every custom property a file declares FOR ITSELF — `--x: value;` in
// a scoped <style> block (e.g. BoardTab.vue's `.thumb-container
// { --tab-width: 86px; ...; width: var(--tab-width); }`), or an
// inline-style/`:style` binding object key (e.g.
// ToolbarEngineMetrics.vue's `{ '--watchdog-animation-ms':
// \`${ms}ms\` }` bound via `:style`). This is a legitimate, common CSS
// custom-property-as-local-variable pattern, categorically distinct
// from the theme.css substrate contract this test enforces — a
// component threading its own computed value through a scoped custom
// property never needs a theme.css entry, and isn't a ghost token
// when the same file both declares and consumes it.
function locallyDefinedTokens(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) names.add(m[1]);
  return names;
}

// Recursively collect .vue, .ts, and .css files under `dir` (skips
// .d.ts — type-only files declare token NAMES as string literals in
// unions, e.g. ChromeAnchor, which is a definition-adjacent artifact,
// not a consumer reference, and would false-positive as a
// "referenced" token for every anchor in the union). theme.css and
// palettes.css themselves are included, not special-cased out — their
// own internal var() references (e.g. theme.css's `var(--cluster-12-9)`,
// resolved from palettes.css) must resolve against the COMBINED
// defined set too, so scanning them is a real, not vacuous, check.
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (
      (entry.endsWith('.vue') || entry.endsWith('.ts') || entry.endsWith('.css')) &&
      !entry.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('app-wide token integrity — every var()/themeColor() reference resolves (rows 1478/1479/1481/1497)', () => {
  const defined = definedTokens();

  it('the definer set (theme.css + palettes.css) is non-trivial (sanity check on the extractor)', () => {
    expect(defined.size).toBeGreaterThan(20);
  });

  it('theme.css declares no --text-1 or --text-2 anchor in any theme block (the deletion itself)', () => {
    expect(defined.has('--text-1')).toBe(false);
    expect(defined.has('--text-2')).toBe(false);
  });

  it('theme.css declares --text-disabled (the minted disabled-control replacement)', () => {
    expect(defined.has('--text-disabled')).toBe(true);
  });

  const files = collectSourceFiles(SRC_ROOT);

  it('scanned a non-trivial number of source files (sanity check on the walker)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  for (const absPath of files) {
    const relPath = 'src' + absPath.slice(SRC_ROOT.length).split('\\').join('/');
    it(`${relPath}: every var()/themeColor() reference resolves in the substrate`, () => {
      const rawSource = readFileSync(absPath, 'utf-8');
      const source = stripComments(rawSource);
      const referenced = new Set([
        ...referencedVarTokens(source),
        ...referencedThemeColorTokens(source),
      ]);
      const local = locallyDefinedTokens(source);
      const allowed = new Set([
        ...(DISCLOSED_FENCE_EXCEPTIONS[relPath] ?? []),
        ...(PRE_EXISTING_GHOST_TOKENS[relPath] ?? []),
      ]);
      const ghosts = [...referenced].filter(
        (name) => !defined.has(name) && !local.has(name) && !allowed.has(name),
      );
      expect(ghosts).toEqual([]);
    });
  }
});
