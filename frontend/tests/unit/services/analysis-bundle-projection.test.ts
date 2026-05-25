/**
 * tests/unit/services/analysis-bundle-projection.test.ts
 *
 * Tier-1 (pure-logic) tests for
 * `src/services/analysis-bundle/projection.ts::projectPacket` —
 * the SPA-typed-shape allow-list filter applied to KataGo response
 * packets at v2-encode time.
 *
 * The compile-time allow-list drift gate (`AllowListDriftGate`)
 * is enforced by `vue-tsc -b` and doesn't need a runtime test —
 * if the gate flips false, the build fails before this suite
 * runs. These tests cover the *runtime* projection: which keys
 * survive, which are dropped, which optional fields pass through
 * unchanged.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';

import {
  ALLOWED_EXTRA_KEYS,
  ALLOWED_MOVE_INFO_KEYS,
  ALLOWED_PLAYER_EXTRA_KEYS,
  ALLOWED_ROOT_INFO_KEYS,
  ALLOWED_ROOT_KEYS,
  projectPacket,
} from '../../../src/services/analysis-bundle/projection';
import type { KataAnalysisResponse } from '../../../src/engine/katago/types';

function _packet(overrides: Record<string, unknown> = {}): KataAnalysisResponse {
  // Cast-through-unknown so we can pump runtime-extra fields into
  // the packet for projection tests; the typed shape itself
  // wouldn't accept them.
  return {
    id: 'q1',
    turnNumber: 5,
    isDuringSearch: false,
    moveInfos: [
      {
        move: 'Q16',
        visits: 500,
        winrate: 0.55,
        scoreLead: 1.5,
        pv: ['Q16', 'D4'],
        order: 0,
      },
    ],
    rootInfo: {
      winrate: 0.523,
      scoreLead: 2.5,
      visits: 1500,
      currentPlayer: 'B',
    },
    ...overrides,
  } as unknown as KataAnalysisResponse;
}

describe('projectPacket', () => {
  it('preserves every key declared in the SPA typed shape', () => {
    const p = _packet({ ownership: [0.1, 0.2], policy: [0.0, 0.5] });
    const projected = projectPacket(p);
    for (const k of ALLOWED_ROOT_KEYS) {
      if (k in p) {
        expect(projected).toHaveProperty(k);
      }
    }
  });

  it('drops root-level keys the typed shape does not declare', () => {
    const p = _packet({
      unknownField: 'should be dropped',
      anotherJunkField: { nested: 1 },
    } as Record<string, unknown>);
    const projected = projectPacket(p) as unknown as Record<string, unknown>;
    expect(projected).not.toHaveProperty('unknownField');
    expect(projected).not.toHaveProperty('anotherJunkField');
  });

  it('drops moveInfos[*] keys outside the allow-list', () => {
    const p = _packet({
      moveInfos: [
        {
          move: 'Q16',
          visits: 500,
          winrate: 0.55,
          scoreLead: 1.5,
          pv: ['Q16'],
          order: 0,
          // Unmodelled fields KataGo actually carries:
          scoreStdev: 5.0,
          scoreMean: 1.2,
          utility: 0.1,
          lcb: 0.5,
        },
      ],
    });
    const projected = projectPacket(p);
    const mi = projected.moveInfos[0] as unknown as Record<string, unknown>;
    expect(mi).not.toHaveProperty('scoreStdev');
    expect(mi).not.toHaveProperty('scoreMean');
    expect(mi).not.toHaveProperty('utility');
    expect(mi).not.toHaveProperty('lcb');
    // Allowed keys retained:
    for (const k of ALLOWED_MOVE_INFO_KEYS) {
      if (k in p.moveInfos[0]) {
        expect(mi).toHaveProperty(k);
      }
    }
  });

  it('drops rootInfo keys outside the allow-list', () => {
    const p = _packet({
      rootInfo: {
        winrate: 0.523,
        scoreLead: 2.5,
        visits: 1500,
        currentPlayer: 'B',
        utility: 0.1,
        rawStWrError: 0.05,
        // junk:
        forwardCompatField: true,
      },
    });
    const projected = projectPacket(p);
    const ri = projected.rootInfo as unknown as Record<string, unknown>;
    expect(ri).not.toHaveProperty('utility');
    expect(ri).not.toHaveProperty('rawStWrError');
    expect(ri).not.toHaveProperty('forwardCompatField');
    for (const k of ALLOWED_ROOT_INFO_KEYS) {
      expect(ri).toHaveProperty(k);
    }
  });

  it('projects extra and its black/white subtrees', () => {
    const p = _packet({
      extra: {
        state: { '5': { 'Win Probability': 0.55 } },
        black: {
          triangular: [[[1, 2], 0.5]],
          deltas: { '4': 0.1 },
          // junk in player extra:
          forwardCompatJunk: 'x',
        },
        white: {
          deltas: { '5': -0.05 },
          junkKey: 1,
        },
        // root-level extra junk:
        unknownExtraKey: 'drop me',
      },
    });
    const projected = projectPacket(p);
    const ex = projected.extra as unknown as Record<string, unknown>;
    expect(ex).not.toHaveProperty('unknownExtraKey');
    for (const k of ALLOWED_EXTRA_KEYS) {
      if (k in (p.extra ?? {})) {
        expect(ex).toHaveProperty(k);
      }
    }
    const black = ex.black as Record<string, unknown>;
    expect(black).not.toHaveProperty('forwardCompatJunk');
    for (const k of ALLOWED_PLAYER_EXTRA_KEYS) {
      if (k in (p.extra?.black ?? {})) {
        expect(black).toHaveProperty(k);
      }
    }
    const white = ex.white as Record<string, unknown>;
    expect(white).not.toHaveProperty('junkKey');
  });

  it('does not mutate the input packet', () => {
    const p = _packet({ unknownField: 'x' } as Record<string, unknown>);
    const before = JSON.stringify(p);
    projectPacket(p);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('handles a minimal packet with no optional fields', () => {
    const p = _packet({ moveInfos: [] });
    const projected = projectPacket(p);
    expect(projected.moveInfos).toEqual([]);
    expect(projected.id).toBe('q1');
    expect(projected.rootInfo.winrate).toBe(0.523);
  });

  it('handles an extra envelope where black or white is absent', () => {
    const p = _packet({
      extra: { state: { '5': { 'Win Probability': 0.5 } } },
    });
    const projected = projectPacket(p);
    expect(projected.extra).toBeDefined();
    expect(projected.extra?.black).toBeUndefined();
    expect(projected.extra?.white).toBeUndefined();
  });
});
