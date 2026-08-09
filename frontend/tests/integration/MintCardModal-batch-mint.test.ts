/**
 * tests/integration/MintCardModal-batch-mint.test.ts
 *
 * Component-level coverage for `MintCardModal.vue`'s "Mint card(s)"
 * affordance (commissioner-designed, ledger rows 926/957/1008) — ONE
 * code path, not two. `open()` resolves `mintNodeIds` from the current
 * mint-selection ("nothing marked IMPLIES the current node is
 * marked" — an empty selection becomes a one-element Set of the
 * board's current node); `submit()` ALWAYS builds and sends exactly
 * ONE `POST /cards/batch` call (`backendService.createCardsBatch`),
 * regardless of `mintNodeIds`'s size — there is no separate branch to
 * the old single-item `POST /cards/` endpoint anywhere in this file. A
 * successful batch clears ONLY the minted entries from the selection;
 * a FAILED batch leaves the selection intact (untouched, so the user
 * can retry).
 *
 * `useMinting` is left REAL (unmocked) — `commitMintBatch` is the
 * modal's sole mint call site — so only `backendService` needs a fake
 * here, same pattern as `useLearnPath.test.ts`.
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
import { serializeActivePath } from '../../src/engine/sgf-writer';
import { i18n } from '../../src/i18n';
import MintCardModal from '../../src/components/modals/MintCardModal.vue';
import { addToSelection, getSelectedNodeIds, removeSelectionSlot } from '../../src/composables/cards/mint-selection';
import { cacheNodeHash, purgeAllNodeHashes } from '../../src/state/node-position-hashes';
import { recordKnownPosition } from '../../src/state/known-positions';
import { currentDialogRequest } from '../../src/composables/useAppDialogs';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import { purgeKnownPositions } from '../../src/state/known-positions';
import type { BoardId, CardId, ContentHash, GameNode } from '../../src/types';

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
  // `boardWithTwoChildren()` mints the SAME literal NodeIds ('c1'/'c2')
  // across every test in this file — the per-node hash cache is
  // module-scope and keyed by NodeId, so a stale entry from an earlier
  // test's `cacheNodeHash` call would otherwise leak into a later
  // test's genuine cache-miss scenario. Purge it every test, same
  // isolation discipline `mint-to-known-position-highlight.test.ts`
  // already uses.
  purgeAllNodeHashes();
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

  it('an EMPTY selection at open() time still goes through createCardsBatch — ONE call, exactly one card, for the current node', async () => {
    const { board } = boardWithTwoChildren();
    addBoard(board);
    const boardId = board.id as BoardId;
    // No addToSelection call — the degenerate case. "Nothing marked
    // IMPLIES the current node is marked."
    fakeBackendService.createCardsBatch.mockResolvedValue([701]);

    const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });
    await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> }).open(boardId);
    await flushPromises();

    // Degenerate size-1 batch's own lineage box (root, since this
    // fresh board has no sourceCardId) — display only; the wire call
    // below is what actually matters.
    expect(wrapper.find('.lineage-box.root').exists()).toBe(true);

    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    // The SOLE mint call site, exactly once, one card, for the
    // board's current node — the OLD single-item POST /cards/
    // endpoint is never touched (createCard doesn't even exist on
    // useMinting's surface any more; this asserts the wire behavior).
    expect(fakeBackendService.createCardsBatch).toHaveBeenCalledTimes(1);
    expect(fakeBackendService.createCard).not.toHaveBeenCalled();
    const payload = fakeBackendService.createCardsBatch.mock.calls[0][0] as { cards: Array<{ raw_content: string }> };
    expect(payload.cards).toHaveLength(1);
    expect(payload.cards[0].raw_content).toBe(serializeActivePath(board, board.currentNodeId));

    removeSelectionSlot(boardId);
  });
});

describe('MintCardModal — pre-existing-card exclusion, type-level (commissioner ruling, ledger row 1063)', () => {
  it('a manually ctrl+clicked already-carded node is silently excluded from the payload, and dropped from the selection', async () => {
    const { board, c1, c2 } = boardWithTwoChildren();
    addBoard(board);
    const boardId = board.id as BoardId;
    addToSelection(boardId, c1); // already has a card
    addToSelection(boardId, c2); // does not

    const c1Hash = serializeActivePath(board, c1) as unknown as ContentHash;
    cacheNodeHash(c1, c1Hash);
    recordKnownPosition(c1Hash, 999 as CardId);
    fakeBackendService.createCardsBatch.mockResolvedValue([801]);

    const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });
    await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> }).open(boardId);
    await flushPromises();
    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    // ONE card in the payload — c1 never reached it.
    expect(fakeBackendService.createCardsBatch).toHaveBeenCalledTimes(1);
    const payload = fakeBackendService.createCardsBatch.mock.calls[0][0] as { cards: Array<{ raw_content: string }> };
    expect(payload.cards).toHaveLength(1);
    expect(payload.cards[0].raw_content).toBe(serializeActivePath(board, c2));

    // c1 is dropped from the selection (it can never mint); c2 minted
    // successfully and is cleared too — nothing left selected.
    expect(getSelectedNodeIds(boardId).size).toBe(0);

    removeSelectionSlot(boardId);
  });

  it('a selection that is ENTIRELY already-carded posts no batch and reflects the empty state honestly', async () => {
    const { board, c1, c2 } = boardWithTwoChildren();
    addBoard(board);
    const boardId = board.id as BoardId;
    addToSelection(boardId, c1);
    addToSelection(boardId, c2);

    const c1Hash = serializeActivePath(board, c1) as unknown as ContentHash;
    const c2Hash = serializeActivePath(board, c2) as unknown as ContentHash;
    cacheNodeHash(c1, c1Hash);
    cacheNodeHash(c2, c2Hash);
    recordKnownPosition(c1Hash, 991 as CardId);
    recordKnownPosition(c2Hash, 992 as CardId);

    const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });
    await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> }).open(boardId);
    await flushPromises();
    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    // No wire call at all — never posts an empty batch.
    expect(fakeBackendService.createCardsBatch).not.toHaveBeenCalled();
    // The affordance reflects the state honestly via the shared alert
    // dialog channel, naming that nothing was minted.
    expect(currentDialogRequest.value?.message).toBeTruthy();
    // Both entries are permanently non-mintable — dropped from selection.
    expect(getSelectedNodeIds(boardId).size).toBe(0);
    // The modal itself stays open (same "let the user see what happened
    // and decide next" posture as a failed batch).
    expect(wrapper.find('.modal-backdrop').exists()).toBe(true);

    removeSelectionSlot(boardId);
  });

  it('a cache-miss on a selected node (hash never fetched) is treated as uncarded and still mints — accepted-cost posture', async () => {
    const { board, c1 } = boardWithTwoChildren();
    addBoard(board);
    const boardId = board.id as BoardId;
    addToSelection(boardId, c1);
    // Deliberately no cacheNodeHash call for c1 — the per-node hash
    // cache has never been asked about this node.
    fakeBackendService.createCardsBatch.mockResolvedValue([901]);

    const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });
    await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> }).open(boardId);
    await flushPromises();
    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(fakeBackendService.createCardsBatch).toHaveBeenCalledTimes(1);
    const payload = fakeBackendService.createCardsBatch.mock.calls[0][0] as { cards: unknown[] };
    expect(payload.cards).toHaveLength(1);

    removeSelectionSlot(boardId);
  });
});
