/**
 * tests/unit/engine/rules.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/engine/rules.ts::validateMove`.
 *
 * `applyGoMove` — exercised by `tests/unit/logic.test.ts` — is built
 * on top of `validateMove`; the integration-shaped tests over there
 * assert the BoardState-shape mutation while these tests pin the
 * raw rules-engine output (the `MoveResult` discriminated record)
 * directly. Direct tests catch a class of edge case the integration
 * shape can hide — for example, a capture-vs-suicide adjudication
 * is invisible at the `applyGoMove` boundary because the wrapper
 * either accepts the move or returns null, but the underlying
 * `validateMove` distinguishes "rejected because suicide" from
 * "accepted with captures and no suicide" in its `reason` field.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { validateMove } from '../../../src/engine/rules';
import type { StoneColor } from '../../../src/types';

const SIZE = 19;

/**
 * Convenience: build a stones map from a list of `[x, y, color]`
 * tuples. Tests stay readable as small fixture lists rather than
 * keyed-object literals with their own coordinate-stringification
 * boilerplate.
 */
function stones(...placements: Array<[number, number, StoneColor]>): Record<string, StoneColor> {
  const out: Record<string, StoneColor> = {};
  for (const [x, y, c] of placements) out[`${x},${y}`] = c;
  return out;
}

describe('validateMove — placement', () => {
  it('accepts an empty point on an empty board', () => {
    const result = validateMove({}, null, 'B', 3, 3, SIZE);
    expect(result.ok).toBe(true);
    expect(result.captures).toEqual([]);
    expect(result.newKoPoint).toBeNull();
  });

  it('rejects placement on an occupied point with reason="occupied"', () => {
    const map = stones([3, 3, 'B']);
    const result = validateMove(map, null, 'W', 3, 3, SIZE);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('occupied');
  });

  it('rejects placement on the active ko point with reason="ko"', () => {
    const result = validateMove({}, { x: 4, y: 3 }, 'W', 4, 3, SIZE);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('ko');
  });

  it('allows placement on a previously-set ko point that is no longer the active ko', () => {
    // A ko point on a different (x,y) is irrelevant — the engine
    // only blocks the exact (x,y) of the active koPoint.
    const result = validateMove({}, { x: 0, y: 0 }, 'W', 4, 3, SIZE);
    expect(result.ok).toBe(true);
  });
});

