/**
 * tests/unit/no-js-shadows.test.ts
 *
 * The net for the stray-`.js`-shadow class of defect (backlog item
 * `build-strayjs-emission`; first named in the W3 resizers review,
 * `.claude/dispatch-reports/lyt-w3-resizers-review.md` §1). Some
 * build/typecheck pass (source not yet pinned down — see the same
 * review's §1 and the corrective build report responding to it) can
 * emit stray, untracked, non-gitignored `.js` files under `src/`
 * alongside the real `.ts`/`.vue` sources they were compiled from.
 * Vite/Vitest's default `resolve.extensions` tries `.js` *before*
 * `.ts` for an extensionless import, so a same-named `.js` sibling
 * silently SHADOWS the real source in module resolution — the
 * review proved this empirically: editing the real `.ts` file (even
 * inserting a bare `throw`) had zero effect on a live test run while
 * the stray `.js` sibling was present, because the test runner never
 * executed the `.ts` file at all.
 *
 * Tier 1 (pure logic, no DOM, no fakes) — a plain filesystem walk
 * over `frontend/src/**\/*.js`, modeled on this repo's existing
 * source-scan test idiom (tests/unit/banned-effects.test.ts's
 * directory-walk shape). For each `.js` file found, checks whether a
 * same-named `.ts`, `.tsx`, or `.vue` sibling exists in the same
 * directory (`useResizablePanel.js` shadowing `useResizablePanel.ts`,
 * or `App.vue.js` shadowing `App.vue`). Any shadow found fails the
 * test loudly, listing every shadowing path — not just a count — so
 * a developer can immediately `rm` the right files (ADR-0002
 * fail-loudly: the failure message must be actionable on its own).
 *
 * This guard does not forbid all `.js` files under `src/` outright —
 * a genuine, deliberately hand-authored `.js` source with no `.ts`/
 * `.vue` sibling would pass it silently. As of authoring, no such
 * file exists under `frontend/src/` (verified: the codebase is
 * TypeScript/Vue throughout). If one is ever added intentionally,
 * this guard will not flag it; only the shadow shape is banned.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const SRC_DIR = join(REPO_ROOT, 'src');

const SIBLING_EXTENSIONS = ['.ts', '.tsx', '.vue'];

function listJsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (entry.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * A `.js` file shadows a sibling if stripping `.js` from its basename
 * leaves either:
 *   - a bare stem with a `.ts`/`.tsx`/`.vue` sibling in the same dir
 *     (`useResizablePanel.js` -> `useResizablePanel.ts`), or
 *   - a stem that itself still carries one of those extensions
 *     (`App.vue.js` -> `App.vue`).
 */
function findShadowedSibling(jsPath: string): string | null {
  const dir = dirname(jsPath);
  const base = basename(jsPath, '.js');
  const dirEntries = readdirSync(dir);

  // Case 1: App.vue.js -> App.vue (stem already ends in a source ext)
  if (SIBLING_EXTENSIONS.some((ext) => base.endsWith(ext)) && dirEntries.includes(base)) {
    return join(dir, base);
  }

  // Case 2: useResizablePanel.js -> useResizablePanel.ts
  for (const ext of SIBLING_EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (dirEntries.includes(candidate)) {
      return join(dir, candidate);
    }
  }

  return null;
}

describe('frontend/src has no stray .js shadow files (build-strayjs-emission)', () => {
  it('no .js file under src/ shadows a same-named .ts/.tsx/.vue sibling', () => {
    const jsFiles = listJsFiles(SRC_DIR);
    const shadows: string[] = [];

    for (const jsPath of jsFiles) {
      const shadowed = findShadowedSibling(jsPath);
      if (shadowed) {
        const rel = (p: string) => p.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
        shadows.push(`${rel(jsPath)} shadows ${rel(shadowed)}`);
      }
    }

    expect(
      shadows,
      `Found ${shadows.length} stray .js file(s) shadowing a real .ts/.tsx/.vue ` +
        `source under src/. Vite/Vitest resolve .js before .ts for extensionless ` +
        `imports, so these silently shadow the real source (see ` +
        `.claude/dispatch-reports/lyt-w3-resizers-review.md §1 for the proof). ` +
        `Delete each listed .js file:\n${shadows.join('\n')}`,
    ).toEqual([]);
  });
});
