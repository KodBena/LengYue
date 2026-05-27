/**
 * src/composables/board/useVariationPath.ts
 * Reactively tracks the full active game line: root → active leaf.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, type ComputedRef } from 'vue';
import { boardsById } from '../../store';
import { getActiveVariationPath } from '../../engine/util';
import type { BoardId, NodeId } from '../../types';

// Branded-type signature: `getActiveVariationPath` returns `NodeId[]`
// (every element is a key in `board.nodes: Record<NodeId, GameNode>` by
// construction); the loose `ComputedRef<string[]>` return type that
// previously sat here laundered the brand back to bare string and forced
// every consumer to either accept loose `string[]` itself or cast at
// each indexing site (a boundary adapter in `useAnalysisProjection`,
// downstream `as NodeId` casts in `BoardTab` and `useEnrichedData`).
// Tightening here propagates the brand through the consumer graph and
// lets those casts retire.
export function useVariationPath(getBoardId: () => BoardId): ComputedRef<NodeId[]> {
  let prevFingerprint = '';
  let prevPath: NodeId[] = [];

  return computed(() => {
    // O(1) board lookup via the derived `boardsById` index — replaces
    // the prior `store.boards.find(b => b.id === boardId)` walk that
    // registered reactive deps on every board entry, composing with
    // the N consumers (one per BoardTab) into O(N²) work per nav
    // step. Diagnosed in
    // `docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md` Bug A.
    // The `boardsById` computed invalidates whenever `store.boards`
    // mutates (the six sites that currently bump `boardsVersion`),
    // so the prior explicit `void boardsVersion.value` read is
    // redundant and dropped.
    const boardId = getBoardId();
    const board = boardsById.value[boardId];
    if (!board) return [];

    const path = getActiveVariationPath(board);
    const fingerprint = path.join(',');

    if (fingerprint === prevFingerprint) {
      return prevPath;
    }

    prevFingerprint = fingerprint;
    prevPath = path;
    return path;
  });
}
