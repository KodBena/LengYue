/**
 * tests/unit/engine/handicap.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/engine/handicap.ts` (wiki
 * Mechanics #4, "No handicap setup support"). Three surfaces:
 *
 *   1. `handicapPoints` / `validHandicapCounts` — the placement table
 *      itself, pinned for every valid N on all three supported board
 *      sizes (19×19 N=2..9, 13×13 N=2..5, 9×9 N=2..4), per the
 *      module-header convention (corners → edges → center).
 *   2. `applyHandicap` — white-to-move, HA[n]/PL[W]/default-KM root
 *      properties (the seeded default KM now drawn per-ruleset from
 *      `handicapKomiForRuleset`, ledger rows 1339/1340 — Tromp-Taylor
 *      seeds 0, the other three ruling-mandated rulesets seed 0.5),
 *      the loud refusal once the root has children, and the
 *      re-selection replace-not-append behaviour.
 *   3. SGF round trip — save a handicapped board, reload it, and
 *      confirm AB[]/HA[n] survive and the reloaded board's turn is
 *      still White (via `getInitialPlayer`'s PL[W] read).
 *
 * No DOM, no fakes, no Vue reactivity — `createInitialBoard()` plus
 * `loadSgf`/`serializeBoard` round trips, same posture as
 * `logic.test.ts` and `sgf-writer-setup-roundtrip.test.ts`.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration; same
// suppression pattern as tests/unit/engine/sgf-loader.test.ts.
import sgf from '@sabaki/sgf';

import {
  handicapPoints,
  validHandicapCounts,
  applyHandicap,
  HandicapOnStartedGameError,
  HANDICAP_KOMI,
  isHandicapBoardSize,
} from '../../../src/engine/handicap';
import { createInitialBoard } from '../../../src/store/board-factory';
import { applyGoMove } from '../../../src/logic';
import { loadSgf } from '../../../src/engine/sgf-loader';
import { serializeBoard } from '../../../src/engine/sgf-writer';
import { RULESET_NAMES, type RulesetName } from '../../../src/engine/rulesets';
import {
  handicapKomiForRuleset,
  normalizeKomiForRuleset,
} from '../../../src/engine/katago/komi-calibration';
import type { BoardState } from '../../../src/types';

function load(source: string): BoardState {
  return loadSgf(sgf.parse(source));
}

/** A board of a given size, freshly loaded (no moves yet). No RU set — resolves to the defaulted Tromp-Taylor ruleset (`getRulesetResolution`'s own default). */
function boardOfSize(size: number): BoardState {
  return load(`(;FF[4]GM[1]SZ[${size}])`);
}

/** A 19×19 board freshly loaded under an explicit `ruleset` (no moves yet). */
function boardWithRuleset(ruleset: RulesetName): BoardState {
  return load(`(;FF[4]GM[1]SZ[19]RU[${ruleset}])`);
}

// ── 1. Placement table ──────────────────────────────────────────────────────

describe('handicapPoints — 19×19', () => {
  const size = 19;

  it('exposes N=2..9 as the valid count range', () => {
    expect(validHandicapCounts(size)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9])('N=%i returns exactly N distinct on-board points', (n) => {
    const points = handicapPoints(size, n);
    expect(points).not.toBeNull();
    expect(points!.length).toBe(n);
    const unique = new Set(points!.map(([x, y]) => `${x},${y}`));
    expect(unique.size).toBe(n);
    for (const [x, y] of points!) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(size);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(size);
    }
  });

  it('N=4 is exactly the 4 corner hoshi (3-3 points)', () => {
    const points = handicapPoints(size, 4)!;
    const asSet = new Set(points.map(([x, y]) => `${x},${y}`));
    expect(asSet).toEqual(new Set(['3,15', '15,3', '15,15', '3,3']));
  });

  it('N=5 adds tengen (center) to the 4 corners', () => {
    const points = handicapPoints(size, 5)!;
    expect(points.some(([x, y]) => x === 9 && y === 9)).toBe(true);
    expect(points.length).toBe(5);
  });

  it('N=6 is 4 corners + left/right edge hoshi, NO tengen', () => {
    const points = handicapPoints(size, 6)!;
    expect(points.some(([x, y]) => x === 9 && y === 9)).toBe(false);
    expect(points.length).toBe(6);
  });

  it('N=8 is 4 corners + all 4 edge hoshi, NO tengen', () => {
    const points = handicapPoints(size, 8)!;
    expect(points.some(([x, y]) => x === 9 && y === 9)).toBe(false);
    expect(points.length).toBe(8);
  });

  it('N=9 is all 8 non-center hoshi + tengen', () => {
    const points = handicapPoints(size, 9)!;
    expect(points.some(([x, y]) => x === 9 && y === 9)).toBe(true);
    expect(points.length).toBe(9);
  });

  it('center (tengen) is present at N=5, absent at N=6, present again at N=7, absent again at N=8, present at N=9 — the module-header table\'s documented non-monotonic seam, pinned explicitly rather than assumed away', () => {
    const hasCenter = (n: number) => handicapPoints(size, n)!.some(([x, y]) => x === 9 && y === 9);
    expect(hasCenter(5)).toBe(true);
    expect(hasCenter(6)).toBe(false);
    expect(hasCenter(7)).toBe(true);
    expect(hasCenter(8)).toBe(false);
    expect(hasCenter(9)).toBe(true);
  });

  it('N=2..4 and N=6→N=9\'s corner+edge points are monotonically retained (the non-tengen point set only grows)', () => {
    for (let n = 2; n < 9; n++) {
      const cur = new Set(handicapPoints(size, n)!.map(([x, y]) => `${x},${y}`).filter((p) => p !== '9,9'));
      const next = new Set(handicapPoints(size, n + 1)!.map(([x, y]) => `${x},${y}`).filter((p) => p !== '9,9'));
      for (const p of cur) expect(next.has(p)).toBe(true);
    }
  });

  it('rejects N=1 and N=10 (out of the supported range)', () => {
    expect(handicapPoints(size, 1)).toBeNull();
    expect(handicapPoints(size, 10)).toBeNull();
  });
});

