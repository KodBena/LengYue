/**
 * tests/integration/MintCardModal.test.ts
 *
 * Bug A: a tag typed into the mint field but NOT committed to a chip
 * (no Enter/comma) used to be silently dropped on Mint — submit()
 * ignored `tagInput`, so the card minted without it. submit() now
 * flushes a non-empty `tagInput` before commitMint. This guards that.
 *
 * useMinting is mocked so the test isolates the modal's submit flush
 * (prepareDraft → a fixed draft; commitMint → a spy), independent of
 * the real card-creation wire path (which the investigation verified
 * is correct end to end).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const commitMint = vi.fn(async () => 1);
const prepareDraft = vi.fn(async () => ({
  num_moves: 1,
  tags: [] as string[],
  grading_parameter: { data: { default_visits: 1000, gamma: 0.9 } },
}));
vi.mock('../../src/composables/review/useMinting', () => ({
  useMinting: () => ({ prepareDraft, commitMint }),
}));

import { store } from '../../src/store';
import { i18n } from '../../src/i18n';
import MintCardModal from '../../src/components/modals/MintCardModal.vue';
import type { BoardId } from '../../src/types';

beforeEach(() => {
  commitMint.mockClear();
  prepareDraft.mockClear();
  // Keep submit on the no-override branch so it doesn't rebuild
  // grading_parameter from a palette (not what this test exercises).
  store.profile.settings.minting.defaultPaletteId = 'active';
});

describe('MintCardModal — typed-but-uncommitted tag (bug A)', () => {
  it('flushes a pending tag into the minted card on submit', async () => {
    const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });

    // Open the modal for the default board (populates the draft).
    await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> })
      .open(store.boards[0].id as BoardId);
    await flushPromises();

    // Type a tag but DON'T press Enter/comma — it stays in the input,
    // never becomes a chip in draft.tags.
    await wrapper.find('.tag-input').setValue('brand-new');

    // Mint.
    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(commitMint).toHaveBeenCalledTimes(1);
    const draft = commitMint.mock.calls[0][0] as { tags: string[] };
    expect(draft.tags).toContain('brand-new'); // flushed, not dropped
  });
});
