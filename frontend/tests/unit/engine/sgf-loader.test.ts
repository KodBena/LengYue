/**
 * tests/unit/engine/sgf-loader.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/engine/sgf-loader.ts::loadSgf`,
 * the bridge between Sabaki's SGF parser output and our internal
 * `BoardState` shape. The loader walks the Sabaki tree, mints a
 * `GameNode` per Sabaki node, and hydrates each node's `delta`
 * (captures, setup-overwrites, ko-point bookkeeping) by replaying
 * the rules engine against the running stones map.
 *
 * Bugs at this layer surface as wrong board projections (a
 * misplayed move replays into stones-everywhere-wrong), broken
 * variation-tree navigation, and incorrect handicap-stone handling.
 * The tests below pin the shape against representative SGFs
 * covering the variation-tree, capture, setup, and pass behaviours
 * the production code path exercises.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, onTestFinished } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration; the
// production import in src/composables/useReviewSession.ts uses the
// same suppression pattern.
import sgf from '@sabaki/sgf';

import { loadSgf, SgfSizeError } from '../../../src/engine/sgf-loader';
import { SgfCoordinateError } from '../../../src/engine/util';
import type { BoardState, GameNode } from '../../../src/types';

/**
 * Convenience: parse an SGF source and load it into a BoardState in
 * one step. Mirrors the production usage pattern in
 * `useReviewSession.loadCard`.
 */
function load(source: string): BoardState {
  return loadSgf(sgf.parse(source));
}

/**
 * Walks the active variation (root → activeChildIndex chain) and
 * returns the node IDs in order. Useful for asserting on the linear
 * mainline shape the production tree-traversal code reads through
 * `getActiveVariationPath`.
 */
function mainlineIds(board: BoardState): string[] {
  const out: string[] = [];
  let curr: GameNode | undefined = board.nodes[board.rootNodeId];
  while (curr) {
    out.push(curr.id);
    if (curr.children.length === 0) break;
    const nextId = curr.children[curr.activeChildIndex] ?? curr.children[0];
    curr = board.nodes[nextId];
  }
  return out;
}

describe('loadSgf — empty SGF', () => {
  it('builds a BoardState with one root node and no stones', () => {
    const board = load('(;FF[4]GM[1]SZ[19])');

    expect(Object.keys(board.nodes)).toHaveLength(1);
    expect(board.currentNodeId).toBe(board.rootNodeId);
    expect(board.stones).toEqual({});
    expect(board.captures).toEqual({ B: 0, W: 0 });
    expect(board.koPoint).toBeNull();
    expect(board.turn).toBe('B');
  });

  it('stamps a fresh BoardId and clientGameId per call', () => {
    const a = load('(;FF[4]GM[1]SZ[19])');
    const b = load('(;FF[4]GM[1]SZ[19])');
    expect(a.id).not.toBe(b.id);
    expect(a.clientGameId).not.toBe(b.clientGameId);
  });
});

describe('loadSgf — linear move sequence', () => {
  it('builds a chain of single-child nodes', () => {
    const board = load('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');

    expect(Object.keys(board.nodes)).toHaveLength(4); // root + 3 moves
    const path = mainlineIds(board);
    expect(path).toHaveLength(4);

    // Each non-leaf node has exactly one child along the mainline.
    for (let i = 0; i < path.length - 1; i++) {
      expect(board.nodes[path[i]].children).toHaveLength(1);
    }
  });

  it('tags each move-node with the right colour and coordinate', () => {
    const board = load('(;FF[4]GM[1]SZ[19];B[pd];W[dp])');
    const [, b1, w1] = mainlineIds(board);

    // "pd" on 19×19 → (15, 15); "dp" → (3, 3).
    expect(board.nodes[b1].move).toMatchObject({ color: 'B', x: 15, y: 15, type: 'place' });
    expect(board.nodes[w1].move).toMatchObject({ color: 'W', x: 3, y: 3, type: 'place' });
  });

  it('parents each move-node back through the chain (root has no parent)', () => {
    const board = load('(;FF[4]GM[1]SZ[19];B[pd];W[dp])');
    const [r, b1, w1] = mainlineIds(board);

    expect(board.nodes[r].parent).toBeNull();
    expect(board.nodes[b1].parent).toBe(r);
    expect(board.nodes[w1].parent).toBe(b1);
  });
});

