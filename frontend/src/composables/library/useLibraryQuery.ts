/**
 * src/composables/library/useLibraryQuery.ts
 *
 * Sparse-buffer pagination for the Library list view.
 *
 * Owns three pieces of state: the query parameters (sort,
 * direction, filter), the totalCount returned by the most recent
 * fetch, and a `Map<offset, page>` sparse buffer keyed by page
 * offset. A virtual-scrolled component reads via `rowAt(index)`
 * and triggers fetches via `ensureRange(start, end)` whenever
 * its visible window approaches the edge of the loaded region.
 *
 * Sort or filter changes reset the buffer and refetch the first
 * page; the generation counter prevents races where an in-flight
 * fetch for the old query resolves into the cleared buffer
 * after a sort/filter change.
 *
 * Concurrency: `ensureRange` dedupes via an in-flight `Map<offset,
 * Promise>` — a second call for the same page returns the
 * pending promise rather than firing a duplicate request.
 *
 * License: Public Domain (The Unlicense)
 */

import { reactive, ref, shallowReadonly, watch } from 'vue';
import type { Ref } from 'vue';
import { libraryService } from '../../services/library-service';
import type {
  LibraryFilter,
  LibraryGameListItem,
  LibrarySortColumn,
  LibrarySortDirection,
} from '../../types';

/**
 * Rows per backend page. Matches the SPA-default `limit` in the
 * /library/games endpoint; small enough that each fetch is sub-
 * 100ms over localhost, large enough that the virtual scroller
 * rarely crosses a page boundary on a single scroll-wheel tick.
 */
export const PAGE_SIZE = 100;

const EMPTY_FILTER: LibraryFilter = {
  playerWhiteLike: null,
  playerBlackLike: null,
  dateFrom: null,
  dateTo: null,
  resultEq: null,
  rulesetEq: null,
  boardSizeEq: null,
};

export interface LibraryQuery {
  /** Reactive sort column. v-model from a header click. */
  readonly sort: Ref<LibrarySortColumn>;

  /** Reactive sort direction. v-model from a header click. */
  readonly direction: Ref<LibrarySortDirection>;

  /**
   * Reactive filter predicates. The composable watches this
   * deeply and refetches when any field changes — set fields to
   * `null` to clear, or assign a fresh object to swap many at
   * once.
   */
  readonly filter: LibraryFilter;

  /**
   * Total rows under the current query (after filters). `null`
   * until the first fetch resolves. The virtual scroller uses
   * this to size its scrollbar.
   */
  readonly totalCount: Readonly<Ref<number | null>>;

  /**
   * Read a row from the sparse buffer. Returns `null` for indices
   * whose page hasn't been fetched yet, or out-of-range indices.
   * Reactive: components reading this inside a `computed` or
   * `watch` will re-trigger when the page lands.
   */
  rowAt: (index: number) => LibraryGameListItem | null;

  /**
   * `true` if the page covering `index` is currently being
   * fetched. The virtual scroller can render a skeleton row at
   * loading positions instead of a permanent blank.
   */
  isRowLoading: (index: number) => boolean;

  /**
   * Trigger fetches for every page overlapping
   * `[startIndex, endIndex)` that isn't already loaded or
   * in-flight. Resolves after every triggered fetch completes;
   * already-loaded ranges return immediately.
   *
   * Idempotent — calling repeatedly with the same range is cheap
   * and safe.
   */
  ensureRange: (startIndex: number, endIndex: number) => Promise<void>;

  /**
   * Reset the buffer and refetch from offset 0. Called after an
   * import completes (newly imported games should appear in the
   * list without a manual reload).
   */
  refresh: () => Promise<void>;
}

export function useLibraryQuery(initial?: Partial<{
  sort: LibrarySortColumn;
  direction: LibrarySortDirection;
  filter: LibraryFilter;
}>): LibraryQuery {
  const sort = ref<LibrarySortColumn>(initial?.sort ?? 'createdAt');
  const direction = ref<LibrarySortDirection>(initial?.direction ?? 'desc');
  const filter = reactive<LibraryFilter>({ ...EMPTY_FILTER, ...(initial?.filter ?? {}) });

  const totalCount = ref<number | null>(null);
  const pages = reactive(new Map<number, LibraryGameListItem[]>());

  // Non-reactive — implementation detail. Tracks in-flight
  // promises per page offset; consumers observe via
  // `isRowLoading`, not by reading this map directly.
  const inFlight = new Map<number, Promise<void>>();

  // Generation counter for racing-fetch protection. Each
  // `refresh` bumps the counter; fetches that started under an
  // older generation discard their result on completion. Without
  // this, a slow first-page fetch from query A could land in the
  // buffer after the user already typed into the filter and
  // started query B.
  let generation = 0;

  function pageOffset(index: number): number {
    return Math.floor(index / PAGE_SIZE) * PAGE_SIZE;
  }

  async function fetchPage(offset: number): Promise<void> {
    const existing = inFlight.get(offset);
    if (existing) return existing;

    const myGen = generation;
    const promise = (async () => {
      try {
        const result = await libraryService.listGames({
          sort: sort.value,
          direction: direction.value,
          // Snapshot the filter values so a concurrent mutation
          // doesn't change them mid-request.
          filter: {
            playerWhiteLike: filter.playerWhiteLike,
            playerBlackLike: filter.playerBlackLike,
            dateFrom: filter.dateFrom,
            dateTo: filter.dateTo,
            resultEq: filter.resultEq,
            rulesetEq: filter.rulesetEq,
            boardSizeEq: filter.boardSizeEq,
          },
          offset,
          limit: PAGE_SIZE,
        });
        if (myGen !== generation) return;
        pages.set(offset, [...result.rows]);
        totalCount.value = result.totalCount;
      } finally {
        inFlight.delete(offset);
      }
    })();
    inFlight.set(offset, promise);
    return promise;
  }

  function rowAt(index: number): LibraryGameListItem | null {
    if (index < 0) return null;
    if (totalCount.value !== null && index >= totalCount.value) return null;
    const off = pageOffset(index);
    const page = pages.get(off);
    if (page === undefined) return null;
    return page[index - off] ?? null;
  }

  function isRowLoading(index: number): boolean {
    return inFlight.has(pageOffset(index));
  }

  async function ensureRange(startIndex: number, endIndex: number): Promise<void> {
    if (endIndex <= startIndex) return;
    const startPage = pageOffset(startIndex);
    const endPage = pageOffset(Math.max(startIndex, endIndex - 1));
    const promises: Promise<void>[] = [];
    for (let off = startPage; off <= endPage; off += PAGE_SIZE) {
      if (!pages.has(off)) {
        promises.push(fetchPage(off));
      }
    }
    if (promises.length > 0) await Promise.all(promises);
  }

  async function refresh(): Promise<void> {
    generation++;
    pages.clear();
    inFlight.clear();
    totalCount.value = null;
    await fetchPage(0);
  }

  // Watch sort + direction + filter. Any change resets the
  // buffer and refetches the first page. The component is
  // expected to also reset its scroll position to 0 — that's a
  // presentation concern, not the composable's.
  watch(
    [sort, direction, () => ({ ...filter })],
    () => {
      void refresh();
    },
    { flush: 'post' },
  );

  return {
    sort,
    direction,
    filter,
    totalCount: shallowReadonly(totalCount),
    rowAt,
    isRowLoading,
    ensureRange,
    refresh,
  };
}
