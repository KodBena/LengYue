/**
 * tests/integration/LibraryTable-lazyload-race.test.ts
 *
 * Ledger row 1142: the Library keyboard-nav's deferred-select-on-
 * late-load mechanism (`LibraryTable.vue`'s `focusIndex` +
 * `selectEmittedForIndex` + the `watch(() => props.rowAt(focusIndex.value), ...)`)
 * was hand-trace-verified but never exercised across the actual
 * lazy-load seam — every other `LibraryTable` integration test
 * (`LibraryTable-keyboard-nav.test.ts` explicitly, by its own
 * comment) supplies a `rowAt` where every row is already loaded,
 * which can never observe the deferred path at all.
 *
 * `createLazyRowSource` below is a controllable fake standing in
 * for `useLibraryQuery` (src/composables/library/useLibraryQuery.ts):
 * same sparse `Map<offset, page>` shape (`pages`, `reactive`, keyed
 * by `PAGE_SIZE`-aligned offset), same in-flight-dedupe-then-land
 * shape as `fetchPage` (`pages.set(offset, rows)` on resolution).
 * The component under test never calls `ensureRange` itself (that's
 * the parent `LibraryTab`'s job on the `visible-range` emit) — this
 * fixture's `ensurePage`/`resolvePage` split lets a test model "a
 * fetch is in flight for this page" and "that fetch just landed" as
 * two independently-controlled, sleep-free steps.
 *
 * Three properties from the ledger row:
 *  (a) keyboard End onto an unfetched index -> when the page
 *      resolves, exactly one `select` emit, for the CURRENT focus
 *      row.
 *  (b) navigate away while a page is in flight -> the stale page's
 *      arrival emits nothing for the abandoned index.
 *  (c) eager emit (data already present at focus-time) plus a later
 *      reactive re-land of the same page does not double-emit for
 *      the same index.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import LibraryTable from '../../src/components/library/LibraryTable.vue';
import { PAGE_SIZE } from '../../src/composables/library/useLibraryQuery';
import type { LibraryGameListItem } from '../../src/types';
import type { GameDisplayOrdinal, GameSourceId } from '../../src/types/ids';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observed: Element[] = [];

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {}
  fire(widthPx: number) {
    this.callback(
      [{ contentRect: { width: widthPx } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  FakeResizeObserver.instances = [];
  (globalThis as any).ResizeObserver = FakeResizeObserver;
});
afterEach(() => {
  (globalThis as any).ResizeObserver = originalResizeObserver;
});

function fakeRow(i: number): LibraryGameListItem {
  return {
    id: i as unknown as GameSourceId,
    clientGameId: `board-${i}` as any,
    playerWhite: 'Cho Hun-hyeon',
    playerBlack: 'Seo Pong-su',
    date: '1981-09-08',
    result: 'B+1.5',
    ruleset: 'Japanese',
    boardSize: 19,
    createdAt: '2026-01-01T00:00:00Z',
    displayOrdinal: i as unknown as GameDisplayOrdinal,
  };
}

function pageRows(offset: number): LibraryGameListItem[] {
  return Array.from({ length: PAGE_SIZE }, (_, k) => fakeRow(offset + k));
}

/**
 * Controllable stand-in for `useLibraryQuery`'s sparse buffer.
 * `ensurePage` mimics `fetchPage`'s in-flight dedupe (a second call
 * for the same offset before it resolves returns the same pending
 * promise); `resolvePage` mimics the fetch landing —
 * `pages.set(offset, rows)` — which is the exact reactive write
 * `LibraryTable`'s deferred-select watcher depends on.
 */
