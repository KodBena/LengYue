/**
 * tests/unit/lyt-path-key-regression.test.ts
 *
 * Follow-up (work-status row 1952, filed by the toolbar-reencode review's
 * Note 2, `.claude/dispatch-reports/lyt-toolbar-reencode-review.md`):
 * `App.vue`'s DOM-id/track-override plumbing used to address the compiled
 * LYT program by literal dotted-index path strings (`'2.2.0'`, `'4.1'`,
 * ...) hand-copied into `LYT_DOM_ID_BY_PATH_LANDSCAPE`/`_PORTRAIT` and a
 * `lytTrackStyleOverrides` path ternary. The compiler's own tree-path
 * numbering is an artifact of encoding structure (child ordering/nesting),
 * so a `.lyt` encoding edit that reshapes a Split's children silently
 * renumbers every path below it — the 2.3->2.2 incident (this same
 * review's own "The path-shift regression" section) broke eight
 * literal-path consumers with ZERO test failures; the M2 stage B2a/B2b
 * `A_setup` insertion (row 2345) produced a SECOND instance of the exact
 * same class, caught only by an ad hoc Playwright check that isn't a gate.
 *
 * LYT R1 PART 2 (`.claude/dispatch-reports/lyt-r1-orientation-pathmap.md`,
 * ADR-0011 Rule 2 trigger) retired the hand-copied literal maps entirely:
 * `App.vue` now derives every path-keyed fact from
 * `buildLytProgramIndex`/`lytParentPath` (`composables/chrome/
 * useLytProgramIndex.ts`), a `widget id -> path` index built by walking
 * the compiled program ONCE. A widget id (`B`, `tree`, `controlPanel`) is
 * the STABLE identity `emit_layout_tree.py` never renumbers — only the
 * PATH shifts. This file now asserts the DERIVATION MECHANISM itself:
 *
 *   1. every widget id App.vue's derivations depend on (`B`, `tree`,
 *      `controlPanel`) resolves to a real path in BOTH compiled programs
 *      today (the "did the encoding drop/rename a load-bearing widget id"
 *      regression class — the direct analog of the old test's "does the
 *      literal path still exist" check, but keyed by the STABLE identity
 *      rather than the shifting artifact);
 *   2. each resolved path (and its derived parent, for the Split-node
 *      DOM ids) is genuinely a member of the compiled program's own path
 *      set, independently re-derived by a second, structurally different
 *      walk (`collectLytPaths`, unchanged from the pre-R1 version of this
 *      file) — so the index's own path bookkeeping is cross-checked, not
 *      merely self-consistent;
 *   3. a widget id that stops resolving is still caught — demonstrated
 *      directly against a synthetic minimal program missing the `tree`
 *      leaf (the exact condition `App.vue`'s own `requireWidgetPath`
 *      throws loudly on), so this suite's own detection mechanism is
 *      proven live, not merely asserted;
 *   4. the retired literal maps (`LYT_DOM_ID_BY_PATH_LANDSCAPE`/
 *      `_PORTRAIT`) are confirmed ABSENT from `App.vue`'s source — a
 *      regression that reintroduces a hand-copied literal (silently
 *      undoing the R1 fix) is caught even though such a literal, if
 *      internally consistent with the CURRENT encoding, would pass every
 *      other assertion in this file.
 *
 * Why this is a stronger net than the literal-path version it replaces:
 * the retired version could only fail AFTER a `.lyt` edit shifted a path
 * out from under an already-stale literal — the failure mode was
 * necessarily reactive. This version fails the moment a load-bearing
 * widget id itself goes missing, independent of what path it used to sit
 * at, and it structurally cannot go stale the way a hand-copied literal
 * could (there is no second copy of the path to drift from the first).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LYT_LANDSCAPE } from '../../src/state/lyt-layout.gen';
import { LYT_PORTRAIT } from '../../src/state/lyt-layout-portrait.gen';
import type { LytNodeData, LytProgram } from '../../src/state/lyt-layout-types';
import { buildLytProgramIndex, lytParentPath } from '../../src/composables/chrome/useLytProgramIndex';

function src(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf-8');
}

/**
 * Recursively collects every `path` string the compiled program declares
 * at any depth — Split children (`LytChild.path`) and Exclusive children
 * (`LytExclusiveChild.path`) alike, since `App.vue`'s DOM-id derivation
 * anchors on both (`controlPanel`'s own path is a Split child of the
 * tree/panels row; the Exclusive's own children — its tab bodies — are a
 * separate namespace App.vue's derivation doesn't address today, but
 * collecting them too costs nothing and keeps this walker a complete
 * mirror of the type rather than a partial one tuned to today's literal
 * set). Independent of `buildLytProgramIndex`'s own walk (different
 * traversal shape: it collects every path present, not a widget-id-keyed
 * subset), so cross-checking the index's resolved paths against this
 * set's membership is a genuine second opinion, not a tautology.
 */
