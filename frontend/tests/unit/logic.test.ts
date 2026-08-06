/**
 * tests/unit/logic.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/logic.ts::applyGoMove`. The Go
 * rules engine is the most domain-bound, type-system-opaque module
 * in the codebase — placement, capture, and ko are arithmetic-style
 * decisions that the strict typecheck cannot police. These tests
 * pin the expected behaviour at the boundary the rest of the
 * application reads through.
 *
 * No DOM, no fakes, no Vue reactivity. The full apparatus is just
 * `createInitialBoard()` (a pure factory) plus assertions over the
 * returned `BoardState`.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration; same
// suppression pattern as tests/unit/engine/sgf-loader.test.ts.
import sgf from '@sabaki/sgf';
import { applyGoMove, applyPass } from '../../src/logic';
import { createInitialBoard } from '../../src/store/board-factory';
import { loadSgf } from '../../src/engine/sgf-loader';
import { serializeBoard } from '../../src/engine/sgf-writer';
import type { BoardState } from '../../src/types';

/**
 * Convenience: chain `applyGoMove` calls with non-null assertions.
 * Each call must succeed; a `null` return throws so the test fails
 * loudly at the line where the unexpected illegal-move return came
 * back, not later when an assertion sees the wrong shape.
 */
function play(board: BoardState, x: number, y: number): BoardState {
  const next = applyGoMove(board, x, y);
  if (!next) throw new Error(`applyGoMove rejected (${x},${y}) — expected legal move`);
  return next;
}

describe('applyGoMove — placement', () => {
  it('places a stone at a legal point and flips the turn', () => {
    const board = createInitialBoard();
    expect(board.turn).toBe('B');

    const next = applyGoMove(board, 3, 3);

    expect(next).not.toBeNull();
    expect(next!.stones['3,3']).toBe('B');
    expect(next!.turn).toBe('W');
  });

  it('returns null when the target point is occupied', () => {
    let board = createInitialBoard();
    board = play(board, 3, 3); // B
    const rejected = applyGoMove(board, 3, 3); // W tries the same point

    expect(rejected).toBeNull();
  });

  it('rejects suicide — playing into a fully-surrounded point', () => {
    // Build a single empty cell at (0,0) surrounded by white stones,
    // then ask Black to fill it. The placed Black stone has no
    // liberties and no enemy capture is generated, so the rules
    // engine returns null.
    let board = createInitialBoard();
    board = play(board, 1, 0); // B
    board = play(board, 0, 1); // W (corner edge)
    board = play(board, 5, 5); // B tempo
    board = play(board, 1, 1); // W (now the corner has W liberties only)
    // Wait — at this point B has played (1,0). Make sure the suicide
    // setup actually surrounds (0,0) with W. We need to remove B(1,0)
    // and instead have W(1,0). Restart with a cleaner construction.
    //
    // Rebuild: use an empty corner cell and ring it with W. Easiest is
    // a 3-stone corner setup using setup properties — but applyGoMove
    // needs alternating turns, so we sequence carefully.
    //
    // Sequence (alternating B/W; W ends up surrounding (0,0)):
    //   B (5,5), W (1,0), B (5,6), W (0,1)
    // After this: W stones at (1,0) and (0,1); the corner (0,0) is
    // an empty point with two W neighbours. To make B suicide, we
    // need it to be Black's turn AND the corner to have no friendly
    // liberty — both conditions hold here.
    let suicideBoard = createInitialBoard();
    suicideBoard = play(suicideBoard, 5, 5); // B
    suicideBoard = play(suicideBoard, 1, 0); // W
    suicideBoard = play(suicideBoard, 5, 6); // B
    suicideBoard = play(suicideBoard, 0, 1); // W
    expect(suicideBoard.turn).toBe('B');

    const rejected = applyGoMove(suicideBoard, 0, 0);
    expect(rejected).toBeNull();
  });
});

describe('applyGoMove — capture', () => {
  it('removes a single stone with no liberties and increments the capture count', () => {
    // White stone at (0,0); Black surrounds via (1,0) then (0,1).
    let board = createInitialBoard();
    board = play(board, 5, 5); // B tempo
    board = play(board, 0, 0); // W in the corner
    board = play(board, 1, 0); // B — W now has 1 liberty at (0,1)
    board = play(board, 5, 6); // W tempo
    board = play(board, 0, 1); // B — captures W at (0,0)

    expect(board.stones['0,0']).toBeUndefined();
    expect(board.stones['1,0']).toBe('B');
    expect(board.stones['0,1']).toBe('B');
    expect(board.captures.B).toBe(1);
  });

  it('sets the koPoint when a single-stone capture comes from a single-stone placement', () => {
    // Standard 1-stone-for-1-stone ko setup. After the capture, the
    // captured square becomes a ko point so White cannot immediately
    // recapture on the next turn.
    //
    //   . W B .
    //   W . W B
    //   . W B .
    //
    // Build the symmetric shape one move at a time. Coordinates use
    // a small region near (3,3) to stay clear of the board edge.
    let board = createInitialBoard();
    board = play(board, 3, 3); // B
    board = play(board, 4, 3); // W
    board = play(board, 4, 2); // B
    board = play(board, 3, 2); // W
    board = play(board, 4, 4); // B
    board = play(board, 3, 4); // W
    board = play(board, 5, 3); // B — surrounds W's (4,3); but (4,3) still has liberty (4,3)? Let me re-check.
    // After (5,3): W stone at (4,3) has neighbours (3,3)=B, (5,3)=B,
    // (4,2)=B, (4,4)=B → 0 liberties → captured. B now has a stone
    // at (5,3) playing the killer move.
    expect(board.stones['4,3']).toBeUndefined();
    expect(board.captures.B).toBe(1);
    // The ko point lives at the just-captured square; W cannot
    // immediately recapture there.
    expect(board.koPoint).toEqual({ x: 4, y: 3 });
  });
});

