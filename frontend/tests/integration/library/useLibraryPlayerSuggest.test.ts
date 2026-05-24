/**
 * tests/integration/library/useLibraryPlayerSuggest.test.ts
 *
 * Integration tests for `useLibraryPlayerSuggest`. Drives the
 * composable against a mocked `libraryService.listPlayers`.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/library-service', () => {
  return {
    libraryService: {
      listPlayers: vi.fn(),
    },
  };
});

import { libraryService } from '../../../src/services/library-service';
import { useLibraryPlayerSuggest } from '../../../src/composables/library/useLibraryPlayerSuggest';

const mockList = vi.mocked(libraryService.listPlayers);

beforeEach(() => {
  mockList.mockReset();
});

describe('useLibraryPlayerSuggest', () => {
  it('exposes null players before refresh', () => {
    const s = useLibraryPlayerSuggest();
    expect(s.players.value).toBeNull();
    expect(s.suggest('Cho')).toEqual([]);
  });

  it('caches the list after refresh', async () => {
    mockList.mockResolvedValueOnce(['Cho Chikun', 'Cho U', 'Lee Sedol']);
    const s = useLibraryPlayerSuggest();
    await s.refresh();
    expect(s.players.value).toEqual(['Cho Chikun', 'Cho U', 'Lee Sedol']);
  });

  it('filters case-insensitively by substring', async () => {
    mockList.mockResolvedValueOnce(['Cho Chikun', 'Cho U', 'Lee Sedol']);
    const s = useLibraryPlayerSuggest();
    await s.refresh();
    expect(s.suggest('cho')).toEqual(['Cho Chikun', 'Cho U']);
    expect(s.suggest('sedol')).toEqual(['Lee Sedol']);
    expect(s.suggest('')).toEqual(['Cho Chikun', 'Cho U', 'Lee Sedol']);
  });

  it('caps results at the limit, preserving cache order', async () => {
    mockList.mockResolvedValueOnce(['A', 'B', 'C', 'D']);
    const s = useLibraryPlayerSuggest();
    await s.refresh();
    expect(s.suggest('', 2)).toEqual(['A', 'B']);
  });

  it('exposes loading=true during the in-flight fetch', async () => {
    let resolve: (v: readonly string[]) => void;
    mockList.mockReturnValueOnce(
      new Promise(r => { resolve = r; }) as Promise<readonly string[]>,
    );
    const s = useLibraryPlayerSuggest();
    const p = s.refresh();
    expect(s.loading.value).toBe(true);
    resolve!(['X']);
    await p;
    expect(s.loading.value).toBe(false);
  });
});
