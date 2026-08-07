/**
 * tests/integration/BaseChart-init-retry-leak.test.ts
 *
 * Regression guard for the leaked init-retry `setTimeout` in
 * `BaseChart.vue`'s `initChart` (design-hydration-telemetry.md's H1
 * finding): the retry id was scheduled but never captured/cleared on
 * unmount, unlike the sibling `HeatmapChart.vue` (`initTimeout`,
 * captured at mount, cleared in `onUnmounted`). A `BaseChart` unmounted
 * while its zero-height retry is pending (TabWidget lazy unmount,
 * App.vue's `:key`-driven board remount) leaked a closure that
 * reschedules itself forever against a dead `chartRef`.
 *
 * ADR-0021: the underlying claim is negative ("no timer fires after
 * unmount"), converted here into a positive tripwire — a spy on
 * `setTimeout` (the retry's own rescheduling call, the observable
 * action a leaked retry callback performs each time it fires) that
 * must NOT be invoked again once the component is unmounted and fake
 * time is advanced past the retry delay. Verified red on pre-fix code
 * (the bare `setTimeout(initChart, CHART_INIT_RETRY_MS)` call): with
 * `chartRef.value` nulled by Vue on unmount, the retry's zero-height
 * branch keeps being taken and keeps re-arming a fresh `setTimeout`
 * forever, so the spy fires.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';
import BaseChart from '../../src/components/charts/BaseChart.vue';
import { CHART_INIT_RETRY_MS } from '../../src/lib/timing';

// Mocked so the module import doesn't pull in real ECharts/canvas work;
// this test's path never reaches `echarts.init` (clientHeight stays 0
// throughout — the zero-height retry branch is exactly what's under test).
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

const SERIES = [{ name: 's', data: [[0, 1], [1, 2]] }];

beforeEach(() => {
  installRenderEnvStubs();
  vi.useFakeTimers();
  (echarts.init as unknown as Mock).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  removeRenderEnvStubs();
});

describe('BaseChart — init-retry timer leak', () => {
  it('clears the pending init-retry timer on unmount (does not reschedule against a dead component)', async () => {
    // jsdom's default HTMLElement.clientHeight is 0 (no layout engine),
    // so `initChart`'s zero-height branch schedules the retry — the
    // state under test, with no stub needed to force it.
    const wrapper = mount(BaseChart, { props: { series: SERIES } });
    // Let initChart's `await nextTick()` resolve so the retry setTimeout
    // is actually scheduled before we assert on it.
    await flushPromises();

    // Sanity check the scheduling fired at all — a guard that can't
    // observe its own setup is a guard that can't fail meaningfully.
    expect(vi.getTimerCount()).toBe(1);
    expect(echarts.init).not.toHaveBeenCalled(); // never reached init (height stayed 0)

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    wrapper.unmount();

    // Advance past the retry delay. A correctly-released timer never
    // fires, so `setTimeout` is never called again from inside the
    // (would-be) retry callback, and no timer is left pending afterward.
    // Pre-fix: the retry fires against the unmounted component, finds
    // `chartRef.value === null` (Vue nulls template refs on unmount),
    // takes the zero-height branch again, and reschedules itself — a
    // fresh `setTimeout` call, which is the tripwire below.
    await vi.advanceTimersByTimeAsync(CHART_INIT_RETRY_MS);

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    setTimeoutSpy.mockRestore();
  });
});
