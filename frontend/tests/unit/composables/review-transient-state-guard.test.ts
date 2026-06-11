/**
 * tests/unit/composables/review-transient-state-guard.test.ts
 *
 * Tier-1 unit tests for `isReviewTransientState`, the named guard
 * predicate shared by App.vue's `handleBoardMove` and `handlePastePv`
 * (ADR-0011 Rule 4 — the predicate quantifies over the class rather
 * than being inlined at each call site).
 *
 * The tests assert the gate's contract:
 *   - LOADING and ANALYZING → true (board-mutation blocked; these are
 *     transient SR states where a mutation would race the lifecycle).
 *   - IDLE, AWAITING_MOVE, FINISHED → false (board-mutation allowed
 *     at its respective entry points; paste is gated by the additional
 *     AWAITING_MOVE check in handlePastePv, but the transient gate
 *     is this function's sole responsibility).
 *
 * A false negative (returning false for LOADING/ANALYZING) would
 * regress the paste permissiveness asymmetry this PR fixed:
 * `handlePastePv` blocked only on AWAITING_MOVE and was therefore
 * more permissive than `handleBoardMove` during LOADING and ANALYZING
 * — paste could mutate the board while the SR lifecycle owned it.
 *
 * Item: review-paste-permissiveness-asymmetry.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { isReviewTransientState } from '../../../src/composables/review/useReviewSession';
import type { ReviewStatus } from '../../../src/types';

describe('isReviewTransientState', () => {
  // The two states where board interaction must be blocked —
  // LOADING positions the board from the card SGF, ANALYZING
  // reads the just-played position to compute the per-move grade.
  it('returns true for LOADING', () => {
    const status: ReviewStatus = 'LOADING';
    expect(isReviewTransientState(status)).toBe(true);
  });

  it('returns true for ANALYZING', () => {
    const status: ReviewStatus = 'ANALYZING';
    expect(isReviewTransientState(status)).toBe(true);
  });

  // States where board interaction is allowed (each entry point
  // adds its own per-state gate; this function only covers the
  // transient-block class).
  it('returns false for IDLE', () => {
    const status: ReviewStatus = 'IDLE';
    expect(isReviewTransientState(status)).toBe(false);
  });

  it('returns false for AWAITING_MOVE', () => {
    const status: ReviewStatus = 'AWAITING_MOVE';
    expect(isReviewTransientState(status)).toBe(false);
  });

  it('returns false for FINISHED', () => {
    const status: ReviewStatus = 'FINISHED';
    expect(isReviewTransientState(status)).toBe(false);
  });

  // Exhaustiveness guard: all five ReviewStatus members are
  // covered above. If ReviewStatus grows a new member, the
  // TypeScript compiler catches any non-union call sites; a
  // reviewer or the ADR-0011 Rule-4 predicate here sees whether
  // the new member belongs in the transient class.
});
