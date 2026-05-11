/**
 * src/composables/board/useActivePath.ts
 * Extracts the lineage of Node IDs from Root to the Current Node.
 */
import { computed } from 'vue';
import { activeBoard } from '../../store';
import type { NodeId } from '../../types';

export function useActivePath() {
  return computed(() => {
    const board = activeBoard.value;
    if (!board) return [];

    const path: string[] = [];
    let currId: string | null = board.currentNodeId;

    while (currId) {
      path.unshift(currId);
      // `board.nodes` is `Record<NodeId, GameNode>`; strict indexing rejects
      // plain string keys. The cast at this boundary is the agreed Category C
      // pattern (ADR to follow): at the site where we know the string IS a
      // valid NodeId (it came from `currentNodeId`, which IS `NodeId`, or
      // from `parent`, which is a `NodeId | null`), we assert the brand.
      currId = board.nodes[currId as NodeId].parent;
    }
    return path;
  });
}
