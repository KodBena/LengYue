/**
 * src/engine/handicap.ts
 *
 * Handicap-stone placement tables and the pure apply primitive
 * (wiki Mechanics #4, "No handicap setup support"). A handicap IS root
 * setup stones — this module computes the canonical point set for a
 * board size + stone count and applies it through the setup toolkit's
 * existing `applySetup` substrate (`src/logic.ts`), never a parallel
 * stone-placement mechanism.
 *
 * ─── Placement convention ────────────────────────────────────────────
 * The star-point (hoshi) tables and the progressive N→points mapping
 * below follow the widely-used Go-software convention (GNU Go's
 * `handicap.c` placement table; reproduced identically by Sabaki,
 * q5go, and most SGF handicap generators — ADR-0019, genre convention
 * is the default spec):
 *
 *   N=2   → two corner hoshi (diagonal)
 *   N=3   → +1 more corner hoshi
 *   N=4   → all 4 corner hoshi
 *   N=5   → 4 corners + tengen (center)
 *   N=6   → 4 corners + left/right edge hoshi (no tengen)
 *   N=7   → N=6 + tengen
 *   N=8   → 4 corners + all 4 edge hoshi (no tengen)
 *   N=9   → all 8 non-center hoshi + tengen
 *
 * The board has full 4-fold symmetry, so WHICH physical corner is
 * "first" is not a Go-rules fact — different software picks different
 * starting corners. This table picks one fixed, internally-consistent
 * order (top-left, bottom-right, top-right, bottom-left) and uses it
 * everywhere (placement, tests, SGF round-trip); it is not claimed to
 * byte-for-byte match any one external generator's corner ORDER, only
 * the canonical STRUCTURE above, which is universal.
 *
 * `(x, y)` here matches this codebase's internal point convention
 * (same as `applySetup`'s parameters): 0-indexed, y=0 is the SGF
 * bottom row (see `applySetup`'s `size - 1 - y` encoding in
 * `src/logic.ts`).
 *
 * Board-size scope: 19×19 supports the full N=2..9 range (the
 * standard range). 13×13 and 9×9 have no widely-agreed convention past
 * "corners, then center" — this module caps 13×13 at N=5 (4 corners +
 * tengen) and 9×9 at N=4 (4 corners only), matching the common
 * software default (Sabaki / q5go both cap smaller-board handicap
 * selection well short of 9). A board of any other size has no
 * handicap table at all — `handicapPoints` returns `null`, and the UI
 * (`useHandicap.ts`) disables the affordance rather than guessing.
 *
 * License: Public Domain (The Unlicense)
 */

import { applySetup } from '../logic';
import { sgfToMove, getRulesetResolution } from './util';
import { handicapKomiForRuleset } from './katago/komi-calibration';
import type { BoardState } from '../types';

export type HandicapBoardSize = 19 | 13 | 9;

/** Every board size this module has a handicap table for. */
export const HANDICAP_BOARD_SIZES: readonly HandicapBoardSize[] = [19, 13, 9];

interface HandicapTable {
  /** Fixed placement order for the 4 corner hoshi (used incrementally for N=2,3,4). */
  readonly corners: readonly [number, number][];
  /** The 4 edge hoshi, in [left, right, bottom, top] order — left/right used first (N=6), bottom/top added at N=8. Empty when the board has no edge hoshi in scope (13×13, 9×9). */
  readonly edges: readonly [number, number][];
  readonly center: [number, number];
  /** Highest N this board size supports (this module's documented, not FF[4]-mandated, cap). */
  readonly maxN: number;
}

const HANDICAP_TABLES: Readonly<Record<HandicapBoardSize, HandicapTable>> = {
  19: {
    corners: [[3, 15], [15, 3], [15, 15], [3, 3]],
    edges: [[3, 9], [15, 9], [9, 3], [9, 15]],
    center: [9, 9],
    maxN: 9,
  },
  13: {
    corners: [[3, 9], [9, 3], [9, 9], [3, 3]],
    edges: [],
    center: [6, 6],
    maxN: 5,
  },
  9: {
    corners: [[2, 6], [6, 2], [6, 6], [2, 2]],
    edges: [],
    center: [4, 4],
    maxN: 4,
  },
};

