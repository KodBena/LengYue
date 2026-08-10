/**
 * tests/unit/composables/ghost-stone.test.ts
 * Tier 1 (pure logic): `computeGhostStone`'s visibility/color decision
 * for the ghost-stone hover preview (wiki2-ghost-stone).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { computeGhostStone } from '../../../src/composables/board/ghost-stone';

describe('computeGhostStone', () => {
  it('never renders when the toggle is off, even while hovering a valid point', () => {
    expect(computeGhostStone(false, 'B', { x: 3, y: 3 })).toBeNull();
    expect(computeGhostStone(false, 'W', { x: 0, y: 0 })).toBeNull();
  });

  it('renders nothing when there is no hover point, regardless of the toggle', () => {
    expect(computeGhostStone(true, 'B', null)).toBeNull();
  });

  it('renders at an occupied/illegal intersection exactly the same as an empty one — no legality or occupancy gate exists', () => {
    // The function's signature takes no BoardState at all: there is
    // nothing for it to consult to know whether (3, 3) is occupied,
    // a suicide point, or a ko point. Passing the same hoverPoint a
    // real illegal placement would use and asserting a result comes
    // back is the honest way to pin "no affordance for board
    // evaluation" — the absence of a legality parameter is the
    // guarantee, not a coincidence of these particular coordinates.
    const illegalIntersection = { x: 3, y: 3 };
    const result = computeGhostStone(true, 'B', illegalIntersection);
    expect(result).toEqual({ x: 3, y: 3, color: 'B' });
  });

  it('color follows side-to-move, not a fixed color', () => {
    const hoverPoint = { x: 5, y: 7 };
    expect(computeGhostStone(true, 'B', hoverPoint)).toEqual({ x: 5, y: 7, color: 'B' });
    expect(computeGhostStone(true, 'W', hoverPoint)).toEqual({ x: 5, y: 7, color: 'W' });
  });
});
