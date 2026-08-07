/**
 * tests/unit/match-player-overrides.test.ts
 *
 * Tier-1 tests for `src/state/match-player-overrides.ts` — the
 * per-MATCH-PLAYER session-ephemeral JSON override (ledger rows
 * 593/594). Covers per-player parse/validate-never-half-apply, and
 * that setting/resetting one player's slot never touches the other's
 * — the state-module half of the "B query never picks up W's
 * overrides" acceptance case (the routing half is pinned in
 * `tests/unit/engine/katago/query-routing.test.ts`).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  matchPlayerOverridesText,
  matchPlayerOverridesError,
  activeMatchPlayerOverrides,
  setMatchPlayerOverridesText,
  resetMatchPlayerOverrides,
  _resetMatchPlayerOverridesForTesting,
} from '../../src/state/match-player-overrides';
import { EMPTY_PER_QUERY_OVERRIDES } from '../../src/state/per-query-overrides';

beforeEach(() => {
  _resetMatchPlayerOverridesForTesting();
});

describe('match-player-overrides — per-player isolation', () => {
  it('both players start empty: identity overrides, no error', () => {
    for (const player of ['B', 'W'] as const) {
      expect(matchPlayerOverridesText(player)).toBe('');
      expect(activeMatchPlayerOverrides(player)).toEqual(EMPTY_PER_QUERY_OVERRIDES);
      expect(matchPlayerOverridesError(player)).toBeNull();
    }
  });

  it('setting B does not affect W (and vice versa)', () => {
    setMatchPlayerOverridesText('B', '{"playoutDoublingAdvantage": 1.5}');
    expect(activeMatchPlayerOverrides('B')).toEqual({ playoutDoublingAdvantage: 1.5 });
    expect(activeMatchPlayerOverrides('W')).toEqual(EMPTY_PER_QUERY_OVERRIDES);
    expect(matchPlayerOverridesText('W')).toBe('');

    setMatchPlayerOverridesText('W', '{"wideRootNoise": 0.05}');
    expect(activeMatchPlayerOverrides('B')).toEqual({ playoutDoublingAdvantage: 1.5 });
    expect(activeMatchPlayerOverrides('W')).toEqual({ wideRootNoise: 0.05 });
  });

  it('both players can carry different, independently-valid override sets simultaneously', () => {
    setMatchPlayerOverridesText('B', '{"playoutDoublingAdvantage": 1.5}');
    setMatchPlayerOverridesText('W', '{}');
    expect(activeMatchPlayerOverrides('B')).toEqual({ playoutDoublingAdvantage: 1.5 });
    expect(activeMatchPlayerOverrides('W')).toEqual(EMPTY_PER_QUERY_OVERRIDES);
  });

  it('invalid JSON on one player is refused (ADR-0002) without disturbing the other player', () => {
    setMatchPlayerOverridesText('B', '{"playoutDoublingAdvantage": 1.5}');
    setMatchPlayerOverridesText('W', '{"valid": true}');

    setMatchPlayerOverridesText('B', '{not valid');
    expect(matchPlayerOverridesText('B')).toBe('{not valid');
    expect(activeMatchPlayerOverrides('B')).toEqual({ playoutDoublingAdvantage: 1.5 }); // last-known-good, not cleared
    expect(matchPlayerOverridesError('B')).not.toBeNull();

    // W untouched by B's invalid edit.
    expect(activeMatchPlayerOverrides('W')).toEqual({ valid: true });
    expect(matchPlayerOverridesError('W')).toBeNull();
  });

  it('resetMatchPlayerOverrides(player) clears only that player', () => {
    setMatchPlayerOverridesText('B', '{"playoutDoublingAdvantage": 1.5}');
    setMatchPlayerOverridesText('W', '{"wideRootNoise": 0.05}');

    resetMatchPlayerOverrides('B');
    expect(activeMatchPlayerOverrides('B')).toEqual(EMPTY_PER_QUERY_OVERRIDES);
    expect(matchPlayerOverridesText('B')).toBe('');
    expect(activeMatchPlayerOverrides('W')).toEqual({ wideRootNoise: 0.05 }); // untouched
  });
});

describe('session-ephemeral reset (simulated reload)', () => {
  it('a fresh module instance starts both players empty regardless of the prior instance\'s state', async () => {
    setMatchPlayerOverridesText('B', '{"playoutDoublingAdvantage": 1.5}');
    setMatchPlayerOverridesText('W', '{"wideRootNoise": 0.05}');

    await vi.resetModules();
    const fresh = await import('../../src/state/match-player-overrides');
    expect(fresh.activeMatchPlayerOverrides('B')).toEqual(EMPTY_PER_QUERY_OVERRIDES);
    expect(fresh.activeMatchPlayerOverrides('W')).toEqual(EMPTY_PER_QUERY_OVERRIDES);
  });
});
