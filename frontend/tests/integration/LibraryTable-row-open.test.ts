/**
 * tests/integration/LibraryTable-row-open.test.ts
 *
 * Pins the row-opening interaction model (ledger row 1015 → commissioner
 * adjudication, ledger row 1106 — SELECT-PREVIEWS, EXPLICIT-OPEN): a
 * plain click selects (previews) only; double-click or Enter on a row
 * opens explicitly; Ctrl/Cmd-click and middle-click still mean "open in
 * new tab"; and a row is not user-selectable text (the native
 * double-click word-selection artifact L7 witnessed, which the ratified
 * double-click-opens gesture makes newly relevant to keep killed).
 *
 * Mounts the real component, same idiom as
 * `LibraryTable-column-fit.test.ts` — `ResizeObserver` faked the same
 * way so the header-width-driven column fit doesn't gate row
 * rendering.
 *
 * Vitest's jsdom environment runs with `css: false` (`vite.config.ts`),
 * so component `<style>` blocks are not auto-injected into the test
 * DOM. For the `user-select: none` assertion, this test reads
 * `LibraryTable.vue`'s own `<style scoped>` block off disk and installs
 * it as a real stylesheet before mounting — same mechanism as
 * `status-bar-hint-no-reflow.test.ts` — so `getComputedStyle` reflects
 * the component's actual, current CSS rather than a hand-copied
 * duplicate that could drift from the source of truth.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import LibraryTable from '../../src/components/library/LibraryTable.vue';
import type { LibraryGameListItem } from '../../src/types';
import type { GameDisplayOrdinal, GameSourceId } from '../../src/types/ids';

const LIBRARY_TABLE_SFC_PATH = join(__dirname, '..', '..', 'src', 'components', 'library', 'LibraryTable.vue');

/**
 * Extracts the `<style scoped>...</style>` body from the SFC source and
 * returns it as plain CSS text — read from disk, not a pasted copy.
 */
function readLibraryTableStyleBlock(): string {
  const source = readFileSync(LIBRARY_TABLE_SFC_PATH, 'utf-8');
  const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!match) {
    throw new Error('LibraryTable.vue: no <style> block found — SFC structure changed unexpectedly');
  }
  return match[1];
}

let styleEl: HTMLStyleElement | null = null;

beforeAll(() => {
  styleEl = document.createElement('style');
  styleEl.textContent = readLibraryTableStyleBlock();
  document.head.appendChild(styleEl);
});

afterAll(() => {
  styleEl?.remove();
  styleEl = null;
});

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

async function mountWideTable() {
  const wrapper = mount(LibraryTable, {
    props: {
      totalCount: 1,
      rowAt: (i: number) => (i === 0 ? fakeRow(0) : null),
      isRowLoading: () => false,
      sort: 'date',
      direction: 'desc',
      selectedId: null,
    },
  });
  // Header ResizeObserver is the second instance constructed (see
  // LibraryTable-column-fit.test.ts's identical comment); fire it wide
  // so every column renders and a row exists to click on.
  const headerObserver = FakeResizeObserver.instances[1];
  headerObserver?.fire(1000);
  await nextTick();
  return wrapper;
}

describe('LibraryTable — row-opening interaction (ledger row 1106: SELECT-PREVIEWS, EXPLICIT-OPEN)', () => {
  it('a plain click selects (previews) only — never opens, never a stray new-tab emit', async () => {
    const wrapper = await mountWideTable();
    const row = wrapper.find('.library-row');
    expect(row.exists()).toBe(true);

    await row.trigger('click');

    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual([fakeRow(0)]);
    expect(wrapper.emitted('open')).toBeFalsy();
    expect(wrapper.emitted('open-new-tab')).toBeFalsy();

    wrapper.unmount();
  });

  it('double-click opens explicitly', async () => {
    const wrapper = await mountWideTable();
    const row = wrapper.find('.library-row');

    await row.trigger('dblclick');

    expect(wrapper.emitted('open')).toBeTruthy();
    expect(wrapper.emitted('open')![0]).toEqual([fakeRow(0)]);

    wrapper.unmount();
  });

  it('Enter on a row opens explicitly', async () => {
    const wrapper = await mountWideTable();
    const row = wrapper.find('.library-row');

    // A row is tabindex="0" precisely so it can receive this keydown
    // once selected by a prior click — see the file header comment.
    await row.trigger('click');
    await row.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('open')).toBeTruthy();
    expect(wrapper.emitted('open')![0]).toEqual([fakeRow(0)]);

    wrapper.unmount();
  });

  it('a non-Enter keydown does not open', async () => {
    const wrapper = await mountWideTable();
    const row = wrapper.find('.library-row');

    await row.trigger('keydown', { key: 'ArrowDown' });

    expect(wrapper.emitted('open')).toBeFalsy();

    wrapper.unmount();
  });

  it('Ctrl-click opens in a new tab, not the active board, and is not a select', async () => {
    const wrapper = await mountWideTable();
    const row = wrapper.find('.library-row');

    await row.trigger('click', { ctrlKey: true });

    expect(wrapper.emitted('open-new-tab')).toBeTruthy();
    expect(wrapper.emitted('open-new-tab')![0]).toEqual([fakeRow(0)]);
    expect(wrapper.emitted('open')).toBeFalsy();
    expect(wrapper.emitted('select')).toBeFalsy();

    wrapper.unmount();
  });

  it('middle-click (mousedown) opens in a new tab', async () => {
    const wrapper = await mountWideTable();
    const row = wrapper.find('.library-row');

    await row.trigger('mousedown', { button: 1 });

    expect(wrapper.emitted('open-new-tab')).toBeTruthy();
    expect(wrapper.emitted('open-new-tab')![0]).toEqual([fakeRow(0)]);

    wrapper.unmount();
  });

  it('row text is not user-selectable (kills the double-click text-selection artifact)', async () => {
    const wrapper = await mountWideTable();
    const row = wrapper.find('.library-row');

    expect(getComputedStyle(row.element).userSelect).toBe('none');

    wrapper.unmount();
  });
});
