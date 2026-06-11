/**
 * tests/integration/stability-trajectory-stratified.test.ts
 *
 * Mirror of the analysis-ledger stratification regression, for the
 * stability-trajectory store: its extracted Q values are raw-derived
 * (rootInfo / moveInfos only), so it keys by `rawKey` — a palette-only swap
 * must keep a node's trajectory reachable, the same way the ledger raw store
 * keeps the board overlays.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { deriveAnalysisKeys } from '../../src/state/analysis-config';
import { stabilityTrajectoryStore } from '../../src/state/stability-trajectory-store';
import type { NodeId, KataAnalysisResponse } from '../../src/types';

const OVERRIDES = { reportAnalysisWinratesAs: 'WHITE' };
const PALETTE_A = { bindings: { delta_fn: 'a' }, parameters: {}, symbols: {} };
const PALETTE_B = { bindings: { delta_fn: 'b' }, parameters: {}, symbols: {} };

function packet(visits: number): KataAnalysisResponse {
  return {
    id: 'q',
    turnNumber: 0,
    isDuringSearch: false,
    moveInfos: [{ move: 'Q16', visits, winrate: 0.5, scoreLead: 3, pv: [], order: 0 }],
    rootInfo: { winrate: 0.5, scoreLead: 3, visits, currentPlayer: 'B' },
  } as KataAnalysisResponse;
}

beforeEach(() => {
  stabilityTrajectoryStore.purgeAll();
});

describe('stability-trajectory-store — raw-keyed (survives palette swap)', () => {
  it('reads a trajectory under the unchanged raw key after a palette change', () => {
    const node = 'n1' as NodeId;
    const a = deriveAnalysisKeys(PALETTE_A, OVERRIDES, 'modelX'); // review-session palette
    const b = deriveAnalysisKeys(PALETTE_B, OVERRIDES, 'modelX'); // active palette afterwards

    stabilityTrajectoryStore.record(a.rawKey, node, packet(1000));

    expect(b.rawKey).toBe(a.rawKey); // palette-independent
    expect(
      stabilityTrajectoryStore.getTrajectory(b.rawKey, 'scoreLead_sign', node),
    ).not.toBeNull();
  });

  it('does not cross model / overrides boundaries (raw key changes there)', () => {
    const node = 'n2' as NodeId;
    const a = deriveAnalysisKeys(PALETTE_A, OVERRIDES, 'modelX');
    const otherModel = deriveAnalysisKeys(PALETTE_A, OVERRIDES, 'modelY');

    stabilityTrajectoryStore.record(a.rawKey, node, packet(1000));

    expect(otherModel.rawKey).not.toBe(a.rawKey);
    expect(
      stabilityTrajectoryStore.getTrajectory(otherModel.rawKey, 'scoreLead_sign', node),
    ).toBeNull();
  });
});
