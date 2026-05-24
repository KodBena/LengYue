/**
 * tests/integration/library/useLibraryQuery.test.ts
 *
 * Integration tests for `useLibraryQuery`. Drives the composable
 * against a mocked `libraryService.listGames`, covering:
 *
 *   - Initial state (totalCount null, no fetch fired).
 *   - ensureRange triggers fetches for missing pages, dedupes
 *     duplicate calls.
 *   - rowAt returns null for unloaded pages, the projected row
 *     for loaded pages.
 *   - Sort / filter changes reset the buffer and refetch from
 *     offset 0.
 *   - Generation counter discards stale fetches.
 *   - isRowLoading flips true during the fetch.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick } from 'vue';

vi.mock('../../../src/services/library-service', () => {
  return {
    libraryService: {
      listGames: vi.fn(),
    },
  };
});

import { libraryService } from '../../../src/services/library-service';
import {
  useLibraryQuery,
  PAGE_SIZE,
} from '../../../src/composables/library/useLibraryQuery';

const mockList = vi.mocked(libraryService.listGames);

function makeRow(id: number, playerWhite: string = 'X'): any {
  return {
    id,
    clientGameId: '11111111-2222-3333-4444-555555555555',
    playerWhite,
    playerBlack: 'Y',
    date: null,
    result: null,
    ruleset: null,
    boardSize: 19,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  mockList.mockReset();
});

describe('useLibraryQuery — initial state', () => {
  it('starts with totalCount null and no row available', () => {
    const q = useLibraryQuery();
    expect(q.totalCount.value).toBeNull();
    expect(q.rowAt(0)).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('useLibraryQuery — ensureRange + rowAt', () => {
  it('fetches the covering page on ensureRange and exposes its rows', async () => {
    mockList.mockResolvedValueOnce({
      rows: [makeRow(1, 'Alice'), makeRow(2, 'Bob')],
      totalCount: 2,
    });
    const q = useLibraryQuery();
    await q.ensureRange(0, 2);
    expect(q.totalCount.value).toBe(2);
    expect(q.rowAt(0)?.playerWhite).toBe('Alice');
    expect(q.rowAt(1)?.playerWhite).toBe('Bob');
  });

  it('dedupes concurrent ensureRange calls for the same page', async () => {
    let resolve: (v: any) => void;
    mockList.mockReturnValueOnce(
      new Promise(r => { resolve = r; }) as Promise<any>,
    );
    const q = useLibraryQuery();
    // Two concurrent calls before the first resolves.
    const a = q.ensureRange(0, 50);
    const b = q.ensureRange(0, 50);
    resolve!({ rows: [makeRow(1)], totalCount: 1 });
    await Promise.all([a, b]);
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('triggers one fetch per uncached page in the range', async () => {
    mockList
      .mockResolvedValueOnce({ rows: [makeRow(1)], totalCount: 250 })
      .mockResolvedValueOnce({ rows: [makeRow(2)], totalCount: 250 })
      .mockResolvedValueOnce({ rows: [makeRow(3)], totalCount: 250 });
    const q = useLibraryQuery();
    // Range spans three pages: 0, PAGE_SIZE, 2*PAGE_SIZE.
    await q.ensureRange(0, PAGE_SIZE * 2 + 1);
    expect(mockList).toHaveBeenCalledTimes(3);
  });

  it('isRowLoading flips true during the fetch and false after', async () => {
    let resolve: (v: any) => void;
    mockList.mockReturnValueOnce(
      new Promise(r => { resolve = r; }) as Promise<any>,
    );
    const q = useLibraryQuery();
    const p = q.ensureRange(0, 10);
    expect(q.isRowLoading(0)).toBe(true);
    resolve!({ rows: [makeRow(1)], totalCount: 1 });
    await p;
    expect(q.isRowLoading(0)).toBe(false);
  });

  it('rowAt returns null for indices past totalCount', async () => {
    mockList.mockResolvedValueOnce({ rows: [makeRow(1)], totalCount: 1 });
    const q = useLibraryQuery();
    await q.ensureRange(0, 5);
    expect(q.rowAt(5)).toBeNull();
  });
});

describe('useLibraryQuery — query change resets buffer', () => {
  it('clears the buffer and refetches when sort changes', async () => {
    mockList
      .mockResolvedValueOnce({ rows: [makeRow(1, 'Alice')], totalCount: 1 })
      .mockResolvedValueOnce({ rows: [makeRow(2, 'Bob')], totalCount: 1 });
    const q = useLibraryQuery();
    await q.ensureRange(0, 5);
    expect(q.rowAt(0)?.playerWhite).toBe('Alice');

    q.sort.value = 'playerWhite';
    await nextTick();
    // The watch fires async; wait for the second fetch.
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    expect(q.rowAt(0)?.playerWhite).toBe('Bob');
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('clears the buffer and refetches when filter changes', async () => {
    mockList
      .mockResolvedValueOnce({ rows: [makeRow(1, 'Alice')], totalCount: 1 })
      .mockResolvedValueOnce({ rows: [makeRow(2, 'Carol')], totalCount: 1 });
    const q = useLibraryQuery();
    await q.ensureRange(0, 5);

    q.filter.playerWhiteLike = 'C';
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    expect(q.rowAt(0)?.playerWhite).toBe('Carol');
    expect(mockList).toHaveBeenCalledTimes(2);
  });
});

describe('useLibraryQuery — refresh', () => {
  it('clears pages and refetches from offset 0', async () => {
    mockList
      .mockResolvedValueOnce({ rows: [makeRow(1, 'Alice')], totalCount: 1 })
      .mockResolvedValueOnce({ rows: [makeRow(2, 'Bob')], totalCount: 1 });
    const q = useLibraryQuery();
    await q.ensureRange(0, 5);
    expect(q.rowAt(0)?.playerWhite).toBe('Alice');
    await q.refresh();
    expect(q.rowAt(0)?.playerWhite).toBe('Bob');
  });
});

describe('useLibraryQuery — generation discards stale fetches', () => {
  it('drops the result of a fetch superseded by a sort change', async () => {
    let resolveFirst: (v: any) => void;
    mockList
      .mockReturnValueOnce(
        new Promise(r => { resolveFirst = r; }) as Promise<any>,
      )
      .mockResolvedValueOnce({
        rows: [makeRow(2, 'Bob')],
        totalCount: 1,
      });
    const q = useLibraryQuery();
    const firstFetch = q.ensureRange(0, 5);
    q.sort.value = 'playerWhite';
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    // Resolve the stale first fetch after the sort change. Its
    // result should NOT clobber the buffer.
    resolveFirst!({ rows: [makeRow(1, 'STALE')], totalCount: 1 });
    await firstFetch;
    expect(q.rowAt(0)?.playerWhite).toBe('Bob');
  });
});