function createLazyRowSource(totalCount: number) {
  const pages = reactive(new Map<number, LibraryGameListItem[]>());
  const inFlight = new Map<number, { promise: Promise<void>; land: () => void }>();

  function pageOffset(i: number): number {
    return Math.floor(i / PAGE_SIZE) * PAGE_SIZE;
  }

  function rowAt(i: number): LibraryGameListItem | null {
    if (i < 0 || i >= totalCount) return null;
    const off = pageOffset(i);
    const page = pages.get(off);
    if (page === undefined) return null;
    return page[i - off] ?? null;
  }

  function isRowLoading(i: number): boolean {
    return inFlight.has(pageOffset(i));
  }

  /** Marks `offset`'s page as fetch-in-flight (parent's `ensureRange` fired). Idempotent, like `fetchPage`. */
  function ensurePage(offset: number, rows: LibraryGameListItem[]): Promise<void> {
    const existing = inFlight.get(offset);
    if (existing) return existing.promise;
    if (pages.has(offset)) return Promise.resolve();
    let resolveFn!: () => void;
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });
    inFlight.set(offset, {
      promise,
      land: () => {
        pages.set(offset, rows);
        inFlight.delete(offset);
        resolveFn();
      },
    });
    return promise;
  }

  /** Resolves the in-flight fetch for `offset`, landing its rows into the reactive `pages` map. No-op if nothing is in flight. */
  function resolvePage(offset: number): void {
    inFlight.get(offset)?.land();
  }

  /** Directly re-lands a page's rows (e.g. simulating a refresh) without going through the in-flight lifecycle. */
  function relandPage(offset: number, rows: LibraryGameListItem[]): void {
    pages.set(offset, rows);
  }

  /** Synchronously preloads a page, as if its fetch had already completed before mount. */
  function preload(offset: number, rows: LibraryGameListItem[]): void {
    pages.set(offset, rows);
  }

  return { rowAt, isRowLoading, ensurePage, resolvePage, relandPage, preload, pageOffset };
}

async function mountLazyTable(totalCount: number, source: ReturnType<typeof createLazyRowSource>) {
  const wrapper = mount(LibraryTable, {
    props: {
      totalCount,
      rowAt: source.rowAt,
      isRowLoading: source.isRowLoading,
      sort: 'date',
      direction: 'desc',
      selectedId: null,
    },
    attachTo: document.body,
  });
  const headerObserver = FakeResizeObserver.instances[1];
  headerObserver?.fire(1000);
  await nextTick();
  return wrapper;
}

