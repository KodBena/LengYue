/**
 * tests/integration/AnalysisChartPanel-empty-state.test.ts
 *
 * Regression guard for M11 (menus-ui audit row 1291): "Two full chart
 * frames with axes, ticks and a legend naming 'Complexity / Win
 * Probability / Score Advantage' — and no data, no empty state…
 * three renderings of one absence coexist." AnalysisChartPanel.vue now
 * branches on `seriesHasData(series)`: real chart when there's
 * something to plot, an actual empty-state message (no axes, no ticks,
 * no legend) when there isn't.
 *
 * BaseChart is stubbed (`shallow` via an explicit `stubs` entry) —
 * ECharts' `echarts.init()` needs a real canvas/layout, which jsdom
 * doesn't provide (the same reason `card-tree-echarts.test.ts` stays
 * at the pure-logic tier rather than mounting a chart component). The
 * property under test here is AnalysisChartPanel's OWN branch, not
 * BaseChart's rendering — stubbing the leaf keeps the assertion on
 * exactly that seam.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import AnalysisChartPanel from '../../src/components/charts/AnalysisChartPanel.vue';

// AnalysisChartPanel.vue's own `onMounted` (unrelated to this fix —
// it drives the preview-box narrow/wide responsive toggle) installs a
// real `ResizeObserver`, which jsdom (this suite's environment) does
// not provide. A minimal stub is enough: the property under test here
// never depends on a resize firing.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function mountPanel(series: unknown[]) {
  return mount(AnalysisChartPanel, {
    props: {
      label: 'Game State (Turns)',
      series,
      zoomRange: [0, 10] as [number, number],
    },
    global: {
      plugins: [i18n],
      // Explicit template stub (not `stubs: { BaseChart: true }`):
      // vue-test-utils' auto-stub relies on the component's registered
      // `name`, which this `<script setup>` SFC doesn't declare via
      // `defineOptions` — an explicit stub with its own marker element
      // avoids depending on that inference.
      stubs: { BaseChart: { template: '<div data-testid="stub-basechart" />' } },
    },
  });
}

describe('AnalysisChartPanel — real empty state vs chart (M11)', () => {
  it('with no series data: shows the empty-state message, does not mount BaseChart', () => {
    const wrapper = mountPanel([]);

    const empty = wrapper.find('[data-testid="chart-empty-state"]');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('Game State (Turns)');

    expect(wrapper.find('[data-testid="stub-basechart"]').exists()).toBe(false);
    // No legend name should be affirmed anywhere in the empty branch.
    expect(wrapper.html()).not.toContain('Complexity');
  });

  it('with every point null-Y (ECharts "absent" convention): still shows the empty state', () => {
    const wrapper = mountPanel([
      { name: 'Complexity', data: [[0, null], [1, null]] },
      { name: 'Win Probability', data: [[0, null]] },
    ]);

    expect(wrapper.find('[data-testid="chart-empty-state"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stub-basechart"]').exists()).toBe(false);
  });

  it('with real data: mounts the chart, not the empty state', () => {
    const wrapper = mountPanel([
      { name: 'Complexity', data: [[0, 0.4], [1, 0.6]] },
    ]);

    expect(wrapper.find('[data-testid="chart-empty-state"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="stub-basechart"]').exists()).toBe(true);
  });
});
