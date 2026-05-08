/**
 * tests/unit/engine/katago/winrate-framing.test.ts
 *
 * Tier-1 (pure-logic) tests for the framing-resolution and
 * packet-normalisation helpers in
 * `src/engine/katago/winrate-framing.ts`. Pure functions over plain
 * inputs; no DOM, no Vue reactivity, no fakes.
 *
 * The class of bug these guard against — silent sign inversion in a
 * transform layer — is exactly the silent-coercion failure mode
 * ADR-0002 is shaped to prevent. Each branch of the
 * normalisation matrix (BLACK / WHITE / SIDETOMOVE × current player)
 * is exercised; the typed signed scalars (winrate, scoreLead,
 * ownership) are checked at byte-equal precision; the defensively-
 * flipped untyped siblings (scoreMean, utility, lcb, etc.) are
 * checked at "present-flip / absent-leave-alone" granularity.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveWinrateFraming,
  normalizePacketToWhiteFraming,
} from '../../../../src/engine/katago/winrate-framing';
import type { KataAnalysisResponse } from '../../../../src/engine/katago/types';

// Minimal fixture: the smallest packet shape that exercises every
// signed field the normaliser touches. Returns a fresh object each
// call so per-test mutations don't bleed across cases.
function makePacket(overrides: {
  currentPlayer: 'B' | 'W';
  rootWinrate?: number;
  rootScoreLead?: number;
  moveWinrates?: number[];
  moveScoreLeads?: number[];
  ownership?: number[] | undefined;
  rootExtras?: Record<string, number>;
  moveExtras?: Record<string, number>;
}): KataAnalysisResponse {
  const moveWinrates = overrides.moveWinrates ?? [0.6];
  const moveScoreLeads = overrides.moveScoreLeads ?? [3.5];
  return {
    id: 'test-q',
    turnNumber: 0,
    isDuringSearch: false,
    rootInfo: {
      winrate: overrides.rootWinrate ?? 0.65,
      scoreLead: overrides.rootScoreLead ?? 4.2,
      visits: 1000,
      currentPlayer: overrides.currentPlayer,
      ...(overrides.rootExtras ?? {}),
    },
    moveInfos: moveWinrates.map((w, i) => ({
      move: 'D4',
      visits: 500,
      winrate: w,
      scoreLead: moveScoreLeads[i] ?? 0,
      pv: ['D4'],
      order: i,
      ...(overrides.moveExtras ?? {}),
    })),
    ...(overrides.ownership ? { ownership: overrides.ownership } : {}),
  };
}

describe('resolveWinrateFraming', () => {
  it('returns SIDETOMOVE when overrides are undefined', () => {
    expect(resolveWinrateFraming(undefined)).toBe('SIDETOMOVE');
  });

  it('returns SIDETOMOVE when overrides is empty', () => {
    expect(resolveWinrateFraming({})).toBe('SIDETOMOVE');
  });

  it('returns SIDETOMOVE when the key is present but non-string', () => {
    expect(resolveWinrateFraming({ reportAnalysisWinratesAs: 42 })).toBe('SIDETOMOVE');
    expect(resolveWinrateFraming({ reportAnalysisWinratesAs: null })).toBe('SIDETOMOVE');
    expect(resolveWinrateFraming({ reportAnalysisWinratesAs: true })).toBe('SIDETOMOVE');
  });

  it('passes through each accepted enum value', () => {
    expect(resolveWinrateFraming({ reportAnalysisWinratesAs: 'BLACK' })).toBe('BLACK');
    expect(resolveWinrateFraming({ reportAnalysisWinratesAs: 'WHITE' })).toBe('WHITE');
    expect(resolveWinrateFraming({ reportAnalysisWinratesAs: 'SIDETOMOVE' })).toBe('SIDETOMOVE');
  });

  it('warns and falls back to SIDETOMOVE for unknown string values', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = resolveWinrateFraming({ reportAnalysisWinratesAs: 'sidewise' });
      expect(out).toBe('SIDETOMOVE');
      expect(warnSpy).toHaveBeenCalledOnce();
      const message = warnSpy.mock.calls[0]?.[0];
      expect(typeof message).toBe('string');
      expect(message as string).toContain("'sidewise'");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('normalizePacketToWhiteFraming — WHITE', () => {
  it('returns the input unchanged (identity, same reference)', () => {
    const packet = makePacket({ currentPlayer: 'W' });
    const out = normalizePacketToWhiteFraming(packet, 'WHITE');
    // Identity: WHITE → no flip → same reference. Contract-relied-on
    // by `mergeAnalysisPacket` (whose `incoming === existing` no-op
    // path gates on visits, not identity, so identity here is purely
    // an efficiency guarantee — but a useful one to assert).
    expect(out).toBe(packet);
  });
});

describe('normalizePacketToWhiteFraming — BLACK', () => {
  it('flips winrate (1 - w) and negates scoreLead on root and moves', () => {
    const packet = makePacket({
      currentPlayer: 'B',
      rootWinrate: 0.7,
      rootScoreLead: 5.0,
      moveWinrates: [0.65, 0.4],
      moveScoreLeads: [3.0, -2.0],
    });
    const out = normalizePacketToWhiteFraming(packet, 'BLACK');

    expect(out.rootInfo.winrate).toBeCloseTo(0.3, 12);
    expect(out.rootInfo.scoreLead).toBeCloseTo(-5.0, 12);
    expect(out.moveInfos[0]?.winrate).toBeCloseTo(0.35, 12);
    expect(out.moveInfos[1]?.winrate).toBeCloseTo(0.6, 12);
    expect(out.moveInfos[0]?.scoreLead).toBeCloseTo(-3.0, 12);
    expect(out.moveInfos[1]?.scoreLead).toBeCloseTo(2.0, 12);
  });

  it('negates ownership per cell when present', () => {
    const packet = makePacket({
      currentPlayer: 'B',
      ownership: [0.8, -0.4, 0.0, 1.0, -1.0],
    });
    const out = normalizePacketToWhiteFraming(packet, 'BLACK');
    expect(out.ownership).toEqual([-0.8, 0.4, -0.0, -1.0, 1.0]);
  });

  it('omits ownership when the input had none', () => {
    const packet = makePacket({ currentPlayer: 'B' });
    expect(packet.ownership).toBeUndefined();
    const out = normalizePacketToWhiteFraming(packet, 'BLACK');
    expect(out.ownership).toBeUndefined();
    // The spread-conditional shouldn't introduce an enumerable
    // `ownership: undefined` either — `Object.hasOwn` is the
    // honest check.
    expect(Object.prototype.hasOwnProperty.call(out, 'ownership')).toBe(false);
  });

  it('preserves currentPlayer and untouched fields', () => {
    const packet = makePacket({
      currentPlayer: 'B',
      rootWinrate: 0.5,
      rootScoreLead: 0,
    });
    const out = normalizePacketToWhiteFraming(packet, 'BLACK');
    expect(out.rootInfo.currentPlayer).toBe('B');
    expect(out.rootInfo.visits).toBe(1000);
    expect(out.id).toBe('test-q');
    expect(out.turnNumber).toBe(0);
    expect(out.isDuringSearch).toBe(false);
    expect(out.moveInfos[0]?.move).toBe('D4');
    expect(out.moveInfos[0]?.visits).toBe(500);
    expect(out.moveInfos[0]?.order).toBe(0);
    expect(out.moveInfos[0]?.pv).toEqual(['D4']);
  });

  it('flips defensively-handled untyped siblings on root and moves', () => {
    const packet = makePacket({
      currentPlayer: 'B',
      rootExtras: { scoreMean: 3.5, scoreSelfplay: 2.7, utility: 0.8 },
      moveExtras: { scoreMean: 4.0, scoreSelfplay: 3.1, utility: 0.6, utilityLcb: 0.55, lcb: 0.62 },
    });
    const out = normalizePacketToWhiteFraming(packet, 'BLACK');

    const ri = out.rootInfo as unknown as Record<string, number>;
    expect(ri.scoreMean).toBeCloseTo(-3.5, 12);
    expect(ri.scoreSelfplay).toBeCloseTo(-2.7, 12);
    expect(ri.utility).toBeCloseTo(-0.8, 12);

    const mi = out.moveInfos[0] as unknown as Record<string, number>;
    expect(mi.scoreMean).toBeCloseTo(-4.0, 12);
    expect(mi.scoreSelfplay).toBeCloseTo(-3.1, 12);
    expect(mi.utility).toBeCloseTo(-0.6, 12);
    expect(mi.utilityLcb).toBeCloseTo(-0.55, 12);
    // lcb is winrate-shaped (probability), so 1 - lcb (not -lcb).
    expect(mi.lcb).toBeCloseTo(0.38, 12);
  });

  it('returns a fresh object — does not mutate the input', () => {
    const packet = makePacket({
      currentPlayer: 'B',
      rootWinrate: 0.7,
      rootScoreLead: 5.0,
    });
    const before = JSON.stringify(packet);
    normalizePacketToWhiteFraming(packet, 'BLACK');
    const after = JSON.stringify(packet);
    expect(after).toBe(before);
  });
});

describe('normalizePacketToWhiteFraming — SIDETOMOVE', () => {
  it('flips when currentPlayer is B (Black-to-move packet)', () => {
    const packet = makePacket({
      currentPlayer: 'B',
      rootWinrate: 0.7,
      rootScoreLead: 4.0,
      moveWinrates: [0.65],
      moveScoreLeads: [3.0],
      ownership: [0.5, -0.5],
    });
    const out = normalizePacketToWhiteFraming(packet, 'SIDETOMOVE');
    expect(out.rootInfo.winrate).toBeCloseTo(0.3, 12);
    expect(out.rootInfo.scoreLead).toBeCloseTo(-4.0, 12);
    expect(out.moveInfos[0]?.winrate).toBeCloseTo(0.35, 12);
    expect(out.moveInfos[0]?.scoreLead).toBeCloseTo(-3.0, 12);
    expect(out.ownership).toEqual([-0.5, 0.5]);
  });

  it('passes through when currentPlayer is W (White-to-move packet)', () => {
    const packet = makePacket({
      currentPlayer: 'W',
      rootWinrate: 0.7,
      rootScoreLead: 4.0,
    });
    const out = normalizePacketToWhiteFraming(packet, 'SIDETOMOVE');
    // Same-reference identity for the no-flip branch — same as WHITE.
    expect(out).toBe(packet);
  });

  it('handles consecutive packets with alternating currentPlayer independently', () => {
    // The canonical SIDETOMOVE story: a sequence of packets for
    // adjacent moves carry alternating sign conventions. Each packet
    // is normalised in isolation against its own currentPlayer.
    const blackToMove = makePacket({
      currentPlayer: 'B',
      rootWinrate: 0.6,
      rootScoreLead: 2.0,
    });
    const whiteToMove = makePacket({
      currentPlayer: 'W',
      rootWinrate: 0.6,
      rootScoreLead: 2.0,
    });
    const outB = normalizePacketToWhiteFraming(blackToMove, 'SIDETOMOVE');
    const outW = normalizePacketToWhiteFraming(whiteToMove, 'SIDETOMOVE');

    // Black-to-move's "0.6 from Black's view" → 0.4 from White's view.
    expect(outB.rootInfo.winrate).toBeCloseTo(0.4, 12);
    expect(outB.rootInfo.scoreLead).toBeCloseTo(-2.0, 12);
    // White-to-move's "0.6 from White's view" → 0.6 (no change).
    expect(outW.rootInfo.winrate).toBeCloseTo(0.6, 12);
    expect(outW.rootInfo.scoreLead).toBeCloseTo(2.0, 12);
  });
});
