/**
 * src/composables/analysis/useIntervalSummary.ts
 *
 * Per-colour summary figures for the currently-set analysis interval
 * (`AnalysisTimelineState.selectionRange`), for display in the Basic
 * analysis tab. This is deliberately a LOOKUP, not a recompute: it
 * projects the current ply-range selection onto each colour's local
 * move-index sub-range (`plyRangeToColorMoveRange`) and looks that
 * pair up in `useTriangularHeatmap`'s accumulated matrix — the exact
 * same composable, and the exact same computed matrix, that
 * `MultiresolutionIntervalPanel`'s heatmap cells are drawn from and
 * hovered against. There is no second aggregation kernel here: a
 * `Wanted` feature ("summary analysis over the set interval") asked
 * for the multiresolution panel's own numbers to be visible without
 * hovering a cell in that panel — reusing its data source is what
 * keeps the two surfaces provably in agreement (see
 * `tests/integration/useIntervalSummary.test.ts`).
 *
 * A row's `cell` is null when the interval has not been analysed at
 * that exact sub-range yet (the heatmap matrix is sparse — populated
 * only by ranges that were actually queried, see
 * `useTriangularHeatmap`'s header). That is not an error: it means
 * "no data for this interval yet", the same state a hover over an
 * unpopulated cell in the multiresolution panel would show.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, type Ref } from 'vue';
import {
  useTriangularHeatmap,
  plyRangeToColorMoveRange,
  type HeatmapCell,
} from './useTriangularHeatmap';
import type { PlyIndex, RootToLeafPath, StoneColor } from '../../types';

export interface IntervalSummaryRow {
  readonly color: StoneColor;
  /** The looked-up cell, or null when this exact sub-range has no data yet. */
  readonly cell: HeatmapCell | null;
}

export interface IntervalSummary {
  readonly rows: readonly [IntervalSummaryRow, IntervalSummaryRow];
}

export function useIntervalSummary(
  variationPath: Ref<RootToLeafPath>,
  selectionRange: Ref<readonly [PlyIndex, PlyIndex]>,
) {
  // Shared kernel: the same composable instance-shape MultiresolutionIntervalPanel
  // uses. No parallel arithmetic over the delta stream happens here.
  const heatmap = useTriangularHeatmap(variationPath);

  function lookupRow(color: StoneColor): IntervalSummaryRow {
    const [startPly, endPly] = selectionRange.value;
    const range = plyRangeToColorMoveRange(startPly, endPly, color);
    if (!range) return { color, cell: null };
    const [s, t] = range;
    const found = heatmap.value.matrix.find(
      (d) => d.cell.color === color && d.cell.s === s && d.cell.t === t,
    );
    return { color, cell: found ? found.cell : null };
  }

  return computed<IntervalSummary>(() => ({
    rows: [lookupRow('B'), lookupRow('W')],
  }));
}
