/**
 * tests/unit/engine/sgf-writer-komi.test.ts
 *
 * Tier-1 (pure-logic) tests for `setSgfRootKomi`
 * (`src/engine/sgf-writer.ts`) — the SGF `KM`-rewrite used by mint-time
 * komi calibration to write the even-game komi onto a card's already-
 * serialized `raw_content`. The string-surgery (replace-in-place vs.
 * insert-at-head, bracket-aware root-block scan, malformed-input throw)
 * is exactly the kind of total-function arithmetic the typecheck cannot
 * police.
 *
 * No DOM, no fakes, no Vue reactivity.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { setSgfRootKomi, serializeActivePath } from '../../../src/engine/sgf-writer';
import { createInitialBoard } from '../../../src/store/board-factory';
import { applyGoMove } from '../../../src/logic';

describe('setSgfRootKomi — replace existing KM', () => {
  it('replaces a half-integer KM value', () => {
    const sgf = '(;SZ[19]KM[6.5]GM[1];B[pd];W[dp])';
    expect(setSgfRootKomi(sgf, 10.5)).toBe('(;SZ[19]KM[10.5]GM[1];B[pd];W[dp])');
  });

  it('replaces an integer KM value', () => {
    const sgf = '(;KM[7]SZ[19])';
    expect(setSgfRootKomi(sgf, 0.5)).toBe('(;KM[0.5]SZ[19])');
  });

  it('replaces a negative KM value', () => {
    const sgf = '(;SZ[19]KM[-3.5])';
    expect(setSgfRootKomi(sgf, 2)).toBe('(;SZ[19]KM[2])');
  });

  it('only touches the ROOT KM, not a same-named property on a later node', () => {
    // KM is a root-only property in practice, but the root-block scan
    // must stop at the first node boundary regardless.
    const sgf = '(;SZ[19]KM[6.5];B[pd]C[KM[99] in a comment])';
    const out = setSgfRootKomi(sgf, 8);
    expect(out).toBe('(;SZ[19]KM[8];B[pd]C[KM[99] in a comment])');
  });
});

describe('setSgfRootKomi — insert when KM absent', () => {
  it('inserts KM at the head of the root block when absent', () => {
    const sgf = '(;SZ[19]GM[1]FF[4];B[pd])';
    expect(setSgfRootKomi(sgf, 6.5)).toBe('(;KM[6.5]SZ[19]GM[1]FF[4];B[pd])');
  });

  it('inserts KM on a root-only (single-node) SGF', () => {
    const sgf = '(;SZ[9])';
    expect(setSgfRootKomi(sgf, 7)).toBe('(;KM[7]SZ[9])');
  });

  it('does not confuse a later node KM[...] for a root one when inserting', () => {
    // No KM on the root; a `KM`-looking substring sits past the first
    // node boundary, so insertion (not replace) is the correct branch.
    const sgf = '(;SZ[19];B[pd]C[komi was KM])';
    expect(setSgfRootKomi(sgf, 6.5)).toBe('(;KM[6.5]SZ[19];B[pd]C[komi was KM])');
  });
});

describe('setSgfRootKomi — malformed input fails loud (ADR-0002)', () => {
  it('throws on input without a leading "(;"', () => {
    expect(() => setSgfRootKomi('SZ[19]KM[6.5]', 7)).toThrow(/well-formed SGF/);
    expect(() => setSgfRootKomi('', 7)).toThrow(/well-formed SGF/);
    expect(() => setSgfRootKomi('()', 7)).toThrow(/well-formed SGF/);
  });
});

describe('setSgfRootKomi — round-trip through serializeActivePath', () => {
  it('rewrites the komi of a real minted (root→current) SGF', () => {
    // A fresh board carries no KM (board-factory roots are {SZ, GM, FF}).
    let board = createInitialBoard();
    const moved = applyGoMove(board, 3, 3);
    expect(moved).not.toBeNull();
    board = moved!;

    const sgf = serializeActivePath(board);
    expect(sgf).not.toContain('KM[');

    const calibrated = setSgfRootKomi(sgf, 10.5);
    expect(calibrated).toContain('KM[10.5]');
    // The move played is preserved (root→current path intact).
    expect(calibrated).toMatch(/;B\[/);
  });
});
