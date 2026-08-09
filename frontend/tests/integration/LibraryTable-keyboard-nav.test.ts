/**
 * tests/integration/LibraryTable-keyboard-nav.test.ts
 *
 * Audit L4 (ledger row 1016, scope-corrected row 1037): the Library
 * list's keyboard-only journey. Roving tabindex over the virtualized
 * rows — exactly one row is ever a Tab stop — plus arrow/Home/End/
 * PageUp/PageDown navigation that survives virtualization: moving
 * focus onto a row outside the currently-rendered window must scroll
 * it into `useVirtualRowList`'s render window and focus the resulting
 * DOM element, not a stale or nonexistent one.
 *
 * Mounts the real component, same idiom as
 * `LibraryTable-row-open.test.ts` / `LibraryTable-column-fit.test.ts`
 * — `ResizeObserver` faked identically so the header-width-driven
 * column fit doesn't gate row rendering.
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

const TOTAL = 500;

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

// Every row loaded — isolates the keyboard/virtualization behavior
// from the query composable's own lazy-range loading (that seam is
// `useLibraryQuery`'s, not this component's).
function rowAt(i: number): LibraryGameListItem | null {
  return i >= 0 && i < TOTAL ? fakeRow(i) : null;
}

async function mountWideTable(selectedId: GameSourceId | null = null) {
  const wrapper = mount(LibraryTable, {
    props: {
      totalCount: TOTAL,
      rowAt,
      isRowLoading: () => false,
      sort: 'date',
      direction: 'desc',
      selectedId,
    },
    attachTo: document.body,
  });
  const headerObserver = FakeResizeObserver.instances[1];
  headerObserver?.fire(1000);
  await nextTick();
  return wrapper;
}

/** `[data-row-index]` values currently rendered, sorted numerically. */
function renderedIndices(wrapper: ReturnType<typeof mount>): number[] {
  return wrapper
    .findAll('.library-row')
    .map((w) => Number(w.attributes('data-row-index')))
    .sort((a, b) => a - b);
}

