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
import { useKernelSeries } from './useKernelSeries';
import { scoreLead } from '../engine/analysis/kernels';
import { useAnalysisTimeline } from './useAnalysisTimeline';
import type { NodeId, BoardId, ColorMoveIndex } from '../types';

/**
 * Branded-type signature discipline (Commit 5a-extension):
 *
 * - `boardId` parameter tightened from `string` to `BoardId`. Caller is
 *   AnalysisDashboard which passes `props.boardId: BoardId` (already
 *   tightened in Commit 5a).
 *
 * - `variationPath` is now exposed as `ComputedRef<NodeId[]>` rather than
 *   the raw `Ref<string[]>` returned by `useVariationPath`. The cast is
 *   localized to a single adapter computed at the boundary of this
 *   composable; downstream consumers (AnalysisDashboard, ScoreLeadPanel,
 *   PlayerPanel, StabilityPanel) get the branded shape automatically.
 *
 *   This is the agreed pattern from Commit 2-tail: cast at the upstream-
 *   boundary, document as safe-by-construction, until `useVariationPath`
 *   itself is tightened (which would let us remove this adapter and
 *   expose the underlying ref directly). The cast is honest because
 *   variationPath is computed by walking `board.nodes`
 *   (Record<NodeId, GameNode>); every element is a valid NodeId by
 *   construction. Future cleanup: tighten useVariationPath to return
 *   `Ref<NodeId[]>` and replace this adapter with a passthrough.
 */
export function useAnalysisProjection(boardId: BoardId) {
  // 1. Source Data
  const variationPathRaw = useVariationPath(() => boardId);
  const enriched = useEnrichedData(variationPathRaw);
  const scoreLeadData = useKernelSeries(variationPathRaw, scoreLead);

  // Boundary adapter: re-expose variationPath with branded element type.
  // Single safe-by-construction cast localized here so consumers don't
  // each need their own.
  const variationPath = computed<NodeId[]>(
    () => variationPathRaw.value as NodeId[]
  );
  
  const {
    visitVector,
    selectionRange,
    setSelectionRange,
    analyzeSelection,
  } = useAnalysisTimeline(variationPathRaw, boardId);

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

  // 3. Series Merging
  const mainSeries = computed(() => {
    if (scoreLeadData.value.length === 0 && enriched.value.stateSeries.length === 0) {
      return [];
    }

    const board = store.boards.find(b => b.id === boardId);
    
    // Transform flat arrays into format that supports conditional dot styling.
    // The kernel series emits `[number | null, number | null][]`: both the
    // index slot and the value slot can be null (an absent kernel sample
    // means we can't anchor it to a turn either). Guard both at the top
    // and pass the null-pair through unchanged so downstream renderers see
    // a uniform shape.
    const scoreLeadFormatted = scoreLeadData.value.map(([i, val]) => {
      if (i === null || val === null) return [i, val];
      
      const nodeId = variationPath.value[i];
      const node = board?.nodes[nodeId];
      
      // Determine dot color by inspecting who actually played the move to reach this state
      const isBlack = node?.move?.color === 'B';
      const pointColor = node?.move ? (isBlack ? '#4aaef0' : '#f04a4a') : '#888';
      
      return {
        value: [i, val],
        itemStyle: { color: pointColor }
      };
    });

    return [
      { 
        name: 'Score Lead', 
        data: scoreLeadFormatted, 
        color: '#fff',
        showPoints: true 
      },
      ...enriched.value.stateSeries,
    ];
  });

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