describe('loadSgf — branching variations', () => {
  it('records all children on the branch point and defaults activeChildIndex to 0', () => {
    // Two variations from the same B[pd] position: W[dp] vs W[pp].
    const board = load('(;FF[4]GM[1]SZ[19];B[pd](;W[dp])(;W[pp]))');

    // Find the branch point by walking down from root once.
    const branchNode = board.nodes[board.rootNodeId].children[0];
    const branch = board.nodes[branchNode];
    expect(branch.children).toHaveLength(2);
    expect(branch.activeChildIndex).toBe(0);

    // Each child resolves to a W move.
    const [c1, c2] = branch.children;
    expect(board.nodes[c1].move?.color).toBe('W');
    expect(board.nodes[c2].move?.color).toBe('W');
  });
});

describe('loadSgf — root setup stones (AB/AW)', () => {
  it('projects AB stones onto the BoardState and into the root node delta', () => {
    // Two-stone Black handicap at star points (roughly).
    const board = load('(;FF[4]GM[1]SZ[19]AB[pd][dp]HA[2]KM[0.5])');
    // "pd" → (15, 15); "dp" → (3, 3) on a 19×19 board.
    expect(board.stones['15,15']).toBe('B');
    expect(board.stones['3,3']).toBe('B');

    const root = board.nodes[board.rootNodeId];
    expect(root.delta?.setupOverwritten).toBeDefined();
    expect(Object.keys(root.delta!.setupOverwritten)).toEqual(
      expect.arrayContaining(['15,15', '3,3']),
    );
  });

  it('projects AW stones onto the BoardState too', () => {
    const board = load('(;FF[4]GM[1]SZ[19]AW[pd]AB[dp])');
    expect(board.stones['15,15']).toBe('W');
    expect(board.stones['3,3']).toBe('B');
  });
});

describe('loadSgf — move with capture', () => {
  it('records the captured stones in the capturing node\'s delta', () => {
    // Sequence: B(0,1), W(8,8) tempo, B(1,0), W(9,9) tempo, B traps W
    // by playing the capture move. Easier: rely on the rules engine —
    // construct a corner-capture SGF directly.
    //
    // Coords on 19×19: SGF "aa" is (0, 18), "ab" is (0, 17), etc.
    // The y-flip means SGF letter b → board y = (size-1) - 1 = 17,
    // not what we want for low coords. Use these mappings:
    //   "aa" → (0, 18)        "ba" → (1, 18)
    //   "ab" → (0, 17)        "bb" → (1, 17)
    //   "ar" → (0, 1)         "br" → (1, 1)   "cr" → (2, 1)
    //   "as" → (0, 0)         "bs" → (1, 0)   "cs" → (2, 0)
    //
    // To capture W at (0,0) with B placement at (1,0):
    //   pre-state: W at (0,0), B at (0,1). Then B plays (1,0).
    //   In SGF: AW[as], AB[ar], then ;B[bs]. But hmm, AB on a
    //   non-root node isn't conventionally how moves are sequenced.
    //   Use a normal move sequence instead.
    //
    // Sequence — alternating turns:
    //   1. B at (0,1)            → "ar"
    //   2. W at (0,0)            → "as"   (corner)
    //   3. B at (10,10)          → "kj"   (tempo)
    //   4. W at (10,11)          → "ki"   (tempo)
    //   5. B at (1,0)            → "bs"   (captures W at (0,0))
    //
    // Yes — after move 5, W's stone at (0,0) has neighbours
    // (1,0)=B, (0,1)=B → 0 liberties → captured.
    const board = load('(;FF[4]GM[1]SZ[19];B[ar];W[as];B[kj];W[ki];B[bs])');
    const path = mainlineIds(board);
    const captureNodeId = path[path.length - 1]; // the B[bs] node
    const captureNode = board.nodes[captureNodeId];

    expect(captureNode.delta?.captures).toEqual(['0,0']);
  });
});

describe('loadSgf — pass moves', () => {
  it('records a B[] empty-string move as a pass', () => {
    const board = load('(;FF[4]GM[1]SZ[19];B[];W[dp])');
    const path = mainlineIds(board);
    const passNode = board.nodes[path[1]];
    expect(passNode.move?.type).toBe('pass');
    expect(passNode.move?.color).toBe('B');
  });
});