function collectLytPaths(program: LytProgram): Set<string> {
  const paths = new Set<string>(['']); // the root itself, addressed as '' in App.vue's derivation
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

/**
 * R1 review follow-up (`.claude/dispatch-reports/lyt-r1-orientation-pathmap-review.md`,
 * Duty 2): `collectLytPaths` above only proves a resolved path is a member
 * of the program's own path set — it does NOT prove the path belongs to
 * the widget id it was resolved for. A derivation bug that swaps two
 * widgets' paths, or off-by-ones into a sibling's path, ships a
 * structurally valid but WRONG path and every membership check above
 * stays green (the reviewer's own reproduction: hardcoding
 * `widgetPaths['tree']` to `'0'`, a real path belonging to a different
 * widget, passed all 16 pre-fix tests).
 *
 * This walker closes that gap: given a widget id, it independently finds
 * the path of the node whose OWN `.widget` field matches — a second,
 * differently-shaped recursive walk (search-for-one-id, short-circuiting,
 * versus `buildLytProgramIndex`'s build-the-whole-map) over the same
 * compiled data. It does NOT import or call `buildLytProgramIndex` — using
 * the derivation under test to compute its own expected value would be
 * exactly the tautology the commission warned against. Cross-checking the
 * derivation's resolved path against THIS walk's independently-found path
 * (identity, not membership) is the round-trip check Duty 2 asked for.
 */
function findWidgetPathIndependently(program: LytProgram, widgetId: string): string | undefined {
  function walkNode(node: LytNodeData, path: string): string | undefined {
    if (node.kind === 'leaf' || node.kind === 'blackbox' || node.kind === 'exclusive') {
      if (node.widget === widgetId) return path;
    }
    if (node.kind === 'split') {
      for (const child of node.children) {
        const found = walkNode(child.node, child.path);
        if (found !== undefined) return found;
      }
    } else if (node.kind === 'exclusive') {
      for (const child of node.children) {
        const found = walkNode(child.node, child.path);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }
  return walkNode(program.root, '');
}

/** The widget ids App.vue's path-keyed derivations depend on today
 *  (`activeLytDomIdByPath`, `lytTrackStyleOverrides`) — see App.vue's own
 *  `requireWidgetPath` call sites for the live enumeration this list
 *  mirrors. */
const REQUIRED_WIDGET_IDS = ['B', 'tree', 'controlPanel'] as const;

describe('App.vue — LYT widget-id path derivation resolves against the real compiled program (row 2345)', () => {
  const app = src('src/App.vue');
  const landscapeIndex = buildLytProgramIndex(LYT_LANDSCAPE);
  const portraitIndex = buildLytProgramIndex(LYT_PORTRAIT);
  const landscapePaths = collectLytPaths(LYT_LANDSCAPE);
  const portraitPaths = collectLytPaths(LYT_PORTRAIT);

  it('sanity: the derived path sets are non-trivial (the walker actually walked something)', () => {
    // Guards against a silently-empty walk (e.g. a future LytProgram
    // shape change this file's walker doesn't know about) passing
    // vacuously.
    expect(landscapePaths.size).toBeGreaterThan(5);
    expect(portraitPaths.size).toBeGreaterThan(5);
  });

  it.each(REQUIRED_WIDGET_IDS)(
    'widget id %s resolves to a path in LYT_LANDSCAPE',
    (widgetId) => {
      const path = landscapeIndex.widgetPaths[widgetId];
      expect(path, `widget id "${widgetId}" has no path in LYT_LANDSCAPE's own compiled program — has it been renamed or dropped from the .lyt encoding?`).toBeDefined();
    },
  );

  it.each(REQUIRED_WIDGET_IDS)(
    'widget id %s resolves to a path in LYT_PORTRAIT',
    (widgetId) => {
      const path = portraitIndex.widgetPaths[widgetId];
      expect(path, `widget id "${widgetId}" has no path in LYT_PORTRAIT's own compiled program — has it been renamed or dropped from the .lyt encoding?`).toBeDefined();
    },
  );

  it('every resolved widget path (and its derived Split-node parent) is a member of LYT_LANDSCAPE\'s own independently-walked path set', () => {
    for (const widgetId of REQUIRED_WIDGET_IDS) {
      const path = landscapeIndex.widgetPaths[widgetId]!;
      expect(landscapePaths.has(path), `widget "${widgetId}"'s resolved path "${path}" does not exist in LYT_LANDSCAPE's own collected path set.`).toBe(true);
      const parent = lytParentPath(path);
      expect(landscapePaths.has(parent), `widget "${widgetId}"'s derived parent path "${parent}" does not exist in LYT_LANDSCAPE's own collected path set.`).toBe(true);
    }
    // The side-column path App.vue's landscape-only OUTER-bar override
    // derives (`tree`'s own grandparent) — see `lytTrackStyleOverrides`'
    // own comment in App.vue.
    const sideColumnPath = lytParentPath(lytParentPath(landscapeIndex.widgetPaths['tree']!));
    expect(landscapePaths.has(sideColumnPath), `the landscape side-column path "${sideColumnPath}" (tree's grandparent) does not exist in LYT_LANDSCAPE's own collected path set.`).toBe(true);
  });

  it('every resolved widget path (and its derived Split-node parent) is a member of LYT_PORTRAIT\'s own independently-walked path set', () => {
    for (const widgetId of REQUIRED_WIDGET_IDS) {
      const path = portraitIndex.widgetPaths[widgetId]!;
      expect(portraitPaths.has(path), `widget "${widgetId}"'s resolved path "${path}" does not exist in LYT_PORTRAIT's own collected path set.`).toBe(true);
      const parent = lytParentPath(path);
      expect(portraitPaths.has(parent), `widget "${widgetId}"'s derived parent path "${parent}" does not exist in LYT_PORTRAIT's own collected path set.`).toBe(true);
    }
  });

  it('every resolved widget path in LYT_LANDSCAPE is the SAME path an independent walk finds for that widget id (identity, not just membership)', () => {
    for (const widgetId of REQUIRED_WIDGET_IDS) {
      const derivedPath = landscapeIndex.widgetPaths[widgetId]!;
      const independentPath = findWidgetPathIndependently(LYT_LANDSCAPE, widgetId);
      expect(independentPath, `independent walk found no node in LYT_LANDSCAPE whose own .widget is "${widgetId}" — the fixture itself is suspect.`).toBeDefined();
      expect(derivedPath, `buildLytProgramIndex resolved widget "${widgetId}" to path "${derivedPath}", but an independent walk over LYT_LANDSCAPE finds "${widgetId}"'s own node at path "${independentPath}" instead — the derivation returned a path belonging to a DIFFERENT widget.`).toBe(independentPath);
    }
  });

  it('every resolved widget path in LYT_PORTRAIT is the SAME path an independent walk finds for that widget id (identity, not just membership)', () => {
    for (const widgetId of REQUIRED_WIDGET_IDS) {
      const derivedPath = portraitIndex.widgetPaths[widgetId]!;
      const independentPath = findWidgetPathIndependently(LYT_PORTRAIT, widgetId);
      expect(independentPath, `independent walk found no node in LYT_PORTRAIT whose own .widget is "${widgetId}" — the fixture itself is suspect.`).toBeDefined();
      expect(derivedPath, `buildLytProgramIndex resolved widget "${widgetId}" to path "${derivedPath}", but an independent walk over LYT_PORTRAIT finds "${widgetId}"'s own node at path "${independentPath}" instead — the derivation returned a path belonging to a DIFFERENT widget.`).toBe(independentPath);
    }
  });

  it('a widget id that stops resolving is caught: a synthetic program missing "tree" leaves widgetPaths["tree"] undefined', () => {
    // Mirrors the exact condition App.vue's own `requireWidgetPath` throws
    // loudly on — proving this suite's own detection mechanism (test-cases
    // above asserting `toBeDefined()`) is live against a real regression
    // shape, not merely asserted to work. A minimal two-leaf program (no
    // `tree`, unlike the real encodings) stands in for "the .lyt encoding
    // dropped/renamed the tree leaf."
    const synthetic: LytProgram = {
      classId: 'synthetic',
      root: {
        kind: 'split',
        axis: 'h',
        gapPx: 0,
        children: [
          {
            path: '0',
            presenceDefaultVisible: true,
            track: { kind: 'fixed', px: 100 },
            node: {
              kind: 'leaf',
              widget: 'B',
              domain: 'board',
              facets: [],
              aspect: 1,
              scrollAxes: [],
              content: null,
              elasticAxes: [],
              ceilingAxes: [],
              floorAxes: [],
              edgeAxes: [],
              orientation: 'v',
              activity: null,
              demote: null,
              envelopeStates: null,
            },
          },
          {
            path: '1',
            presenceDefaultVisible: true,
            track: { kind: 'elastic', minPx: 0, frWeight: 1 },
            node: {
              // renamed from 'tree' -- the exact regression shape this
              // test proves the derivation catches.
              kind: 'leaf',
              widget: 'notTree',
              domain: 'board',
              facets: [],
              aspect: null,
              scrollAxes: [],
              content: null,
              elasticAxes: [],
              ceilingAxes: [],
              floorAxes: [],
              edgeAxes: [],
              orientation: 'v',
              activity: null,
              demote: null,
              envelopeStates: null,
            },
          },
        ],
      },
    };
    const index = buildLytProgramIndex(synthetic);
    expect(index.widgetPaths['tree']).toBeUndefined();
    expect(index.widgetPaths['B']).toBe('0'); // the sibling that DID resolve, for contrast
  });

  it('the retired hand-copied literal maps are confirmed absent from App.vue\'s source', () => {
    // A regression that reintroduces LYT_DOM_ID_BY_PATH_LANDSCAPE/
    // _PORTRAIT (silently undoing the R1 derivation fix) would pass every
    // assertion above as long as the reintroduced literals happened to be
    // internally consistent with the CURRENT encoding — this check closes
    // that gap directly.
    expect(app).not.toContain('LYT_DOM_ID_BY_PATH_LANDSCAPE');
    expect(app).not.toContain('LYT_DOM_ID_BY_PATH_PORTRAIT');
    expect(app).toContain('buildLytProgramIndex');
    expect(app).toContain('requireWidgetPath');
  });
});
