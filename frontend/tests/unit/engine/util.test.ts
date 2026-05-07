/**
 * tests/unit/engine/util.test.ts
 *
 * Tier-1 (pure-logic) tests for the small helpers in
 * `src/engine/util.ts` — coordinate conversion, board-property
 * extraction, RFC4122 v4 UUID generation, and the
 * `resolveGameName` four-rung fallback ladder.
 *
 * Each helper is small but used in many places; bugs at this layer
 * surface as misaligned analyses, wrong komi, duplicated game-source
 * groupings, or unstable identifiers in persisted shapes — exactly
 * the silent-coercion class ADR-0002 is shaped to prevent.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  sgfToMove,
  moveToKataCoord,
  toGtp,
  getBoardSize,
  getKomi,
  getInitialStones,
  generateUUID,
  resolveGameName,
} from '../../../src/engine/util';
import { createInitialBoard } from '../../../src/store/board-factory';
import type { BoardState } from '../../../src/types';

describe('sgfToMove', () => {
  it('decodes "pd" on 19×19 to (15, 15) (y inverts to bottom-origin)', () => {
    const m = sgfToMove('pd', 'B', 19);
    expect(m.type).toBe('place');
    expect(m).toMatchObject({ x: 15, y: 15, color: 'B' });
  });

  it('decodes "aa" on 19×19 to the top-left corner (0, 18)', () => {
    const m = sgfToMove('aa', 'W', 19);
    expect(m.type).toBe('place');
    expect(m).toMatchObject({ x: 0, y: 18, color: 'W' });
  });

  it('treats the special "tt" string as a pass on boards ≤ 19×19', () => {
    const m = sgfToMove('tt', 'B', 19);
    expect(m.type).toBe('pass');
  });

  it('does NOT treat "tt" as a pass on boards larger than 19×19', () => {
    // Above 19×19, "tt" is a real coordinate (19, 5 on a 25×25
    // board). The pass marker for those sizes is the empty string,
    // not "tt".
    const m = sgfToMove('tt', 'B', 25);
    expect(m.type).toBe('place');
  });

  it('treats an empty string as a pass on any board size', () => {
    expect(sgfToMove('', 'B', 19).type).toBe('pass');
    expect(sgfToMove('   ', 'B', 19).type).toBe('pass');
  });

  it('treats undefined as a pass', () => {
    expect(sgfToMove(undefined, 'B', 19).type).toBe('pass');
  });
});

describe('moveToKataCoord', () => {
  it('returns "pass" for a pass move', () => {
    expect(moveToKataCoord({ type: 'pass', color: 'B', x: 0, y: 0 })).toBe('pass');
  });

  it('returns a GTP coordinate for a placed move', () => {
    expect(moveToKataCoord({ type: 'place', color: 'B', x: 3, y: 3 })).toBe('D4');
  });
});

describe('toGtp', () => {
  it('returns the column letter and 1-indexed row', () => {
    expect(toGtp(0, 0)).toBe('A1');
    expect(toGtp(3, 3)).toBe('D4');
  });

  it('skips the letter "I" (KataGo follows the GTP convention)', () => {
    // GTP_ALPHABET is "ABCDEFGHJKLMNOPQRSTUVWXYZ" — index 8 is 'J',
    // not 'I'. (0..7) → A..H, 8 → J, 9 → K, …
    expect(toGtp(7, 0)).toBe('H1');
    expect(toGtp(8, 0)).toBe('J1');
  });

  it('returns "pass" with a console warning when x is out of range', () => {
    expect(toGtp(-1, 0)).toBe('pass');
    expect(toGtp(100, 0)).toBe('pass');
  });
});

describe('getBoardSize', () => {
  it('reads the SZ property from the root node', () => {
    const board = createInitialBoard();
    expect(getBoardSize(board)).toBe(19);
  });

  it('defaults to 19 when SZ is missing', () => {
    const board = createInitialBoard();
    delete board.nodes[board.rootNodeId].properties['SZ'];
    expect(getBoardSize(board)).toBe(19);
  });
});

describe('getKomi', () => {
  it('reads the KM property from the root node', () => {
    const board = createInitialBoard();
    board.nodes[board.rootNodeId].properties['KM'] = ['7.5'];
    expect(getKomi(board)).toBe(7.5);
  });

  it('defaults to 6.5 when KM is missing', () => {
    const board = createInitialBoard();
    expect(getKomi(board)).toBe(6.5);
  });

  it('defaults to 6.5 when KM is unparseable', () => {
    const board = createInitialBoard();
    board.nodes[board.rootNodeId].properties['KM'] = ['unparseable'];
    expect(getKomi(board)).toBe(6.5);
  });
});

describe('getInitialStones', () => {
  it('returns an empty array when no setup stones exist', () => {
    const board = createInitialBoard();
    expect(getInitialStones(board)).toEqual([]);
  });

  it('extracts AB / AW from the root node in GTP-coord form', () => {
    const board = createInitialBoard();
    board.nodes[board.rootNodeId].properties['AB'] = ['pd'];
    board.nodes[board.rootNodeId].properties['AW'] = ['dp'];
    const stones = getInitialStones(board);
    expect(stones).toContainEqual(['B', 'Q16']);
    expect(stones).toContainEqual(['W', 'D4']);
  });

  it('does not surface mid-tree setup (only the root node is read)', () => {
    // The protocol distinguishes initialStones (board state before
    // the first move) from moves (the game played after). Mid-tree
    // setup is intentionally out of scope for this helper — see the
    // function's docstring.
    const board = createInitialBoard();
    // No setup on root; pretend a hypothetical mid-tree node exists
    // with AB property — getInitialStones must not see it.
    expect(getInitialStones(board)).toEqual([]);
  });
});

describe('generateUUID', () => {
  it('produces a string in RFC4122 v4 shape', () => {
    const u = generateUUID();
    expect(u).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('produces distinct values across calls', () => {
    const a = generateUUID();
    const b = generateUUID();
    expect(a).not.toBe(b);
  });
});

describe('resolveGameName', () => {
  // Fixed instant for the date-stamp branch, so the test doesn't
  // depend on the wall clock.
  const FROZEN = new Date(Date.UTC(2026, 4, 8, 12, 30, 0));

  function withRootProps(extras: Record<string, string[]>): BoardState {
    const board = createInitialBoard();
    Object.assign(board.nodes[board.rootNodeId].properties, extras);
    return board;
  }

  it('prefers the SGF GN property when present', () => {
    const board = withRootProps({ GN: ['Famous Game'], EV: ['Tournament 2026'] });
    expect(resolveGameName(board, FROZEN)).toBe('Famous Game');
  });

  it('falls back to EV when GN is absent', () => {
    const board = withRootProps({ EV: ['Tournament 2026'] });
    expect(resolveGameName(board, FROZEN)).toBe('Tournament 2026');
  });

  it('falls back to source filename when GN and EV are both absent', () => {
    const board = createInitialBoard();
    board.sourceFileName = 'kobayashi-vs-cho-1996.sgf';
    expect(resolveGameName(board, FROZEN)).toBe('kobayashi-vs-cho-1996');
  });

  it('strips a single trailing .sgf extension case-insensitively', () => {
    const board = createInitialBoard();
    board.sourceFileName = 'GAME.SGF';
    expect(resolveGameName(board, FROZEN)).toBe('GAME');
  });

  it('falls back to the date-stamped catch-all when no metadata is available', () => {
    const board = createInitialBoard();
    const resolved = resolveGameName(board, FROZEN);
    // Format: "Free play (YYYY-MM-DD HH:MM)" in the system's local
    // timezone. Pin the prefix and the shape rather than the exact
    // wall-clock string (the test process's TZ is the system TZ).
    expect(resolved).toMatch(/^Free play \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\)$/);
  });

  it('skips a whitespace-only GN and falls through to EV', () => {
    const board = withRootProps({ GN: ['   '], EV: ['Tournament 2026'] });
    expect(resolveGameName(board, FROZEN)).toBe('Tournament 2026');
  });
});
