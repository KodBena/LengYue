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
import type { PlayerCount } from '../../../src/types';

const mockList = vi.mocked(libraryService.listPlayers);

// Helper: build a PlayerCount[] from a name list. The counts here
// are tagged by ascending index so a test that cares about ordering
// can pin to them explicitly; otherwise they're just non-NaN noise.
function pcs(names: readonly string[]): readonly PlayerCount[] {
  return names.map((name, i) => ({ name, count: i + 1 }));
}

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
    mockList.mockResolvedValueOnce(pcs(['Cho Chikun', 'Cho U', 'Lee Sedol']));
    const s = useLibraryPlayerSuggest();
    await s.refresh();
    expect(s.players.value).toEqual(pcs(['Cho Chikun', 'Cho U', 'Lee Sedol']));
  });

  it('filters case-insensitively by substring (returns names only)', async () => {
    mockList.mockResolvedValueOnce(pcs(['Cho Chikun', 'Cho U', 'Lee Sedol']));
    const s = useLibraryPlayerSuggest();
    await s.refresh();
    expect(s.suggest('cho')).toEqual(['Cho Chikun', 'Cho U']);
    expect(s.suggest('sedol')).toEqual(['Lee Sedol']);
    expect(s.suggest('')).toEqual(['Cho Chikun', 'Cho U', 'Lee Sedol']);
  });

  it('caps results at the limit, preserving cache order', async () => {
    mockList.mockResolvedValueOnce(pcs(['A', 'B', 'C', 'D']));
    const s = useLibraryPlayerSuggest();
    await s.refresh();
    expect(s.suggest('', 2)).toEqual(['A', 'B']);
  });

  it('exposes loading=true during the in-flight fetch', async () => {
    let resolve: (v: readonly PlayerCount[]) => void;
    mockList.mockReturnValueOnce(
      new Promise(r => { resolve = r; }) as Promise<readonly PlayerCount[]>,
    );
    const s = useLibraryPlayerSuggest();
    const p = s.refresh();
    expect(s.loading.value).toBe(true);
    resolve!(pcs(['X']));
    await p;
    expect(s.loading.value).toBe(false);
  });
});
