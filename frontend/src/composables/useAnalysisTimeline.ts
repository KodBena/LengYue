/**
 * src/composables/useAnalysisTimeline.ts
 * License: Public Domain (The Unlicense)
 */

import { computed, ref, watch, type Ref, type ComputedRef } from 'vue';
import { ledger } from '../services/analysis-ledger';
import { analysisService } from '../services/analysis-service';
import type { NodeId } from '../types';
import { activeConfigHash } from '../services/analysis-config';

export interface AnalysisTimelineState {
  visitVector: ComputedRef<number[]>;
  selectionRange: Ref<[number, number]>;
  /**
   * The only sanctioned way to update selectionRange from outside this composable.
   * Using this setter — rather than mutating selectionRange.value directly —
   * preserves the black-box contract and prevents callers from accidentally
   * reassigning the Ref binding instead of its value.
   */
  setSelectionRange: (range: [number, number]) => void;
  analyzeSelection: (visits: number) => void;
}

export function useAnalysisTimeline(
  variationPath: Ref<string[]>,
  boardId: string,
): AnalysisTimelineState {

  const visitVector = computed<number[]>(() => {
    const ids = variationPath.value;
    if (ids.length === 0) return [];

    const rawVisits = ids.map(id => ledger.getRaw(activeConfigHash.value, id as NodeId)?.rootInfo?.visits ?? 0);
    const globalMax = Math.max(...rawVisits, 1);
    return rawVisits.map(v => v / globalMax);
  });

  const selectionRange = ref<[number, number]>([0, 0]);

  watch(
    () => variationPath.value.length,
    (len) => {
      if (len === 0) {
        selectionRange.value = [0, 0];
        return;
      }
      
      const [prevStart, prevEnd] = selectionRange.value;

      if (prevStart === 0 && prevEnd === 0) {
        selectionRange.value = [0, len - 1];
        return;
      }

      const s = isNaN(prevStart) ? 0 : prevStart;
      const e = isNaN(prevEnd) ? len : prevEnd;

      const newStart = Math.max(0, Math.min(s, len - 1));
      const newEnd   = Math.max(newStart + 1, Math.min(e, len));
      
      selectionRange.value = [newStart, newEnd];
    },
    { immediate: true },
  );

  /**
   * The single sanctioned mutation point for selectionRange.
   * Exposed as a named action to make the contract explicit and
   * prevent callers from accidentally swapping out the Ref itself.
   */
  function setSelectionRange(range: [number, number]): void {
    selectionRange.value = range;
  }

  function analyzeSelection(visits: number): void {
    const path = variationPath.value as NodeId[];
    
    const startTurn = Math.round(selectionRange.value[0]) || 0;
    const endTurn = Math.round(selectionRange.value[1]) || 0;

    if (path.length === 0 || endTurn <= startTurn) return;

    const clampedEnd = Math.min(endTurn, path.length - 1);
    analysisService.analyzeRange(boardId as any, path, startTurn, clampedEnd, visits);
  }

  return { visitVector, selectionRange, setSelectionRange, analyzeSelection };
}
