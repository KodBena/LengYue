/**
 * tests/unit/charts/chart-data.test.ts
 *
 * Pure-logic coverage for `seriesHasData` (chart-data.ts) — the shared
 * predicate BaseChart.vue (legend gate) and AnalysisChartPanel.vue
 * (chart-vs-empty-state branch) both read for M11 (menus-ui audit row
 * 1291: "two full chart frames with axes, ticks and a legend — and no
 * data, no empty state").
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { seriesHasData } from '../../../src/components/charts/chart-data';

describe('seriesHasData', () => {
  it('is false for undefined/null series', () => {
    expect(seriesHasData(undefined)).toBe(false);
    expect(seriesHasData(null)).toBe(false);
  });

  it('is false for an empty series array', () => {
    expect(seriesHasData([])).toBe(false);
  });

  it('is false when every series has an empty data array', () => {
    expect(seriesHasData([{ data: [] }, { data: [] }])).toBe(false);
  });

  it('is false when every datum is a null-Y tuple (ECharts "no value here" convention)', () => {
    expect(seriesHasData([
      { data: [[0, null], [1, null]] },
      { data: [[0, null]] },
    ])).toBe(false);
  });

  it('is false when every datum is a null-Y { value } object', () => {
    expect(seriesHasData([
      { data: [{ value: [0, null] }, { value: [1, null] }] },
    ])).toBe(false);
  });

  it('is true when at least one tuple datum has a non-null Y', () => {
    expect(seriesHasData([
      { data: [[0, null]] },
      { data: [[0, null], [1, 0.5]] },
    ])).toBe(true);
  });

  it('is true when at least one { value } datum has a non-null Y', () => {
    expect(seriesHasData([
      { data: [{ value: [0, null] }, { value: [1, 42] }] },
    ])).toBe(true);
  });

  it('is true for a genuine zero Y value (0 is data, not absence)', () => {
    expect(seriesHasData([{ data: [[0, 0]] }])).toBe(true);
  });
});
