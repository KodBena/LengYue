/**
 * tests/integration/LibraryTable-column-fit.test.ts
 *
 * Resolution roadmap Phase 2 (ledger row 928, audit finding L2): the
 * component-level counterpart to `table-column-fit.test.ts`'s pure
 * coverage — a narrow mount shows the "+N more" elision indicator and
 * renders NO 0-width column (L2's own finding: two player-name
 * columns measured `scrollWidth` 70/58 at 0px rendered width, with
 * the header collapsing into the concatenated string
 * "BlackWhiteDate"). This tier mounts the real component (the
 * existing idiom per `WizardStepIndicator.test.ts` /
 * `SetupWizardModal.test.ts`, not the render-count-only tier-3
 * exception `tests/CLAUDE.md` otherwise names).
 *
 * `ResizeObserver` is faked the same way
 * `useDeferredContainerBreakpoint.test.ts` fakes it — jsdom's own stub
 * (`tests/integration/render-count/jsdom-stubs.ts`) is a permanent
 * no-op that never invokes its callback, useless for driving
 * `useElementWidth`'s width-tracking logic.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import LibraryTable from '../../src/components/library/LibraryTable.vue';
import {
  LIBRARY_TABLE_COLUMNS,
  LIBRARY_TABLE_GAP_PX,
  LIBRARY_TABLE_INDICATOR_WIDTH_PX,
} from '../../src/components/library/library-table-columns';
import { fitColumns } from '../../src/state/table-column-fit';
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

function mountTable() {
  return mount(LibraryTable, {
    props: {
      totalCount: 3,
      rowAt: (i: number) => (i < 3 ? fakeRow(i) : null),
      isRowLoading: () => false,
      sort: 'date',
      direction: 'desc',
      selectedId: null,
    },
  });
}

// The header's own ResizeObserver is the SECOND instance constructed
// (the first is the scroll-container's pre-existing height observer —
// see LibraryTable.vue's onMounted, which wires containerHeight's
// observer before headerWidth's).
function headerObserver(): FakeResizeObserver {
  const inst = FakeResizeObserver.instances[1];
  if (!inst) throw new Error('header ResizeObserver not constructed');
  return inst;
}

describe('LibraryTable — column-fit rendering (audit L2)', () => {
  it('renders every column with no elision indicator when the header is wide enough', async () => {
    const wrapper = mountTable();
    headerObserver().fire(1000); // comfortably fits all 5 columns
    await nextTick();

    expect(wrapper.findAll('.col-indicator').length).toBe(0);
    expect(wrapper.find('.col-ordinal').exists()).toBe(true);
    expect(wrapper.findAll('.col-player').length).toBeGreaterThanOrEqual(2); // header cells
    expect(wrapper.text()).toContain('Cho Hun-hyeon');
    expect(wrapper.text()).toContain('Seo Pong-su');

    wrapper.unmount();
  });

  // Widths chosen to exercise a mid-narrowing and an extreme-narrowing
  // case. Expected visible/dropped sets are derived from the SAME
  // `fitColumns` engine the component uses (already covered as a pure
  // function in `table-column-fit.test.ts`) rather than hand-derived
  // arithmetic, so this test's job stays "does the DOM reflect the
  // fit decision," not "did the test re-derive the fit math correctly."
  it.each([280, 160, 60])(
    'renders exactly the fit-decided visible/dropped columns at width=%dpx, never a 0-width one',
    async (width) => {
      const expected = fitColumns(width, LIBRARY_TABLE_COLUMNS, LIBRARY_TABLE_GAP_PX, LIBRARY_TABLE_INDICATOR_WIDTH_PX);

      const wrapper = mountTable();
      headerObserver().fire(width);
      await nextTick();

      const headerCells = wrapper.findAll('.library-table-header > .th');
      const indicatorCells = headerCells.filter((c) => c.classes().includes('col-indicator'));
      const columnCells = headerCells.filter((c) => !c.classes().includes('col-indicator'));

      // Exactly the visible set renders — no more, no less — and
      // every one of them carries its full label text (never a
      // present-but-truncated-to-nothing remnant, L2's own failure
      // shape: 0px-wide columns that still occupied a grid track).
      expect(columnCells.length).toBe(expected.visible.length);
      for (const cell of columnCells) {
        expect(cell.text().length).toBeGreaterThan(0);
      }

      // The elision indicator is present iff anything was dropped —
      // never silent, per audit R1/L2's own fix shape.
      expect(indicatorCells.length).toBe(expected.dropped.length > 0 ? 1 : 0);
      if (expected.dropped.length > 0) {
        expect(indicatorCells[0]!.text()).toContain(`+${expected.dropped.length} more`);
      }

      // The header string must never concatenate dropped labels into
      // one run-on word (L2's own witnessed failure: "BlackWhiteDate").
      const headerText = wrapper.find('.library-table-header').text();
      expect(headerText).not.toContain('BlackWhiteDate');

      // Every DROPPED column's label is genuinely absent from the
      // header, not merely visually squeezed.
      for (const dropped of expected.dropped) {
        if (dropped.key === 'ordinal') continue; // '#' isn't a distinguishing string to search for
        expect(headerText).not.toContain(dropped.label);
      }

      wrapper.unmount();
    },
  );
});
