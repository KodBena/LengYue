/**
 * tests/unit/lyt-path-key-regression.test.ts
 *
 * Follow-up (work-status row 1952, filed by the toolbar-reencode review's
 * Note 2, `.claude/dispatch-reports/lyt-toolbar-reencode-review.md`):
 * `App.vue`'s DOM-id/track-override plumbing (`LYT_DOM_ID_BY_PATH_LANDSCAPE`,
 * `LYT_DOM_ID_BY_PATH_PORTRAIT`, `lytTrackStyleOverrides`) addresses the
 * compiled LYT program by literal dotted-index path strings
 * (`'2.2.0'`, `'4.1'`, ...). The compiler's own tree-path numbering is an
 * artifact of encoding structure (child ordering / nesting), so a `.lyt`
 * encoding edit that reshapes a Split's children silently renumbers every
 * path below it — the 2.3->2.2 incident (this same review's own "The
 * path-shift regression" section) broke eight literal-path consumers with
 * ZERO test failures, caught only by an ad hoc Playwright check that isn't
 * a gate. This file mechanizes the net (ADR-0011 Rule 2 / ADR-0000 Rule
 * 2b): every literal path key `App.vue` references is checked against the
 * REAL compiled program's own path set, derived independently from the
 * SAME `.gen.ts` files App.vue imports (`lyt-layout.gen.ts` /
 * `lyt-layout-portrait.gen.ts`) — not re-typed by hand, so a future
 * regeneration is what the test compares against, not a second literal
 * copy that could itself drift.
 *
 * Two sides, both derived from their real sources:
 *   - The REAL path set: a recursive walk of `LYT_LANDSCAPE.root` /
 *     `LYT_PORTRAIT.root` (the same typed data App.vue imports and
 *     renders), collecting every `path` field at every depth (Split
 *     children AND Exclusive children, since `LYT_DOM_ID_BY_PATH_*`
 *     anchors DOM ids on both node kinds — '2.2.1' is the control-panel
 *     EXCLUSIVE node's own path, not a Split child).
 *   - The literals in use: source-scanned out of `App.vue`'s own text
 *     (the single-tab-implementation proof in
 *     `LytNode-exclusive-rendering.test.ts` is this file's own
 *     precedent for the source-scan approach) — not hand-transcribed,
 *     so a future literal this test doesn't yet know about still gets
 *     caught by the "does App.vue's source still contain what we
 *     extracted" self-check below.
 *
 * RED-WITHOUT-FIX: verified by temporarily aliasing
 * `LYT_DOM_ID_BY_PATH_LANDSCAPE`'s `'2.2'`/`'2.2.0'`/`'2.2.1'` keys to
 * `'2.3'`/`'2.3.0'`/`'2.3.1'` (the OLD, pre-reencode numbering — exactly
 * the shape of the incident this file guards against) and confirming the
 * suite goes red; the alias was reverted immediately after (see the
 * build report for this commission's own transcript, not re-run on every
 * CI pass).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LYT_LANDSCAPE } from '../../src/state/lyt-layout.gen';
import { LYT_PORTRAIT } from '../../src/state/lyt-layout-portrait.gen';
import type { LytNodeData, LytProgram } from '../../src/state/lyt-layout-types';

function src(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf-8');
}

/**
 * Recursively collects every `path` string the compiled program declares
 * at any depth — Split children (`LytChild.path`) and Exclusive children
 * (`LytExclusiveChild.path`) alike, since `App.vue`'s DOM-id maps anchor
 * on both (`'2.2.1'` is the control-panel Exclusive node's OWN path, a
 * Split child of `'2.2'`; the Exclusive's own children — `'2.2.1.0'`
 * etc. — are tab bodies, a separate namespace App.vue's maps don't
 * address today, but collecting them too costs nothing and keeps this
 * walker a complete mirror of the type rather than a partial one tuned
 * to today's literal set).
 */
function collectLytPaths(program: LytProgram): Set<string> {
  const paths = new Set<string>(['']); // the root itself, addressed as '' in App.vue's maps
  function walkNode(node: LytNodeData): void {
    if (node.kind === 'split') {
      for (const child of node.children) {
        paths.add(child.path);
        walkNode(child.node);
      }
    } else if (node.kind === 'exclusive') {
      for (const child of node.children) {
        paths.add(child.path);
        walkNode(child.node);
      }
    }
    // 'leaf' / 'blackbox': no further paths beneath them.
  }
  walkNode(program.root);
  return paths;
}

/** Extracts every quoted string key/value inside a named `Record<string,
 * string>` object-literal declaration from raw source text — used to
 * pull the literal path keys out of `LYT_DOM_ID_BY_PATH_LANDSCAPE`
 * / `_PORTRAIT` without re-typing them by hand. */
