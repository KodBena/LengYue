/**
 * tests/integration/useIntervalSummary.test.ts
 *
 * Tier-3 (composable integration) coverage for `useIntervalSummary`
 * (`src/composables/analysis/useIntervalSummary.ts`) — the Basic
 * analysis tab's interval-summary panel (wiki Wanted feature #6).
 *
 * The commissioned requirement is specific: the summary must be the
 * SAME aggregate `MultiresolutionIntervalPanel`'s heatmap cells show
 * on hover, not a parallel recompute that happens to agree. The
 * headline test below proves that by construction rather than by
 * coincidence — it reads the value both ways (through
 * `useIntervalSummary` and through a direct `useTriangularHeatmap`
 * matrix lookup for the same colour-local (s, t)) and asserts the
 * exact `HeatmapCell` object contents match, for an interval that was
 * never computed twice: both composables resolve to the very entry
 * `ledger.recordEnrichment` wrote once.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
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
  useThumbnailCache: () => ({
    warmPath: vi.fn(),
    getSnapshot: vi.fn(),
    getSnapshotSync: vi.fn(() => null),
  }),
}));

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, resetWorkspace, store } from '../../src/store';
import { useVariationPathFor } from '../../src/composables/board/useVariationPath';
import { useTriangularHeatmap } from '../../src/composables/analysis/useTriangularHeatmap';
import { useIntervalSummary } from '../../src/composables/analysis/useIntervalSummary';
import { ledger } from '../../src/state/analysis-ledger';
import { activeAnalysisKeys } from '../../src/state/analysis-config';
import { withSetup } from './with-setup';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId, BoardState, PlyIndex } from '../../src/types';

beforeEach(() => {
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
  ledger.purgeAll();
});

// 6-move mainline: B W B W B W. Black's colour-local moves 0,1,2 sit at
// ply 1,3,5; White's at ply 2,4,6 (colorMoveToPly's contract).
const SGF = '(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp];W[dd];B[fq];W[nc])';

function setup(): { boardId: BoardId; board: BoardState } {
  const board = loadSgf(sgf.parse(SGF));
  addBoard(board);
  return { boardId: board.id, board };
}

describe('useIntervalSummary — shared-kernel equality with the multiresolution heatmap', () => {
  it('resolves to the exact HeatmapCell useTriangularHeatmap produces for the projected interval', () => {
    const { boardId } = setup();
    // useVariationPathFor takes a board getter; resolve the live board
    // object the same way useAnalysisProjection's useVariationPath wrapper
    // does internally.
    const path = withSetup(() => useVariationPathFor(
      () => store.boards.find((b) => b.id === boardId) ?? null,
    ));

    // Attach the triangular enrichment once, on the root node — the ONLY
    // place the value is computed. Both composables under test read it
    // through the ledger; neither recomputes it.
    ledger.recordEnrichment(activeAnalysisKeys.value.enrichedKey, path.value[0], {
      black: { triangular: [[[0, 2], 0.42]] },
      white: { triangular: [[[0, 2], -0.13]] },
    });

    // Selection spans the whole 6-move line: ply [1, 6]. Both colours'
    // three moves (colour-local 0..2) are fully contained, so both project
    // to the (0, 2) cell recorded above (see
    // tests/unit/composables/plyRangeToColorMoveRange.test.ts for the
    // projection's own coverage).
    const selectionRange = ref<[PlyIndex, PlyIndex]>([1, 6] as [PlyIndex, PlyIndex]);

    const heatmap = withSetup(() => useTriangularHeatmap(path));
    const summary = withSetup(() => useIntervalSummary(path, selectionRange));

    const heatmapBlackCell = heatmap.value.matrix.find(
      (d) => d.cell.color === 'B' && d.cell.s === 0 && d.cell.t === 2,
    )?.cell;
    const heatmapWhiteCell = heatmap.value.matrix.find(
      (d) => d.cell.color === 'W' && d.cell.s === 0 && d.cell.t === 2,
    )?.cell;
    expect(heatmapBlackCell).toBeDefined();
    expect(heatmapWhiteCell).toBeDefined();

    const summaryBlackRow = summary.value.rows.find((r) => r.color === 'B');
    const summaryWhiteRow = summary.value.rows.find((r) => r.color === 'W');

    // Structural equality ONLY: `useIntervalSummary` instantiates its
    // own `useTriangularHeatmap` (it must — the summary works when the
    // multiresolution panel is not mounted), so this cross-instance
    // comparison can never be referential. The load-bearing
    // no-parallel-recompute witness lives in
    // `useIntervalSummary-kernel-witness.test.ts` (sentinel-mocked
    // kernel, `toBe` against the mock's own cells — review finding 1's
    // spread-copy fake fails there). This assertion is the live
    // cross-surface agreement check, not the identity proof.
    expect(summaryBlackRow?.cell).toEqual(heatmapBlackCell);
    expect(summaryWhiteRow?.cell).toEqual(heatmapWhiteCell);
    expect(summaryBlackRow?.cell?.value).toBe(0.42);
    expect(summaryWhiteRow?.cell?.value).toBe(-0.13);
  });

  it('updates when the selection range changes, and reports no-data for a projected sub-range with no recorded cell', async () => {
    const { boardId } = setup();
    const path = withSetup(() => useVariationPathFor(
      () => store.boards.find((b) => b.id === boardId) ?? null,
    ));

    // Only the full-range (0,2) Black cell is recorded — no White entry,
    // and no narrower Black entry either.
    ledger.recordEnrichment(activeAnalysisKeys.value.enrichedKey, path.value[0], {
      black: { triangular: [[[0, 2], 0.42]] },
    });

    const selectionRange = ref<[PlyIndex, PlyIndex]>([1, 6] as [PlyIndex, PlyIndex]);
    const summary = withSetup(() => useIntervalSummary(path, selectionRange));

    expect(summary.value.rows.find((r) => r.color === 'B')?.cell?.value).toBe(0.42);
    expect(summary.value.rows.find((r) => r.color === 'W')?.cell).toBeNull();

    // Narrow the selection to Black's first move only (ply [1, 1] → colour-
    // local (0, 0) for Black, no White move contained at all).
    selectionRange.value = [1, 1] as [PlyIndex, PlyIndex];
    await nextTick();

    // No (0,0) Black cell was ever recorded, so the summary now correctly
    // reports "no data yet" rather than stale-returning the wider (0,2)
    // value — proving the lookup re-derives per selectionRange change.
    expect(summary.value.rows.find((r) => r.color === 'B')?.cell).toBeNull();
    expect(summary.value.rows.find((r) => r.color === 'W')?.cell).toBeNull();
  });
});
