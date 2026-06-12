/**
 * src/composables/board/useActivePath.ts
 * Extracts the lineage of Node IDs from Root to the Current Node.
 */
import { computed } from 'vue';
import { activeBoard } from '../../store';
export function useActivePath() {
    return computed(() => {
        const board = activeBoard.value;
        if (!board)
            return [];
        const path = [];
        let currId = board.currentNodeId;
        // Annotated exemption (local/hand-rolled-path-walk): this composable
        // re-derives getPath's root→current walk as a bare `string[]` (the
        // wrong-name leak the lint guards). It has ZERO consumers at HEAD (dead
        // legacy producer) — routing it through navigator.ts's branded `getPath`
        // OR deleting it is maintainer-directed (deletion needs the FILES.md
        // cut), so it is named-as-debt, not refactored in the cast-stage2 arc.
        // eslint-disable-next-line local/hand-rolled-path-walk -- unused legacy producer; route through getPath or delete (maintainer-directed)
        while (currId) {
            path.unshift(currId);
            // `board.nodes` is `Record<NodeId, GameNode>`; strict indexing rejects
            // plain string keys. The cast at this boundary is the agreed Category C
            // pattern (ADR to follow): at the site where we know the string IS a
            // valid NodeId (it came from `currentNodeId`, which IS `NodeId`, or
            // from `parent`, which is a `NodeId | null`), we assert the brand.
            currId = board.nodes[currId].parent;
        }
        return path;
    });
}
