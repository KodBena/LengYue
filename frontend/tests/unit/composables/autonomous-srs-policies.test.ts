/**
 * tests/unit/composables/autonomous-srs-policies.test.ts
 *
 * Tier-1 (pure-logic) tests for the built-in policies in
 * `src/composables/autonomous-srs.ts`. The policies themselves are
 * thin adapters over `queryEngineMove`; the value of the test is
 * pinning the option-passing contract so a future refactor that
 * accidentally drops `model` or `maxVisits` from the wire surfaces
 * here rather than in a live run.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/composables/board/usePlayFromPosition', () => ({
  queryEngineMove: vi.fn(),
}));

import { queryEngineMove } from '../../../src/composables/board/usePlayFromPosition';
import { fixedNetworkPolicy } from '../../../src/composables/board/autonomous-srs';
import type { BoardState, ReviewCard, CardId, EbisuModel } from '../../../src/types';

const SENTINEL_EBISU: EbisuModel = { alpha: 4, beta: 4, t: 1 };

function makeStubBoard(): BoardState {
  // The policy doesn't introspect the board — it just forwards to
  // queryEngineMove. A bare cast to BoardState satisfies the type
  // contract; the mock receives this object verbatim and the test
  // asserts on the forwarded reference.
  return { id: 'b' } as unknown as BoardState;
}

function makeStubCard(): ReviewCard {
  return {
    id: 1 as CardId,
    canonicalContent: '(;FF[4]GM[1]SZ[19])',
    numMoves: 1,
    model: SENTINEL_EBISU,
    lastReviewedAt: null,
    numReviews: 0,
    suspended: false,
    defaultVisits: 1000,
    gamma: 1.0,
  };
}

beforeEach(() => {
  vi.mocked(queryEngineMove).mockReset();
});

describe('fixedNetworkPolicy', () => {
  it('forwards katagoUrl, maxVisits, model, and timeoutMs to queryEngineMove', async () => {
    vi.mocked(queryEngineMove).mockResolvedValue({
      x: 3,
      y: 4,
      gtp: 'D15',
      packet: {} as never,
    });

    const policy = fixedNetworkPolicy({
      katagoUrl: 'ws://test:1234',
      maxVisits: 250,
      model: 'weak',
      perMoveTimeoutMs: 7777,
    });

    const board = makeStubBoard();
    const result = await policy(board, makeStubCard());

    expect(result).toEqual({ x: 3, y: 4, gtp: 'D15' });
    expect(queryEngineMove).toHaveBeenCalledTimes(1);
    expect(queryEngineMove).toHaveBeenCalledWith({
      katagoUrl: 'ws://test:1234',
      board,
      maxVisits: 250,
      timeoutMs: 7777,
      model: 'weak',
    });
  });

  it('omits the model and timeoutMs fields when not configured (proxy default routing + harness default timeout)', async () => {
    vi.mocked(queryEngineMove).mockResolvedValue({
      x: 0,
      y: 0,
      gtp: 'A19',
      packet: {} as never,
    });

    const policy = fixedNetworkPolicy({
      katagoUrl: 'ws://test:1234',
      maxVisits: 100,
    });

    await policy(makeStubBoard(), makeStubCard());

    const callArgs = vi.mocked(queryEngineMove).mock.calls[0]?.[0];
    expect(callArgs?.model).toBeUndefined();
    expect(callArgs?.timeoutMs).toBeUndefined();
    expect(callArgs?.maxVisits).toBe(100);
  });

  it('rebinds maxVisits across multiple invocations (closure stays fresh per options object)', async () => {
    vi.mocked(queryEngineMove).mockResolvedValue({
      x: 0,
      y: 0,
      gtp: 'A19',
      packet: {} as never,
    });

    const lowVisits = fixedNetworkPolicy({ katagoUrl: 'ws://t:1', maxVisits: 30 });
    const highVisits = fixedNetworkPolicy({ katagoUrl: 'ws://t:1', maxVisits: 1000 });

    await lowVisits(makeStubBoard(), makeStubCard());
    await highVisits(makeStubBoard(), makeStubCard());

    expect(vi.mocked(queryEngineMove).mock.calls[0]?.[0]?.maxVisits).toBe(30);
    expect(vi.mocked(queryEngineMove).mock.calls[1]?.[0]?.maxVisits).toBe(1000);
  });

  it('propagates queryEngineMove errors to the caller (driver records as policy failure)', async () => {
    vi.mocked(queryEngineMove).mockRejectedValue(new Error('connection refused'));

    const policy = fixedNetworkPolicy({ katagoUrl: 'ws://nowhere', maxVisits: 100 });

    await expect(policy(makeStubBoard(), makeStubCard())).rejects.toThrow('connection refused');
  });
});
