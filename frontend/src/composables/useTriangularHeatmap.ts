/**
 * src/composables/useTriangularHeatmap.ts
 * Extracts pre-calculated triangular heatmap data from the Ledger
 * for a given anchored variation path.
 */
import { computed, type Ref } from 'vue';
import { ledger } from '../services/analysis-ledger';
import type { NodeId } from '../types';
import { activeConfigHash } from '../services/analysis-config';

export interface HeatmapResult {
  matrix: [number, number, number][];
  min: number;
  max: number;
  moveCount: number;
}

export function useTriangularHeatmap(variationPath: Ref<string[]>) {
  return computed<HeatmapResult>(() => {
    // The explicit dependency call is GONE.
    // Calling getRaw() below automatically triggers Vue's reactivity per-node.
    
    const matrix: [number, number, number][] = [];
    let min = Infinity;
    let max = -Infinity;

    variationPath.value.forEach((nodeId) => {
      const packet = ledger.getRaw(activeConfigHash.value, nodeId as NodeId);
      if (!packet?.extra) return;

      packet.extra.black?.triangular?.forEach(([[s, e], v]) => {
        matrix.push([s, e, v]);
        if (v < min) min = v;
        if (v > max) max = v;
      });

      packet.extra.white?.triangular?.forEach(([[s, e], v]) => {
        matrix.push([e, s, v]);
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
