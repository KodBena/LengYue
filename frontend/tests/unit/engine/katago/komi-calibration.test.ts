/**
 * tests/unit/engine/katago/komi-calibration.test.ts
 *
 * Tier-1 (pure-logic) tests for the mint-time komi-calibration
 * arithmetic (`src/engine/katago/komi-calibration.ts`). The
 * load-bearing decisions — the WHITE/BLACK/SIDETOMOVE → Black-positive
 * normalisation, the `evalKomi + lead` direction, the round-to-half,
 * and the [-150, 150] clamp — are exactly the kind of sign-and-rounding
 * arithmetic the strict typecheck cannot police, so they are pinned
 * here.
 *
 * No DOM, no fakes, no Vue reactivity.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  computeEvenKomi,
  scoreLeadToBlackPositive,
  roundToHalf,
  clampKomi,
  KOMI_MIN,
  KOMI_MAX,
} from '../../../../src/engine/katago/komi-calibration';

const WHITE = { reportAnalysisWinratesAs: 'WHITE' };
const BLACK = { reportAnalysisWinratesAs: 'BLACK' };
const SIDETOMOVE = { reportAnalysisWinratesAs: 'SIDETOMOVE' };

describe('scoreLeadToBlackPositive — framing normalisation', () => {
  it('BLACK framing is already Black-positive (pass-through)', () => {
    expect(scoreLeadToBlackPositive(5, BLACK, 'B')).toBe(5);
    expect(scoreLeadToBlackPositive(-3, BLACK, 'W')).toBe(-3);
  });

  it('WHITE framing is White-positive — negate to Black-positive', () => {
    // +scoreLead under WHITE = White ahead ⇒ Black behind ⇒ -5 Black-positive.
    expect(scoreLeadToBlackPositive(5, WHITE, 'B')).toBe(-5);
    expect(scoreLeadToBlackPositive(-3, WHITE, 'W')).toBe(3);
  });

  it('SIDETOMOVE framing: positive favours the side to move', () => {
    // Black to move, +lead ⇒ Black ahead ⇒ Black-positive unchanged.
    expect(scoreLeadToBlackPositive(4, SIDETOMOVE, 'B')).toBe(4);
    // White to move, +lead ⇒ White ahead ⇒ negate.
    expect(scoreLeadToBlackPositive(4, SIDETOMOVE, 'W')).toBe(-4);
  });

  it('undefined overrides resolve to SIDETOMOVE (KataGo default)', () => {
    expect(scoreLeadToBlackPositive(2, undefined, 'B')).toBe(2);
    expect(scoreLeadToBlackPositive(2, undefined, 'W')).toBe(-2);
  });
});

describe('roundToHalf', () => {
  it('rounds to the nearest 0.5', () => {
    expect(roundToHalf(6.2)).toBe(6);
    expect(roundToHalf(6.3)).toBe(6.5);
    expect(roundToHalf(6.7)).toBe(6.5);
    expect(roundToHalf(6.8)).toBe(7);
    expect(roundToHalf(-6.3)).toBe(-6.5);
  });

  it('passes integers and half-integers through unchanged', () => {
    expect(roundToHalf(7)).toBe(7);
    expect(roundToHalf(6.5)).toBe(6.5);
    expect(roundToHalf(-7.5)).toBe(-7.5);
  });

  it('rounds quarter-ties up via Math.round half-up', () => {
    // x.25 → x.5 boundary: 6.25*2 = 12.5 → Math.round 13 → 6.5
    expect(roundToHalf(6.25)).toBe(6.5);
    // x.75 → (x+1) boundary: 6.75*2 = 13.5 → Math.round 14 → 7
    expect(roundToHalf(6.75)).toBe(7);
    // negative tie: -6.25*2 = -12.5 → Math.round -12 (half-up toward +∞) → -6
    expect(roundToHalf(-6.25)).toBe(-6);
  });
});

describe('clampKomi', () => {
  it('passes values within range', () => {
    expect(clampKomi(6.5)).toBe(6.5);
    expect(clampKomi(KOMI_MIN)).toBe(KOMI_MIN);
    expect(clampKomi(KOMI_MAX)).toBe(KOMI_MAX);
  });

  it('clamps below KOMI_MIN and above KOMI_MAX', () => {
    expect(clampKomi(-200)).toBe(KOMI_MIN);
    expect(clampKomi(200)).toBe(KOMI_MAX);
  });
});

describe('computeEvenKomi — direction (Black ahead ⇒ raise komi)', () => {
  it('WHITE framing: White ahead by 5 under komi 6.5 ⇒ lower komi to 1.5', () => {
    // WHITE +5 = White ahead 5 ⇒ Black-positive -5 ⇒ even = 6.5 + (-5) = 1.5.
    const r = computeEvenKomi({
      evalKomi: 6.5,
      scoreLead: 5,
      overrideSettings: WHITE,
      currentPlayer: 'B',
    });
    expect(r.scoreLeadBlackPositive).toBe(-5);
    expect(r.rawEvenKomi).toBe(1.5);
    expect(r.evenKomi).toBe(1.5);
    expect(r.clamped).toBe(false);
  });

  it('WHITE framing: Black ahead by 4 under komi 6.5 ⇒ raise komi to 10.5', () => {
    // WHITE -4 = White behind 4 = Black ahead 4 ⇒ Black-positive +4 ⇒ even = 6.5 + 4 = 10.5.
    const r = computeEvenKomi({
      evalKomi: 6.5,
      scoreLead: -4,
      overrideSettings: WHITE,
      currentPlayer: 'B',
    });
    expect(r.scoreLeadBlackPositive).toBe(4);
    expect(r.evenKomi).toBe(10.5);
    expect(r.clamped).toBe(false);
  });

  it('BLACK framing: Black ahead by 3 under komi 7 ⇒ raise komi to 10', () => {
    const r = computeEvenKomi({
      evalKomi: 7,
      scoreLead: 3,
      overrideSettings: BLACK,
      currentPlayer: 'W',
    });
    expect(r.scoreLeadBlackPositive).toBe(3);
    expect(r.evenKomi).toBe(10);
  });

  it('SIDETOMOVE framing: White to move, +2 lead ⇒ White ahead ⇒ lower komi', () => {
    // SIDETOMOVE +2 with White to move ⇒ Black-positive -2 ⇒ even = 6.5 - 2 = 4.5.
    const r = computeEvenKomi({
      evalKomi: 6.5,
      scoreLead: 2,
      overrideSettings: SIDETOMOVE,
      currentPlayer: 'W',
    });
    expect(r.scoreLeadBlackPositive).toBe(-2);
    expect(r.evenKomi).toBe(4.5);
  });
});

describe('computeEvenKomi — rounding', () => {
  it('rounds a fractional even komi to the nearest 0.5', () => {
    // 6.5 + 0.7 (Black-positive, BLACK framing) = 7.2 ⇒ round → 7.
    const r = computeEvenKomi({
      evalKomi: 6.5,
      scoreLead: 0.7,
      overrideSettings: BLACK,
      currentPlayer: 'B',
    });
    expect(r.rawEvenKomi).toBeCloseTo(7.2, 10);
    expect(r.evenKomi).toBe(7);
    expect(r.clamped).toBe(false);
  });

  it('rounds a tie toward the upper half', () => {
    // 6.5 + 0.75 = 7.25 ⇒ round-to-half tie → 7.5.
    const r = computeEvenKomi({
      evalKomi: 6.5,
      scoreLead: 0.75,
      overrideSettings: BLACK,
      currentPlayer: 'B',
    });
    expect(r.evenKomi).toBe(7.5);
  });
});

describe('computeEvenKomi — clamping at both ends', () => {
  it('clamps a huge Black lead to KOMI_MAX and flags it', () => {
    const r = computeEvenKomi({
      evalKomi: 7,
      scoreLead: 500,
      overrideSettings: BLACK,
      currentPlayer: 'B',
    });
    expect(r.rawEvenKomi).toBe(507);
    expect(r.evenKomi).toBe(KOMI_MAX);
    expect(r.clamped).toBe(true);
  });

  it('clamps a huge White lead to KOMI_MIN and flags it', () => {
    // WHITE +500 = White ahead 500 ⇒ Black-positive -500 ⇒ even = 7 - 500 = -493.
    const r = computeEvenKomi({
      evalKomi: 7,
      scoreLead: 500,
      overrideSettings: WHITE,
      currentPlayer: 'B',
    });
    expect(r.scoreLeadBlackPositive).toBe(-500);
    expect(r.rawEvenKomi).toBe(-493);
    expect(r.evenKomi).toBe(KOMI_MIN);
    expect(r.clamped).toBe(true);
  });

  it('does NOT flag clamped when the rounded value lands exactly on an endpoint', () => {
    // even = 7 + 143 = 150 = KOMI_MAX exactly; clamp is a no-op, not a clamp.
    const r = computeEvenKomi({
      evalKomi: 7,
      scoreLead: 143,
      overrideSettings: BLACK,
      currentPlayer: 'B',
    });
    expect(r.evenKomi).toBe(KOMI_MAX);
    expect(r.clamped).toBe(false);
  });
});
