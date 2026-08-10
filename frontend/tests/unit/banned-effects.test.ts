/**
 * tests/unit/banned-effects.test.ts
 *
 * The net (ADR-0011) for ledger row 1506 (commissioner ban):
 * box-shadow, CSS transitions, and blur (backdrop-filter / filter:
 * blur()) are BANNED in the frontend, no carve-outs. This is a
 * source-lint test — Tier 1, no DOM, no fakes, a plain filesystem
 * text scan — modeled on the repo's existing source-scan test idiom
 * (tests/unit/library-token-integrity.test.ts's per-file `it.each`
 * shape; tests/unit/chart-accent-primary-lock.test.ts's directory-
 * walk + regex-per-line scan). It fails red on any of:
 *
 *   - `box-shadow:` (any value)
 *   - `backdrop-filter:` (any value)
 *   - `filter:` whose value contains `blur(`
 *   - `transition:` / `transition-property:` / `transition-duration:`
 *     / `transition-delay:` / `transition-timing-function:` (any
 *     value — including a `:style="{ transition: ... }"` binding
 *     written as a JS object key, the form the removal sweep found
 *     in MoveSuggestions.vue)
 *
 * across every `frontend/src/**\/*.{vue,css}` file — matching the
 * commission's literal scope. `@keyframes`-driven `animation:` is
 * deliberately NOT scanned here: the ban names shadows/transitions/
 * blur, not keyframe animation, and the sweep reported the three
 * live `@keyframes` sites (App.vue's workspace-boot-spin,
 * ToolbarEngineMetrics.vue's watchdog-pong-pending, PboPopover.vue's
 * busy-dot pulse) as findings for a separate ruling rather than
 * removing them unilaterally — see
 * .claude/dispatch-reports/effects-ban-sweep-build.md.
 *
 * FENCE EXCLUSION (disclosed, not silent): three files were off-
 * limits to this sweep because a concurrent builder owns them
 * (WizardStepSgfImport.vue, useSetupWizard.ts, SetupWizardModal.vue)
 * plus one rail-side file (chrome/TabWidget.vue). Of those,
 * SetupWizardModal.vue still carries a live `box-shadow:` declaration
 * (line ~107 at sweep time) — reported as residue in the dispatch
 * report for the orchestrator's post-merge pass, NOT swept here. This
 * guard excludes exactly that fixed, named set so it can pass red-to-
 * green on the sweep's own tree without silently widening scope to
 * cover a file this builder was told not to touch; it does not
 * exclude anything else; a new violation anywhere else in `src/`
 * still fails it. When the fenced files are swept (by whoever owns
 * that follow-up), remove their names from FENCE_EXCLUSIONS so this
 * guard starts covering them too — leaving them excluded forever
 * would silently narrow the net's promise.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const SRC_DIR = join(REPO_ROOT, 'src');

// Disclosed fence residue — see header. Paths are relative to SRC_DIR,
// forward-slash-normalized.
const FENCE_EXCLUSIONS = new Set([
  'components/wizard/steps/WizardStepSgfImport.vue',
  'composables/useSetupWizard.ts',
  'components/wizard/SetupWizardModal.vue',
  'components/chrome/TabWidget.vue',
]);

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFiles(full));
    } else if (/\.(vue|css)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// Strip comments before scanning so PROSE about the ban (e.g. "No
// transition: the swap is instantaneous", a real comment this sweep
// left behind in StatusBar.vue) doesn't false-positive as a live
// declaration. Order matters: HTML comments can contain the `<style>`
// block's own `/* */` comments in edge cases, so strip HTML first,
// then block comments, then `//` line comments (guarded against
// stripping a `http://`/`https://` URL fragment).
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<!:)\/\/.*$/gm, '');
}

const BOX_SHADOW = /\bbox-shadow\s*:/;
const BACKDROP_FILTER = /\bbackdrop-filter\s*:/;
const BLUR_FILTER = /(?<!backdrop-)\bfilter\s*:[^;{}\n]*\bblur\(/;
const TRANSITION = /\btransition(-property|-duration|-delay|-timing-function)?\s*:/;

const CHECKS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'box-shadow', pattern: BOX_SHADOW },
  { name: 'backdrop-filter', pattern: BACKDROP_FILTER },
  { name: 'filter: ...blur(...)', pattern: BLUR_FILTER },
  { name: 'transition (or transition-*)', pattern: TRANSITION },
];

describe('frontend never declares box-shadow, backdrop-filter, blur(), or transition (ledger row 1506)', () => {
  const allFiles = listFiles(SRC_DIR);
  const scanned = allFiles.filter(
    (f) => !FENCE_EXCLUSIONS.has(f.slice(SRC_DIR.length + 1).replace(/\\/g, '/')),
  );

  it('scanned a non-trivial slice of src/ (sanity — a guard over zero files is not a guard)', () => {
    expect(scanned.length).toBeGreaterThan(50);
  });

  it.each(scanned.map((f) => [f.slice(SRC_DIR.length + 1).replace(/\\/g, '/'), f] as const))(
    '%s: no banned box-shadow / backdrop-filter / blur() / transition declaration',
    (_label, filePath) => {
      const raw = readFileSync(filePath, 'utf-8');
      const clean = stripComments(raw);
      const lines = clean.split('\n');
      const hits: string[] = [];
      lines.forEach((line, idx) => {
        for (const { name, pattern } of CHECKS) {
          if (pattern.test(line)) {
            hits.push(`line ${idx + 1} (${name}): ${line.trim()}`);
          }
        }
      });
      expect(
        hits,
        `${filePath} contains banned declaration(s):\n${hits.join('\n')}\n` +
          `box-shadow, backdrop-filter, filter:blur(), and transition are ` +
          `banned outright (ledger row 1506, no carve-outs). Delete the ` +
          `declaration; if it was load-bearing for edge separation against ` +
          `the ground, substitute a solid border (--border-2 / --border-3).`,
      ).toEqual([]);
    },
  );
});
