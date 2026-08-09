/**
 * tests/integration/LibraryTable-sort-header.test.ts
 *
 * Audit L21 (ledger row 1019, library-residual disposition sweep): a
 * newly-chosen sort column must start ASCENDING, and only toggle to
 * descending on a second click on the SAME column. The pre-fix
 * `onHeaderClick` left `direction` untouched on a column switch, so a
 * header click while `direction` was 'desc' (the query's own default)
 * silently inherited that direction — the first click on any text
 * column landed the user at the end of the alphabet with no
 * indication why (witnessed live against the real backend: clicking
 * "Black" from the default date-desc sort produced `thug, maxiao888,
 * bork, bork, bork`, not the alphabet's start).
 *
 * Mounts the real component, same idiom as
 * `LibraryTable-row-open.test.ts` / `LibraryTable-column-fit.test.ts`
 * — `ResizeObserver` faked identically so the header-width-driven
 * column fit doesn't gate header rendering.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import LibraryTable from '../../src/components/library/LibraryTable.vue';
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

async function mountWideTable(sort: 'date' | 'playerBlack', direction: 'asc' | 'desc') {
  const wrapper = mount(LibraryTable, {
    props: {
      totalCount: 1,
      rowAt: (i: number) => (i === 0 ? fakeRow(0) : null),
      isRowLoading: () => false,
      sort,
      direction,
      selectedId: null,
    },
  });
  const headerObserver = FakeResizeObserver.instances[1];
  headerObserver?.fire(1000);
  await nextTick();
  return wrapper;
}

function headerByLabel(wrapper: ReturnType<typeof mount>, label: string) {
  const headers = wrapper.findAll('.th');
  const match = headers.find((h) => h.text().startsWith(label));
  if (!match) throw new Error(`no header found for label "${label}"`);
  return match;
}

describe('LibraryTable — sort-header direction (audit L21)', () => {
  it('switching to a new column emits update:direction "asc", not the inherited direction', async () => {
    // Current sort is 'date' desc (the query composable's own default)
    // — the exact state a fresh Library mount starts in.
    const wrapper = await mountWideTable('date', 'desc');
    const blackHeader = headerByLabel(wrapper, 'Black');

    await blackHeader.trigger('click');

    expect(wrapper.emitted('update:sort')).toBeTruthy();
    expect(wrapper.emitted('update:sort')![0]).toEqual(['playerBlack']);
    expect(wrapper.emitted('update:direction')).toBeTruthy();
    expect(wrapper.emitted('update:direction')![0]).toEqual(['asc']);

    wrapper.unmount();
  });

  it('a second click on the SAME (now-active) column toggles direction instead of re-forcing asc', async () => {
    const wrapper = await mountWideTable('playerBlack', 'asc');
    const blackHeader = headerByLabel(wrapper, 'Black');

    await blackHeader.trigger('click');

    expect(wrapper.emitted('update:sort')).toBeFalsy();
    expect(wrapper.emitted('update:direction')).toBeTruthy();
    expect(wrapper.emitted('update:direction')![0]).toEqual(['desc']);

    wrapper.unmount();
  });
});
