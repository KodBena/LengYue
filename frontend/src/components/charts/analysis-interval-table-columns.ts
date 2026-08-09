/**
 * src/components/charts/analysis-interval-table-columns.ts
 *
 * Resolution roadmap Phase 2 (ledger row 928, audit finding R1 —
 * "`.dashboard` (Analysis range panel)" clipped 30% by
 * `overflow-x: hidden`/`clip`). SINGLE HOME for
 * `IntervalSummaryPanel.vue`'s column geometry: `Player` / `Interval`
 * / `Value` — the panel's own name (interval = the "range" the audit
 * language names) and its three-column shape are what identify it as
 * the Analysis dashboard's table for this arc; see
 * `IntervalSummaryPanel.vue`'s own header comment for the full
 * identification note.
 *
 * Same `TableColumnSpec` shape and `fitColumns` engine as
 * `library-table-columns.ts` (state/table-column-fit.ts) — declared
 * per-column data, one home, not scattered CSS literals.
 *
 * License: Public Domain (The Unlicense)
 */
import type { TableColumnSpec } from '../../state/table-column-fit';

export type AnalysisIntervalColumnKey = 'player' | 'interval' | 'value';

// assumption (not spec-given): minWidth floors, sized to the longest
// realistic cell content at this panel's body font size
// (`--text-body`, 10px): "White"/"Black" (player), "moves 123–456"
// (interval — the widest realistic string), "no data" / "-0.123"
// (value).
//
// Priority: LOWER drops first. `Value` is the number this panel
// exists to show (its whole reason for being, per the panel's own
// header doc — "the same number a hover ... shows") so it is ranked
// to survive longest; `Interval` is the most re-derivable of the
// three (the move range is also visible from the heatmap hover this
// panel mirrors) so it drops first.
export const ANALYSIS_INTERVAL_TABLE_COLUMNS: readonly TableColumnSpec<AnalysisIntervalColumnKey>[] = [
  { key: 'player', label: 'Player', minWidth: 56, priority: 2 },
  { key: 'interval', label: 'Interval', minWidth: 108, priority: 1 },
  { key: 'value', label: 'Value', minWidth: 64, priority: 3 },
];

// assumption (not spec-given): the visual gap this table's existing
// cell padding already provides between columns (`padding: 4px
// var(--space-default) 4px 0` — 8px right padding per cell is the de
// facto inter-column gap in a border-collapsed table).
export const ANALYSIS_INTERVAL_TABLE_GAP_PX = 8;

// assumption (not spec-given): elision-indicator column width, same
// rationale as `LIBRARY_TABLE_INDICATOR_WIDTH_PX`.
export const ANALYSIS_INTERVAL_TABLE_INDICATOR_WIDTH_PX = 64;