/** True iff `size` is one of the sizes this module has a handicap table for. */
export function isHandicapBoardSize(size: number): size is HandicapBoardSize {
  // Widening cast, not a coercion: `Array<T>.includes` is typed to accept
  // only `T`, but the whole point of this guard is to test an arbitrary
  // `number` (which may not be a `HandicapBoardSize`) for membership — the
  // cast only relaxes the SEARCH argument's type, it does not touch the
  // array's actual (branded-literal) runtime values.
  return (HANDICAP_BOARD_SIZES as readonly number[]).includes(size);
}

/** The valid handicap counts (inclusive, always starting at 2) for a given board size. `[]` for an unsupported size. */
export function validHandicapCounts(size: number): number[] {
  if (!isHandicapBoardSize(size)) return [];
  const { maxN } = HANDICAP_TABLES[size];
  return Array.from({ length: maxN - 1 }, (_, i) => i + 2);
}

/**
 * Computes the canonical handicap point set for `size` and `n`
 * stones, per the module-header convention. Returns `null` — not an
 * empty array, which would be a silent "no stones" — when `size` has
 * no handicap table or `n` is out of that table's supported range; the
 * caller (`useHandicap.ts`) surfaces that as a disabled/refused
 * affordance rather than placing a wrong or partial set (ADR-0002).
 */
export function handicapPoints(size: number, n: number): readonly [number, number][] | null {
  if (!isHandicapBoardSize(size)) return null;
  const table = HANDICAP_TABLES[size];
  if (!Number.isInteger(n) || n < 2 || n > table.maxN) return null;

  const [c0, c1, c2, c3] = table.corners;
  const [eLeft, eRight, eBottom, eTop] = table.edges;
  const center = table.center;

  switch (n) {
    case 2: return [c0, c1];
    case 3: return [c0, c1, c2];
    case 4: return [c0, c1, c2, c3];
    case 5: return [c0, c1, c2, c3, center];
    case 6: return [c0, c1, c2, c3, eLeft, eRight];
    case 7: return [c0, c1, c2, c3, eLeft, eRight, center];
    case 8: return [c0, c1, c2, c3, eLeft, eRight, eBottom, eTop];
    case 9: return [c0, c1, c2, c3, eLeft, eRight, eBottom, eTop, center];
    default: return null; // unreachable given the maxN guard above; fail-loud rather than fall through
  }
}

/**
 * The standard handicap-game komi under the three half-integer-domain
 * rulesets (AGA, Chinese, Japanese) — just enough to rule out a drawn
 * game, the de facto convention nearly every Go client defaults a
 * handicap game to. This is no longer the uniform value every ruleset
 * seeds: `applyHandicap` below draws the actual per-board default from
 * `handicapKomiForRuleset` (`engine/katago/komi-calibration.ts`),
 * whose declared domain table gives Tromp-Taylor its own member (`0`,
 * per Tromp-Taylor's integer-only komi domain) rather than this
 * uniform 0.5 (commissioner ruling, ledger rows 1339/1340). Retained
 * as a named export — the half-integer-domain rulesets' value, and the
 * literal `komiDomainStep`/`handicapKomiForRuleset`'s table already
 * resolves to for them — for callers and tests that want that specific
 * constant without threading a ruleset through. Komi stays
 * user-editable after handicap application — this is only the seeded
 * default (same status as `createInitialBoard`'s own un-set-komi
 * default, `getKomi`'s 6.5 fallback in `engine/util.ts`).
 */
export const HANDICAP_KOMI = 0.5;

/**
 * Thrown when `applyHandicap` is called against a board that has
 * already progressed past the root (a move — or any other child node
 * — exists). Handicap is a root-only, pre-game setup operation; a
 * board with game-tree children has already started, and silently
 * rewriting the root's setup stones under an in-progress game would
 * desync the tree from the stones actually played (ADR-0002: refuse
 * loudly, not destructively). `useHandicap.ts` catches this and
 * surfaces it as a system message rather than letting it propagate as
 * an unhandled exception.
 */
export class HandicapOnStartedGameError extends Error {
  constructor() {
    super('applyHandicap: refused — the root node already has game-tree children (a move has been played)');
    this.name = 'HandicapOnStartedGameError';
  }
}

