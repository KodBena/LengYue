/**
 * tests/unit/lyt-tree-orientation.test.ts
 *
 * LYT R1 PART 1 (`.claude/dispatch-reports/lyt-r1-orientation-pathmap.md`,
 * commissioner ruling row 2310): `App.vue` now wires the compiled
 * program's `tree` leaf's own `orientation` field through to
 * `TreeWidget.vue`'s `orientation` prop (`activeTreeOrientation`,
 * `lytOrientationToProp`). Two facts this suite pins:
 *
 *   1. `lytOrientationToProp`'s own axis -> prop-value mapping (the pure
 *      function App.vue's computed delegates to) — both directions of the
 *      closed `{'h','v'}` domain.
 *   2. What the REAL compiled programs actually emit for `tree` TODAY —
 *      `'v'` in both classes. Per the commission's own build report, this
 *      is the load-time undeclared default (`emit_layout_tree.py`'s
 *      `build_program` never threads `orientation.rebind`'s derivation
 *      through to emission), independently CONFIRMED to agree with the
 *      genuine Amendment 9 derivation at every OPTIMAL representative
 *      screen size in `research/lyt/runner.py`'s own `SCREEN_SIZES` (see
 *      the build report for the direct re-solve transcript) — not a value
 *      this test merely assumes is correct. A future `.lyt` encoding edit
 *      that changes `tree`'s own residual-box shape enough to flip this
 *      would change what `build_program` emits, and this test's own
 *      second assertion would need updating alongside it — the point of
 *      pinning it here is that such a change is now VISIBLE (a failing
 *      test), not silent.
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

describe("the compiled programs' own tree leaf orientation (row 2310)", () => {
  it("LYT_LANDSCAPE's tree leaf orientation is 'v' today", () => {
    const leaf = buildLytProgramIndex(LYT_LANDSCAPE).leafNodes['tree'];
    expect(leaf, 'no "tree" leaf resolved in LYT_LANDSCAPE').toBeDefined();
    expect(leaf!.orientation).toBe('v');
  });

  it("LYT_PORTRAIT's tree leaf orientation is 'v' today", () => {
    const leaf = buildLytProgramIndex(LYT_PORTRAIT).leafNodes['tree'];
    expect(leaf, 'no "tree" leaf resolved in LYT_PORTRAIT').toBeDefined();
    expect(leaf!.orientation).toBe('v');
  });

  it('App.vue wires activeTreeOrientation through to TreeWidget\'s orientation prop', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf-8');
    expect(app).toContain(':orientation="activeTreeOrientation"');
    expect(app).toContain("leafNodes['tree']");
  });
});
