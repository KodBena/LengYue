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
import {
  store,
  activeBoard,
  createBoard,
} from '../../store';
import { mutateProfile } from '../../store/profile-owner';
import { loadSgfIntoBoard } from '../sgf/loadIntoBoard';
import type { BoardId, BoardState, LibraryGame, ReviewCard } from '../../types';
import ConfirmLoadModal from '../../components/modals/ConfirmLoadModal.vue';

// Ledger row 1015 (audit L7, "modal on every open"): a module-local,
// NON-PERSISTED map from BoardId to the node count observed
// immediately after the last library/card load into that board — the
// count that reflects exactly the loaded content with zero moves
// added since. Deliberately outside BoardState / store/schema.ts: this
// is a same-session-only heuristic (reset on reload, never round-trips
// through SyncService), not a new piece of domain state, so it stays
// local to the composable that consumes it rather than growing the
// persisted board schema for one interaction-model decision.
//
// ASSUMPTION (declared per CLAUDE.md point 7, adjudicated at review):
// "meaningful unsaved state" for the open-path modal means the active
// board's node count has changed since it was last (re)loaded from a
// card or library game. A board sitting at its just-loaded node count
// has nothing in it the user made — reopening a different game from
// the library only discards a view of already-persisted content, not
// work — so the modal should stay silent for that case exactly as it
// already does for a truly pristine (root-only) board. Any node-count
// change since the load (a move added, a variation branched, moves
// undone past the loaded count) is treated as meaningful and still
// gets the modal. This deliberately reuses the codebase's existing
// "node count" signal (the same cheap heuristic `resolveTargetBoard`
// and `useCloseBoardGuard.requestCloseBoard` already use to mean
// "has moves") rather than inventing a new dirty-tracking mechanism;
// it does not attempt to detect same-count structural edits (e.g. an
// added move immediately followed by an undo of a different move),
// which is an accepted approximation, not a claim of exactness.
//
// Left unbounded per boardId for the app's lifetime, same acceptance
// posture as `BoardState.analysisRanges`'s uncapped growth (ledger
// rows 112/119): bounded in practice by how many boards a session
// actually opens, not by an enforced limit.
const loadedNodeCountByBoard = new Map<BoardId, number>();

function stampLoadedNodeCount(boardId: BoardId): void {
  const board = store.boards.find(b => b.id === boardId);
  if (board) loadedNodeCountByBoard.set(boardId, Object.keys(board.nodes).length);
}

export function useDirtyBoardGuard(
  confirmLoadModalRef: Ref<InstanceType<typeof ConfirmLoadModal> | null>,
): {
  handleLoadCard: (card: ReviewCard) => Promise<void>;
  handleLoadLibraryGame: (game: LibraryGame) => Promise<void>;
  handleLoadLibraryGameInNewBoard: (game: LibraryGame) => Promise<void>;
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
    // "Meaningful" per the declared assumption above: more than the
    // root AND changed since the last load into this board. A board
    // still sitting at exactly its just-loaded count has nothing the
    // user would lose that isn't already safely in the library/card
    // it came from.
    const loadedCount = loadedNodeCountByBoard.get(board.id);
    const isMeaningful = nodeCount > 1 && loadedCount !== nodeCount;
    let targetBoardId = board.id;
    let action = store.profile.settings.navigation.actionOnDirtyBoard;

    if (isMeaningful && action === 'ask') {
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
        // Typed owner-routed write (was an aliased updateRegistry walk —
        // work-status item settings-profile-mutator-owner).
        const remembered = action;
        mutateProfile((p) => { p.settings.navigation.actionOnDirtyBoard = remembered; });
      }
    }

    if (action === 'new' && nodeCount > 1) {
      createBoard();
      targetBoardId = store.boards[store.activeBoardIndex].id;
    }

    return targetBoardId;
  }

  /**
   * Guard-local wrapper over the shared `loadSgfIntoBoard` primitive
   * (`composables/sgf/loadIntoBoard.ts`). The primitive is fail-loud;
   * the guard deliberately swallows-and-logs — the dirty-board decision
   * has already been made by the time we get here, so a parse failure
   * must not reopen the modal. Logging is the right behaviour and
   * matches the pre-extraction shape.
   *
   * On success, stamps `loadedNodeCountByBoard` with the freshly
   * loaded content's node count (ledger row 1015) — the baseline the
   * next `resolveTargetBoard` call compares against to decide whether
   * this board's state has become "meaningful" since.
   */
  function loadOrLog(
    targetBoardId: BoardId,
    sgfContent: string,
    stamp?: (board: BoardState) => void,
  ): void {
    try {
      loadSgfIntoBoard(targetBoardId, sgfContent, stamp);
      stampLoadedNodeCount(targetBoardId);
    } catch (err) {
      console.error('Failed to load SGF into board:', err);
    }
  }

  async function handleLoadCard(card: ReviewCard): Promise<void> {
    const targetBoardId = await resolveTargetBoard();
    if (targetBoardId === null) return;
    loadOrLog(targetBoardId, card.canonicalContent, board => {
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
    loadOrLog(targetBoardId, game.rawContent, board => {
      // Stamp the library row's `client_game_id` so a subsequent
      // mint reuses the existing `game_source` row via the
      // backend's `get_or_create_game_source_by_client_id` dedup.
      // Per-user-id-enumeration design: `clientGameId` is no longer
      // nullable — the "legacy pre-dedup rows carry null" exception
      // is closed (the migration backfills historical NULLs), so
      // this assignment is now unconditional.
      board.clientGameId = game.clientGameId;
    });
  }

  /**
   * "Open in new tab" path: always create a fresh board and load
   * the library game into it, bypassing the dirty-board guard
   * entirely. The user's intent with middle-click / ctrl-click is
   * "open without touching the active context" — no overwrite
   * concern, so the resolveTargetBoard / confirm-load detour is
   * irrelevant. Mirrors the load+stamp body of
   * `handleLoadLibraryGame` exactly so library-row provenance
   * (`clientGameId` → backend dedup) stays consistent between the
   * two paths.
   */
  async function handleLoadLibraryGameInNewBoard(game: LibraryGame): Promise<void> {
    createBoard();
    const targetBoardId = store.boards[store.activeBoardIndex].id;
    loadOrLog(targetBoardId, game.rawContent, board => {
      // Per-user-id-enumeration design: see handleLoadLibraryGame's
      // identical note — unconditional now that clientGameId is
      // never null.
      board.clientGameId = game.clientGameId;
    });
  }

  return { handleLoadCard, handleLoadLibraryGame, handleLoadLibraryGameInNewBoard };
}
