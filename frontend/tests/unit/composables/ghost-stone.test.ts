/**
 * tests/unit/composables/ghost-stone.test.ts
 * Tier 1 (pure logic): `computeGhostStone`'s visibility/color decision
 * for the ghost-stone hover preview (wiki2-ghost-stone; occupancy
 * amendment, ledger row 1635).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { computeGhostStone } from '../../../src/composables/board/ghost-stone';

// Shared occupancy predicates for the tests below. `alwaysEmpty` is the
// degenerate "nothing is occupied" view; the pre-amendment tests use it
// so they still pin behaviour that has nothing to do with occupancy.
const alwaysEmpty = () => false;

describe('computeGhostStone', () => {
  it('never renders when the toggle is off, even while hovering a valid point', () => {
    expect(computeGhostStone(false, 'B', { x: 3, y: 3 }, alwaysEmpty)).toBeNull();
    expect(computeGhostStone(false, 'W', { x: 0, y: 0 }, alwaysEmpty)).toBeNull();
  });

  it('renders nothing when there is no hover point, regardless of the toggle', () => {
    expect(computeGhostStone(true, 'B', null, alwaysEmpty)).toBeNull();
  });

  it('renders at an empty-but-illegal intersection exactly the same as a legal empty one — no legality gate exists', () => {
    // The function's signature takes no BoardState at all: there is
    // nothing for it to consult to know whether (3, 3) is a suicide
    // point or a ko point. `isOccupied` only answers occupancy — for
    // this point it says "empty" — so passing the same hoverPoint a
    // real illegal-but-empty placement would use and asserting a
    // result comes back is the honest way to pin "no affordance for
    // legality evaluation." The absence of a legality parameter is
    // the guarantee, not a coincidence of these particular
    // coordinates; occupancy (row 1635) is now a separate, narrower
    // gate covered below.
    const illegalButEmptyIntersection = { x: 3, y: 3 };
    const result = computeGhostStone(true, 'B', illegalButEmptyIntersection, alwaysEmpty);
    expect(result).toEqual({ x: 3, y: 3, color: 'B' });
  });

  it('does not render over an occupied intersection (row 1635 occupancy amendment)', () => {
    // The occupancy view answers only "is there a stone here" — no
    // legality reasoning is exercised in reaching `false`/`true` here
    // (the fixture is not derived from board rules, it's a fixed
    // predicate) — which is exactly the visibility-not-legality
    // distinction the header on `computeGhostStone` documents.
    const isOccupied = (p: { x: number; y: number }) => p.x === 3 && p.y === 3;
    expect(computeGhostStone(true, 'B', { x: 3, y: 3 }, isOccupied)).toBeNull();
    // A neighboring empty point is unaffected by the same predicate.
    expect(computeGhostStone(true, 'B', { x: 4, y: 3 }, isOccupied)).toEqual({
      x: 4, y: 3, color: 'B',
    });
  });

  it('color follows side-to-move, not a fixed color', () => {
    const hoverPoint = { x: 5, y: 7 };
    expect(computeGhostStone(true, 'B', hoverPoint, alwaysEmpty)).toEqual({ x: 5, y: 7, color: 'B' });
    expect(computeGhostStone(true, 'W', hoverPoint, alwaysEmpty)).toEqual({ x: 5, y: 7, color: 'W' });
  });
});
