/**
 * src/composables/analysis/useAnalysisTimeline.ts
 *
 * Owns the analysis-chart selection range plus the visit-vector
 * derived from the ledger. Source of truth for the selection range is
 * `BoardState.analysisRanges` in the store, keyed per branch-stem
 * (`BranchRangeKey`, `branch-range-key.ts`) — that lets a range set on
 * one variation survive tab switches, board switches, AND navigating
 * away to a sibling branch and back, without one branch's range
 * silently clobbering another's (BoardState outlives the component
 * lifecycle on all three axes; the `:key="boardId"` re-mount on board
 * switch picks up the new board's stored ranges automatically).
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, watch, type Ref, type ComputedRef } from 'vue';
import { ledger } from '../../state/analysis-ledger';
import { analysisService } from '../../services/analysis-service';
import { store, mutateBoard } from '../../store';
import type { BoardId, PlyIndex, RootToLeafPath } from '../../types';
import { activeAnalysisKeys } from '../../state/analysis-config';
import { deriveBranchRangeKey } from './branch-range-key';

export interface AnalysisTimelineState {
  visitVector: ComputedRef<number[]>;
  /**
   * Read-only view onto the active branch stem's stored selection
   * range (`BoardState.analysisRanges[branchKey]`). Mutate via
   * `setSelectionRange`, never via `.value =`. Branded
   * `[PlyIndex, PlyIndex]` per `BoardState.analysisRanges`'s brand
   * (which the brand pair was introduced to enforce against the
   * colour-local-vs-absolute-ply confusion class).
   */
  selectionRange: ComputedRef<[PlyIndex, PlyIndex]>;
  /** The only sanctioned mutation point. */
  setSelectionRange: (range: [PlyIndex, PlyIndex]) => void;
  analyzeSelection: (visits: number) => void;
}

export function useAnalysisTimeline(
  // Root→leaf by contract: the timeline's x-axis and the clamp logic
  // below span the whole active line (branded-path-types arc).
  variationPath: Ref<RootToLeafPath>,
  boardId: BoardId,
): AnalysisTimelineState {

  const visitVector = computed<number[]>(() => {
    const ids = variationPath.value;
    if (ids.length === 0) return [];

    const rawVisits = ids.map(id => ledger.getRaw(activeAnalysisKeys.value.rawKey, id)?.rootInfo?.visits ?? 0);
    const globalMax = Math.max(...rawVisits, 1);
    return rawVisits.map(v => v / globalMax);
  });

  // ── Selection range — store-backed, keyed per branch-stem ──────────────────
  const board = computed(() => store.boards.find(b => b.id === boardId));
  // BranchRangeKey mint site: the sole factory, given the active path and
  // this board's node table (the two legs the key's dependency-set doc
  // comment names). Recomputes only when the path or the tree shape
  // changes — a plain cursor move within the same line does not touch
  // `activeChildIndex` anywhere, so the key (and thus which map entry
  // `stored` below reads) stays stable across ordinary navigation.
  const branchKey = computed(() => deriveBranchRangeKey(variationPath.value, board.value?.nodes ?? {}));
  const stored = computed(() => board.value?.analysisRanges?.[branchKey.value]);

  // Brand cast at construction: the `[0, 0]` fallback is the empty range
  // at the root, valid PlyIndices by construction (PlyIndex 0 = root).
  const selectionRange = computed<[PlyIndex, PlyIndex]>(
    () => stored.value ?? ([0, 0] as [PlyIndex, PlyIndex]) // PlyIndex brand mint: [0,0] is the empty root range (see comment above)
  );

  function setSelectionRange(range: [PlyIndex, PlyIndex]): void {
    const key = branchKey.value;
    mutateBoard(boardId, draft => {
      if (!draft.analysisRanges) draft.analysisRanges = {};
      draft.analysisRanges[key] = range;
    });
  }

  // Keep the stored range in sync with (branch key, path length): reseed
  // the default fit-to-path range on first observation of a branch stem
  // that has no remembered entry yet (a fresh fork, OR the mainline
  // before any fork exists), clamp in place on a length change within
  // the SAME branch stem (plain forward play/extension — the existing,
  // must-not-regress behavior). Watching the pair (not length alone) is
  // load-bearing: a branch switch to a sibling of equal length changes
  // `stored` (a different map entry) without changing `path.length`, and
  // that sibling's own default must still get seeded the first time it's
  // visited. Skip the write when the clamp is a no-op so we don't churn
  // boardsVersion on every navigation. Brand casts at the construction
  // sites are safe by construction — every value is clamped against
  // `len = variationPath.value.length`, which is the upper bound of
  // valid PlyIndices for the active path.
  watch(
    () => [branchKey.value, variationPath.value.length] as const,
    ([, len]) => {
      if (len === 0) return;

      const prev = stored.value;
      if (!prev) {
        setSelectionRange([0, len - 1] as [PlyIndex, PlyIndex]); // PlyIndex brand mint: clamped against path length (see comment above)
        return;
      }

      const [prevStart, prevEnd] = prev;
      const s = isNaN(prevStart) ? 0 : prevStart;
      const e = isNaN(prevEnd) ? len : prevEnd;

      const newStart = Math.max(0, Math.min(s, len - 1));
      const newEnd   = Math.max(newStart + 1, Math.min(e, len));

      if (newStart !== prevStart || newEnd !== prevEnd) {
        setSelectionRange([newStart, newEnd] as [PlyIndex, PlyIndex]); // PlyIndex brand mint: clamped against path length (see comment above)
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
