/**
 * tests/unit/tab-idiom-convergence.test.ts
 *
 * Regression guard for ledger row 1292 (menus-ui-audit finding M19):
 * three tab idioms coexisted in the app — the top-level control-panel
 * strip and the Settings sub-tab strip already rendered through the
 * shared `TabWidget.vue` (bordered box, separators, bottom accent);
 * the Analysis inner strip was a bespoke borderless-underline
 * `<button role="tab">` row; the Cards (Decks/Browse) strip was a
 * third bespoke variant whose underline ran past its tabs. `TabWidget`
 * is the incumbent idiom — it already carried the roles/keyboard
 * contract two strips relied on (see TabWidget-overflow.test.ts /
 * TabWidget-keydown-propagation.test.ts) — so convergence means the
 * other two strips actually render THROUGH it (ADR-0012: one
 * component, one idiom), not merely re-styled to look the same.
 *
 * The Cards strip converged first (ledger row 928, commit 10b6e9aa,
 * `ForestDirectory.vue`'s Decks/Browse strip). This M19 pass converges
 * the Analysis strip (`AnalysisDashboard.vue`).
 *
 * Source-text assertions (Tier 1 — no DOM, no Vue, no store/context
 * fixture — AnalysisDashboard.vue needs a full per-board
 * AnalysisContext + store to mount, which is out of proportion to
 * what this regression needs to pin): each converged file must
 * actually import and use `<TabWidget`, and must NOT carry the
 * bespoke `role="tab"` / `.tab-strip` / `.tab.active` markup or CSS
 * the audit found — a re-styled bespoke strip that merely LOOKS like
 * TabWidget would still pass a visual check but fail this one, which
 * is the point (ADR-0021: observe the actual convergence, not a
 * symptom of it).
 *
 * MECHANISM GAP CLOSED (2026-08-12, independent-review Finding 1 on
 * work item `lyt-settings-live-opening`,
 * `.claude/dispatch-reports/lyt-settings-live-review.md` §2): the
 * `CONVERGED_STRIPS` list below is a hand-enumerated file list — it
 * quantifies over two SPECIFIC instances of the M19 defect, never over
 * the CLASS ("any component outside TabWidget.vue that renders
 * `role="tab"`"), which is exactly the enumeration-fails-open-at-the-
 * next-instance failure ADR-0011 Rule 4 names. The review sabotage-
 * proved this concretely: a fake `role="tab"` planted inside
 * `SettingsPane.vue`'s Session pane body (a file this list never
 * named, added by a LATER work item this file predates) went
 * completely undetected by this suite AND by every other test in the
 * tree (3164 tests, all green). The
 * `describe('Single-tab-implementation invariant ...')` block below is
 * the fix: a recursive walk of the ENTIRE `src/components/` tree (the
 * same `collectSourceFiles` shape `tests/unit/token-integrity-
 * appwide.test.ts` already established for an app-wide sweep, reused
 * here rather than re-invented — ADR-0012 P1), asserting `role="tab"`
 * appears in exactly one file, `chrome/TabWidget.vue`. This is now a
 * genuine class-level net: the NEXT component authored anywhere under
 * `src/components/` that plants a second tab implementation fails this
 * test by construction, without needing its own name added to a list
 * first. `CONVERGED_STRIPS` below is kept as the narrower,
 * documentation-carrying regression for the M19 audit's own two named
 * instances (it still asserts real convergence facts the sweep
 * doesn't — TabWidget import, template usage, the keep-mounted
 * regression, the bespoke-CSS absence); the sweep is the closed-class
 * proof, not a replacement for those.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SRC_COMPONENTS_ROOT = resolve(process.cwd(), 'src/components');

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf-8');
}

// Recursively collect every .vue file under `dir` — the same shape
// `token-integrity-appwide.test.ts`'s own `collectSourceFiles` already
// uses for an app-wide sweep (ADR-0012 P1: one walker, not a second
// hand-rolled one).
function collectVueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectVueFiles(full));
    } else if (entry.endsWith('.vue')) {
      out.push(full);
    }
  }
  return out;
}

// Strip `<!-- ... -->` template comments and `/* ... */`/`//` script
// comments before scanning — a docstring ILLUSTRATING `role="tab"` as
// prose (this very file's own header, or a future file's) must not
// false-positive as a real second implementation. Mirrors
// `token-integrity-appwide.test.ts`'s own `stripComments` exactly.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

