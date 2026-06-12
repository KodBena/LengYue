/**
 * src/composables/cards/board-card-trees.ts
 *
 * Per-board card-tree state at module scope. The forest, active set,
 * hydrated cards map, per-tree forest stats, and lifecycle flags all
 * become projections of "what this board is currently exploring," in
 * the same shape `store.session.reviews[boardId]` carries the review
 * session's projection.
 *
 * Why module-scope rather than per-composable-instance: the same
 * board may be displayed by multiple components — `ForestDirectory`'s
 * Decks panel, the future `CardTreeWidget` overlay in a review panel —
 * and they must read the same accumulated state. A composable-instance
 * map would split the state by callsite. Module-scope mirrors the
 * existing pattern in `useReviewSession.pendingAnalysisAborts` and
 * `analysisService.activeQueryIds`.
 *
 * Lifecycle: a slot is lazily initialised on first `getOrCreate`
 * call. `removeBoardCardTree` is invoked from `closeBoard` (per-board
 * cleanup) and `resetWorkspace` calls `clearAllBoardCardTrees`
 * (identity flip). Both calls are safe when no slot exists. Resource-
 * ownership audit tag O12 (board-card-trees — per-board card-tree
 * state; a code-minted tag past the archived plan's inventory, so the
 * slug, not the number, is the stable handle).
 *
 * Persistence: not persisted via SyncService. The forest, active set,
 * and hydrated cards are analysis-shaped data — large, regenerable
 * from the backend on demand, and ephemeral within a session. Same
 * reasoning as `pendingAnalysisAborts` and the analysis ledger.
 *
 * License: Public Domain (The Unlicense)
 */
import { reactive } from 'vue';
const emptyState = () => ({
    forest: [],
    activeSet: new Set(),
    cards: new Map(),
    forestStats: new Map(),
    isLoading: false,
    error: null,
    source: null,
});
// Reactive map so consumers' `computed`s and `watch`es re-fire when a
// slot's contents change. The map itself is reactive; per-slot fields
// are reassigned wholesale (new Set / new Map) rather than mutated in
// place — same pattern as `useCardTreeData` already followed before
// this refactor.
const boardCardTrees = reactive(new Map());
export function getOrCreateBoardCardTree(boardId) {
    let slot = boardCardTrees.get(boardId);
    if (!slot) {
        slot = emptyState();
        boardCardTrees.set(boardId, slot);
    }
    return slot;
}
export function getBoardCardTree(boardId) {
    return boardCardTrees.get(boardId) ?? null;
}
/**
 * Drop the per-board card-tree slot. Called from `closeBoard` so the
 * map doesn't accumulate dead entries over the session. Safe when no
 * slot exists.
 */
export function removeBoardCardTree(boardId) {
    boardCardTrees.delete(boardId);
}
/**
 * Drop every card-tree slot. Called from `resetWorkspace` on identity
 * flip so the prior identity's exploration state can't leak into the
 * new identity's session. The slots hold accumulated forests / cards
 * which are tenant-scoped data; clearing them on identity change is
 * privacy-correct.
 */
export function clearAllBoardCardTrees() {
    boardCardTrees.clear();
}