function extractRecordKeys(source: string, constName: string): string[] {
  const declRe = new RegExp(`const ${constName}: Record<string, string> = \\{([\\s\\S]*?)\\n\\};`);
  const match = declRe.exec(source);
  if (!match) {
    throw new Error(`lyt-path-key-regression: could not locate "${constName}" declaration in App.vue's source — has it been renamed or restructured?`);
  }
  const body = match[1];
  const keyRe = /'([^']*)':/g;
  const keys: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(body)) !== null) keys.push(m[1]);
  return keys;
}

describe('App.vue — LYT literal path keys resolve against the real compiled program (row 1952)', () => {
  const app = src('src/App.vue');
  const landscapePaths = collectLytPaths(LYT_LANDSCAPE);
  const portraitPaths = collectLytPaths(LYT_PORTRAIT);

  it('sanity: the derived path sets are non-trivial (the walker actually walked something)', () => {
    // Guards against a silently-empty walk (e.g. a future LytProgram
    // shape change this file's walker doesn't know about) passing
    // vacuously — a set of size 1 (just root) would make every
    // assertion below trivially fail loudly instead, but this positive
    // check makes the "the walker works at all" fact explicit.
    expect(landscapePaths.size).toBeGreaterThan(5);
    expect(portraitPaths.size).toBeGreaterThan(5);
    // The specific paths this suite's other assertions depend on being
    // real, confirmed present in the freshly-derived set (not assumed).
    expect(landscapePaths.has('2.2.1')).toBe(true);
    expect(portraitPaths.has('4.1')).toBe(true);
  });

  it('every LYT_DOM_ID_BY_PATH_LANDSCAPE key resolves against LYT_LANDSCAPE', () => {
    const literalKeys = extractRecordKeys(app, 'LYT_DOM_ID_BY_PATH_LANDSCAPE');
    expect(literalKeys.length).toBeGreaterThan(0); // the extractor itself found something
    for (const key of literalKeys) {
      expect(landscapePaths.has(key), `App.vue's LYT_DOM_ID_BY_PATH_LANDSCAPE references path "${key}", which does not exist in the compiled LYT_LANDSCAPE program — the .lyt encoding's tree shifted and this literal was not updated.`).toBe(true);
    }
  });

  it('every LYT_DOM_ID_BY_PATH_PORTRAIT key resolves against LYT_PORTRAIT', () => {
    const literalKeys = extractRecordKeys(app, 'LYT_DOM_ID_BY_PATH_PORTRAIT');
    expect(literalKeys.length).toBeGreaterThan(0);
    for (const key of literalKeys) {
      expect(portraitPaths.has(key), `App.vue's LYT_DOM_ID_BY_PATH_PORTRAIT references path "${key}", which does not exist in the compiled LYT_PORTRAIT program — the .lyt encoding's tree shifted and this literal was not updated.`).toBe(true);
    }
  });

  it('lytTrackStyleOverrides\' literal treePanelPath values resolve against their own class\'s program', () => {
    // Source-scanned rather than re-typed: the ternary
    // `activeScreenClassId.value === 'portrait' ? '4.0' : '2.2.0'` inside
    // the computed's body.
    const ternaryRe = /const treePanelPath = activeScreenClassId\.value === 'portrait' \? '([^']+)' : '([^']+)';/;
    const m = ternaryRe.exec(app);
    expect(m, "could not locate lytTrackStyleOverrides' treePanelPath ternary in App.vue's source — has it been restructured?").not.toBeNull();
    const [, portraitPath, landscapePath] = m!;
    expect(portraitPaths.has(portraitPath), `lytTrackStyleOverrides' portrait treePanelPath "${portraitPath}" does not exist in LYT_PORTRAIT.`).toBe(true);
    expect(landscapePaths.has(landscapePath), `lytTrackStyleOverrides' landscape treePanelPath "${landscapePath}" does not exist in LYT_LANDSCAPE.`).toBe(true);
  });

  it("lytTrackStyleOverrides' landscape-only OUTER-bar override key ('2') resolves against LYT_LANDSCAPE", () => {
    // `overrides['2'] = ...` — the side-column width override, landscape-only.
    const overrideRe = /overrides\['([^']+)'\] = `\$\{effectiveTreeControlRegionWidthPx\.value\}px`;/;
    const m = overrideRe.exec(app);
    expect(m, "could not locate lytTrackStyleOverrides' landscape OUTER-bar override key in App.vue's source — has it been restructured?").not.toBeNull();
    const [, key] = m!;
    expect(landscapePaths.has(key), `lytTrackStyleOverrides' landscape OUTER-bar override key "${key}" does not exist in LYT_LANDSCAPE.`).toBe(true);
  });
});
