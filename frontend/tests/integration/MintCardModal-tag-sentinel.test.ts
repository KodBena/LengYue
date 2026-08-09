/**
 * tests/integration/MintCardModal-tag-sentinel.test.ts
 *
 * M15 (audit report, ledger row 1250): the OLD tag input carried two
 * control meanings inside the data stream — Comma-to-commit and a
 * `$`-prefix "dynamic query" convention — making a tag containing a
 * literal comma, or one starting with `$`, awkward or impossible to
 * type deliberately. Comma is no longer a commit key (Enter-only,
 * genre convention per token/chip inputs); the `$`-dynamic-query
 * affordance is now an explicit toggle button
 * (`.tag-mode-toggle`) rather than a magic prefix the user must type
 * by hand — and typing `$` manually with the toggle OFF still produces
 * a literal `$`-led tag, unchanged wire format.
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
  store.profile.settings.minting.defaultPaletteId = 'active';
});

async function openModal() {
  const boardId = store.boards[0].id as BoardId;
  const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });
  await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> }).open(boardId);
  await flushPromises();
  return { wrapper, boardId };
}

async function mintedTags(wrapper: ReturnType<typeof mount>): Promise<string[]> {
  await wrapper.find('.btn-submit').trigger('click');
  await flushPromises();
  const payload = fakeBackendService.createCardsBatch.mock.calls[0][0] as { cards: Array<{ tags: string[] }> };
  return payload.cards[0].tags;
}

describe('MintCardModal — tag input stops using in-band sentinels (M15)', () => {
  it('a literal tag containing a comma survives typing + Enter (comma no longer force-commits)', async () => {
    const { wrapper, boardId } = await openModal();

    const input = wrapper.find('.tag-input');
    await input.setValue('a,b');
    await input.trigger('keydown', { key: ',' });
    // Comma must NOT have committed a chip — the text is still live in
    // the input, uncommitted.
    expect(wrapper.findAll('.tag-badge')).toHaveLength(0);
    await input.trigger('keydown', { key: 'Enter' });

    const tags = await mintedTags(wrapper);
    expect(tags).toContain('a,b');

    removeSelectionSlot(boardId);
  });

  it('a literal tag starting with $ survives typing + Enter with dynamic-query mode OFF', async () => {
    const { wrapper, boardId } = await openModal();

    expect(wrapper.find('.tag-mode-toggle').attributes('aria-pressed')).toBe('false');

    const input = wrapper.find('.tag-input');
    await input.setValue('$price');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.find('.tag-badge').text()).toContain('$price');

    const tags = await mintedTags(wrapper);
    expect(tags).toContain('$price');

    removeSelectionSlot(boardId);
  });

  it('dynamic-query entry is reachable via the explicit toggle, without the user typing $', async () => {
    const { wrapper, boardId } = await openModal();

    await wrapper.find('.tag-mode-toggle').trigger('click');
    expect(wrapper.find('.tag-mode-toggle').attributes('aria-pressed')).toBe('true');

    const input = wrapper.find('.tag-input');
    await input.setValue('fight');
    await input.trigger('keydown', { key: 'Enter' });

    // $ was prepended automatically — the user never typed it.
    expect(wrapper.find('.tag-badge').text()).toContain('$fight');

    const tags = await mintedTags(wrapper);
    expect(tags).toContain('$fight');

    removeSelectionSlot(boardId);
  });
});
