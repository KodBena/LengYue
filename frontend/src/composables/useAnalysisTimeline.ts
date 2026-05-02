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
import type { BoardId, NodeId, PlyIndex } from '../types';
import { activeConfigHash } from '../services/analysis-config';

export interface AnalysisTimelineState {
  visitVector: ComputedRef<number[]>;
  /**
   * Read-only view onto the active board's stored selection range.
   * Mutate via `setSelectionRange`, never via `.value =`. Branded
   * `[PlyIndex, PlyIndex]` per `BoardState.analysisRange`'s brand
   * (which the brand pair was introduced to enforce against the
   * colour-local-vs-absolute-ply confusion class).
   */
  selectionRange: ComputedRef<[PlyIndex, PlyIndex]>;
  /** The only sanctioned mutation point. */
  setSelectionRange: (range: [PlyIndex, PlyIndex]) => void;
  analyzeSelection: (visits: number) => void;
}

export function useAnalysisTimeline(
  variationPath: Ref<NodeId[]>,
  boardId: BoardId,
): AnalysisTimelineState {

  const visitVector = computed<number[]>(() => {
    const ids = variationPath.value;
    if (ids.length === 0) return [];

    const rawVisits = ids.map(id => ledger.getRaw(activeConfigHash.value, id)?.rootInfo?.visits ?? 0);
    const globalMax = Math.max(...rawVisits, 1);
    return rawVisits.map(v => v / globalMax);
  });

  // ── Selection range — store-backed ────────────────────────────────────────
  const board = computed(() => store.boards.find(b => b.id === boardId));
  const stored = computed(() => board.value?.analysisRange);

  // Brand cast at construction: the `[0, 0]` fallback is the empty range
  // at the root, valid PlyIndices by construction (PlyIndex 0 = root).
  const selectionRange = computed<[PlyIndex, PlyIndex]>(
    () => stored.value ?? ([0, 0] as [PlyIndex, PlyIndex])
  );

  function setSelectionRange(range: [PlyIndex, PlyIndex]): void {
    mutateBoard(boardId, draft => { draft.analysisRange = range; });
  }

  // Keep the stored range in sync with the path length: initialize on
  // first observation of a non-empty path, clamp on subsequent length
  // changes. Skip the write when the clamp is a no-op so we don't churn
  // boardsVersion on every navigation. Brand casts at the construction
  // sites are safe by construction — every value is clamped against
  // `len = variationPath.value.length`, which is the upper bound of
  // valid PlyIndices for the active path.
  watch(
    () => variationPath.value.length,
    (len) => {
      if (len === 0) return;

      const prev = stored.value;
      if (!prev) {
        setSelectionRange([0, len - 1] as [PlyIndex, PlyIndex]);
        return;
      }

      const [prevStart, prevEnd] = prev;
      const s = isNaN(prevStart) ? 0 : prevStart;
      const e = isNaN(prevEnd) ? len : prevEnd;

      const newStart = Math.max(0, Math.min(s, len - 1));
      const newEnd   = Math.max(newStart + 1, Math.min(e, len));

      if (newStart !== prevStart || newEnd !== prevEnd) {
        setSelectionRange([newStart, newEnd] as [PlyIndex, PlyIndex]);
      }
    },
    { immediate: true },
  );

  function analyzeSelection(visits: number): void {
    const path = variationPath.value;

    const startTurn = Math.round(selectionRange.value[0]) || 0;
    const endTurn = Math.round(selectionRange.value[1]) || 0;

    if (path.length === 0 || endTurn <= startTurn) return;

    const clampedEnd = Math.min(endTurn, path.length - 1);
    analysisService.analyzeRange(boardId, path, startTurn, clampedEnd, visits);
  }

  return { visitVector, selectionRange, setSelectionRange, analyzeSelection };
}
