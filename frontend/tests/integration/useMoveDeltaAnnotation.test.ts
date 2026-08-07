/**
 * tests/integration/useMoveDeltaAnnotation.test.ts
 *
 * Tier-3 (composable integration) tests for `useMoveDeltaAnnotation` —
 * the board-overlay data source for wiki Wanted #7 / #7.1: the
 * just-played move's delta (vs its parent) and the child's visit count.
 *
 * Acceptance covered here:
 *   - shows delta+visits when the ledger holds both the raw (visits) and
 *     enrichment (delta) halves for the current node;
 *   - absent (null) when the ledger doesn't hold a delta for the node —
 *     both the "nothing recorded" and the "evaluated but no delta yet"
 *     cases;
 *   - the delta value is the SAME authority `MergedDeltaPanel` charts
 *     (`useAnalysisProjection`'s `enriched.deltaSeries`), not a
 *     separately-computed number — proven by cross-checking against a
 *     parallel `useAnalysisProjection` instance for the same board.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

// Same service-mock preamble as useAnalysisProjection.test.ts: keeps
// resetWorkspace off the network in jsdom.
vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  useThumbnailCache: () => ({
    warmPath: vi.fn(),
  }),
}));

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, mutateBoard, resetWorkspace, store } from '../../src/store';
import { navigateTo } from '../../src/engine/navigator';
import { ledger } from '../../src/state/analysis-ledger';
import { activeAnalysisKeys } from '../../src/state/analysis-config';
import { useMoveDeltaAnnotation } from '../../src/composables/board/useMoveDeltaAnnotation';
import { useAnalysisProjection } from '../../src/composables/analysis/useAnalysisProjection';
import { withSetup } from './with-setup';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId, BoardState, NodeId, RawAnalysis } from '../../src/types';

beforeEach(() => {
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
  ledger.purgeAll();
});

function setup(source: string): { boardId: BoardId; board: BoardState } {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  return { boardId: board.id, board };
}

/** Root → active-leaf node ids, in order (index 0 = root). */
function activePathIds(board: BoardState): NodeId[] {
  const path: NodeId[] = [board.rootNodeId];
  let curr = board.nodes[board.rootNodeId];
  while (curr.children.length > 0) {
    const next = curr.children[curr.activeChildIndex] ?? curr.children[0];
    path.push(next);
    curr = board.nodes[next];
  }
  return path;
}

function navigateToPathIndex(boardId: BoardId, idx: number): NodeId {
  let target!: NodeId;
  mutateBoard(boardId, draft => {
    const path = activePathIds(draft);
    target = path[idx];
    navigateTo(draft, target);
  });
  return target;
}

function rawAt(visits: number): RawAnalysis {
  return {
    id: 'q',
    turnNumber: 0,
    isDuringSearch: false,
    moveInfos: [],
    rootInfo: { winrate: 0.5, scoreLead: 0, visits, currentPlayer: 'B' },
  };
}

describe('useMoveDeltaAnnotation — found (both halves in the ledger)', () => {
  it("returns the just-played move's point, colour, delta, and visits", () => {
    const { boardId, board } = setup('(;FF[4]GM[1]SZ[19];B[pd])');
    const childId = navigateToPathIndex(boardId, 1); // B[pd] — Black's move 0

    const { rawKey, enrichedKey } = activeAnalysisKeys.value;
    ledger.recordRaw(rawKey, childId, rawAt(340));
    ledger.recordEnrichment(enrichedKey, childId, { black: { deltas: { '0': 0.42 } } });

    const annotation = withSetup(() => useMoveDeltaAnnotation(() => board, () => childId));
    expect(annotation.value).not.toBeNull();
    expect(annotation.value?.color).toBe('B');
    expect(annotation.value?.visits).toBe(340);
    expect(annotation.value?.delta).toBeCloseTo(0.42);
    // The annotated point is the node's own move — not re-derived from
    // SGF coordinates here (that convention is loadSgf's own contract).
    const move = board.nodes[childId].move;
    expect(move).not.toBeNull();
    expect(annotation.value?.point).toEqual({ x: move!.x, y: move!.y });
  });

  it("White's move indexes deltaSeries.white at colour-local index 0", () => {
    const { boardId, board } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp])');
    const childId = navigateToPathIndex(boardId, 2); // W[dp] — White's move 0

    const { rawKey, enrichedKey } = activeAnalysisKeys.value;
    ledger.recordRaw(rawKey, childId, rawAt(150));
    ledger.recordEnrichment(enrichedKey, childId, { white: { deltas: { '0': -0.15 } } });

    const annotation = withSetup(() => useMoveDeltaAnnotation(() => board, () => childId));
    expect(annotation.value?.color).toBe('W');
    expect(annotation.value?.visits).toBe(150);
    expect(annotation.value?.delta).toBeCloseTo(-0.15);
  });

  it('cross-checks against the SAME authority MergedDeltaPanel charts (useAnalysisProjection.enriched.deltaSeries)', () => {
    const { boardId, board } = setup('(;FF[4]GM[1]SZ[19];B[pd])');
    const childId = navigateToPathIndex(boardId, 1);

    const { rawKey, enrichedKey } = activeAnalysisKeys.value;
    ledger.recordRaw(rawKey, childId, rawAt(500));
    ledger.recordEnrichment(enrichedKey, childId, { black: { deltas: { '0': 0.77 } } });

    const annotation = withSetup(() => useMoveDeltaAnnotation(() => board, () => childId));
    const projection = withSetup(() => useAnalysisProjection(boardId));

    const chartedDelta = projection.enriched.value.deltaSeries.black[0]?.data.find(([k]) => k === 0)?.[1];
    expect(chartedDelta).toBeCloseTo(0.77);
    expect(annotation.value?.delta).toBe(chartedDelta);
  });
});

describe('useMoveDeltaAnnotation — absence (never a zero placeholder)', () => {
  it('is null when nothing has been recorded for the node', () => {
    const { boardId, board } = setup('(;FF[4]GM[1]SZ[19];B[pd])');
    const childId = navigateToPathIndex(boardId, 1);

    const annotation = withSetup(() => useMoveDeltaAnnotation(() => board, () => childId));
    expect(annotation.value).toBeNull();
  });

  it('is null when the child has raw (visits) but no enrichment delta yet', () => {
    const { boardId, board } = setup('(;FF[4]GM[1]SZ[19];B[pd])');
    const childId = navigateToPathIndex(boardId, 1);

    const { rawKey } = activeAnalysisKeys.value;
    ledger.recordRaw(rawKey, childId, rawAt(50));

    const annotation = withSetup(() => useMoveDeltaAnnotation(() => board, () => childId));
    expect(annotation.value).toBeNull();
  });

  it('is null at the root (no move to annotate)', () => {
    const { boardId, board } = setup('(;FF[4]GM[1]SZ[19];B[pd])');
    const rootId = navigateToPathIndex(boardId, 0);

    const { rawKey, enrichedKey } = activeAnalysisKeys.value;
    ledger.recordRaw(rawKey, rootId, rawAt(1));
    ledger.recordEnrichment(enrichedKey, rootId, { black: { deltas: { '0': 0.1 } } });

    const annotation = withSetup(() => useMoveDeltaAnnotation(() => board, () => rootId));
    expect(annotation.value).toBeNull();
  });
});
