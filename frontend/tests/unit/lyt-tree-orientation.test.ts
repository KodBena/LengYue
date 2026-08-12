/**
 * tests/unit/lyt-tree-orientation.test.ts
 *
 * LYT R1 PART 1 (`.claude/dispatch-reports/lyt-r1-orientation-pathmap.md`,
 * commissioner ruling row 2310): `App.vue` wires the compiled program's
 * `tree` leaf's own `orientation` field through to `TreeWidget.vue`'s
 * `orientation` prop (`activeTreeOrientation`, `lytOrientationToProp`) — no
 * source change needed here, this arc only changes what the compiled
 * program itself carries (see below).
 *
 * LYT P2d (`.claude/dispatch-reports/lyt-p2d-orientation-emission.md`,
 * same ledger row 2310, Amendment 9's own derivation mechanism finally
 * threaded through to EMISSION): `emit_layout_tree.py`'s `build_program`
 * now threads `orientation.compute_derived_orientations`'s own genuine
 * per-solve verdict through for the `tree` leaf specifically (that
 * module's own "P2d -- emit the DERIVED orientation" docstring section has
 * the full derivation, the per-class representative-size votes, and the
 * disclosed scope narrowing/`otherBand` disagreement finding). Two facts
 * this suite pins:
 *
 *   1. `lytOrientationToProp`'s own axis -> prop-value mapping (the pure
 *      function App.vue's computed delegates to) — both directions of the
 *      closed `{'h','v'}` domain.
 *   2. What the REAL compiled programs actually emit for `tree` TODAY,
 *      post-P2d: `'v'` for LYT_LANDSCAPE (unanimous across landscape's two
 *      solvable representative sizes, IDENTICAL to the pre-P2d load-time
 *      placeholder — byte-identical compiled program), `'h'` for
 *      LYT_PORTRAIT (unanimous across all five of portrait's
 *      representative sizes, DIFFERENT from the pre-P2d placeholder — the
 *      one observable diff P2d produces). The Python-side no-tautology
 *      re-derivation (`research/lyt/tests/test_emit_layout_tree.py`'s own
 *      "P2d" section — independent solve + walk, never calling
 *      `emit_layout_tree._derive_tree_orientation` to compute its own
 *      expected value) is the source of truth these two literals mirror; a
 *      future `.lyt` encoding edit that changes either class's own
 *      residual-box shape enough to flip a value would change what
 *      `build_program` emits (and, per that module's own fail-loud
 *      disagreement refusal, might instead make emission REFUSE outright
 *      if representative sizes stop agreeing) — this test's own literals
 *      would need updating alongside it, the point of pinning them here
 *      being that such a change is VISIBLE (a failing test), not silent.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LYT_LANDSCAPE } from '../../src/state/lyt-layout.gen';
import { LYT_PORTRAIT } from '../../src/state/lyt-layout-portrait.gen';
import { buildLytProgramIndex, lytOrientationToProp } from '../../src/composables/chrome/useLytProgramIndex';

describe('lytOrientationToProp — pure axis -> TreeWidget prop mapping', () => {
  it("maps 'h' to 'horizontal'", () => {
    expect(lytOrientationToProp('h')).toBe('horizontal');
  });
  it("maps 'v' to 'vertical'", () => {
    expect(lytOrientationToProp('v')).toBe('vertical');
  });
});

describe("the compiled programs' own tree leaf orientation (row 2310, P2d)", () => {
  it("LYT_LANDSCAPE's tree leaf orientation is 'v' today (unanimous, byte-identical to pre-P2d)", () => {
    const leaf = buildLytProgramIndex(LYT_LANDSCAPE).leafNodes['tree'];
    expect(leaf, 'no "tree" leaf resolved in LYT_LANDSCAPE').toBeDefined();
    expect(leaf!.orientation).toBe('v');
  });

  it("LYT_PORTRAIT's tree leaf orientation is 'h' today (P2d's own derived flip, v -> h)", () => {
    const leaf = buildLytProgramIndex(LYT_PORTRAIT).leafNodes['tree'];
    expect(leaf, 'no "tree" leaf resolved in LYT_PORTRAIT').toBeDefined();
    expect(leaf!.orientation).toBe('h');
  });

  it('App.vue wires activeTreeOrientation through to TreeWidget\'s orientation prop', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf-8');
    expect(app).toContain(':orientation="activeTreeOrientation"');
    expect(app).toContain("leafNodes['tree']");
  });
});