describe('handicapPoints — 13×13', () => {
  const size = 13;

  it('caps at N=5 (4 corners + tengen)', () => {
    expect(validHandicapCounts(size)).toEqual([2, 3, 4, 5]);
    expect(handicapPoints(size, 6)).toBeNull();
  });

  it.each([2, 3, 4, 5])('N=%i returns N distinct in-bounds points', (n) => {
    const points = handicapPoints(size, n);
    expect(points).not.toBeNull();
    expect(points!.length).toBe(n);
    for (const [x, y] of points!) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(size);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(size);
    }
  });

  it('N=5 includes the 13×13 tengen (6,6)', () => {
    const points = handicapPoints(size, 5)!;
    expect(points).toContainEqual([6, 6]);
  });
});

describe('handicapPoints — 9×9', () => {
  const size = 9;

  it('caps at N=4 (4 corners only, no tengen entry)', () => {
    expect(validHandicapCounts(size)).toEqual([2, 3, 4]);
    expect(handicapPoints(size, 5)).toBeNull();
  });

  it.each([2, 3, 4])('N=%i returns N distinct in-bounds points', (n) => {
    const points = handicapPoints(size, n);
    expect(points).not.toBeNull();
    expect(points!.length).toBe(n);
    for (const [x, y] of points!) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(size);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(size);
    }
  });
});

describe('handicapPoints / isHandicapBoardSize — unsupported sizes', () => {
  it('returns null / [] for an unsupported board size (e.g. 21)', () => {
    expect(isHandicapBoardSize(21)).toBe(false);
    expect(handicapPoints(21, 4)).toBeNull();
    expect(validHandicapCounts(21)).toEqual([]);
  });
});

// ── 2. applyHandicap ────────────────────────────────────────────────────────

