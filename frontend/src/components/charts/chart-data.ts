/**
 * src/components/charts/chart-data.ts
 *
 * Shared predicate: does a BaseChart-shaped `series` array carry any
 * actual datum? Both `BaseChart.vue` (gates the legend — M11, menus-ui
 * audit row 1291: "a legend for absent series affirmatively claims
 * data should be there") and `AnalysisChartPanel.vue` (chooses between
 * the chart and a real empty state) need the identical answer to "is
 * there anything to plot", so the check lives here once rather than
 * drifting between two ad-hoc reimplementations (ADR-0012 P1).
 *
 * A series counts as carrying data when at least one point across all
 * series has a non-null Y value — the same null-means-absent
 * convention `getVisibleYBounds` (BaseChart.vue) and
 * `updateMarker`/`getDisplaySeries` already use for "this point has
 * nothing to show". Datum shape mirrors those functions' own
 * structural read: either a `[x, y]` tuple or a `{ value: [x, y], ... }`
 * object (ECharts' two accepted per-point forms; BaseChart's callers
 * use both).
 *
 * License: Public Domain (The Unlicense)
 */

interface ChartSeriesLike {
  readonly data?: ReadonlyArray<unknown>;
}

function pointY(pt: unknown): number | null | undefined {
  if (pt && typeof pt === 'object' && 'value' in pt) {
    const v = (pt as { value?: unknown }).value;
    return Array.isArray(v) ? (v[1] as number | null | undefined) : undefined;
  }
  return Array.isArray(pt) ? (pt[1] as number | null | undefined) : undefined;
}

/**
 * True iff at least one series carries at least one point with a
 * non-null Y value. Undefined/empty `series` (or every series empty,
 * or every point's Y null) all read as "no data" — the empty-state
 * case this predicate exists to detect.
 */
export function seriesHasData(
  series: ReadonlyArray<ChartSeriesLike> | undefined | null,
): boolean {
  if (!series) return false;
  for (const s of series) {
    const data = s?.data;
    if (!data) continue;
    for (const pt of data) {
      const y = pointY(pt);
      if (y !== null && y !== undefined) return true;
    }
  }
  return false;
}
