/**
 * tests/integration/MintCardModal.test.ts
 *
 * Bug A: a tag typed into the mint field but NOT committed to a chip
 * (no Enter/comma) used to be silently dropped on Mint — submit()
 * ignored `tagInput`, so the card minted without it. submit() now
 * flushes a non-empty `tagInput` before minting. This guards that.
 *
 * Batch card-minting affordance (ledger rows 926/957/1008): the modal
 * now has exactly ONE mint call site (`commitMintBatch` /
 * `POST /cards/batch`) regardless of selection size — `useMinting` is
 * left REAL here (not mocked); only `backendService` is faked, same
 * "fakes at the service boundary" shape `useLearnPath.test.ts` and
 * `MintCardModal-batch-mint.test.ts` already use.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

import { store } from '../../src/store';
import { i18n } from '../../src/i18n';
import MintCardModal from '../../src/components/modals/MintCardModal.vue';
import { removeSelectionSlot } from '../../src/composables/cards/mint-selection';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import { purgeKnownPositions } from '../../src/state/known-positions';
import type { BoardId } from '../../src/types';

beforeEach(() => {
  resetFakeBackendService();
  fakeBackendService.hashPosition.mockImplementation(async (raw: string) => raw as any);
  fakeBackendService.createCardsBatch.mockResolvedValue([1]);
  purgeKnownPositions();
  // Keep submit on the no-override branch so it doesn't rebuild
  // grading_parameter from a palette (not what this test exercises).
  store.profile.settings.minting.defaultPaletteId = 'active';
});

describe('MintCardModal — typed-but-uncommitted tag (bug A)', () => {
  it('flushes a pending tag into the minted card on submit', async () => {
    const boardId = store.boards[0].id as BoardId;
    const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });

    // Open the modal for the default board (empty selection — the
    // degenerate one-card batch of the board's current node).
    await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> }).open(boardId);
    await flushPromises();

    // Type a tag but DON'T press Enter/comma — it stays in the input,
    // never becomes a chip in draft.tags.
    await wrapper.find('.tag-input').setValue('brand-new');

    // Mint.
    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(fakeBackendService.createCardsBatch).toHaveBeenCalledTimes(1);
    const payload = fakeBackendService.createCardsBatch.mock.calls[0][0] as { cards: Array<{ tags: string[] }> };
    expect(payload.cards).toHaveLength(1);
    expect(payload.cards[0].tags).toContain('brand-new'); // flushed, not dropped

    removeSelectionSlot(boardId);
  });
});
