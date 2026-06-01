/**
 * tests/unit/composables/perf-fixtures.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/composables/perf/fixtures.ts`. The
 * perf-scenario harness leans on the generated fixture being a *legal*
 * SGF with a deep main line — autonav walks it and `analyzeRange` spans
 * its turns. The "guaranteed legal, no captures" claim rests on the
 * even-spaced grid (no two placed stones orthogonally adjacent); these
 * tests pin it by replaying the fixture through the real rules-engine
 * loader, navigating to the leaf, and asserting no stone was ever
 * captured and the main line is the full requested length.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';
import { loadSgf } from '../../../src/engine/sgf-loader';
import { navigateTo } from '../../../src/engine/navigator';
import { getActiveVariationPath } from '../../../src/engine/util';
import type { BoardState, GameNode } from '../../../src/types';
import { buildSpacedFixtureSgf, DEFAULT_FIXTURE_SGF } from '../../../src/composables/perf/fixtures';

function load(source: string): BoardState {
  return loadSgf(sgf.parse(source));
}

/** Load, then replay to the active line's leaf (the production load path). */
function loadAtLeaf(source: string): BoardState {
  const board = load(source);
  const path = getActiveVariationPath(board);
  navigateTo(board, path[path.length - 1]);
  return board;
}

function mainlineLength(board: BoardState): number {
  let n = 0;
  let curr: GameNode | undefined = board.nodes[board.rootNodeId];
  while (curr) {
    n += 1;
    if (curr.children.length === 0) break;
    const nextId = curr.children[curr.activeChildIndex] ?? curr.children[0];
    curr = board.nodes[nextId];
  }
  return n;
}

describe('buildSpacedFixtureSgf', () => {
  it('produces a parseable SGF with the full requested main line', () => {
    const board = load(buildSpacedFixtureSgf(100));
    // 1 root + 100 move nodes.
    expect(mainlineLength(board)).toBe(101);
  });

  it('never captures a stone — the legality guarantee', () => {
    const board = loadAtLeaf(buildSpacedFixtureSgf(100));
    // At the leaf, every move was legal and no group was ever surrounded,
    // so the final position holds all 100 stones and both capture counters
    // are zero.
    expect(board.captures).toEqual({ B: 0, W: 0 });
    expect(Object.keys(board.stones)).toHaveLength(100);
  });

  it('caps at the grid capacity (100 on 19×19) when over-requested', () => {
    const board = load(buildSpacedFixtureSgf(500));
    expect(mainlineLength(board)).toBe(101);
  });

  it('alternates B then W from the first move', () => {
    const board = load(buildSpacedFixtureSgf(4));
    let curr: GameNode | undefined = board.nodes[board.rootNodeId];
    const colors: string[] = [];
    while (curr) {
      if (curr.move) colors.push(curr.move.color);
      if (curr.children.length === 0) break;
      curr = board.nodes[curr.children[curr.activeChildIndex] ?? curr.children[0]];
    }
    expect(colors).toEqual(['B', 'W', 'B', 'W']);
  });

  it('DEFAULT_FIXTURE_SGF is the full 100-move game with no captures', () => {
    const board = loadAtLeaf(DEFAULT_FIXTURE_SGF);
    expect(mainlineLength(board)).toBe(101);
    expect(board.captures).toEqual({ B: 0, W: 0 });
    expect(Object.keys(board.stones)).toHaveLength(100);
  });
});
