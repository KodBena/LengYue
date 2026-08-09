/**
 * tests/integration/useDirtyBoardGuard.test.ts
 *
 * Pins the open-path modal's "meaningful state" decision (ledger row
 * 1015, audit L7 — the modal fired on every library open). Follows the
 * same suite shape as `useCloseBoardGuard.test.ts` (its sibling guard).
 *
 * Declared assumption under test (see the comment above
 * `loadedNodeCountByBoard` in `useDirtyBoardGuard.ts`): the confirm-load
 * modal is shown only when the active board's node count has changed
 * since it was last (re)loaded from a card or library game — a board
 * still sitting at exactly its just-loaded content has nothing the
 * user would lose that isn't already safely persisted elsewhere.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';

import { store, addBoard, resetWorkspace, mutateBoard } from '../../src/store';
import { createInitialBoard, asNodeId } from '../../src/store/board-factory';
import { i18n } from '../../src/i18n';
import { useDirtyBoardGuard } from '../../src/composables/board/useDirtyBoardGuard';
import ConfirmLoadModal from '../../src/components/modals/ConfirmLoadModal.vue';
import type { BoardId, LibraryGame } from '../../src/types';
import type { GameDisplayOrdinal, GameSourceId } from '../../src/types/ids';

const ONE_MOVE_SGF = '(;FF[4]GM[1]SZ[19];B[pd])';
const OTHER_ONE_MOVE_SGF = '(;FF[4]GM[1]SZ[19];W[dp])';

function libraryGame(overrides: Partial<LibraryGame> = {}): LibraryGame {
  return {
    id: 1 as unknown as GameSourceId,
    clientGameId: 'lib-board-1' as unknown as BoardId,
    playerWhite: 'White Player',
    playerBlack: 'Black Player',
    date: '2026-01-01',
    result: 'B+R',
    ruleset: 'Japanese',
    boardSize: 19,
    metadataExtra: {},
    createdAt: '2026-01-01T00:00:00Z',
    rawContent: ONE_MOVE_SGF,
    displayOrdinal: 1 as unknown as GameDisplayOrdinal,
    ...overrides,
  };
}

describe('useDirtyBoardGuard — open-path modal "meaningful state" policy', () => {
  let modalWrapper: VueWrapper<InstanceType<typeof ConfirmLoadModal>>;

  beforeEach(() => {
    resetWorkspace();
    store.profile.settings.navigation.actionOnDirtyBoard = 'ask';
    modalWrapper = mount(ConfirmLoadModal, { global: { plugins: [i18n] } });
  });

  afterEach(() => {
    modalWrapper.unmount();
  });

  it('loads with no modal into a pristine (root-only) board', async () => {
    const blank = createInitialBoard();
    addBoard(blank);

    const { handleLoadLibraryGame } = useDirtyBoardGuard(
      { value: modalWrapper.vm } as { value: InstanceType<typeof ConfirmLoadModal> },
    );

    await handleLoadLibraryGame(libraryGame());
    await flushPromises();

    expect(modalWrapper.find('.modal-backdrop').exists()).toBe(false);
    // The load actually happened.
    expect(Object.keys(store.boards[store.boards.length - 1]!.nodes).length).toBeGreaterThan(1);
  });

  it('raises the modal for a board with organic moves never loaded via the guard', async () => {
    const blank = createInitialBoard();
    addBoard(blank);
    // Simulate organic play: a move added outside the load path, so no
    // loadedNodeCountByBoard stamp exists for this board.
    mutateBoard(blank.id as BoardId, draft => {
      draft.nodes[asNodeId('extra-node')] = {
        id: asNodeId('extra-node'),
        parent: draft.rootNodeId,
        children: [],
        activeChildIndex: 0,
        properties: {},
        move: null,
      };
    });

    const { handleLoadLibraryGame } = useDirtyBoardGuard(
      { value: modalWrapper.vm } as { value: InstanceType<typeof ConfirmLoadModal> },
    );

    const pending = handleLoadLibraryGame(libraryGame());
    await flushPromises();

    expect(modalWrapper.find('.modal-backdrop').exists()).toBe(true);

    await modalWrapper.find('.btn-cancel').trigger('click');
    await pending;
  });

  it('re-opening a second library game with no edits since the first load raises no modal', async () => {
    const blank = createInitialBoard();
    addBoard(blank);
    const boardId = blank.id as BoardId;

    const { handleLoadLibraryGame } = useDirtyBoardGuard(
      { value: modalWrapper.vm } as { value: InstanceType<typeof ConfirmLoadModal> },
    );

    // First open: pristine board, no modal, content lands and gets
    // stamped as the load baseline.
    await handleLoadLibraryGame(libraryGame());
    await flushPromises();
    expect(modalWrapper.find('.modal-backdrop').exists()).toBe(false);
    const afterFirstLoad = Object.keys(store.boards.find(b => b.id === boardId)!.nodes).length;
    expect(afterFirstLoad).toBeGreaterThan(1);

    // Second open of a different game onto the SAME still-unmodified
    // board: nothing meaningful would be lost (L7's "browsing loop"),
    // so no modal — this is the audit's own complaint, fixed.
    await handleLoadLibraryGame(
      libraryGame({ id: 2 as unknown as GameSourceId, rawContent: OTHER_ONE_MOVE_SGF }),
    );
    await flushPromises();
    expect(modalWrapper.find('.modal-backdrop').exists()).toBe(false);
  });

  it('raises the modal when the board was edited after a library load', async () => {
    const blank = createInitialBoard();
    addBoard(blank);
    const boardId = blank.id as BoardId;

    const { handleLoadLibraryGame } = useDirtyBoardGuard(
      { value: modalWrapper.vm } as { value: InstanceType<typeof ConfirmLoadModal> },
    );

    await handleLoadLibraryGame(libraryGame());
    await flushPromises();
    expect(modalWrapper.find('.modal-backdrop').exists()).toBe(false);

    // The user adds a move on top of the loaded game.
    mutateBoard(boardId, draft => {
      draft.nodes[asNodeId('user-added-node')] = {
        id: asNodeId('user-added-node'),
        parent: draft.currentNodeId,
        children: [],
        activeChildIndex: 0,
        properties: {},
        move: null,
      };
    });

    const pending = handleLoadLibraryGame(
      libraryGame({ id: 3 as unknown as GameSourceId, rawContent: OTHER_ONE_MOVE_SGF }),
    );
    await flushPromises();

    expect(modalWrapper.find('.modal-backdrop').exists()).toBe(true);

    await modalWrapper.find('.btn-cancel').trigger('click');
    await pending;
  });

  it('fails loudly if the modal ref is unmounted when a confirm-worthy load is requested (ADR-0002)', async () => {
    const blank = createInitialBoard();
    addBoard(blank);
    mutateBoard(blank.id as BoardId, draft => {
      draft.nodes[asNodeId('extra-node')] = {
        id: asNodeId('extra-node'),
        parent: draft.rootNodeId,
        children: [],
        activeChildIndex: 0,
        properties: {},
        move: null,
      };
    });

    const { handleLoadLibraryGame } = useDirtyBoardGuard(
      { value: null } as { value: InstanceType<typeof ConfirmLoadModal> | null },
    );

    await expect(handleLoadLibraryGame(libraryGame())).rejects.toThrow(
      /ConfirmLoadModal is not mounted/,
    );
  });
});