/**
 * `applyPass` (pass-support design, PASS SUPPORT §B, `.claude/
 * dispatch-reports/design-engine-features.md`) — turn parity, no
 * capture, tree-node shape, and the SGF round-trip through the real
 * writer/loader (the mutator's node must produce the exact property
 * shape `sgfToMove` already decodes and `serializeBoard` already
 * re-emits — both existing, pre-fix code paths per the sgf-pass-
 * diagnosis report).
 */
describe('applyPass', () => {
  it('consumes the turn without placing a stone or capturing', () => {
    const board = createInitialBoard();
    expect(board.turn).toBe('B');

    const next = applyPass(board);

    expect(next.turn).toBe('W');
    expect(Object.keys(next.stones)).toHaveLength(0);
    expect(next.captures).toEqual({ B: 0, W: 0 });
  });

  it('appends a tree node with move.type "pass" and the passing colour', () => {
    const board = createInitialBoard();
    const next = applyPass(board);

    expect(next.currentNodeId).not.toBe(board.currentNodeId);
    const node = next.nodes[next.currentNodeId];
    expect(node.move).toEqual({ x: 0, y: 0, color: 'B', type: 'pass' });
    expect(node.parent).toBe(board.currentNodeId);
    expect(next.nodes[board.currentNodeId].children).toContain(next.currentNodeId);
  });

  it('a pass never touches the stones projection even mid-game', () => {
    let board = createInitialBoard();
    board = play(board, 3, 3); // B
    board = play(board, 15, 15); // W
    const stonesBefore = { ...board.stones };

    const next = applyPass(board); // B passes

    expect(next.stones).toEqual(stonesBefore);
    expect(next.turn).toBe('W');
  });

  it('two consecutive passes alternate colour correctly (turn parity over a pass-pass sequence)', () => {
    let board = createInitialBoard();
    board = applyPass(board); // B passes → W to move
    expect(board.turn).toBe('W');
    board = applyPass(board); // W passes → B to move
    expect(board.turn).toBe('B');
    expect(board.nodes[board.currentNodeId].move).toEqual({ x: 0, y: 0, color: 'W', type: 'pass' });
  });

  it('existing-child reuse: replaying the same pass descends into the existing node rather than duplicating', () => {
    const board = createInitialBoard();
    const first = applyPass(board);
    // Re-navigate to the parent and pass again — same shape as
    // applyGoMove's dedup test, mirrored for the pass mutator.
    const replay = applyPass({ ...first, currentNodeId: board.currentNodeId, nodes: first.nodes, turn: 'B' });

    expect(replay.currentNodeId).toBe(first.currentNodeId);
    expect(Object.keys(replay.nodes)).toHaveLength(Object.keys(first.nodes).length);
  });

  it('SGF round-trip: a pass played via applyPass survives serializeBoard → loadSgf identically', () => {
    let board = createInitialBoard();
    board = play(board, 3, 3); // B
    board = applyPass(board); // W passes
    board = play(board, 15, 15); // B plays again

    const written = serializeBoard(board);
    // The written SGF must carry an empty-value W property (the pass
    // marker) — not merely "some W property".
    expect(written).toMatch(/;W\[\]/);

    const reloaded = loadSgf(sgf.parse(written));
    const reloadedLeaf = reloaded.nodes[reloaded.currentNodeId];
    // Walk reloaded's mainline to find the pass node and confirm it
    // decoded back to type 'pass', color 'W' — the exact round-trip
    // the design's acceptance criteria require.
    let cursor = reloaded.nodes[reloaded.rootNodeId];
    const moves: (typeof reloadedLeaf.move)[] = [];
    while (true) {
      moves.push(cursor.move);
      if (cursor.children.length === 0) break;
      cursor = reloaded.nodes[cursor.children[cursor.activeChildIndex]];
    }
    const passMove = moves.find(m => m?.type === 'pass');
    expect(passMove).toEqual({ x: 0, y: 0, color: 'W', type: 'pass' });
  });
});
