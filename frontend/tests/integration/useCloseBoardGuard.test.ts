/**
 * tests/integration/useCloseBoardGuard.test.ts
 *
 * Pins the close-board guard policy (ADR-0019 audit S6 / C10) added
 * alongside BoardTab's real-<button> keyboard fix: closing a board with
 * moves on it must go through ConfirmCloseBoardModal and only call the
 * store's closeBoard on an explicit confirm; a blank (root-only) board
 * closes with no prompt.
 *
 * `closeBoard` itself (the resource-ownership teardown chain) is already
 * pinned end to end in `store-mutators.test.ts` — this suite mocks it to
 * a spy so it stays scoped to the GUARD's own decision logic (per the
 * fakes discipline: closeBoard is an effect boundary the guard delegates
 * to, not what this suite verifies).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
// @ts-expect-error — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

vi.mock('../../src/store', async () => {
  const actual = await vi.importActual<typeof import('../../src/store')>('../../src/store');
  return { ...actual, closeBoard: vi.fn() };
});

import { store, addBoard, closeBoard, resetWorkspace } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { loadSgf } from '../../src/engine/sgf-loader';
import { i18n } from '../../src/i18n';
import { useCloseBoardGuard } from '../../src/composables/board/useCloseBoardGuard';
import ConfirmCloseBoardModal from '../../src/components/modals/ConfirmCloseBoardModal.vue';
import type { BoardId, BoardState } from '../../src/types';

const ONE_MOVE_SGF = '(;FF[4]GM[1]SZ[19];B[pd])';

function boardWithMoves(): BoardState {
  const board = loadSgf(sgf.parse(ONE_MOVE_SGF));
  addBoard(board);
  return store.boards[store.boards.length - 1];
}

describe('useCloseBoardGuard — confirm-before-destroy policy', () => {
  let modalWrapper: VueWrapper<InstanceType<typeof ConfirmCloseBoardModal>>;

  beforeEach(() => {
    resetWorkspace();
    vi.mocked(closeBoard).mockClear();
    modalWrapper = mount(ConfirmCloseBoardModal, { global: { plugins: [i18n] } });
  });

  afterEach(() => {
    modalWrapper.unmount();
  });

  it('closes immediately, with no confirm, for a blank (root-only) board', async () => {
    const blank = createInitialBoard();
    addBoard(blank);

    const { requestCloseBoard } = useCloseBoardGuard(
      { value: modalWrapper.vm } as { value: InstanceType<typeof ConfirmCloseBoardModal> },
    );

    await requestCloseBoard(blank.id as BoardId);
    await flushPromises();

    expect(closeBoard).toHaveBeenCalledWith(blank.id);
    // The modal never opened — nothing worth confirming.
    expect(modalWrapper.find('.modal-backdrop').exists()).toBe(false);
  });

  it('opens the confirm modal for a board with moves, and does NOT close on cancel', async () => {
    const board = boardWithMoves();
    const { requestCloseBoard } = useCloseBoardGuard(
      { value: modalWrapper.vm } as { value: InstanceType<typeof ConfirmCloseBoardModal> },
    );

    const pending = requestCloseBoard(board.id as BoardId);
    await flushPromises();

    // The guard is now awaiting the modal's resolution — closeBoard has
    // not run yet.
    expect(closeBoard).not.toHaveBeenCalled();
    expect(modalWrapper.find('.modal-backdrop').exists()).toBe(true);
    // The modal body names the board (resolveGameName's fallback ladder —
    // no GN/EV/sourceFileName on this fixture, so the date-stamped "Free
    // play" rung), proving the guard resolved and passed a real name
    // rather than opening the modal blank.
    expect(modalWrapper.find('.modal-body').text()).toMatch(/Free play/);

    await modalWrapper.find('.btn-cancel').trigger('click');
    await pending;

    expect(closeBoard).not.toHaveBeenCalled();
    expect(modalWrapper.find('.modal-backdrop').exists()).toBe(false);
  });

  it('closes only after an explicit confirm for a board with moves', async () => {
    const board = boardWithMoves();
    const { requestCloseBoard } = useCloseBoardGuard(
      { value: modalWrapper.vm } as { value: InstanceType<typeof ConfirmCloseBoardModal> },
    );

    const pending = requestCloseBoard(board.id as BoardId);
    await flushPromises();

    expect(closeBoard).not.toHaveBeenCalled();

    await modalWrapper.find('.btn-close').trigger('click');
    await pending;

    expect(closeBoard).toHaveBeenCalledWith(board.id);
  });

  it('is a no-op when the target board no longer exists', async () => {
    const { requestCloseBoard } = useCloseBoardGuard(
      { value: modalWrapper.vm } as { value: InstanceType<typeof ConfirmCloseBoardModal> },
    );

    await requestCloseBoard('not-a-real-board-id' as BoardId);

    expect(closeBoard).not.toHaveBeenCalled();
    expect(modalWrapper.find('.modal-backdrop').exists()).toBe(false);
  });

  it('fails loudly if the modal ref is unmounted when a confirm-worthy close is requested (ADR-0002)', async () => {
    const board = boardWithMoves();
    const { requestCloseBoard } = useCloseBoardGuard(
      { value: null } as { value: InstanceType<typeof ConfirmCloseBoardModal> | null },
    );

    await expect(requestCloseBoard(board.id as BoardId)).rejects.toThrow(
      /ConfirmCloseBoardModal is not mounted/,
    );
    expect(closeBoard).not.toHaveBeenCalled();
  });
});
