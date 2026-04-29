/**
 * src/composables/useAnalysisTimeline.ts
 *
 * Owns the analysis-chart selection range plus the visit-vector
 * derived from the ledger. Source of truth for the selection range
 * is `BoardState.analysisRange` in the store — that lets the range
 * survive tab switches and board switches per release-scope item 2
 * (BoardState outlives the component lifecycle on both axes; the
 * `:key="boardId"` re-mount on board switch picks up the new
 * board's stored range automatically).
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, watch, type Ref, type ComputedRef } from 'vue';
import { ledger } from '../services/analysis-ledger';
import { analysisService } from '../services/analysis-service';
import { store, mutateBoard } from '../store';
import type { BoardId, NodeId } from '../types';
import { activeConfigHash } from '../services/analysis-config';

export interface AnalysisTimelineState {
  visitVector: ComputedRef<number[]>;
  /**
   * Read-only view onto the active board's stored selection range.
   * Mutate via `setSelectionRange`, never via `.value =`.
   */
  selectionRange: ComputedRef<[number, number]>;
  /** The only sanctioned mutation point. */
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

  // ── Selection range — store-backed ────────────────────────────────────────
  // Single safe-by-construction cast at the boundary: callers thread
  // `boardId: BoardId` (e.g. AnalysisDashboard's `props.boardId`) but
  // the parameter is currently typed `string` for compatibility with
  // pre-branded callers. Localized here so the rest of the composable
  // can use the branded type for `mutateBoard`.
  const branded = boardId as BoardId;

  const board = computed(() => store.boards.find(b => b.id === branded));
  const stored = computed(() => board.value?.analysisRange);

  const selectionRange = computed<[number, number]>(() => stored.value ?? [0, 0]);

  function setSelectionRange(range: [number, number]): void {
    mutateBoard(branded, draft => { draft.analysisRange = range; });
  }

  // Keep the stored range in sync with the path length: initialize on
  // first observation of a non-empty path, clamp on subsequent length
  // changes. Skip the write when the clamp is a no-op so we don't churn
  // boardsVersion on every navigation.
  watch(
    () => variationPath.value.length,
    (len) => {
      if (len === 0) return;

      const prev = stored.value;
      if (!prev) {
        // First init: full range.
        setSelectionRange([0, len - 1]);
        return;
      }

      const [prevStart, prevEnd] = prev;
      const s = isNaN(prevStart) ? 0 : prevStart;
      const e = isNaN(prevEnd) ? len : prevEnd;

      const newStart = Math.max(0, Math.min(s, len - 1));
      const newEnd   = Math.max(newStart + 1, Math.min(e, len));

      if (newStart !== prevStart || newEnd !== prevEnd) {
        setSelectionRange([newStart, newEnd]);
      }
    },
    { immediate: true },
  );

  function analyzeSelection(visits: number): void {
    const path = variationPath.value as NodeId[];

    const startTurn = Math.round(selectionRange.value[0]) || 0;
    const endTurn = Math.round(selectionRange.value[1]) || 0;

    if (path.length === 0 || endTurn <= startTurn) return;

    const clampedEnd = Math.min(endTurn, path.length - 1);
    analysisService.analyzeRange(branded, path, startTurn, clampedEnd, visits);
  }

  return { visitVector, selectionRange, setSelectionRange, analyzeSelection };
}