const CONVERGED_STRIPS: Array<{ name: string; path: string }> = [
  { name: 'Analysis inner strip', path: 'src/components/charts/AnalysisDashboard.vue' },
  { name: 'Cards (Decks/Browse) strip', path: 'src/components/tree/ForestDirectory.vue' },
];

describe('Tab-idiom convergence (audit M19, ledger row 1292)', () => {
  for (const { name, path } of CONVERGED_STRIPS) {
    describe(name, () => {
      const src = readSrc(path);

      it('imports the shared TabWidget component', () => {
        expect(src).toMatch(/import TabWidget from ['"].*chrome\/TabWidget\.vue['"]/);
      });

      it('the template actually renders through <TabWidget>, not just imports it unused', () => {
        const template = src.slice(src.indexOf('<template>'), src.indexOf('</template>'));
        expect(template).toMatch(/<TabWidget[\s>]/);
      });

      if (name === 'Analysis inner strip') {
        it('the <TabWidget> call carries no keep-mounted attribute — review remedy (ADR-0021): a silent :keep-mounted="true" would kill the regime-B unmount-on-switch perf win with no red test', () => {
          const template = src.slice(src.indexOf('<template>'), src.indexOf('</template>'));
          const tabWidgetTag = /<TabWidget\b[^>]*>/.exec(template);
          expect(tabWidgetTag).not.toBeNull();
          expect(tabWidgetTag![0]).not.toMatch(/keep-mounted/);
        });
      }

      it('carries no bespoke role="tab" markup of its own (TabWidget owns that contract)', () => {
        // Anything outside TabWidget.vue itself declaring `role="tab"` is a
        // second, parallel tab-strip implementation — exactly the M19 defect.
        expect(src).not.toMatch(/role="tab"/);
        expect(src).not.toMatch(/role='tab'/);
      });

      it('carries no bespoke .tab-strip / .tab.active idiom CSS of its own', () => {
        const styleStart = src.indexOf('<style');
        const style = styleStart === -1 ? '' : src.slice(styleStart, src.indexOf('</style>'));
        expect(style).not.toMatch(/\.tab-strip\s*\{/);
        expect(style).not.toMatch(/\.tab\.active\s*\{/);
        expect(style).not.toMatch(/\.tab:hover\s*\{/);
      });
    });
  }

  it('TabWidget.vue itself is untouched by this convergence — no visual redesign of the incumbent (M19 scope)', () => {
    const src = readSrc('src/components/chrome/TabWidget.vue');
    // The incumbent's own idiom markers: bordered strip (border-bottom on
    // the header), bottom accent on the active tab. Still present, unchanged.
    expect(src).toMatch(/\.tab-header\s*\{[^}]*border-bottom/s);
    expect(src).toMatch(/\.tab-header li\.active\s*\{[^}]*border-bottom:\s*2px solid var\(--accent-primary\)/s);
  });
});

describe('Single-tab-implementation invariant — swept over the WHOLE components/ tree, not an enumerated file list (ADR-0011 Rule 4)', () => {
  const ALLOWED_ROLE_TAB_FILE = 'chrome/TabWidget.vue';

  // DISCLOSED, EXPLICITLY-ALLOWLISTED EXCEPTION (mirrors
  // token-integrity-appwide.test.ts's own `PRE_EXISTING_GHOST_TOKENS`
  // shape — allowlisted by exact file, so a NEW role="tab" anywhere
  // else, including a different element in this same file, still fails
  // red). Surfaced when this sweep was first run app-wide (2026-08-12,
  // closing independent-review Finding 1 on work item
  // `lyt-settings-live-opening`): `WizardStepIndicator.vue`'s numbered
  // step-progress dots use `role="tablist"`/`role="tab"` for their OWN,
  // unrelated ARIA semantics (a step indicator, not a content-tab
  // strip) — a ratified, pre-existing genre distinct from the M19
  // TabWidget convergence this suite polices (see that file's own
  // header, ADR-0019 wizard-genre convention). Pre-existing and
  // untouched by this work item; not a second implementation of
  // TabWidget's OWN idiom (bordered strip, `.tab-header`/`.tab-body`,
  // switchable panes) — it never renders a `.tab-body`/pane-switching
  // structure at all, only a static row of numbered jump targets.
  const PRE_EXISTING_ROLE_TAB_EXCEPTIONS = new Set<string>(['wizard/WizardStepIndicator.vue']);

  const files = collectVueFiles(SRC_COMPONENTS_ROOT);

  it('scanned a non-trivial number of .vue files (sanity check on the walker)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it(`only ${ALLOWED_ROLE_TAB_FILE} (plus the disclosed pre-existing exceptions) declares role="tab" anywhere under src/components/`, () => {
    const offenders: string[] = [];
    for (const absPath of files) {
      const relPath = absPath.slice(SRC_COMPONENTS_ROOT.length + 1).split('\\').join('/');
      if (relPath === ALLOWED_ROLE_TAB_FILE) continue;
      if (PRE_EXISTING_ROLE_TAB_EXCEPTIONS.has(relPath)) continue;
      const src = stripComments(readFileSync(absPath, 'utf-8'));
      if (/role=["']tab["']/.test(src)) {
        offenders.push(relPath);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the pre-existing exception list names files that actually declare role="tab" (an allowlist entry that matches nothing is dead, and would silently stop policing the day the markup it once named is removed)', () => {
    for (const relPath of PRE_EXISTING_ROLE_TAB_EXCEPTIONS) {
      const src = stripComments(readFileSync(join(SRC_COMPONENTS_ROOT, relPath), 'utf-8'));
      expect(src).toMatch(/role=["']tab["']/);
    }
  });

  it(`${ALLOWED_ROLE_TAB_FILE} itself still declares role="tab" (the walker and the regex both actually work — a vacuously-passing sweep would be worse than no sweep)`, () => {
    const src = readSrc(`src/components/${ALLOWED_ROLE_TAB_FILE}`);
    expect(src).toMatch(/role="tab"/);
  });

  // SABOTAGE REGRESSION (review Finding 1's own reproduction, restored
  // after verifying it fails): a fake `role="tab"` planted inside ANY
  // component under src/components/ — not just the two files
  // `CONVERGED_STRIPS` above happens to name — must fail the sweep
  // above. This test constructs the exact shape the review's Sabotage B
  // used (a role="tab" element inside a pane BODY, the kind of markup a
  // child editor component could plausibly introduce) against an
  // in-memory fixture, so the CLASS is exercised without leaving a
  // planted defect in the tree between test runs.
  it('a synthetic second implementation anywhere in the tree would be caught (in-memory reproduction of the review\'s own sabotage shape)', () => {
    const offenders: string[] = [];
    const fixtureRelPath = 'chrome/__sabotage_fixture_not_a_real_file__.vue';
    const sabotageSrc = stripComments(
      '<template><div class="tab-padding"><div role="tab" class="fake-second-tab-impl">x</div></div></template>',
    );
    if (fixtureRelPath !== ALLOWED_ROLE_TAB_FILE && /role=["']tab["']/.test(sabotageSrc)) {
      offenders.push(fixtureRelPath);
    }
    expect(offenders).toEqual([fixtureRelPath]);
  });
});
