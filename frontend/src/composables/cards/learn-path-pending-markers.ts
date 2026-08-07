/**
 * src/composables/cards/learn-path-pending-markers.ts
 *
 * Per-board registry of "would-be-carded on mint all" node markers for
 * the "Learn this path" exploration (ledger row 718 amendment #2:
 * PRE-MINT MARKERS). `useLearnPath.explore()` adds a `NodeId` here the
 * moment it records a deviation candidate that ISN'T already an
 * existing card (the marker set = the pending-seed set minus the
 * existing-card subset — matching what `confirmMint` will actually
 * mint), so the marker appears live as the walk grows the tree,
 * composing with the live-growth requirement rather than a separate
 * pass. `TreeWidget.vue` reads a board's set via `getPendingMintNodeIds`
 * (passed in as a prop, same shape as its existing `gameHeadIds` — a
 * `ReadonlySet<NodeId>` membership test per node; see that prop's own
 * doc comment for the precedent this mirrors) and renders a dashed
 * blue ring for a member node, visually distinct from the active-node
 * ring and the game-head ring already drawn there.
 *
 * Ownership / clearing (resource-ownership-at-mutation-sites
 * discipline, frontend/CLAUDE.md): the set is explicitly owned by
 * whichever `LearnPathModal` session is exploring a given board.
 * `clearPendingMintMarkers` is called from two sites in
 * `LearnPathModal.vue` — after `confirmMint` resolves (whether it
 * seeded anything or not) and on an explicit discard/close of an
 * unconfirmed exploration — never implicitly. `closeBoard` /
 * `resetWorkspace` also drop a board's slot outright (registered
 * below) so a closed board can't leave a stale marker set for a
 * future board that happens to reuse... — it doesn't reuse `BoardId`s
 * (fresh UUID per board), but the slot would otherwise accumulate
 * dead entries over a session the same way `board-card-trees.ts`'s
 * slots would without its own board-close teardown, which this
 * module mirrors.
 *
 * Module-scope (not composable-instance) for the same reason as
 * `board-card-trees.ts`: `TreeWidget` (via `App.vue`) and
 * `LearnPathModal` are siblings, not parent/child, so the state has
 * to live somewhere both can reach without prop-drilling through
 * `App.vue`'s own state.
 *
 * License: Public Domain (The Unlicense)
 */
import { reactive } from 'vue';
import type { BoardId, NodeId } from '../../types';
import { registerBoardCloseHandler, registerWorkspaceResetHandler } from '../../store/teardown-registry';

const EMPTY_SET: ReadonlySet<NodeId> = new Set();

const pendingMintNodesByBoard = reactive(new Map<BoardId, Set<NodeId>>());

/** Reactive membership set for `boardId`, for `TreeWidget`'s prop. Never `undefined` — an empty board reads as the shared empty set. */
export function getPendingMintNodeIds(boardId: BoardId): ReadonlySet<NodeId> {
  return pendingMintNodesByBoard.get(boardId) ?? EMPTY_SET;
}

/** Marks `nodeId` as "would be carded on mint all" for `boardId`. Called live, during the walk, by `useLearnPath.explore()`. */
export function addPendingMintMarker(boardId: BoardId, nodeId: NodeId): void {
  let set = pendingMintNodesByBoard.get(boardId);
  if (!set) {
    set = reactive(new Set<NodeId>());
    pendingMintNodesByBoard.set(boardId, set);
  }
  set.add(nodeId);
}

/** Drops every marker for `boardId` — called after a batch mint resolves, or on an explicit discard. Safe when no slot exists. */
export function clearPendingMintMarkers(boardId: BoardId): void {
  pendingMintNodesByBoard.get(boardId)?.clear();
}

/** Drops the slot entirely. Called on board-close / workspace-reset teardown (below); exported for direct test use. */
export function removePendingMintMarkers(boardId: BoardId): void {
  pendingMintNodesByBoard.delete(boardId);
}

registerBoardCloseHandler({
  label: 'learn-path-pending-markers:remove',
  run: (boardId) => removePendingMintMarkers(boardId),
});
registerWorkspaceResetHandler({
  label: 'learn-path-pending-markers',
  run: () => pendingMintNodesByBoard.clear(),
});