describe('LibraryTable — keyboard operability (audit L4)', () => {
  it('roving tabindex: exactly one rendered row is a Tab stop, at focusIndex', async () => {
    const wrapper = await mountWideTable();
    const rows = wrapper.findAll('.library-row');
    expect(rows.length).toBeGreaterThan(1);

    const tabbable = rows.filter((r) => r.attributes('tabindex') === '0');
    const notTabbable = rows.filter((r) => r.attributes('tabindex') === '-1');
    expect(tabbable.length).toBe(1);
    expect(notTabbable.length).toBe(rows.length - 1);
    // Defaults to row 0 — the list's first tab stop before any
    // selection has happened.
    expect(tabbable[0].attributes('data-row-index')).toBe('0');

    wrapper.unmount();
  });

  it('Tab into the list lands on the active (selected) row, and it is the ONLY tab stop in the list', async () => {
    // selectedId matches row 2's fake id — but focusIndex is
    // independent internal state (this component has no id→index
    // lookup to resolve it from), so the active tab stop is whatever
    // the user last interacted with, not automatically row 2. Clicking
    // row 2 first is what makes it the roving tab stop.
    const wrapper = await mountWideTable();
    const row2 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '2')!;
    await row2.trigger('click');

    const rows = wrapper.findAll('.library-row');
    const tabbable = rows.filter((r) => r.attributes('tabindex') === '0');
    expect(tabbable.length).toBe(1);
    expect(tabbable[0].attributes('data-row-index')).toBe('2');
    // Tab exits in one stop: no other element inside the listbox is
    // focusable, so a native Tab from row 2 lands outside the list.
    const otherFocusable = rows.filter((r) => r !== tabbable[0]);
    for (const r of otherFocusable) {
      expect(r.attributes('tabindex')).toBe('-1');
    }

    wrapper.unmount();
  });

  it('ArrowDown moves selection, focus, and the preview follows (select emitted)', async () => {
    const wrapper = await mountWideTable();
    const row0 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '0')!;
    await row0.trigger('click');
    expect(wrapper.emitted('select')![0]).toEqual([fakeRow(0)]);

    await row0.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();

    const selectEvents = wrapper.emitted('select')!;
    expect(selectEvents[selectEvents.length - 1]).toEqual([fakeRow(1)]);

    const tabbable = wrapper.findAll('.library-row').filter((r) => r.attributes('tabindex') === '0');
    expect(tabbable.length).toBe(1);
    expect(tabbable[0].attributes('data-row-index')).toBe('1');

    wrapper.unmount();
  });

  it('ArrowUp moves selection back up', async () => {
    const wrapper = await mountWideTable();
    const row0 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '0')!;
    await row0.trigger('click');
    await row0.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();

    const row1 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '1')!;
    await row1.trigger('keydown', { key: 'ArrowUp' });
    await nextTick();

    const selectEvents = wrapper.emitted('select')!;
    expect(selectEvents[selectEvents.length - 1]).toEqual([fakeRow(0)]);

    wrapper.unmount();
  });

  it('ArrowUp at row 0 stays clamped at row 0 (no negative index, no crash)', async () => {
    const wrapper = await mountWideTable();
    const row0 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '0')!;
    await row0.trigger('click');
    await row0.trigger('keydown', { key: 'ArrowUp' });
    await nextTick();

    const tabbable = wrapper.findAll('.library-row').filter((r) => r.attributes('tabindex') === '0');
    expect(tabbable[0].attributes('data-row-index')).toBe('0');

    wrapper.unmount();
  });

  it('End jumps to the last row, scrolling it into the render window and focusing it (virtualization case)', async () => {
    const wrapper = await mountWideTable();
    // Row 499 (the last row) is nowhere near the initially-rendered
    // window (overscan 5 around row 0) — this is exactly the
    // out-of-window case the audit flags as most likely to regress.
    expect(renderedIndices(wrapper)).not.toContain(TOTAL - 1);

    const row0 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '0')!;
    await row0.trigger('click');
    await row0.trigger('keydown', { key: 'End' });
    // The keydown handler awaits nextTick internally (focusRowAfterRender)
    // before calling .focus() — flush an extra tick so that resolves.
    await nextTick();
    await nextTick();

    expect(renderedIndices(wrapper)).toContain(TOTAL - 1);
    const lastRow = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === String(TOTAL - 1))!;
    expect(lastRow.exists()).toBe(true);
    expect(lastRow.attributes('tabindex')).toBe('0');
    expect(document.activeElement).toBe(lastRow.element);

    const selectEvents = wrapper.emitted('select')!;
    expect(selectEvents[selectEvents.length - 1]).toEqual([fakeRow(TOTAL - 1)]);

    wrapper.unmount();
  });

  it('Home jumps back to the first row from a scrolled-away position', async () => {
    const wrapper = await mountWideTable();
    const row0 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '0')!;
    await row0.trigger('click');
    await row0.trigger('keydown', { key: 'End' });
    await nextTick();
    await nextTick();

    const lastRow = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === String(TOTAL - 1))!;
    await lastRow.trigger('keydown', { key: 'Home' });
    await nextTick();
    await nextTick();

    expect(renderedIndices(wrapper)).toContain(0);
    const firstRow = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '0')!;
    expect(firstRow.attributes('tabindex')).toBe('0');
    expect(document.activeElement).toBe(firstRow.element);

    wrapper.unmount();
  });

  it('Enter opens the focused/selected row through the existing guard, surviving the roving-tabindex refactor', async () => {
    const wrapper = await mountWideTable();
    const row0 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '0')!;
    await row0.trigger('click');
    await row0.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('open')).toBeTruthy();
    expect(wrapper.emitted('open')![0]).toEqual([fakeRow(0)]);

    wrapper.unmount();
  });

  it('roles: listbox container, option rows, aria-selected tracks the selected row', async () => {
    const wrapper = await mountWideTable();
    const listbox = wrapper.find('[role="listbox"]');
    expect(listbox.exists()).toBe(true);

    const row0 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '0')!;
    expect(row0.attributes('role')).toBe('option');
    expect(row0.attributes('aria-selected')).toBe('false');

    await row0.trigger('click');
    // Mirrors what LibraryTab.vue does in the real app: `select` sets
    // `preview.selectedRow`, which flows back down as the `selectedId`
    // prop. This standalone mount has no parent wiring that up, so the
    // test does it explicitly.
    const selected = wrapper.emitted('select')![0][0] as LibraryGameListItem;
    await wrapper.setProps({ selectedId: selected.id });
    await nextTick();

    expect(row0.attributes('aria-selected')).toBe('true');

    wrapper.unmount();
  });

  it('aria-sort reflects the current sort column/direction on sortable headers; the non-sortable ordinal column gets none', async () => {
    const wrapper = mount(LibraryTable, {
      props: {
        totalCount: TOTAL,
        rowAt,
        isRowLoading: () => false,
        sort: 'date',
        direction: 'desc',
        selectedId: null,
      },
    });
    FakeResizeObserver.instances[1]?.fire(1000);
    await nextTick();

    const headers = wrapper.findAll('.th');
    const dateHeader = headers.find((h) => h.text().startsWith('Date'))!;
    expect(dateHeader.attributes('aria-sort')).toBe('descending');

    const resultHeader = headers.find((h) => h.text().startsWith('Result'))!;
    expect(resultHeader.attributes('aria-sort')).toBe('none');

    const ordinalHeader = wrapper.find('.col-ordinal');
    expect(ordinalHeader.attributes('aria-sort')).toBeUndefined();

    wrapper.unmount();
  });

  it('PageDown moves focus by a full page (containerHeight / rowHeight rows)', async () => {
    const wrapper = await mountWideTable();
    const scrollEl = wrapper.find('.library-table-scroll').element as HTMLDivElement;
    Object.defineProperty(scrollEl, 'clientHeight', { value: 320, configurable: true }); // 10 rows @ 32px
    // containerHeight is read from `el.clientHeight` inside the
    // scroll-container's own ResizeObserver callback (instance 0 —
    // constructed before the header-width observer, instance 1). Fire
    // it now that clientHeight has a real value so `pageSize()` sees it.
    FakeResizeObserver.instances[0]?.fire(0);

    const row0 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '0')!;
    await row0.trigger('click');
    await row0.trigger('keydown', { key: 'PageDown' });
    await nextTick();
    await nextTick();

    const tabbable = wrapper.findAll('.library-row').filter((r) => r.attributes('tabindex') === '0');
    expect(tabbable[0].attributes('data-row-index')).toBe('10');

    wrapper.unmount();
  });

  it('a non-navigation keydown (e.g. a plain letter) does not move focus or open', async () => {
    const wrapper = await mountWideTable();
    const row0 = wrapper.findAll('.library-row').find((r) => r.attributes('data-row-index') === '0')!;
    await row0.trigger('click');
    await row0.trigger('keydown', { key: 'a' });
    await nextTick();

    expect(wrapper.emitted('open')).toBeFalsy();
    const tabbable = wrapper.findAll('.library-row').filter((r) => r.attributes('tabindex') === '0');
    expect(tabbable[0].attributes('data-row-index')).toBe('0');

    wrapper.unmount();
  });
});
