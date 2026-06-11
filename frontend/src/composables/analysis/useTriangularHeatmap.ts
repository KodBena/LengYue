/**
 * src/composables/analysis/useTriangularHeatmap.ts
 * Extracts pre-calculated triangular heatmap data from the Ledger
 * for a given anchored variation path.
 *
 * The proxy emits `triangular` per colour as `[(s, t), value]` pairs
 * where `s, t` are 0-indexed colour-local move indices (proxy/bsa.py:222
 * SubStream → rxp/rxp.py:352 Triangular). This composable carries the
 * colour through into the cell record so downstream consumers can
 * convert to absolute ply via `colorMoveToPly` rather than indexing
 * `variationPath` with a colour-local number — the latter is the bug
 * shape the `ColorMoveIndex` / `PlyIndex` brand pair exists to prevent.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, type Ref } from 'vue';
import { ledger } from '../../state/analysis-ledger';
import type { ColorMoveIndex, PlyIndex, RootToLeafPath, StoneColor } from '../../types';
import { activeAnalysisKeys } from '../../state/analysis-config';

export interface HeatmapCell {
  readonly color: StoneColor;
  readonly s: ColorMoveIndex;
  readonly t: ColorMoveIndex;
  readonly value: number;
}

// ECharts heatmap series datum. The `value` tuple is what ECharts plots
// (the visual layout uses the upper triangle for Black and the lower for
// White, achieved by swapping x/y for White entries); the `cell` field is
// opaque to ECharts but visible to formatter and click handlers as
// `params.data.cell`, carrying the typed coordinates and colour.
export interface HeatmapDatum {
  readonly value: readonly [number, number, number];
  readonly cell: HeatmapCell;
}

export interface HeatmapResult {
  matrix: HeatmapDatum[];
  min: number;
  max: number;
  moveCount: number;
}

// Root→leaf by contract: the triangular heatmap is anchored on the
// whole active line (branded-path-types arc; fed by
// `useVariationPath`). Replaces the loose `Ref<string[]>` the original
// signature accepted — the brand also retires the per-element
// `as NodeId` re-cast the loose element type forced below.
export function useTriangularHeatmap(variationPath: Ref<RootToLeafPath>) {
  return computed<HeatmapResult>(() => {
    const matrix: HeatmapDatum[] = [];
    let min = Infinity;
    let max = -Infinity;

    variationPath.value.forEach((nodeId) => {
      const enr = ledger.getEnrichment(activeAnalysisKeys.value.enrichedKey, nodeId);
      if (!enr) return;

      enr.black?.triangular?.forEach(([[s, t], v]) => {
        const cell: HeatmapCell = {
          color: 'B',
          s: s as ColorMoveIndex, // brand mint: triangular tuple index → ColorMoveIndex
          t: t as ColorMoveIndex, // brand mint: triangular tuple index → ColorMoveIndex
          value: v,
        };
        matrix.push({ value: [s, t, v], cell });
        if (v < min) min = v;
        if (v > max) max = v;
      });

      enr.white?.triangular?.forEach(([[s, t], v]) => {
        const cell: HeatmapCell = {
          color: 'W',
          s: s as ColorMoveIndex, // brand mint: triangular tuple index → ColorMoveIndex
          t: t as ColorMoveIndex, // brand mint: triangular tuple index → ColorMoveIndex
          value: v,
        };
        matrix.push({ value: [t, s, v], cell });
        if (v < min) min = v;
        if (v > max) max = v;
      });
    });

    return {
      matrix,
      min: min === Infinity ? 0 : min,
      max: max === -Infinity ? 2 : max,
      moveCount: Math.ceil(variationPath.value.length / 2)
    };
  });
}

// Convert a colour-local move index to an absolute PlyIndex into a
// `variationPath`. Black's m-th colour-local move (0-indexed) lives at
// ply 2m+1; White's at ply 2m+2. Slot 0 in `variationPath` is the root
// (no move played), so the +1 / +2 offsets are exact.
//
// The `as`-casts are justified per ADR-0002 Rule 2: this function is
// the single authority that establishes the PlyIndex invariant from a
// (ColorMoveIndex, StoneColor) pair, and uses brand erasure only to
// perform the arithmetic.
export const colorMoveToPly = (m: ColorMoveIndex, color: StoneColor): PlyIndex =>
  // brand erase ColorMoveIndex → number for the arithmetic, brand mint the
  // result as PlyIndex (this fn is the sole authority for the invariant above).
  ((m as number) * 2 + (color === 'B' ? 1 : 2)) as PlyIndex;
