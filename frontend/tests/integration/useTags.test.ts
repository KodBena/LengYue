/**
 * tests/integration/useTags.test.ts
 *
 * The tag-dictionary chokepoint (`learnTags`) and the metadata-edit
 * SSOT fix (bug C): a tag added through the card-metadata editor must
 * enter `store.knownTags` so autocomplete knows it immediately — the
 * divergence that previously left it invisible until the next boot's
 * getTags(). The metadata-edit path routes through
 * `useCardMetadata.updateMetadata`, the single chokepoint both
 * ReviewSessionPanel and ForestDirectory share.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

import { store } from '../../src/store';
import { learnTags } from '../../src/composables/cards/useTags';
import { useCardMetadata } from '../../src/composables/cards/useCardMetadata';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import type { CardId, ReviewCard } from '../../src/types';

beforeEach(() => {
  resetFakeBackendService();
  // Known baseline; set directly rather than via resetWorkspace (which
  // would fire the real identity-scoped cache clears — not under test here).
  store.knownTags = ['$mistake'];
});

describe('learnTags — tag-dictionary chokepoint', () => {
  it('unions brand-new tags into store.knownTags', () => {
    learnTags(['$mistake', 'fuseki', 'tesuji']);
    expect(store.knownTags).toEqual(expect.arrayContaining(['$mistake', 'fuseki', 'tesuji']));
  });

  it('is idempotent — same array identity when nothing new (no reactive churn)', () => {
    store.knownTags = ['a', 'b'];
    const before = store.knownTags;
    learnTags(['a', 'b']);
    expect(store.knownTags).toBe(before);
  });

  it('empty input is a no-op', () => {
    const before = store.knownTags;
    learnTags([]);
    expect(store.knownTags).toBe(before);
  });
});

describe('useCardMetadata.updateMetadata — folds edited tags into the dictionary (bug C)', () => {
  it('a tag added via the metadata editor immediately enters store.knownTags', async () => {
    const updatedCard = {
      id: 1 as unknown as CardId,
      tags: ['$mistake', 'brand-new'],
    } as unknown as ReviewCard;
    fakeBackendService.updateCardMetadata.mockResolvedValue(updatedCard);

    const { updateMetadata } = useCardMetadata();
    const result = await updateMetadata(1 as unknown as CardId, { tags: ['$mistake', 'brand-new'] });

    expect(result).toBe(updatedCard); // pass-through preserved
    expect(store.knownTags).toContain('brand-new'); // the SSOT gap, now closed
  });
});
