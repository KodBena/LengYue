/**
 * tests/unit/store/board-factory-komi.test.ts
 *
 * `createInitialBoard` (ledger row 1146): a fresh board authors
 * `RU: ['Tromp-Taylor']` at construction (commissioner adjudication,
 * `board-factory.ts`'s own header) — this test pins that its `KM` is
 * ALSO authored at construction, and lands inside Tromp-Taylor's
 * integer-only komi domain (`engine/katago/komi-calibration.ts`'s
 * `normalizeKomiForRuleset`), rather than being left absent to fall
 * through to `getKomi`'s bare 6.5 (half-integer) fallback.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { createInitialBoard } from '../../../src/store/board-factory';
import { getKomi, getRulesetResolution } from '../../../src/engine/util';

describe('createInitialBoard — Tromp-Taylor default komi is authored and integer (ledger row 1146)', () => {
  it('authors a KM property on the root node (not left absent)', () => {
    const board = createInitialBoard();
    const root = board.nodes[board.rootNodeId];
    expect(root?.properties['KM']).toBeDefined();
    expect(root?.properties['KM']?.[0]).not.toBe(undefined);
  });

  it('the authored komi is an integer, matching the board\'s own (Tromp-Taylor) ruleset', () => {
    const board = createInitialBoard();
    expect(getRulesetResolution(board)).toEqual({ name: 'Tromp-Taylor', source: 'ru' });
    const komi = getKomi(board);
    expect(Number.isInteger(komi)).toBe(true);
  });

  it('the authored komi is the conventional Tromp-Taylor value (7 — the round of the generic 6.5 default)', () => {
    const board = createInitialBoard();
    expect(getKomi(board)).toBe(7);
  });

  it('every fresh board (fresh call) gets an independent, equally-valid KM — not a shared mutable default', () => {
    const a = createInitialBoard();
    const b = createInitialBoard();
    expect(getKomi(a)).toBe(getKomi(b));
    expect(a.nodes[a.rootNodeId]).not.toBe(b.nodes[b.rootNodeId]);
  });
});