/**
 * Applies an N-stone handicap to `board`'s ROOT node: places the
 * canonical Black setup stones for `size`/`n` (via `applySetup`, the
 * one substrate that writes AB — no parallel placement mechanism),
 * sets White to move first (`state.turn` for the live session, `PL[W]`
 * on the root for SGF round-trip), records `HA[n]` (the standard SGF
 * handicap-count property), and seeds the handicap-convention komi for
 * `board`'s OWN ruleset (`handicapKomiForRuleset`, read off the root's
 * `RU` property via `getRulesetResolution` — same read `board`'s own
 * komi-domain normalization already uses) unless the root already
 * carries an explicit `KM` the caller placed some other way (defensive;
 * in practice this is always called against a fresh/empty root). `RU`
 * itself is never touched by this function, so reading it before the
 * root rewrite below is safe — the same "a file's literal data is not
 * rewritten by a read" posture `komi-calibration.ts`'s header
 * documents for `normalizeRuleset`.
 *
 * Pure — like `applySetup`/`applyGoMove`, returns a new `BoardState`
 * rather than mutating in place. Callers already updating
 * `store.boards` through `updateBoardState` (the setup toolkit's own
 * substrate, `useSetupTools.ts`) reuse the same channel — see
 * `useHandicap.ts`.
 *
 * Re-selection: calling this again on a still-untouched root (no
 * children yet — see the guard below) fully REPLACES the root's `AB`
 * set with the new N's canonical points, rather than toggling on top
 * of the previous selection — "pick handicap N" is a set operation,
 * not an additive click sequence, so changing your mind from 9 to 2
 * stones before the first move must not leave the extra 7 stranded.
 *
 * @throws HandicapOnStartedGameError if the root already has children.
 */
export function applyHandicap(board: BoardState, size: number, n: number): BoardState {
  const rootNode = board.nodes[board.rootNodeId];
  if (rootNode.children.length > 0) {
    throw new HandicapOnStartedGameError();
  }

  const points = handicapPoints(size, n);
  if (!points) {
    throw new Error(`applyHandicap: no handicap table for size=${size}, n=${n}`);
  }

  // Start from a root with any PRIOR handicap AB stones cleared — see
  // the re-selection note above. A directly-constructed clean root
  // (rather than N applySetup(...,null) calls) avoids applySetup's
  // erase branch, which would additionally stamp `AE[...]` entries
  // onto a root that has never had a move (semantically pointless
  // there — AE means "a stone WAS here and is now erased", untrue of
  // a root nobody has played on yet). Only `AB` is cleared; a
  // manually-placed `AW`/`TR` from the setup toolkit survives a
  // handicap re-pick — neither is part of what "handicap" means — so
  // the matching `stones` entries are removed by COORDINATE (decoding
  // the prior `AB` list), not by a blanket rebuild that would also
  // drop an unrelated hand-placed white stone.
  const priorAB = rootNode.properties.AB ?? [];
  const clearedProperties = { ...rootNode.properties };
  delete clearedProperties.AB;
  const clearedStones = { ...board.stones };
  for (const sgfCoord of priorAB) {
    const move = sgfToMove(sgfCoord, 'B', size);
    if (move.type === 'place') delete clearedStones[`${move.x},${move.y}`];
  }

  let working: BoardState = {
    ...board,
    nodes: { ...board.nodes, [board.rootNodeId]: { ...rootNode, properties: clearedProperties } },
    stones: clearedStones,
  };

  for (const [x, y] of points) {
    working = applySetup(working, x, y, 'B');
  }

  const rootProps = { ...working.nodes[working.rootNodeId].properties };
  rootProps.HA = [String(n)];
  rootProps.PL = ['W'];
  if (!rootProps.KM) {
    const ruleset = getRulesetResolution(board).name;
    rootProps.KM = [String(handicapKomiForRuleset(ruleset))];
  }

  return {
    ...working,
    turn: 'W',
    nodes: {
      ...working.nodes,
      [working.rootNodeId]: { ...working.nodes[working.rootNodeId], properties: rootProps },
    },
  };
}
