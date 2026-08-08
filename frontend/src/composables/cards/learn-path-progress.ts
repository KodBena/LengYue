/**
 * src/composables/cards/learn-path-progress.ts
 *
 * Per-board "currently awaiting on-demand engine analysis at this
 * node" marker — the Learn Path walk's live-progress surface
 * (ADR-0002/C6 progress honesty; commission ledger row 881). Now that
 * the walk DRIVES the engine for a position with no recorded
 * analysis (see `useLearnPath.ts`'s module header, "On-demand
 * analysis"), the tree-growth checkpoint alone no longer tells the
 * user whether the walk is quietly stepping through already-recorded
 * positions or blocked waiting on a live query — this registry is
 * the extra bit of live state that distinguishes the two, surfaced
 * as a distinct ring on the node in `TreeWidget` and a distinct
 * status line in `LearnPathModal`.
 *
 * Mirrors `learn-path-pending-markers.ts`'s module-scope, board-keyed
 * shape for the same reason: `TreeWidget` and `LearnPathModal` are
 * siblings under `App.vue`, not parent/child, so this state has to
 * live somewhere both can reach without prop-drilling through
 * `App.vue`'s own state. Kept as its own file rather than folded into
 * `learn-path-pending-markers.ts` — the two track different concerns
 * (mint-eligibility vs. in-flight-query state) and have independent
 * lifecycles within a single walk (a node can be marked "analyzing"
 * and never become a pending-mint marker at all, e.g. the spine).
 *
 * Single-node, not a set: the walk issues at most one in-flight
 * on-demand query at a time (`useLearnPath.ts`'s module header,
 * "Pacing"), so "the node currently being analyzed" is always at
 * most one value per board.
 *
 * License: Public Domain (The Unlicense)
 */
import { reactive } from 'vue';
import type { BoardId, NodeId } from '../../types';
import { registerBoardCloseHandler, registerWorkspaceResetHandler } from '../../store/teardown-registry';

const analyzingNodeByBoard = reactive(new Map<BoardId, NodeId | null>());

/** The NodeId the walk is currently awaiting an on-demand engine query for on `boardId`, or `null` when nothing is in flight. */
export function getAnalyzingNodeId(boardId: BoardId): NodeId | null {
  return analyzingNodeByBoard.get(boardId) ?? null;
}

/** Marks `nodeId` as "awaiting engine analysis" for `boardId`. Called by `useLearnPath`'s walk immediately before issuing an on-demand query. */
export function setAnalyzingNode(boardId: BoardId, nodeId: NodeId): void {
  analyzingNodeByBoard.set(boardId, nodeId);
}

/** Clears the marker for `boardId` once the in-flight query settles (result, refusal, timeout, or abort). Safe when nothing is set. */
export function clearAnalyzingNode(boardId: BoardId): void {
  analyzingNodeByBoard.set(boardId, null);
}

registerBoardCloseHandler({
  label: 'learn-path-progress:remove',
  // Drops the closing board's slot entirely (not just clears it to
  // null) — same "don't accumulate dead entries over a session" shape
  // as `learn-path-pending-markers.ts`'s own board-close handler.
  run: (boardId) => { analyzingNodeByBoard.delete(boardId); },
});
registerWorkspaceResetHandler({
  label: 'learn-path-progress',
  run: () => { analyzingNodeByBoard.clear(); },
});