describe('LibraryTable — deferred-select across the lazy-load seam (ledger row 1142)', () => {
  it('(a) End onto an unfetched index defers, then emits exactly once for the current focus row when its page lands', async () => {
    const TOTAL = 250; // pages at offset 0, 100, 200
    const source = createLazyRowSource(TOTAL);
    source.preload(0, pageRows(0));
    const wrapper = await mountLazyTable(TOTAL, source);

    const row0 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '0')!;
    await row0.trigger('click');
    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('select')![0]).toEqual([fakeRow(0)]);

    // End -> focusIndex jumps to 249, whose page (offset 200) is not
    // loaded yet. `rowAt(249)` is null, so `emitSelectForFocusIndex`
    // must return without emitting.
    await row0.trigger('keydown', { key: 'End' });
    await nextTick();
    await nextTick();
    expect(wrapper.emitted('select')).toHaveLength(1); // still just row0 — deferred, not emitted yet

    // Parent's `ensureRange` fires for the pending page; still no
    // emit while the fetch is in flight.
    const pending = source.ensurePage(200, pageRows(200));
    await nextTick();
    expect(wrapper.emitted('select')).toHaveLength(1);

    // The page lands: the deferred-select watcher (dependent on
    // `pages.get(200)`, since focusIndex is still 249) fires exactly
    // once for the CURRENT focus row.
    source.resolvePage(200);
    await pending;
    await nextTick();

    const selectEvents = wrapper.emitted('select')!;
    expect(selectEvents).toHaveLength(2);
    expect(selectEvents[1]).toEqual([fakeRow(249)]);

    // Landing the same page again must not re-fire (guarded by
    // `selectEmittedForIndex`).
    source.relandPage(200, pageRows(200));
    await nextTick();
    expect(wrapper.emitted('select')).toHaveLength(2);

    wrapper.unmount();
  });

  it('(b) navigating away while a page is in flight: the stale page landing later emits nothing for the abandoned index', async () => {
    const TOTAL = 250;
    const source = createLazyRowSource(TOTAL);
    source.preload(0, pageRows(0));
    const wrapper = await mountLazyTable(TOTAL, source);

    // Start focus at row 4 (not row 0; row 4 is the outer edge of the
    // default-overscan render window at mount time) so that
    // `selectEmittedForIndex` is seeded on an index OTHER than 0 —
    // Home's later move back to row 0 must therefore still be a
    // genuinely fresh eager emit rather than being silently
    // swallowed by the already-emitted-for-this-index guard (row 0
    // hasn't been emitted for yet in this test).
    const startRow = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '4')!;
    await startRow.trigger('click');
    expect(wrapper.emitted('select')).toHaveLength(1); // row4, eager
    expect(wrapper.emitted('select')![0]).toEqual([fakeRow(4)]);

    // Jump to 249 (offset 200, unloaded) — deferred, no emit yet.
    await startRow.trigger('keydown', { key: 'End' });
    await nextTick();
    await nextTick();
    expect(wrapper.emitted('select')).toHaveLength(1);
    const pending = source.ensurePage(200, pageRows(200));

    // Navigate away BEFORE the pending page resolves: Home moves
    // focus back to row 0, whose page is already loaded, so this is
    // an eager, immediate second emit. The row wrapper for index 249
    // is rendered (as a loading placeholder — see the template's
    // `v-else` "…" cell) even though its data hasn't landed, and it
    // now carries the roving tabindex, so it's the real DOM target
    // for the next keydown.
    const focusedRow = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '249')!;
    expect(focusedRow.attributes('tabindex')).toBe('0');
    await focusedRow.trigger('keydown', { key: 'Home' });
    await nextTick();
    await nextTick();

    const afterHome = wrapper.emitted('select')!;
    expect(afterHome).toHaveLength(2);
    expect(afterHome[1]).toEqual([fakeRow(0)]);

    // The abandoned index's page (200) now lands. `focusIndex` is 0
    // — the deferred watcher re-tracked its dependency onto
    // `pages.get(0)` the moment focus moved, so `pages.set(200, ...)`
    // must NOT retrigger it, and no emit for index 249 should occur.
    source.resolvePage(200);
    await pending;
    await nextTick();
    await nextTick();

    const finalEvents = wrapper.emitted('select')!;
    expect(finalEvents).toHaveLength(2); // unchanged — nothing fired for the stale index
    expect(finalEvents.map((e) => (e[0] as LibraryGameListItem).id)).not.toContain(fakeRow(249).id);

    wrapper.unmount();
  });

  it('(c) eager emit (data already loaded) plus a later reactive re-land of the same page does not double-emit', async () => {
    const TOTAL = 250;
    const source = createLazyRowSource(TOTAL);
    source.preload(0, pageRows(0)); // covers indices 0..99, both row0 and row1 already loaded
    const wrapper = await mountLazyTable(TOTAL, source);

    const row0 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '0')!;
    await row0.trigger('click');
    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('select')![0]).toEqual([fakeRow(0)]);

    // ArrowDown onto row1 — already loaded in the same page. This
    // exercises BOTH paths for the same index concurrently:
    // `moveFocusTo`'s synchronous eager `emitSelectForFocusIndex`
    // call, AND the deferred watcher re-running because `focusIndex`
    // itself is one of its reactive dependencies (a plain ref read)
    // — both must resolve to a single emit, guarded by
    // `selectEmittedForIndex`.
    await row0.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    await nextTick();

    let selectEvents = wrapper.emitted('select')!;
    expect(selectEvents).toHaveLength(2);
    expect(selectEvents[1]).toEqual([fakeRow(1)]);

    // A later, unrelated reactive re-land of the SAME page (e.g. a
    // refresh that replaces the array reference at the same offset)
    // must not re-fire for the still-focused index 1.
    source.relandPage(0, pageRows(0));
    await nextTick();
    await nextTick();

    selectEvents = wrapper.emitted('select')!;
    expect(selectEvents).toHaveLength(2); // unchanged

    wrapper.unmount();
  });
});
