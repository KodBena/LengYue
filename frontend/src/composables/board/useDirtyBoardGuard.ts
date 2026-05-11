/**
 * src/composables/board/useDirtyBoardGuard.ts
 * Owns the dirty-board guard policy: when the user requests to load
 * a card and the active board has non-trivial state, ask via the
 * confirm-load modal (or honor the persisted decision); then carry
 * out the load (parse SGF, create or overwrite the target board,
 * navigate to the active variation's leaf).
 *
 * The caller passes in a `confirmLoadModalRef` (the template-bound
 * ref to `<ConfirmLoadModal />`). Holding the ref at the caller's
 * top level lets vue-tsc track string-ref usage; the composable
 * consumes it. If the ref is null at handler-call time, the
 * contract has been violated by a missing template mount; we throw
 * rather than silently swallow (per ADR-0002).
 *
 * Public API:
 *   - handleLoadCard(card): call from the load-event consumer
 *     (currently `<ForestDirectory @load-card=…/>` in App.vue).
 *
 * License: Public Domain (The Unlicense).
 */
import type { Ref } from 'vue';
// @ts-ignore — @sabaki/sgf has no published types
import sgf from '@sabaki/sgf';
import {
  store,
  activeBoard,
  updateBoardState,
  mutateBoard,
  createBoard,
} from '../../store';
import { loadSgf } from '../../engine/sgf-loader';
import { navigateTo } from '../../engine/navigator';
import { updateRegistry, getActiveVariationPath } from '../../engine/util';
import type { ReviewCard, NodeId } from '../../types';
import ConfirmLoadModal from '../../components/modals/ConfirmLoadModal.vue';

export function useDirtyBoardGuard(
  confirmLoadModalRef: Ref<InstanceType<typeof ConfirmLoadModal> | null>,
): {
  handleLoadCard: (card: ReviewCard) => Promise<void>;
} {
  async function handleLoadCard(card: ReviewCard): Promise<void> {
    const board = activeBoard.value;
    if (!board) return;

    const nodeCount = Object.keys(board.nodes).length;
    let targetBoardId = board.id;
    let action = store.profile.settings.navigation.actionOnDirtyBoard;

    if (nodeCount > 1 && action === 'ask') {
      // Contract: ConfirmLoadModal must be mounted via confirmLoadModalRef
      // before this handler can be invoked. Fail loud if the contract is
      // broken (per ADR-0002), rather than silently early-returning.
      if (!confirmLoadModalRef.value) {
        throw new Error(
          'useDirtyBoardGuard: ConfirmLoadModal is not mounted — bind confirmLoadModalRef in the template before calling handleLoadCard.',
        );
      }

      const result = await confirmLoadModalRef.value.open();
      if (result.action === 'cancel') return;
      action = result.action;
      if (result.remember) {
        updateRegistry(store.profile.settings, ['navigation', 'actionOnDirtyBoard'], action);
      }
    }

    if (action === 'new' && nodeCount > 1) {
      createBoard();
      targetBoardId = store.boards[store.activeBoardIndex].id;
    }

    try {
      const sabakiTrees = sgf.parse(card.sgf);
      const parsedBoard = loadSgf(sabakiTrees);
      parsedBoard.id = targetBoardId as any;
      // Stamp the lineage source onto the board so a subsequent mint
      // from this exploration session populates `parent_card_id`
      // correctly (consumed by `useMinting.prepareDraft`).
      parsedBoard.sourceCardId = card.id;

      const idx = store.boards.findIndex(b => b.id === targetBoardId);
      if (idx !== -1) {
        updateBoardState(idx, parsedBoard);
        const path = getActiveVariationPath(parsedBoard);
        const leafId = path[path.length - 1];
        mutateBoard(targetBoardId, draft => navigateTo(draft, leafId as NodeId));
      }
    } catch (err) {
      console.error('Failed to load card into board:', err);
    }
  }

  return { handleLoadCard };
}
