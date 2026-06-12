/**
 * src/composables/board/engine-move-delta-reconcile.ts
 *
 * Shared surgical-merge helper for engine-move-delta consumers.
 *
 * Both `usePlayMatch.start` and `usePlayFromPosition.start` contain
 * structurally identical `onMoveApplied` bodies — ~35 lines of
 * merge-and-gate logic that appends a new engine-move node into the
 * store and optionally advances the user's cursor. The only caller-
 * supplied variation is the composable-name label used in error
 * messages.
 *
 * Extracting the body here makes the "one shared contract" structural
 * rather than copy-paste-enforced: any future fix to the merge or the
 * user-tracking gate applies once and propagates to both consumers.
 * Deferred from PR #422's `not-filed:extract-engine-move-delta-reconcile-helper`
 * marker (work-status item `engine-move-delta-consumer-residue`).
 *
 * License: Public Domain (The Unlicense)
 */
import { store, mutateBoard } from '../../store';
import { navigateTo } from '../../engine/navigator';
/**
 * Reconcile a single engine-move delta into the store.
 *
 * Appends the new child to the parent node (new-node case) or bumps
 * `activeChildIndex` to the matching existing child (existing-child-
 * reuse case), then advances the user's cursor to `newPointer` if and
 * only if they were tracking — i.e., `draft.currentNodeId ===
 * previousPointer` at the moment the move lands.
 *
 * **Fail-loud contract (ADR-0002):**
 * - Throws if the board has been removed from the store mid-run.
 * - Throws if the parent node (`previousPointer`) is missing from the
 *   board's node map.
 * - Throws if `newNode === null` (existing-child reuse) but `newPointer`
 *   is not found among the parent's children — a structural invariant
 *   violation that would leave the board silently inconsistent.
 *   (`applyGoMove` only returns in-tree pointers today, so this branch
 *   is unreachable under normal operation; the throw surfaces any future
 *   breakage loudly per ADR-0002.)
 *
 * @param boardId  The board being reconciled.
 * @param delta    The per-move delta emitted by the engine loop.
 * @param label    Caller label for error messages ("usePlayMatch" /
 *                 "usePlayFromPosition").
 */
export function reconcileEngineMoveDelta(boardId, delta, label) {
    const { previousPointer, newPointer, newNode } = delta;
    if (!store.boards.find((b) => b.id === boardId)) {
        throw new Error(`${label}: board ${boardId} disappeared mid-run`);
    }
    mutateBoard(boardId, (draft) => {
        const parent = draft.nodes[previousPointer];
        if (parent === undefined) {
            throw new Error(`${label}: parent node ${previousPointer} missing from board ${boardId}`);
        }
        if (newNode !== null) {
            // New-node case: append the child to the parent's children list
            // and add the new node to draft.nodes. Use `parent.children.length`
            // (the index of the new entry) as the active-child index, which
            // matches `applyGoMove`'s convention for fresh nodes.
            draft.nodes[previousPointer] = {
                ...parent,
                children: [...parent.children, newPointer],
                activeChildIndex: parent.children.length,
            };
            draft.nodes[newPointer] = newNode;
        }
        else {
            // Existing-child reuse: just bump activeChildIndex so subsequent
            // active-variation walks descend into the engine's variation rather
            // than whatever the user had selected.
            const childIdx = parent.children.indexOf(newPointer);
            if (childIdx !== -1) {
                draft.nodes[previousPointer] = { ...parent, activeChildIndex: childIdx };
            }
            else {
                // ADR-0002 fail-loud: `newNode === null` signals that the engine's
                // move duplicated an existing child, so `newPointer` must be among
                // `parent.children`. If it is not, the delta is internally
                // inconsistent — a structural invariant the loop's caller relies
                // on. This branch is unreachable today (`applyGoMove` only returns
                // pointers already in the tree), but an explicit throw surfaces any
                // future breakage at the violation site rather than letting the
                // board silently diverge.
                throw new Error(`${label}: existing-child reuse signalled (newNode===null) but newPointer ` +
                    `${newPointer} not found in parent ${previousPointer}'s children on board ` +
                    `${boardId} — delta is internally inconsistent`);
            }
        }
        if (draft.currentNodeId === previousPointer) {
            navigateTo(draft, newPointer);
        }
    });
}
