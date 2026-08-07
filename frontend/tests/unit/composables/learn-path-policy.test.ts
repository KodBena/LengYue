/**
 * tests/unit/composables/learn-path-policy.test.ts
 *
 * Tier-1 (pure-logic) tests for `spineFirstPolicy`
 * (`src/composables/cards/learn-path-policy.ts`) — the ratified
 * ranking/role/recursion policy behind "Learn this path" (ledger rows
 * 706-708, 718). Pure function of `moveInfos` + config; no DOM, no
 * fakes, no ledger.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { spineFirstPolicy, type LearnPathPolicyConfig } from '../../../src/composables/cards/learn-path-policy';
import type { KataMoveInfo } from '../../../src/engine/katago/types';

function info(move: string, order: number): KataMoveInfo {
  return { move, order, visits: 100, winrate: 0.5, scoreLead: 0, pv: [] };
}

const CONFIG: LearnPathPolicyConfig = { depth: 3, topK: 3 };

describe('spineFirstPolicy.rankCandidates — row 706 (ascending order, stable on ties)', () => {
  it('ranks ascending by order regardless of input array order', () => {
    const moveInfos = [info('C3', 2), info('D4', 0), info('Q16', 1)];
    const ranked = spineFirstPolicy.rankCandidates(moveInfos, CONFIG);
    expect(ranked.map(r => r.info.move)).toEqual(['D4', 'Q16', 'C3']);
    expect(ranked.map(r => r.rank)).toEqual([1, 2, 3]);
  });

  it('breaks ties on equal `order` by original array position (stable)', () => {
    // Two candidates tied at order 0 — this should never happen from a
    // real KataGo packet, but the policy pins deterministic behaviour
    // for it rather than leaving it to sort-implementation happenstance.
    const moveInfos = [info('First', 0), info('Second', 0), info('Third', 1)];
    const ranked = spineFirstPolicy.rankCandidates(moveInfos, CONFIG);
    expect(ranked.map(r => r.info.move)).toEqual(['First', 'Second', 'Third']);
  });

  it('is stable across repeated calls on the same (re-ordered-in-memory) input', () => {
    const moveInfos = [info('A', 5), info('B', 5), info('C', 5), info('D', 4)];
    const first = spineFirstPolicy.rankCandidates(moveInfos, CONFIG).map(r => r.info.move);
    const second = spineFirstPolicy.rankCandidates(moveInfos, CONFIG).map(r => r.info.move);
    expect(first).toEqual(second);
    // topK is 3 (CONFIG) — 'C' (order 5, discovered last among the
    // order-5 tie) is sliced off.
    expect(first).toEqual(['D', 'A', 'B']);
  });

  it('slices to topK and never returns more than topK entries', () => {
    const moveInfos = [info('A', 0), info('B', 1), info('C', 2), info('D', 3), info('E', 4)];
    const ranked = spineFirstPolicy.rankCandidates(moveInfos, { depth: 1, topK: 2 });
    expect(ranked).toHaveLength(2);
    expect(ranked.map(r => r.info.move)).toEqual(['A', 'B']);
  });

  it('returns an empty array for an empty candidate list', () => {
    expect(spineFirstPolicy.rankCandidates([], CONFIG)).toEqual([]);
  });
});

describe('spineFirstPolicy — row 707/708 (spine vs. deviation role)', () => {
  it('tags rank 1 (best, order 0) as the spine and never as a deviation', () => {
    const moveInfos = [info('D4', 0), info('Q16', 1), info('C3', 2)];
    const ranked = spineFirstPolicy.rankCandidates(moveInfos, { depth: 1, topK: 3 });
    expect(ranked[0]).toMatchObject({ rank: 1, role: 'spine' });
    expect(ranked[1]).toMatchObject({ rank: 2, role: 'deviation' });
    expect(ranked[2]).toMatchObject({ rank: 3, role: 'deviation' });
  });

  it('isCardEligible: spine is never card-eligible, deviation always is', () => {
    expect(spineFirstPolicy.isCardEligible('spine')).toBe(false);
    expect(spineFirstPolicy.isCardEligible('deviation')).toBe(true);
  });

  it('shouldRecurse: continues for both roles while under the depth budget, stops at it', () => {
    const config: LearnPathPolicyConfig = { depth: 2, topK: 3 };
    expect(spineFirstPolicy.shouldRecurse('spine', 1, config)).toBe(true);
    expect(spineFirstPolicy.shouldRecurse('deviation', 1, config)).toBe(true);
    expect(spineFirstPolicy.shouldRecurse('spine', 2, config)).toBe(false);
    expect(spineFirstPolicy.shouldRecurse('deviation', 2, config)).toBe(false);
  });
});
