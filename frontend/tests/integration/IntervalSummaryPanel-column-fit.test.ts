/**
 * tests/integration/IntervalSummaryPanel-column-fit.test.ts
 *
 * Resolution roadmap Phase 2 (ledger row 928, audit finding R1 —
 * "`.dashboard` (Analysis range panel)" clipped 30% by
 * `overflow-x: hidden`/`clip`). Component-level counterpart to
 * `table-column-fit.test.ts`'s pure coverage, for the Analysis
 * dashboard's typed table (see `IntervalSummaryPanel.vue`'s own
 * header note on why this panel is the one identified).
 *
 * `injectAnalysisContext` and `useIntervalSummary` are both mocked —
 * the real `AnalysisContext` chain (`useAnalysisProjection` et al.)
 * pulls in the live store/engine machinery this panel's OWN render
 * logic doesn't need to be exercised; only `ctx.variationPath` /
 * `ctx.selectionRange` and `summary.value.rows` are actually read by
 * this component, so those are exactly what's faked (tests/CLAUDE.md's
 * fake-pattern convention, applied to two composable dependencies
 * rather than a service singleton).
 *
 * `ResizeObserver` is faked the same way
 * `useDeferredContainerBreakpoint.test.ts` fakes it.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import type { HeatmapCell } from '../../src/composables/analysis/useTriangularHeatmap';

const fakeVariationPath = ref([]);
const fakeSelectionRange = ref([0, 10]);

vi.mock('../../src/composables/analysis/useAnalysisContext', () => ({
  injectAnalysisContext: () => ({
    variationPath: fakeVariationPath,
    selectionRange: fakeSelectionRange,
  }),
}));

const fakeSummaryRows = ref<
  readonly [{ color: 'B'; cell: HeatmapCell | null }, { color: 'W'; cell: HeatmapCell | null }]
>([
  { color: 'B', cell: { color: 'B', s: 1 as any, t: 5 as any, value: 0.123 } },
  { color: 'W', cell: { color: 'W', s: 1 as any, t: 5 as any, value: -0.456 } },
]);

vi.mock('../../src/composables/analysis/useIntervalSummary', () => ({
  useIntervalSummary: () => ({ get value() { return { rows: fakeSummaryRows.value }; } }),
}));

import IntervalSummaryPanel from '../../src/components/charts/IntervalSummaryPanel.vue';
import {
  ANALYSIS_INTERVAL_TABLE_COLUMNS,
  ANALYSIS_INTERVAL_TABLE_GAP_PX,
  ANALYSIS_INTERVAL_TABLE_INDICATOR_WIDTH_PX,
} from '../../src/components/charts/analysis-interval-table-columns';
import { fitColumns } from '../../src/state/table-column-fit';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe() {}
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

function lastObserver(): FakeResizeObserver {
  const inst = FakeResizeObserver.instances.at(-1);
  if (!inst) throw new Error('no ResizeObserver constructed');
  return inst;
}

describe('IntervalSummaryPanel — column-fit rendering (audit R1)', () => {
  it('renders every column with no elision indicator when the content area is wide enough', async () => {
    const wrapper = mount(IntervalSummaryPanel);
    lastObserver().fire(1000); // comfortably fits all 3 columns
    await nextTick();

    expect(wrapper.findAll('.indicator-cell').length).toBe(0);
    expect(wrapper.find('thead').text()).toContain('Player');
    expect(wrapper.find('thead').text()).toContain('Interval');
    expect(wrapper.find('thead').text()).toContain('Value');
    expect(wrapper.text()).toContain('0.123');

    wrapper.unmount();
  });

  it.each([100, 60])(
    'drops columns by priority and shows the elision indicator at width=%dpx, never a 0-width column',
    async (width) => {
      const expected = fitColumns(
        width,
        ANALYSIS_INTERVAL_TABLE_COLUMNS,
        ANALYSIS_INTERVAL_TABLE_GAP_PX,
        ANALYSIS_INTERVAL_TABLE_INDICATOR_WIDTH_PX,
      );

      const wrapper = mount(IntervalSummaryPanel);
      lastObserver().fire(width);
      await nextTick();

      const headerCells = wrapper.findAll('thead th');
      const indicatorCells = headerCells.filter((c) => c.classes().includes('indicator-cell'));
      const columnCells = headerCells.filter((c) => !c.classes().includes('indicator-cell'));

      expect(columnCells.length).toBe(expected.visible.length);
      for (const cell of columnCells) {
        expect(cell.text().length).toBeGreaterThan(0);
      }
      expect(indicatorCells.length).toBe(expected.dropped.length > 0 ? 1 : 0);
      if (expected.dropped.length > 0) {
        expect(indicatorCells[0]!.text()).toContain(`+${expected.dropped.length} more`);
      }

      // Body rows carry the same column count as the header (never a
      // row rendering a cell for a column the header itself dropped).
      const firstBodyRow = wrapper.find('tbody tr');
      expect(firstBodyRow.findAll('td').length).toBe(headerCells.length);

      wrapper.unmount();
    },
  );
});