describe('validateMove — capture', () => {
  it('captures an enemy single-stone chain with no liberties', () => {
    // White stone at (0,0) with B at (1,0); the placed B at (0,1)
    // captures the W stone (which had only (0,1) as a liberty).
    const map = stones([0, 0, 'W'], [1, 0, 'B']);
    const result = validateMove(map, null, 'B', 0, 1, SIZE);
    expect(result.ok).toBe(true);
    expect(result.captures).toEqual(['0,0']);
  });

  it('captures a multi-stone enemy chain when the placement removes its last liberty', () => {
    // W stones at (0,0), (1,0), (2,0); B walls them in.
    // Existing B stones: (3,0), (0,1), (1,1), (2,1). The placed B at
    // (3,0) is unnecessary; instead place the killer at e.g. (2,0)?
    // Wait — we need the chain to have exactly one liberty before
    // the kill move. Let me lay it out:
    //
    //   . . . W .
    //   B B B . B
    //
    // Wait, easier: a 2-stone W chain at (0,0)+(1,0) with all
    // surrounding cells = B. The 2-stone chain has liberties at
    // (0,1), (1,1), (2,0). Make all three filled with B except
    // (2,0); then B plays (2,0).
    const map = stones(
      [0, 0, 'W'], [1, 0, 'W'],            // W chain
      [0, 1, 'B'], [1, 1, 'B'], [2, 1, 'B'], // B wall above
    );
    // Before the kill, W's liberties are (2,0). B plays (2,0).
    const result = validateMove(map, null, 'B', 2, 0, SIZE);
    expect(result.ok).toBe(true);
    expect(new Set(result.captures)).toEqual(new Set(['0,0', '1,0']));
  });

  it('does not generate a koPoint on a multi-stone capture', () => {
    // Same fixture as above. The koPoint heuristic is "single stone
    // captured by a single placement" — multi-stone captures don't
    // qualify.
    const map = stones(
      [0, 0, 'W'], [1, 0, 'W'],
      [0, 1, 'B'], [1, 1, 'B'], [2, 1, 'B'],
    );
    const result = validateMove(map, null, 'B', 2, 0, SIZE);
    expect(result.newKoPoint).toBeNull();
  });

  it('sets koPoint when a single stone captures exactly one stone', () => {
    // 1-stone B captures 1 stone of W, with B itself a single isolated
    // stone after placement. Standard ko shape:
    //
    //   . W . W .
    //   W . W . W
    //   . W X W .   (X = the placement; it captures the W stone at
    //   . . . . .   (col left-of-X). Symmetric ring shape.
    //
    // Concrete coords: W at (4,3), neighbours W: (3,2), (5,3); but for
    // the W stone at (4,3) to die when B(5,3) plays, we'd also need
    // (3,3) and (4,4) and (4,2) blocked.
    //
    // Smaller fixture: corner ko.
    //
    //   . W .
    //   W X .   X = the new B stone at (1,1); captures W at (0,1)
    //   B B .   if W at (0,1) has only (1,1) as a liberty.
    //
    // Pre-state: W at (0,1), (1,2); B at (1,0), (0,2)? Let me think
    // again. To capture a W stone at (0,1) with a single B placement,
    // (0,1) must already have all-but-one neighbours filled. (0,1)'s
    // neighbours are (0,0), (1,1), (0,2). So fill (0,0)=B, (0,2)=B,
    // and the kill move is (1,1)=B. The captured W at (0,1) has 0
    // liberties post-kill.
    //
    // Now is the placed B at (1,1) "single-stone"? Its neighbours after
    // capture: (0,1)=empty (just captured), (2,1)=empty, (1,0)=empty,
    // (1,2)=empty. So yes, B(1,1) is single-stone. Ko point should be
    // at (0,1) — the captured square.
    const map = stones(
      [0, 1, 'W'],
      [0, 0, 'B'], [0, 2, 'B'],
    );
    const result = validateMove(map, null, 'B', 1, 1, SIZE);
    expect(result.ok).toBe(true);
    expect(result.captures).toEqual(['0,1']);
    expect(result.newKoPoint).toEqual({ x: 0, y: 1 });
  });
});

describe('validateMove — suicide', () => {
  it('rejects suicide on an empty point fully surrounded by enemy stones', () => {
    // (0,0) is empty; (1,0) and (0,1) are W. B plays (0,0): its only
    // neighbours are W, no captures generated, so the placed B
    // chain has 0 liberties → suicide.
    const map = stones([1, 0, 'W'], [0, 1, 'W']);
    const result = validateMove(map, null, 'B', 0, 0, SIZE);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('suicide');
  });

  it('allows a "suicide" placement that captures the surrounding chain (not actually suicide)', () => {
    // W stones at (1,0), (0,1) — but this time, those W stones
    // themselves have only the empty (0,0) as a liberty (because
    // we wall them with B everywhere else).
    //
    //   W B  (at (0,1)=W, (1,1)=B)
    //   B    (at (0,0)=empty, (1,0)=W, (2,0)=B, (0,2)=B)
    //
    // Layout:
    //   y=2:  B . .
    //   y=1:  W B .
    //   y=0:  . W B
    //
    // The two W stones (1,0) and (0,1) are NOT a single chain (they
    // aren't adjacent). They're two separate single-stone chains. B
    // plays at (0,0): each W stone now has 0 liberties (each had
    // only (0,0) as its liberty). Both die. The placed B then has
    // liberties at (1,0) and (0,1) (just-captured squares).
    const map = stones(
      [1, 0, 'W'], [2, 0, 'B'],
      [0, 1, 'W'], [1, 1, 'B'],
      [0, 2, 'B'],
    );
    const result = validateMove(map, null, 'B', 0, 0, SIZE);
    expect(result.ok).toBe(true);
    expect(new Set(result.captures)).toEqual(new Set(['1,0', '0,1']));
  });
});
