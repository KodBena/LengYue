/**
 * src/composables/cards/mint-selection.ts
 *
 * Per-board registry of NodeIds marked for the batch card-minting
 * affordance (commissioner-designed, ledger rows 926/957/1008). This
 * is pure DATA — a typed set of node references — independent of
 * navigation: ctrl+click in `TreeWidget.vue` toggles membership here
 * without moving the cursor, and "Learn this path"
 * (`useLearnPath.ts`) adds nodes here live as it grows the tree
 * instead of minting them itself. Both are consumers of the SAME
 * affordance: `MintCardModal.vue`'s "Mint card(s)" submit reads this
 * set for the active board and builds one `POST /cards/batch` call
 * from it (`batch-mint-core.ts`); an empty set is the degenerate
 * single-mint case (today's `POST /cards/` behavior, unchanged).
 *
 * Formerly `learn-path-pending-markers.ts` (row 718's "pre-mint
 * marker" concept) — generalized in place rather than duplicated,
 * since "a node that would be minted on the next batch action" is
 * exactly what a ctrl+click selection also is; `TreeWidget` renders
 * both through the one dashed ring this file's predecessor already
 * owned (see that ring's own doc comment in `TreeWidget.vue` for the
 * concentric-ring-stack radius this reuses unchanged).
 *
 * Lifecycle (assumed facts — task's spec left the exact triggers to
 * the implementer, listed explicitly here per the commission):
 *   - Survives navigation within the same board (plain click moves
 *     the cursor; ctrl+click toggles membership; neither touches the
 *     other board's or a different node's membership).
 *   - A successful mint clears ONLY the minted entries
 *     (`removeFromSelection`) — any node the user selected AFTER the
 *     draft was prepared, or that failed to mint, stays selected.
 *   - Board close / workspace reset drop the slot entirely (mirrors
 *     the predecessor file's own teardown).
 *   - Loading a *different* game into the SAME BoardId
 *     (`loadSgfIntoBoard`, the "game switch" case — the node ids the
 *     selection references are about to become meaningless) clears
 *     the whole board's selection (`clearSelection`).
 *   - A *different* BoardId's selection is unaffected by any of the
 *     above — the registry is already keyed per-board, so switching
 *     which board is active in the UI is not a mutation at all: the
 *     newly-active board's own (independently-tracked) set is what
 *     renders, and a never-touched board reads as the shared empty
 *     set.
 *
 * Module-scope (not composable-instance), matching the predecessor
 * file's own reasoning: `TreeWidget` (via `App.vue`), `MintCardModal`,
 * and `LearnPathModal` are siblings, not parent/child, so the state
 * has to live somewhere all three can reach without prop-drilling
 * through `App.vue`.
 *
 * License: Public Domain (The Unlicense)
 */
import { reactive } from 'vue';
import type { BoardId, NodeId } from '../../types';
import { registerBoardCloseHandler, registerWorkspaceResetHandler } from '../../store/teardown-registry';

const EMPTY_SET: ReadonlySet<NodeId> = new Set();

const selectionByBoard = reactive(new Map<BoardId, Set<NodeId>>());

/** Reactive membership set for `boardId`, for `TreeWidget`'s prop and the batch-mint draft. Never `undefined` — an untouched board reads as the shared empty set. */
export function getSelectedNodeIds(boardId: BoardId): ReadonlySet<NodeId> {
  return selectionByBoard.get(boardId) ?? EMPTY_SET;
}

/** Membership test for a single node — `TreeWidget`'s ctrl+click handler uses this to decide add vs. remove. */
export function isNodeSelected(boardId: BoardId, nodeId: NodeId): boolean {
  return selectionByBoard.get(boardId)?.has(nodeId) ?? false;
}

function ensureSet(boardId: BoardId): Set<NodeId> {
  let set = selectionByBoard.get(boardId);
  if (!set) {
    set = reactive(new Set<NodeId>());
    selectionByBoard.set(boardId, set);
  }
  return set;
}

/** Adds `nodeId` to `boardId`'s selection (idempotent). Used by ctrl+click (add branch) and by `useLearnPath.explore()` marking a newly-grown node. */
export function addToSelection(boardId: BoardId, nodeId: NodeId): void {
  ensureSet(boardId).add(nodeId);
}

/** Removes `nodeId` from `boardId`'s selection (idempotent, safe when absent or when no slot exists yet). */
export function removeFromSelectionOne(boardId: BoardId, nodeId: NodeId): void {
  selectionByBoard.get(boardId)?.delete(nodeId);
}

/** Toggles `nodeId`'s membership in `boardId`'s selection — the ctrl+click primitive. */
export function toggleNodeSelection(boardId: BoardId, nodeId: NodeId): void {
  const set = ensureSet(boardId);
  if (set.has(nodeId)) set.delete(nodeId);
  else set.add(nodeId);
}

/** Removes exactly `nodeIds` from `boardId`'s selection — the "successful mint clears the minted entries" lifecycle rule. Safe when no slot exists. */
export function removeFromSelection(boardId: BoardId, nodeIds: Iterable<NodeId>): void {
  const set = selectionByBoard.get(boardId);
  if (!set) return;
  for (const id of nodeIds) set.delete(id);
}

/** Drops every selected node for `boardId` — board/game switch (a new SGF loaded into the same BoardId). Safe when no slot exists. */
export function clearSelection(boardId: BoardId): void {
  selectionByBoard.get(boardId)?.clear();
}

/** Drops the slot entirely. Called on board-close / workspace-reset teardown (below); exported for direct test use. */
export function removeSelectionSlot(boardId: BoardId): void {
  selectionByBoard.delete(boardId);
}

registerBoardCloseHandler({
  label: 'mint-selection:remove',
  run: (boardId) => removeSelectionSlot(boardId),
});
registerWorkspaceResetHandler({
  label: 'mint-selection',
  run: () => selectionByBoard.clear(),
});
