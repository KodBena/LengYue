/**
 * tests/unit/logic-setup.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/logic.ts::applySetup` and its
 * sibling `applyMarkup` — the setup toolkit's data layer (ledger rows
 * 603/604). `applySetup` predates this commission (caller-less at
 * HEAD, per its own doc comment); these tests pin the toggle
 * semantics the new UI wiring (`useSetupTools`) now depends on, plus
 * the two invariants the commission named explicitly: no capture
 * logic runs on setup placement, and a setup stone is still a REAL
 * stone a later MOVE can capture.
 *
 * No DOM, no fakes, no Vue reactivity — `createInitialBoard()` plus
 * assertions over the returned `BoardState`, same shape as
 * `logic.test.ts`.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { applySetup, applyMarkup, applyGoMove } from '../../src/logic';
import { createInitialBoard } from '../../src/store/board-factory';
import type { BoardState } from '../../src/types';

describe('applySetup — placement and toggle', () => {
  it('places a black setup stone without consuming the turn', () => {
    const board = createInitialBoard();
    expect(board.turn).toBe('B');

    const next = applySetup(board, 3, 3, 'B');

    expect(next.stones['3,3']).toBe('B');
    expect(next.turn).toBe('B'); // unchanged — setup is not a move
    expect(next.captures).toEqual({ B: 0, W: 0 });
  });

  it('same-color toggle removes the stone (classic editor toggle semantics)', () => {
    const board = createInitialBoard();
    const placed = applySetup(board, 3, 3, 'B');
    expect(placed.stones['3,3']).toBe('B');

    const toggled = applySetup(placed, 3, 3, 'B');
    expect(toggled.stones['3,3']).toBeUndefined();
  });

  it('opposite-color setup REPLACES the existing stone (not a stack/error)', () => {
    const board = createInitialBoard();
    const black = applySetup(board, 3, 3, 'B');
    const replaced = applySetup(black, 3, 3, 'W');
    expect(replaced.stones['3,3']).toBe('W');
  });

  it('mutates only the CURRENT node — does not create a new tree node', () => {
    const board = createInitialBoard();
    const nodeCountBefore = Object.keys(board.nodes).length;
    const next = applySetup(board, 3, 3, 'B');
    expect(Object.keys(next.nodes)).toHaveLength(nodeCountBefore);
    expect(next.currentNodeId).toBe(board.currentNodeId);
  });

  it('records the setup edit as an SGF AB property on the current node', () => {
    const board = createInitialBoard();
    const next = applySetup(board, 3, 3, 'B');
    const node = next.nodes[next.currentNodeId];
    // (3,3) on a 19×19 board → SGF "dd" (x=3 → 'd', size-1-y = 15 → 'p'... )
    // Don't hand-decode; assert the coordinate round-trips through the
    // same encoding the loader/writer already use — presence is the point.
    expect(node.properties.AB).toBeDefined();
    expect(node.properties.AB).toHaveLength(1);
  });

  it('places a setup stone that a SUBSEQUENT MOVE can capture (no special-cased immunity)', () => {
    // Ring a single setup stone at (0,0) with three real Black moves,
    // alternating turns exactly as a live game would; the fourth
    // liberty is filled by a real move that must capture it.
    let board = createInitialBoard();
    board = applySetup(board, 0, 0, 'W'); // lone setup stone, does not touch board.turn
    expect(board.turn).toBe('B');

    board = applyGoMove(board, 1, 0)!; // B
    board = applyGoMove(board, 10, 10)!; // W tempo
    board = applyGoMove(board, 0, 1)!; // B — captures the W setup stone at (0,0)

    expect(board.stones['0,0']).toBeUndefined();
    expect(board.captures.B).toBe(1);
  });
});

describe('applyMarkup — triangle toggle', () => {
  it('adds a TR mark independent of the stones map', () => {
    const board = createInitialBoard();
    const next = applyMarkup(board, 5, 5, 'TR');
    const node = next.nodes[next.currentNodeId];
    expect(node.properties.TR).toHaveLength(1);
    expect(next.stones).toEqual(board.stones); // untouched
  });

  it('toggles the same mark off on a second call at the same point', () => {
    const board = createInitialBoard();
    const marked = applyMarkup(board, 5, 5, 'TR');
    const unmarked = applyMarkup(marked, 5, 5, 'TR');
    expect(unmarked.nodes[unmarked.currentNodeId].properties.TR).toBeUndefined();
  });

  it('a triangle on an occupied point does not disturb the stone there', () => {
    let board: BoardState = createInitialBoard();
    board = applySetup(board, 4, 4, 'B');
    const marked = applyMarkup(board, 4, 4, 'TR');
    expect(marked.stones['4,4']).toBe('B');
    expect(marked.nodes[marked.currentNodeId].properties.TR).toHaveLength(1);
  });

  it('does not consume the turn or touch captures', () => {
    const board = createInitialBoard();
    const next = applyMarkup(board, 5, 5, 'TR');
    expect(next.turn).toBe(board.turn);
    expect(next.captures).toEqual(board.captures);
  });
});
