/**
 * tests/unit/engine/util.test.ts
 *
 * Tier-1 (pure-logic) tests for the small helpers in
 * `src/engine/util.ts` — coordinate conversion, board-property
 * extraction, and the `resolveGameName` four-rung fallback ladder.
 * (The `generateUUID` tests moved to `tests/unit/lib/utils.test.ts`
 * with their subject, 2026-06-10.)
 *
 * Each helper is small but used in many places; bugs at this layer
 * surface as misaligned analyses, wrong komi, duplicated game-source
 * groupings, or unstable identifiers in persisted shapes — exactly
 * the silent-coercion class ADR-0002 is shaped to prevent.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, onTestFinished } from 'vitest';
import {
  sgfToMove,
  SgfCoordinateError,
  moveToKataCoord,
  toGtp,
  getBoardSize,
  getKomi,
  getInitialStones,
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

  // ── File-trust boundary (ADR-0002), item sgf-file-boundary-coercions ──
  // The prior shape did charCodeAt(…) - 97 with no bounds check, so a
  // garbage coordinate minted a Move with NaN / out-of-board geometry
  // that propagated into the stones map and the rules engine.

  it('throws SgfCoordinateError on a coordinate outside the board', () => {
    // "zz" → col=25, row=25, outside a 19×19 board.
    expect(() => sgfToMove('zz', 'B', 19)).toThrow(SgfCoordinateError);
  });

  it('throws SgfCoordinateError on a single-character coordinate (charCodeAt(1) → NaN)', () => {
    expect(() => sgfToMove('a', 'B', 19)).toThrow(SgfCoordinateError);
  });

  it('throws SgfCoordinateError on a non-alphabet coordinate character', () => {
    // "@" is below 'a' (charCode 64) → col = -33, out of range.
    expect(() => sgfToMove('@@', 'B', 19)).toThrow(SgfCoordinateError);
  });

  it('still accepts "tt" as a real coordinate on boards > 19×19 (in bounds)', () => {
    // Above 19×19, "tt" is (19, 5) on a 25×25 board — a valid point,
    // not a pass and not malformed. The new bounds check must not
    // reject it.
    const m = sgfToMove('tt', 'B', 25);
    expect(m.type).toBe('place');
    expect(m).toMatchObject({ x: 19, y: 5 });
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
    // Spy + suppress: the warning is the documented behaviour, so assert it
    // fires (the test's own claim) rather than letting it print to stderr.
    // Restore failure-safe (no restoreMocks config) so a thrown assertion
    // can't leak the silenced console.warn into later tests.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    onTestFinished(() => warn.mockRestore());

    expect(toGtp(-1, 0)).toBe('pass');
    expect(toGtp(100, 0)).toBe('pass');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('out of GTP range'));
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

  it('SKIPS a malformed setup coordinate with a warning rather than throwing', () => {
    // The load-bearing tolerance: getInitialStones runs at
    // analysis-request time on a board that has ALREADY loaded (often
    // rehydrated from persistence under older silently-coercing code).
    // Re-throwing here would crash the unguarded analysis hot path on
    // every navigation. The file-trust boundary is loadSgf, not this
    // re-reader — so a bad stored coord degrades that one stone.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    onTestFinished(() => warn.mockRestore());

    const board = createInitialBoard();
    // One valid AB stone, one malformed ("zz" out of bounds on 19×19).
    board.nodes[board.rootNodeId].properties['AB'] = ['pd', 'zz'];

    const stones = getInitialStones(board);
    // The valid stone survives; the malformed one is dropped, not fatal.
    expect(stones).toContainEqual(['B', 'Q16']);
    expect(stones).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('malformed setup coord'));
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
