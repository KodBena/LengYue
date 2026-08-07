/**
 * tests/unit/chart-accent-primary-lock.test.ts
 *
 * Class guard for the defect `contrast-tokens-review.md` (dated
 * REPAIR section in `.claude/dispatch-reports/contrast-tokens-build.md`)
 * found: `themeColor('--accent-primary')` is a JS-side read that
 * bypasses `theme.css`'s CSS-alias decoupling entirely (`--heatmap-mid`
 * / `--chart-marker` / `--player-black` re-pointing to
 * `--accent-primary-canonical` protects only `var()` consumers, not
 * `getComputedStyle` reads via `themeColor()`). A chart-series or
 * node-role color read via `themeColor('--accent-primary')` directly
 * would silently shift when the high-contrast-text override darkens
 * `--accent-primary` for its TEXT/CTA role — exactly the
 * data-series-must-be-untouched violation the review rejected the
 * build for.
 *
 * SCOPE (honest, not "every file"): this guard scans the two
 * directories that render charts / chart-adjacent visuals and are
 * the only directories with any `themeColor('--accent-primary')`
 * call site as of this writing — `src/components/charts/` and
 * `src/composables/analysis/` (verified via
 * `grep -rl "themeColor(" src/components/charts src/composables/analysis`
 * at authoring time). It does NOT scan the rest of `src/` — chrome
 * components (toolbar, modals, registry editors, etc.) are free to
 * read `--accent-primary` directly for CTA / active-state text, and
 * SHOULD pick up the high-contrast override. If a future chart or
 * chart-adjacent module is added outside these two directories, this
 * guard will not see it — the honest fix if that happens is to widen
 * `SCAN_DIRS` below, not to treat this test as exhaustive protection
 * over all of `src/`.
 *
 * Within the scanned directories, every remaining direct
 * `themeColor('--accent-primary')` call must be a disclosed CHROME
 * use (an axis-pointer crosshair, a tooltip-box border — chrome that
 * encodes no data) carrying the marker comment
 * `contrast-tokens-review.md (4)` within a few lines above it — the
 * disclosure the coordinator's REJECT verdict's item (4) sanctioned.
 * A future edit that reads '--accent-primary' directly in these
 * directories WITHOUT that marker fails this test — the class guard
 * the coordinator's REPAIR item (3) asked for, closing the class
 * rather than just the four originally-found instances.
 *
 * No DOM, no fakes — a plain filesystem text scan (Tier 1, pure).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const SCAN_DIRS = [
  join(REPO_ROOT, 'src', 'components', 'charts'),
  join(REPO_ROOT, 'src', 'composables', 'analysis'),
];
const DISCLOSURE_MARKER = 'contrast-tokens-review.md (4)';
const DIRECT_READ = /themeColor\(\s*['"]--accent-primary['"]\s*\)/;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFiles(full));
    } else if (/\.(ts|vue)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('chart-adjacent modules never read --accent-primary undisclosed', () => {
  const files = SCAN_DIRS.flatMap(listFiles);

  it('scanned at least the known chart files (sanity — a guard over zero files is not a guard)', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(files.map((f) => [f.slice(REPO_ROOT.length + 1), f] as const))(
    '%s: every direct --accent-primary read is disclosed as chrome',
    (_label, filePath) => {
      const lines = readFileSync(filePath, 'utf-8').split('\n');
      const undisclosed: number[] = [];
      lines.forEach((line, idx) => {
        if (!DIRECT_READ.test(line)) return;
        const windowStart = Math.max(0, idx - 12);
        const preceding = lines.slice(windowStart, idx + 1).join('\n');
        if (!preceding.includes(DISCLOSURE_MARKER)) {
          undisclosed.push(idx + 1); // 1-based for a readable failure message
        }
      });
      expect(
        undisclosed,
        `${filePath} reads themeColor('--accent-primary') directly at ` +
        `line(s) ${undisclosed.join(', ')} without the disclosure marker ` +
        `"${DISCLOSURE_MARKER}" nearby. If this is a genuine chart-series ` +
        `or node-role color, use '--accent-primary-canonical' instead. If ` +
        `it is genuinely chrome (encodes no data), add the marker comment ` +
        `to disclose the choice, matching BaseChart.vue's axisPointer and ` +
        `useEChartsForestRender.ts's tooltip-border precedent.`,
      ).toEqual([]);
    },
  );
});
