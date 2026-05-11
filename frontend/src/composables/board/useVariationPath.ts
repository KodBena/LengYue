/**
 * src/composables/board/useVariationPath.ts
 * Reactively tracks the full active game line: root → active leaf.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, type ComputedRef } from 'vue';
import { store, boardsVersion } from '../../store';
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
    // Primary subscription: fires on every mutateBoard call (due to boardsVersion++).
    void boardsVersion.value;

    const boardId = getBoardId();
    const board = store.boards.find(b => b.id === boardId);
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