describe('applyHandicap', () => {
  it('places N black setup stones at the canonical points and records HA[n]', () => {
    const board = createInitialBoard(); // 19×19
    const next = applyHandicap(board, 19, 4);

    const points = handicapPoints(19, 4)!;
    for (const [x, y] of points) {
      expect(next.stones[`${x},${y}`]).toBe('B');
    }
    expect(Object.keys(next.stones).length).toBe(4);
    expect(next.nodes[next.rootNodeId].properties.HA).toEqual(['4']);
    expect(next.nodes[next.rootNodeId].properties.AB?.length).toBe(4);
  });

  it('hands the first move to White — both BoardState.turn and root PL[W]', () => {
    const board = createInitialBoard();
    const next = applyHandicap(board, 19, 5);

    expect(next.turn).toBe('W');
    expect(next.nodes[next.rootNodeId].properties.PL).toEqual(['W']);
  });

  it('seeds the Tromp-Taylor handicap komi (0) when no KM is already set — createInitialBoard authors RU[Tromp-Taylor] (ledger row 1146), so this is NOT HANDICAP_KOMI (0.5) any more: TT is an ordinary row in the per-ruleset domain table, not the uniform default (ledger rows 1339/1340)', () => {
    const board = createInitialBoard();
    // `createInitialBoard` now authors its own KM (ledger row 1146 —
    // see `tests/unit/store/board-factory-komi.test.ts`), so KM is
    // deleted here to isolate applyHandicap's own "no KM yet" seeding
    // path from the factory's authored default.
    delete board.nodes[board.rootNodeId].properties['KM'];
    const next = applyHandicap(board, 19, 3);

    expect(next.nodes[next.rootNodeId].properties.KM).toEqual(['0']);
  });

  it.each(RULESET_NAMES)(
    'seeds %s\'s own handicap komi (handicapKomiForRuleset) when no KM is already set — the compositional invariant: the seeded value always lies in that ruleset\'s own komi domain',
    (ruleset) => {
      const board = boardWithRuleset(ruleset);
      const next = applyHandicap(board, 19, 3);

      const expected = handicapKomiForRuleset(ruleset);
      const seeded = next.nodes[next.rootNodeId].properties.KM;
      expect(seeded).toEqual([String(expected)]);
      // Domain membership: normalizing the seeded value against its OWN
      // ruleset is a no-op — it is already in that ruleset's domain
      // (integer under Tromp-Taylor, half-integer otherwise).
      expect(normalizeKomiForRuleset(Number(seeded![0]), ruleset)).toBe(expected);
    },
  );

  it('Tromp-Taylor seeds 0, the other three ruling-mandated rulesets seed 0.5 (HANDICAP_KOMI) — pinning the concrete per-ruleset values, not just the domain-membership property above', () => {
    expect(handicapKomiForRuleset('Tromp-Taylor')).toBe(0);
    expect(handicapKomiForRuleset('AGA')).toBe(HANDICAP_KOMI);
    expect(handicapKomiForRuleset('Chinese')).toBe(HANDICAP_KOMI);
    expect(handicapKomiForRuleset('Japanese')).toBe(HANDICAP_KOMI);
  });

  it('does not override an already-explicit KM on the root', () => {
    let board = createInitialBoard();
    board = {
      ...board,
      nodes: {
        ...board.nodes,
        [board.rootNodeId]: {
          ...board.nodes[board.rootNodeId],
          properties: { ...board.nodes[board.rootNodeId].properties, KM: ['7.5'] },
        },
      },
    };
    const next = applyHandicap(board, 19, 4);
    expect(next.nodes[next.rootNodeId].properties.KM).toEqual(['7.5']);
  });

  it('re-selecting a different N replaces the stone set rather than adding to it', () => {
    const board = createInitialBoard();
    const nine = applyHandicap(board, 19, 9);
    expect(Object.keys(nine.stones).length).toBe(9);

    const two = applyHandicap(nine, 19, 2);
    expect(Object.keys(two.stones).length).toBe(2);
    const points = handicapPoints(19, 2)!;
    for (const [x, y] of points) expect(two.stones[`${x},${y}`]).toBe('B');
  });

  it('refuses loudly (HandicapOnStartedGameError) once the root has a move played', () => {
    let board = createInitialBoard();
    board = applyGoMove(board, 3, 3)!; // root now has a child

    expect(() => applyHandicap(board, 19, 4)).toThrow(HandicapOnStartedGameError);
  });

  it('applies correctly on 13×13 and 9×9 boards too', () => {
    const board13 = boardOfSize(13);
    const next13 = applyHandicap(board13, 13, 5);
    expect(Object.keys(next13.stones).length).toBe(5);
    expect(next13.turn).toBe('W');

    const board9 = boardOfSize(9);
    const next9 = applyHandicap(board9, 9, 4);
    expect(Object.keys(next9.stones).length).toBe(4);
    expect(next9.turn).toBe('W');
  });

  it('throws a plain Error (not the refusal type) for an out-of-range N', () => {
    const board = createInitialBoard();
    expect(() => applyHandicap(board, 19, 1)).toThrow();
    expect(() => applyHandicap(board, 19, 1)).not.toThrow(HandicapOnStartedGameError);
  });
});

// ── 3. SGF round trip: AB[] + HA[n], reload keeps White to move ────────────

describe('applyHandicap — SGF round trip', () => {
  it('serializes AB[] and HA[n] on the root, and reload preserves both the stones and White-to-move', () => {
    const board = createInitialBoard();
    const handicapped = applyHandicap(board, 19, 4);

    const saved = serializeBoard(handicapped);
    expect(saved).toContain('HA[4]');
    expect(saved).toMatch(/AB(\[[a-z]{2}\]){4}/);
    expect(saved).toContain('PL[W]');

    const reloaded = load(saved);
    expect(reloaded.turn).toBe('W'); // getInitialPlayer reads PL[W] off the reloaded root
    expect(reloaded.nodes[reloaded.rootNodeId].properties.HA).toEqual(['4']);

    const points = handicapPoints(19, 4)!;
    for (const [x, y] of points) {
      expect(reloaded.stones[`${x},${y}`]).toBe('B');
    }
  });

  it('loading a hand-authored SGF with HA+AB (no PL) still round-trips the stones (PL absent → turn defaults to B, HA/AB are independent of PL)', () => {
    // Exercises the loader's generic property carry-through for an
    // SGF this codebase did not itself write (e.g. imported from
    // another client that didn't stamp PL) — HA/AB survive either way.
    const source = '(;FF[4]GM[1]SZ[9]HA[2]AB[cg][gc])';
    const board = load(source);

    expect(board.nodes[board.rootNodeId].properties.HA).toEqual(['2']);
    expect(board.stones['2,2']).toBe('B'); // 'cg' → col=2, row(SGF)=6 → y = 8-6 = 2
    expect(board.stones['6,6']).toBe('B'); // 'gc' → col=6, row(SGF)=2 → y = 8-2 = 6
    expect(board.turn).toBe('B'); // no PL in this hand-authored fixture
  });
});
