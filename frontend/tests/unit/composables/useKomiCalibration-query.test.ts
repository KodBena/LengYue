/**
 * tests/unit/composables/useKomiCalibration-query.test.ts
 *
 * Tier-1 coverage for `buildCalibrationQuery`'s evalKomi round/clamp
 * fix (commissioner-directed audit, ledger row 1063): KataGo's
 * Analysis Engine accepts only integer-or-half-integer komi in
 * [-150, 150]. Before this fix, `evalKomi` was read straight off the
 * board's SGF `KM` property via a bare `parseFloat` with NO
 * validation, then placed VERBATIM on the evaluation query's `komi`
 * field sent to the engine — a hand-edited or third-party-authored
 * SGF can legally carry a non-half-integer (`KM[7.3]`) or
 * out-of-range (`KM[200]`) value. This file pins that `buildCalibrationQuery`
 * now rounds-to-half and clamps `evalKomi` BEFORE it reaches the wire
 * query, for both the query's own `komi` field and the reported
 * `evalKomi` value (the "single-source, same value the engine saw"
 * invariant the module header already claims — now true for a VALID
 * value).
 *
 * `buildCalibrationQuery` is otherwise a pure function of its
 * arguments (no I/O) — exported specifically so this suite doesn't
 * need to mock the connection-lifecycle plumbing
 * (`connectFresh`/`awaitFinalPacket`) the rest of `calibrate()` owns.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { buildCalibrationQuery } from '../../../src/composables/review/useKomiCalibration';
import { KOMI_MIN, KOMI_MAX } from '../../../src/engine/katago/komi-calibration';
import { createInitialBoard } from '../../../src/store/board-factory';
import type { BoardState } from '../../../src/types';

function boardWithKomi(km: string): BoardState {
  const board = createInitialBoard();
  const root = board.nodes[board.rootNodeId];
  root.properties = { ...root.properties, KM: [km] };
  return board;
}

describe('buildCalibrationQuery — evalKomi round/clamp fix (ledger row 1063)', () => {
  it('a legal half-integer, in-range komi passes through unchanged', () => {
    const board = boardWithKomi('6.5');
    const { query, evalKomi } = buildCalibrationQuery(board, 100, undefined);
    expect(evalKomi).toBe(6.5);
    expect(query.komi).toBe(6.5);
  });

  it('a legal integer, in-range komi passes through unchanged', () => {
    const board = boardWithKomi('7');
    const { query, evalKomi } = buildCalibrationQuery(board, 100, undefined);
    expect(evalKomi).toBe(7);
    expect(query.komi).toBe(7);
  });

  it('a non-half-integer komi (e.g. a hand-edited SGF) is rounded to the nearest half-integer before it reaches the wire', () => {
    const board = boardWithKomi('7.3');
    const { query, evalKomi } = buildCalibrationQuery(board, 100, undefined);
    expect(evalKomi).toBe(7.5);
    expect(query.komi).toBe(7.5);
  });

  it('an out-of-range komi is clamped to KOMI_MAX before it reaches the wire', () => {
    const board = boardWithKomi('999');
    const { query, evalKomi } = buildCalibrationQuery(board, 100, undefined);
    expect(evalKomi).toBe(KOMI_MAX);
    expect(query.komi).toBe(KOMI_MAX);
  });

  it('an out-of-range negative komi is clamped to KOMI_MIN before it reaches the wire', () => {
    const board = boardWithKomi('-999');
    const { query, evalKomi } = buildCalibrationQuery(board, 100, undefined);
    expect(evalKomi).toBe(KOMI_MIN);
    expect(query.komi).toBe(KOMI_MIN);
  });

  it('exactly at KOMI_MAX is a no-op clamp (boundary inclusive)', () => {
    const board = boardWithKomi(String(KOMI_MAX));
    const { evalKomi } = buildCalibrationQuery(board, 100, undefined);
    expect(evalKomi).toBe(KOMI_MAX);
  });

  it('a garbage (non-numeric) KM falls back to getKomi\'s own 6.5 default, still round/clamp-safe', () => {
    const board = boardWithKomi('not-a-number');
    const { evalKomi } = buildCalibrationQuery(board, 100, undefined);
    expect(evalKomi).toBe(6.5);
  });

  it('targetNodeId parametrizes the evaluated position (batch card-minting affordance, ledger row 1063) — defaults to board.currentNodeId when omitted', () => {
    const board = boardWithKomi('6.5');
    const viaDefault = buildCalibrationQuery(board, 100, undefined);
    const viaExplicit = buildCalibrationQuery(board, 100, undefined, board.currentNodeId);
    expect(viaExplicit.expectedTurn).toBe(viaDefault.expectedTurn);
    expect(viaExplicit.query.analyzeTurns).toEqual(viaDefault.query.analyzeTurns);
  });
});
