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
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf-8');
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
