/**
 * src/composables/board/useCloseBoardGuard.ts
 * Owns the close-board guard policy (ADR-0019 audit S6 / C10 — board
 * close was previously irreversible and unconfirmed: `closeBoard` was
 * wired straight from BoardTab's close button with no confirm, no undo).
 *
 * The caller passes in a `confirmCloseBoardModalRef` (the template-bound
 * ref to `<ConfirmCloseBoardModal />`), same contract shape as
 * `useDirtyBoardGuard`'s `confirmLoadModalRef`. Holding the ref at the
 * caller's top level lets vue-tsc track string-ref usage; the composable
 * consumes it. If the ref is null at handler-call time, the contract has
 * been violated by a missing template mount; we throw rather than
 * silently swallow (per ADR-0002).
 *
 * Guard policy: confirm only when the board holds more than its root
 * node — the same cheap "has moves" signal `useDirtyBoardGuard`'s
 * `resolveTargetBoard` already uses to decide whether a board is worth
 * protecting from an overwrite. A freshly-created blank board (root node
 * only, nothing a user could lose) closes immediately with no prompt;
 * anything with actual tree content is confirmed. This mirrors the app's
 * one existing destructive-vs-trivial distinction rather than inventing
 * a new one, and avoids the "confirm always" alternative's cost: closing
 * the ambient blank boards a workspace accumulates (the audit's own
 * 92-board rail) would otherwise mean dozens of pointless confirms for
 * boards with nothing on them.
 *
 * License: Public Domain (The Unlicense).
 */
import type { Ref } from 'vue';
import { store, closeBoard } from '../../store';
import { resolveGameName } from '../../engine/util';
import type { BoardId } from '../../types';
import ConfirmCloseBoardModal from '../../components/modals/ConfirmCloseBoardModal.vue';

export function useCloseBoardGuard(
  confirmCloseBoardModalRef: Ref<InstanceType<typeof ConfirmCloseBoardModal> | null>,
): {
  requestCloseBoard: (id: BoardId) => Promise<void>;
} {
  async function requestCloseBoard(id: BoardId): Promise<void> {
    const board = store.boards.find(b => b.id === id);
    if (!board) return; // already gone — nothing to confirm or close

    const nodeCount = Object.keys(board.nodes).length;
    if (nodeCount > 1) {
      // Contract: ConfirmCloseBoardModal must be mounted via
      // confirmCloseBoardModalRef before this handler can be invoked.
      // Fail loud if the contract is broken (per ADR-0002), rather than
      // silently closing without the guard the caller asked for.
      if (!confirmCloseBoardModalRef.value) {
        throw new Error(
          'useCloseBoardGuard: ConfirmCloseBoardModal is not mounted — bind ' +
          'confirmCloseBoardModalRef in the template before requestCloseBoard can run.',
        );
      }
      const confirmed = await confirmCloseBoardModalRef.value.open(resolveGameName(board));
      if (!confirmed) return;
    }

    closeBoard(id);
  }

  return { requestCloseBoard };
}
