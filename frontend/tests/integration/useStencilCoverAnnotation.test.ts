/**
 * tests/integration/useStencilCoverAnnotation.test.ts
 *
 * Leaf data-source test: a current-node raw-ledger record is visible to the
 * overlay composable, and a later ledger write invalidates its computed.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});
vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  useThumbnailCache: () => ({ warmPath: vi.fn() }),
}));

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, resetWorkspace } from '../../src/store';
import { ledger } from '../../src/state/analysis-ledger';
import { activeAnalysisKeys } from '../../src/state/analysis-config';
import { useStencilCoverAnnotation } from '../../src/composables/board/useStencilCoverAnnotation';
import { withSetup } from './with-setup';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { RawAnalysis, StencilCoverAnnotation } from '../../src/types';

beforeEach(() => {
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
  ledger.purgeAll();
});

describe('useStencilCoverAnnotation', () => {
  it('reads the current node annotation and reacts to a later raw-ledger packet', () => {
    const board = loadSgf(sgf.parse('(;FF[4]GM[1]SZ[9];B[ee])'));
    addBoard(board);
    const currentNodeId = board.nodes[board.rootNodeId].children[0]!;

    const annotation: StencilCoverAnnotation = {
      version: 1,
      threshold: 0.6,
      width: 9,
      height: 9,
      positive: {
        placements: [{ stencil: '1x1', points: [[4, 4]] }],
        tileCount: 1,
        optimal: true,
        status: 'optimal',
      },
      negative: {
        placements: [],
        tileCount: 0,
        optimal: true,
        status: 'empty',
      },
      optimal: true,
    };

    const view = withSetup(() => useStencilCoverAnnotation(() => currentNodeId));
    expect(view.value).toBeNull();

    const raw: RawAnalysis = {
      id: 'stencil-test',
      turnNumber: 1,
      isDuringSearch: false,
      moveInfos: [],
      rootInfo: { winrate: 0.5, scoreLead: 0, visits: 100, currentPlayer: 'B' },
      stencilCover: annotation,
    };
    ledger.recordRaw(activeAnalysisKeys.value.rawKey, currentNodeId, raw);
    expect(view.value).toEqual(annotation);
  });
});
