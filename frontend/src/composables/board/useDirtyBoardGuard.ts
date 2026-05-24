/**
 * src/composables/board/useDirtyBoardGuard.ts
 * Owns the dirty-board guard policy: when the user requests to load
 * an SGF body (from a card or a library game) and the active board
 * has non-trivial state, ask via the confirm-load modal (or honor
 * the persisted decision); then carry out the load (parse SGF,
 * create or overwrite the target board, navigate to the active
 * variation's leaf).
 *
 * The caller passes in a `confirmLoadModalRef` (the template-bound
 * ref to `<ConfirmLoadModal />`). Holding the ref at the caller's
 * top level lets vue-tsc track string-ref usage; the composable
 * consumes it. If the ref is null at handler-call time, the
 * contract has been violated by a missing template mount; we throw
 * rather than silently swallow (per ADR-0002).
 *
 * Two public verbs, sharing the same dirty-board decision + SGF-load
 * core but stamping different per-board fields:
 *
 *   - handleLoadCard(card): the card-load path. Consumed by
 *     `<ForestDirectory @load-card=…/>` in App.vue. Stamps
 *     `sourceCardId` on the resulting board so a subsequent mint
 *     populates `parent_card_id` correctly (see
 *     `useMinting.prepareDraft`).
 *
 *   - handleLoadLibraryGame(game): the library-load path. Stamps
 *     the library row's `clientGameId` onto the board so a
 *     subsequent mint reuses the existing `game_source` row via
 *     the backend's `get_or_create_game_source_by_client_id`
 *     dedup. The card-mint integration the SGF-library design note
 *     calls out (`docs/notes/sgf-library-plan.md`).
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
import type { BoardId, BoardState, LibraryGame, NodeId, ReviewCard } from '../../types';
import ConfirmLoadModal from '../../components/modals/ConfirmLoadModal.vue';

export function useDirtyBoardGuard(
  confirmLoadModalRef: Ref<InstanceType<typeof ConfirmLoadModal> | null>,
): {
  handleLoadCard: (card: ReviewCard) => Promise<void>;
  handleLoadLibraryGame: (game: LibraryGame) => Promise<void>;
} {
  /**
   * Resolve where the next load should write: return the target
   * board id if the load should proceed, or null if the user
   * cancelled at the confirm-load modal.
   *
   * Honours `navigation.actionOnDirtyBoard` (`'ask' | 'new' |
   * 'overwrite'`) — the remembered preference shared with the
   * card-load path so library opens follow the same rule the user
   * already configured for browse opens.
   */
  async function resolveTargetBoard(): Promise<BoardId | null> {
    const board = activeBoard.value;
    if (!board) return null;

    const nodeCount = Object.keys(board.nodes).length;
    let targetBoardId = board.id;
    let action = store.profile.settings.navigation.actionOnDirtyBoard;

    if (nodeCount > 1 && action === 'ask') {
      // Contract: ConfirmLoadModal must be mounted via
      // confirmLoadModalRef before this handler can be invoked.
      // Fail loud if the contract is broken (per ADR-0002), rather
      // than silently early-returning.
      if (!confirmLoadModalRef.value) {
        throw new Error(
          'useDirtyBoardGuard: ConfirmLoadModal is not mounted — bind ' +
          'confirmLoadModalRef in the template before calling handleLoad*.',
        );
      }

      const result = await confirmLoadModalRef.value.open();
      if (result.action === 'cancel') return null;
      action = result.action;
      if (result.remember) {
        updateRegistry(store.profile.settings, ['navigation', 'actionOnDirtyBoard'], action);
      }
    }

    if (action === 'new' && nodeCount > 1) {
      createBoard();
      targetBoardId = store.boards[store.activeBoardIndex].id;
    }

    return targetBoardId;
  }

  /**
   * Parse an SGF body, write it into the target board, and
   * navigate to the active variation's leaf. The optional `stamp`
   * callback mutates the parsed board before commit — used by
   * each caller to attach load-specific provenance
   * (`sourceCardId` for cards, `clientGameId` for library games).
   *
   * Errors during parse / load surface to the console — the dirty-
   * board decision has already been made by the time we get here,
   * so a parse failure shouldn't reopen the modal; logging is the
   * right behaviour and matches the pre-refactor shape.
   */
  function loadSgfIntoBoard(
    targetBoardId: BoardId,
    sgfContent: string,
    stamp?: (board: BoardState) => void,
  ): void {
    try {
      const sabakiTrees = sgf.parse(sgfContent);
      const parsedBoard = loadSgf(sabakiTrees);
      parsedBoard.id = targetBoardId as any;
      stamp?.(parsedBoard);

      const idx = store.boards.findIndex(b => b.id === targetBoardId);
      if (idx !== -1) {
        updateBoardState(idx, parsedBoard);
        const path = getActiveVariationPath(parsedBoard);
        const leafId = path[path.length - 1];
        mutateBoard(targetBoardId, draft => navigateTo(draft, leafId as NodeId));
      }
    } catch (err) {
      console.error('Failed to load SGF into board:', err);
    }
  }

  async function handleLoadCard(card: ReviewCard): Promise<void> {
    const targetBoardId = await resolveTargetBoard();
    if (targetBoardId === null) return;
    loadSgfIntoBoard(targetBoardId, card.sgf, board => {
      // Stamp the lineage source onto the board so a subsequent
      // mint from this exploration session populates
      // `parent_card_id` correctly (consumed by
      // `useMinting.prepareDraft`).
      board.sourceCardId = card.id;
    });
  }

  async function handleLoadLibraryGame(game: LibraryGame): Promise<void> {
    const targetBoardId = await resolveTargetBoard();
    if (targetBoardId === null) return;
    loadSgfIntoBoard(targetBoardId, game.rawContent, board => {
      // Stamp the library row's `client_game_id` so a subsequent
      // mint reuses the existing `game_source` row via the
      // backend's `get_or_create_game_source_by_client_id` dedup.
      // Legacy library rows (pre-dedup) carry `clientGameId ===
      // null` — leave the board's freshly generated UUID in place
      // for those; the card-mint will create a sibling row.
      if (game.clientGameId !== null) {
        board.clientGameId = game.clientGameId;
      }
    });
  }

  return { handleLoadCard, handleLoadLibraryGame };
}
