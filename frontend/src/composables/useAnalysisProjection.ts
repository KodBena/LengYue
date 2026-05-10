/**
 * src/composables/useAnalysisProjection.ts
 * Projects raw board state and analysis data into a UI-ready ViewModel.
 * Logic is moved here from the UI layer to ensure auditability.
 * License: Public Domain (The Unlicense)
 */

import { computed } from 'vue';
import { store, activeBoard } from '../store';
import { useVariationPath } from './useVariationPath';
import { useEnrichedData } from './useEnrichedData';
import { useAnalysisTimeline } from './useAnalysisTimeline';
import type { BoardId, ColorMoveIndex } from '../types';

/**
 * Branded-type signature discipline:
 *
 * - `boardId` parameter is `BoardId`. Caller is AnalysisDashboard which
 *   passes `props.boardId: BoardId` (already tightened in Commit 5a).
 *
 * - `variationPath` flows in as `ComputedRef<NodeId[]>` directly from
 *   `useVariationPath`, which itself reads from `board.nodes:
 *   Record<NodeId, GameNode>` via `getActiveVariationPath` — every
 *   element is a NodeId by construction. The boundary adapter that
 *   previously lived at the head of this composable (a single
 *   safe-by-construction `as NodeId[]` cast paired with renamed
 *   `variationPathRaw`) is gone; the upstream return type is now the
 *   truth and downstream consumers receive the branded shape directly.
 */
export function useAnalysisProjection(boardId: BoardId) {
  // 1. Source Data
  const variationPath = useVariationPath(() => boardId);
  const enriched = useEnrichedData(variationPath);

  const {
    visitVector,
    selectionRange,
    setSelectionRange,
    analyzeSelection,
  } = useAnalysisTimeline(variationPath, boardId);

  // 2. Index Calculation (The "Audit" Logic)
  const activeMainIndex = computed(() => {
    const id = activeBoard.value?.currentNodeId;
    if (!id) return null;
    const idx = variationPath.value.indexOf(id);
    return idx === -1 ? null : idx;
  });

  const getPlayerIndex = (color: 'B' | 'W'): ColorMoveIndex | null => {
    const board = store.boards.find(b => b.id === boardId);
    if (!board || activeMainIndex.value === null) return null;

    // Internal accesses now use the branded variationPath; no per-site
    // casts needed (the boundary cast above did the work once).
    const currentId = variationPath.value[activeMainIndex.value];
    const currentNode = board.nodes[currentId];

    if (currentNode?.move?.color === color) return null;

    let count = 0;
    for (let i = 0; i <= activeMainIndex.value; i++) {
      const node = board.nodes[variationPath.value[i]];
      if (node?.move?.color === color) count++;
    }
    // Brand cast at construction: `count` is the colour-local move index
    // PlayerPanel expects (semantics preserved from the prior bare-number
    // return; type claim now honest).
    return count as ColorMoveIndex;
  };

  const activeBlackIndex = computed(() => getPlayerIndex('B'));
  const activeWhiteIndex = computed(() => getPlayerIndex('W'));

  // 3. Series — palette-driven only.
  // The default palette's state_fns include 'Score Advantage'
  // (= `x["rootInfo"]["scoreLead"]`) which produces a series with the
  // same values the v1.0.20-removed SPA-side `scoreLead` kernel
  // emitted. The proxy is now the single source of truth for every
  // series in the Game State chart; the SPA contributes no ad-hoc
  // metric extraction. A side effect that motivated the deletion:
  // when the user purges analysis, `enriched.value.stateSeries`
  // empties (no packets → no `extra.state` → no series), and
  // mainSeries is naturally `[]`. The prior kernel-scoreLead path
  // emitted a series of all-null points that kept mainSeries non-
  // empty after purge, so the chart legend/axes lingered visually
  // even though the data was gone.
  const mainSeries = computed(() => enriched.value.stateSeries);

  return {
    // State
    variationPath,
    mainSeries,
    enriched,
    
    // Selection/Timeline
    visitVector,
    selectionRange,
    setSelectionRange,
    
    // Indices
    activeMainIndex,
    activeBlackIndex,
    activeWhiteIndex,
    
    // Actions
    analyzeSelection,
  };
}