// ── File-trust boundary (ADR-0002) ──────────────────────────────────────────
// The three coercions closed by work-status item
// `sgf-file-boundary-coercions`: malformed board size (throws), malformed
// inbound coordinate (throws, via sgfToMove), and an illegal move in an
// otherwise-loadable file (loads, skips, warns — prod-visible, formerly
// DEV-gated).

describe('loadSgf — malformed board size (SZ)', () => {
  it('throws SgfSizeError on a non-numeric SZ rather than coercing to NaN geometry', () => {
    // SZ[foo] previously parsed to NaN and propagated into every
    // coordinate computation — a structurally corrupt board, not a
    // mis-scored one. The file-trust boundary refuses it loudly.
    expect(() => load('(;FF[4]GM[1]SZ[foo];B[pd])')).toThrow(SgfSizeError);
  });

  it('throws SgfSizeError on a zero / non-positive SZ', () => {
    expect(() => load('(;FF[4]GM[1]SZ[0])')).toThrow(SgfSizeError);
  });

  it('throws SgfSizeError on a non-square SZ[w:h] (unsupported, not silently truncated)', () => {
    // `parseInt('19:13')` would silently yield 19; the round-trip guard
    // rejects the trailing `:13` so the unsupported shape surfaces.
    expect(() => load('(;FF[4]GM[1]SZ[19:13])')).toThrow(SgfSizeError);
  });

  it('still defaults to 19 when SZ is ABSENT (absence is a legitimate default, not malformation)', () => {
    const board = load('(;FF[4]GM[1];B[pd])');
    const path = mainlineIds(board);
    // "pd" on a 19×19 board decodes to (15, 15); proves size resolved to 19.
    expect(board.nodes[path[1]].move).toMatchObject({ x: 15, y: 15 });
  });
});

describe('loadSgf — malformed inbound coordinate', () => {
  it('throws SgfCoordinateError when a move coordinate is out of board bounds', () => {
    // "zz" → col=25, row=25, outside a 19×19 board. Previously this
    // minted a Move with out-of-board (x, y) that flowed into the
    // stones map; now the boundary rejects it.
    expect(() => load('(;FF[4]GM[1]SZ[19];B[zz])')).toThrow(SgfCoordinateError);
  });

  it('throws SgfCoordinateError when a setup-stone coordinate is malformed (bypasses validateMove)', () => {
    // Setup stones (AB) skip the rules engine's validateMove, so a bad
    // AB coordinate had no downstream guard at all before this change.
    expect(() => load('(;FF[4]GM[1]SZ[19]AB[zz])')).toThrow(SgfCoordinateError);
  });

  it('throws SgfCoordinateError on a single-character coordinate (NaN from charCodeAt(1))', () => {
    expect(() => load('(;FF[4]GM[1]SZ[19];B[a])')).toThrow(SgfCoordinateError);
  });
});

describe('loadSgf — illegal move in an otherwise-loadable file', () => {
  it('loads the board, skips the illegal move, and warns prod-visibly (no DEV gate)', () => {
    // Spy on console.warn: the prior notice was gated under
    // import.meta.env.DEV, so production silently dropped the move.
    // Assert the notice fires (the test's own claim) and carries the
    // per-node detail rather than a bare count.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    onTestFinished(() => warn.mockRestore());

    // B plays (0,0), then W plays the SAME point — an occupied-point
    // placement the rules engine rejects. "as" → (0,0); replaying W[as]
    // onto the occupied point is illegal.
    const board = load('(;FF[4]GM[1]SZ[19];B[as];W[as])');

    // The board still loads (renderable-but-anomalous): the illegal W
    // move is skipped, so its node carries no captures and the stone
    // map keeps B at (0,0).
    const path = mainlineIds(board);
    expect(path.length).toBe(3); // root + B + W nodes all present
    const wNode = board.nodes[path[2]];
    expect(wNode.delta?.captures).toEqual([]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('illegal move skipped'),
    );
    // Per-node detail preserved (ADR-0002 Revisit-when #2): the message
    // names the coordinate and the rules-engine reason.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('occupied'));
  });
});
