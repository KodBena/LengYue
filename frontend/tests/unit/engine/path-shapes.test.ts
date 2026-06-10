/**
 * tests/unit/engine/path-shapes.test.ts
 *
 * Tier-1 (pure-logic) tests pinning the divergence between the two
 * root-anchored path shapes — `getActiveVariationPath` (root→leaf,
 * `RootToLeafPath`) and `getPath` (root→current, `RootToCurrentPath`)
 * — on a board whose cursor sits BEHIND a pre-existing forward
 * variation.
 *
 * This is the fixture the 2026-05-15 match postmortem's §2 names as
 * the universal gap: every prior fixture started from a fresh board,
 * so `current == leaf` held everywhere and the two helpers were
 * observationally identical — which is exactly how Bugs A and B
 * (PRs #243/#244) shipped unobserved. The history-lessons audit
 * (2026-06-10, §3.4) made closing that gap an unconditional
 * recommendation; this file is the closure. The branded path types
 * minted in the same arc (`src/types/game.ts`) make the confusion a
 * compile error; these tests pin the runtime divergence the brands
 * encode.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration; same
// suppression pattern as the sibling sgf-loader tests.
import sgf from '@sabaki/sgf';

import { loadSgf } from '../../../src/engine/sgf-loader';
import { getActiveVariationPath } from '../../../src/engine/util';
import {
  getPath,
  navigatePrev,
  navigateTo,
  rootToCurrentPrefix,
} from '../../../src/engine/navigator';
import type { BoardState } from '../../../src/types';

/** Parse-and-load convenience, mirroring the sibling suites. */
function load(source: string): BoardState {
  return loadSgf(sgf.parse(source));
}

// A 5-move mainline with a sibling variation at move 3, so the active
// line is selected via `activeChildIndex` (not just an only-child
// chain). Cursor starts at the root — i.e. the tree already extends
// 5 plies past the cursor at load time.
const SGF_WITH_FORWARD_MAINLINE =
  '(;FF[4]GM[1]SZ[19];B[pd];W[dp](;B[pp];W[dd];B[qf])(;B[cd]))';

describe('path shapes — pre-existing forward variation (current != leaf)', () => {
  it('diverges immediately after load: the cursor is at the root, the active line extends past it', () => {
    const board = load(SGF_WITH_FORWARD_MAINLINE);

    const activeLine = getActiveVariationPath(board);
    const toCurrent = getPath(board.nodes, board.currentNodeId);

    // Root + 5 mainline moves; the variation branch is not on the
    // active line (activeChildIndex 0 selects the mainline).
    expect(activeLine).toHaveLength(6);
    // The cursor never moved: root→current is just the root.
    expect(toCurrent).toHaveLength(1);
    expect(toCurrent[0]).toBe(board.rootNodeId);
    // Same anchor, different terminus — THE shape divergence.
    expect(activeLine[0]).toBe(board.rootNodeId);
    expect(activeLine[activeLine.length - 1]).not.toBe(board.currentNodeId);
  });

  it('coincides exactly when the cursor sits at the active leaf', () => {
    const board = load(SGF_WITH_FORWARD_MAINLINE);
    const activeLine = getActiveVariationPath(board);
    navigateTo(board, activeLine[activeLine.length - 1]);

    expect(getPath(board.nodes, board.currentNodeId)).toEqual(
      getActiveVariationPath(board),
    );
  });

  it('navigating BACK from the leaf re-opens the divergence: root→current is a strict prefix of root→leaf', () => {
    const board = load(SGF_WITH_FORWARD_MAINLINE);
    const activeLine = getActiveVariationPath(board);
    navigateTo(board, activeLine[activeLine.length - 1]);

    // Two steps back from the leaf — the cursor now has pre-existing
    // forward variation past it, the trigger condition of both match
    // postmortem bugs.
    navigatePrev(board);
    navigatePrev(board);

    const afterBack = getActiveVariationPath(board);
    const toCurrent = getPath(board.nodes, board.currentNodeId);

    // The active line is unchanged by backward navigation…
    expect(afterBack).toEqual(activeLine);
    // …while root→current stopped at the cursor.
    expect(toCurrent).toHaveLength(activeLine.length - 2);
    expect(toCurrent[toCurrent.length - 1]).toBe(board.currentNodeId);
    // Strict prefix: element-wise equal up to the cursor, then shorter.
    expect(afterBack.slice(0, toCurrent.length)).toEqual([...toCurrent]);
    expect(afterBack.length).toBeGreaterThan(toCurrent.length);
  });

  it('rootToCurrentPrefix(line, i) equals getPath to the node at index i — the sanctioned slice re-brand', () => {
    const board = load(SGF_WITH_FORWARD_MAINLINE);
    const activeLine = getActiveVariationPath(board);

    for (let i = 0; i < activeLine.length; i++) {
      expect(rootToCurrentPrefix(activeLine, i)).toEqual(
        getPath(board.nodes, activeLine[i]),
      );
    }
  });
});
