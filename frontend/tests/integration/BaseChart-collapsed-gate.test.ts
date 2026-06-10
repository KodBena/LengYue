/**
 * tests/integration/BaseChart-collapsed-gate.test.ts
 *
 * Regression guard for the collapsed-chart work gate (the
 * `AnalysisChartPanel` "rolled-up panels still ran ECharts setOption on
 * every analysis packet" bug). It is the ECharts-work analogue of the
 * render-count guards (`tests/integration/render-count/`): it asserts a
 * *frequency* — that a collapsed (`active: false`) BaseChart performs ZERO
 * `setOption` on a redraw trigger — rather than any render output. ECharts
 * is mocked so `setOption` is a spy; the redraw is driven through the
 * direct `zoomRange` watch (no throttle timing to fight).
 *
 * Verify the guard is live: delete the `if (props.active === false)` gate in
 * BaseChart's `updateOptions` and this test goes red.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';
import { assertOmittedGatePropMeansActive } from './gate-prop-omission';
import BaseChart from '../../src/components/charts/BaseChart.vue';

// Mock ECharts: `init` returns a chart whose `setOption` is a spy — the
// per-packet work the gate suppresses while collapsed.
vi.mock('echarts', () => ({
  init: vi.fn(() => ({
    setOption: vi.fn(),
    on: vi.fn(),
    getZr: () => ({ on: vi.fn() }),
    resize: vi.fn(),
    dispose: vi.fn(),
  })),
}));

import * as echarts from 'echarts';

beforeEach(() => {
  installRenderEnvStubs();
  // jsdom reports clientHeight 0 (no layout) → BaseChart.initChart would
  // infinite-retry on a 100ms timer; a non-zero height lets init run once.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 300,
  });
  (echarts.init as unknown as Mock).mockClear();
});

afterEach(() => {
  removeRenderEnvStubs();
  // Remove the own stub → restore Element.prototype's inherited getter.
  delete (HTMLElement.prototype as unknown as { clientHeight?: unknown }).clientHeight;
});

const SERIES = [{ name: 's', data: [[0, 1], [1, 2]] }];

/** The chart instance BaseChart created via the mocked echarts.init. */
function spiedChart(): { setOption: Mock } {
  return (echarts.init as unknown as Mock).mock.results[0].value;
}

describe('BaseChart — collapsed gate', () => {
  it('does no setOption while collapsed, then catches up on re-expand', async () => {
    const wrapper = mount(BaseChart, { props: { series: SERIES, active: false } });
    await flushPromises(); // initChart: await nextTick → echarts.init → (gated) updateOptions

    const chart = spiedChart();
    expect(chart.setOption.mock.calls.length).toBe(0); // collapsed at mount → init's redraw gated

    // A redraw trigger (zoomRange → the direct updateOptions watch) while
    // collapsed must NOT reach setOption.
    await wrapper.setProps({ zoomRange: [0, 1] });
    await flushPromises();
    expect(chart.setOption.mock.calls.length).toBe(0);

    // Re-expand → exactly the catch-up the gate promises (active=true ⇒ the
    // ECharts work runs).
    await wrapper.setProps({ active: true });
    await flushPromises();
    expect(chart.setOption.mock.calls.length).toBeGreaterThan(0);

    wrapper.unmount();
  });

  // Regression guard for the intermission-chart blank-render + ecModel crash
  // (ReviewSessionPanel omits `active`). Vue casts an omitted `boolean`-typed
  // prop to `false` (not `undefined`), so a `withDefaults`-less BaseChart read
  // `active === false` for every such consumer and never ran the first
  // setOption — a blank chart, plus a live zr handler calling containPixel on
  // an unconfigured (`_model`-less) instance. With `active` defaulted to
  // `true`, omission ⇒ active. Remove the `active: true` default → red.
  // The mount/flush/assert choreography lives in the reusable omission guard
  // (./gate-prop-omission.ts — the lint rule gate-prop-needs-default's
  // runtime half); this file is its worked example.
  it('runs setOption when `active` is omitted (Vue would otherwise cast it to false)', async () => {
    await assertOmittedGatePropMeansActive({
      component: BaseChart,
      gateProp: 'active',
      props: { series: SERIES },
      gatedWorkRan: () => spiedChart().setOption.mock.calls.length > 0,
    });
  });
});
