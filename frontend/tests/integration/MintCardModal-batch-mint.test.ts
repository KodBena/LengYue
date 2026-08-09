/**
 * tests/integration/MintCardModal-batch-mint.test.ts
 *
 * Component-level coverage for the batch card-minting affordance's
 * non-empty-selection branch of `MintCardModal.vue` (commissioner-
 * designed, ledger rows 926/957/1008): a non-empty mint-selection at
 * `open()` time switches the SAME modal into batch mode; submit()
 * builds and sends exactly ONE `POST /cards/batch` call
 * (`backendService.createCardsBatch`); a successful batch clears ONLY
 * the minted entries from the selection; a FAILED batch leaves the
 * selection intact (untouched, so the user can retry).
 *
 * `useMinting` is left REAL (unmocked) — the batch branch never calls
 * `prepareDraft`/`commitMint` (the empty-selection path's own
 * machinery), so only `backendService` needs a fake here, same
 * pattern as `useLearnPath.test.ts`.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

import { store, addBoard } from '../../src/store';
import { createInitialBoard, asNodeId } from '../../src/store/board-factory';
import { i18n } from '../../src/i18n';
import MintCardModal from '../../src/components/modals/MintCardModal.vue';
import { addToSelection, getSelectedNodeIds, removeSelectionSlot } from '../../src/composables/cards/mint-selection';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import { purgeKnownPositions } from '../../src/state/known-positions';
import type { BoardId, GameNode } from '../../src/types';

function boardWithTwoChildren() {
  const board = createInitialBoard();
  const c1 = asNodeId('c1');
  const c2 = asNodeId('c2');
  const mk = (id: ReturnType<typeof asNodeId>, x: number): GameNode => ({
    id, parent: board.rootNodeId, children: [], activeChildIndex: 0,
    properties: { B: [`${x}`] }, move: { x, y: 3, color: 'B', type: 'place' },
  });
  board.nodes[board.rootNodeId].children.push(c1, c2);
  board.nodes[c1] = mk(c1, 3);
  board.nodes[c2] = mk(c2, 4);
  return { board, c1, c2 };
}

beforeEach(() => {
  resetFakeBackendService();
  fakeBackendService.hashPosition.mockImplementation(async (raw: string) => raw as any);
  purgeKnownPositions();
  store.boards.length = 0;
  store.activeBoardIndex = 0;
  store.profile.settings.minting.defaultPaletteId = 'active';
});

describe('MintCardModal — batch mode (non-empty selection at open() time)', () => {
  it('sends ONE createCardsBatch call for all selected nodes, in one transaction', async () => {
    const { board, c1, c2 } = boardWithTwoChildren();
    addBoard(board);
    const boardId = board.id as BoardId;
    addToSelection(boardId, c1);
    addToSelection(boardId, c2);
    fakeBackendService.createCardsBatch.mockResolvedValue([501, 502]);

    const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });
    await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> }).open(boardId);
    await flushPromises();

    // Batch-mode UI: the lineage box shows the batch summary, not a
    // single card's lineage.
    expect(wrapper.text()).toContain('2');

    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(fakeBackendService.createCardsBatch).toHaveBeenCalledTimes(1);
    expect(fakeBackendService.createCard).not.toHaveBeenCalled();
    const payload = fakeBackendService.createCardsBatch.mock.calls[0][0] as { cards: unknown[] };
    expect(payload.cards).toHaveLength(2);

    removeSelectionSlot(boardId);
  });

  it('a successful batch clears the minted entries from the selection', async () => {
    const { board, c1, c2 } = boardWithTwoChildren();
    addBoard(board);
    const boardId = board.id as BoardId;
    addToSelection(boardId, c1);
    addToSelection(boardId, c2);
    fakeBackendService.createCardsBatch.mockResolvedValue([601, 602]);

    const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });
    await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> }).open(boardId);
    await flushPromises();
    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(getSelectedNodeIds(boardId).size).toBe(0);
    removeSelectionSlot(boardId);
  });

  it('a FAILED batch leaves the selection intact', async () => {
    const { board, c1, c2 } = boardWithTwoChildren();
    addBoard(board);
    const boardId = board.id as BoardId;
    addToSelection(boardId, c1);
    addToSelection(boardId, c2);
    fakeBackendService.createCardsBatch.mockRejectedValue(new Error('batch failed: index 1 invalid'));

    const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });
    await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> }).open(boardId);
    await flushPromises();
    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(getSelectedNodeIds(boardId)).toEqual(new Set([c1, c2]));
    // The modal stays open on failure (same posture as the single-mint
    // path) so the user can see the error and retry.
    expect(wrapper.find('.modal-backdrop').exists()).toBe(true);
    removeSelectionSlot(boardId);
  });

  it('an EMPTY selection at open() time takes the single-mint (unchanged, today) path — no batch call', async () => {
    const { board } = boardWithTwoChildren();
    addBoard(board);
    const boardId = board.id as BoardId;
    // No addToSelection call — the degenerate case.

    const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });
    await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> }).open(boardId);
    await flushPromises();

    // Single-mint's own lineage box (root, since this fresh board has
    // no sourceCardId) renders instead of the batch summary.
    expect(wrapper.find('.lineage-box.root').exists()).toBe(true);
    expect(fakeBackendService.createCardsBatch).not.toHaveBeenCalled();
  });
});
