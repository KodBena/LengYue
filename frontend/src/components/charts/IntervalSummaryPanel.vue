<!--
  src/components/charts/IntervalSummaryPanel.vue

  Compact interval-summary table for the Basic analysis tab (wiki
  Wanted feature #6). Shows the currently-set analysis interval's
  per-colour summary figure — the same number a hover over the
  matching cell in MultiresolutionIntervalPanel's heatmap shows —
  without requiring that panel to be enabled or its cell hovered.

  Deliberately NOT a recompute: `useIntervalSummary` looks the value
  up in `useTriangularHeatmap`'s own accumulated matrix (the exact
  composable the multiresolution panel's cells are drawn from), so
  this panel and that one are provably reading the same authority —
  see the composable's header and
  `tests/integration/useIntervalSummary.test.ts`.

  Resolution roadmap Phase 2 (ledger row 928): this is "the Analysis
  dashboard table" that arc's spec names — identified from audit
  finding R1's own language ("`.dashboard` (Analysis range panel)",
  30% clipped by `overflow-x: hidden`/`clip`): "Interval" is the
  audit's "range," and this panel's fixed Player/Interval/Value shape
  is the one analysis-dashboard surface that is genuinely a named,
  typed table rather than a data-driven matrix (contrast
  `StabilityCrossCorrelationPanel.vue`'s N×N correlation grids, whose
  column identities are extractor/metric ids, not a fixed priority-
  ranked set — a column-drop-by-priority spec does not fit that
  shape, so it is out of this arc's fixed two-surface scope; flagged
  as an assumption, not silently resolved). Column geometry lives in
  `analysis-interval-table-columns.ts`; the fit/drop decision is
  `state/table-column-fit.ts`'s `fitColumns` (same engine
  `LibraryTable.vue` uses).

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useIntervalSummary } from '../../composables/analysis/useIntervalSummary';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';
import { useElementWidth } from '../../composables/chrome/useElementWidth';
import { fitColumns } from '../../state/table-column-fit';
import {
  ANALYSIS_INTERVAL_TABLE_COLUMNS,
  ANALYSIS_INTERVAL_TABLE_GAP_PX,
  ANALYSIS_INTERVAL_TABLE_INDICATOR_WIDTH_PX,
} from './analysis-interval-table-columns';
import type { StoneColor } from '../../types';

// Phase-0 projection seam: self-source from the injected AnalysisContext,
// same pattern as the other prop-less registry panels.
const ctx = injectAnalysisContext();
const variationPath = ctx.variationPath;
const selectionRange = ctx.selectionRange;

const summary = useIntervalSummary(variationPath, selectionRange);

const COLOR_LABEL: Record<'B' | 'W', string> = { B: 'Black', W: 'White' };

interface SummaryDisplayRow {
  readonly color: StoneColor;
  readonly label: string;
  readonly value: number | null;
}

// Human-readable move-range label per row, mirroring the caption format
// MultiresolutionIntervalPanel's hover preview uses ("moves s–t") — same
// vocabulary, no new convention introduced for this surface.
const rangeLabel = computed<SummaryDisplayRow[]>(() =>
  summary.value.rows.map((row) => {
    if (!row.cell) return { color: row.color, label: '—', value: null };
    return {
      color: row.color,
      label: `moves ${row.cell.s}–${row.cell.t}`,
      value: row.cell.value,
    };
  }),
);

// Resolution roadmap Phase 2: available width measured off the
// table's own content element (see IntervalSummaryPanel.vue's header
// note on why this is "the Analysis dashboard table"), same
// contentRect-based composable LibraryTable.vue uses.
const contentEl = ref<HTMLDivElement | null>(null);
const contentWidth = useElementWidth();

const columnFit = computed(() =>
  fitColumns(
    contentWidth.widthPx.value,
    ANALYSIS_INTERVAL_TABLE_COLUMNS,
    ANALYSIS_INTERVAL_TABLE_GAP_PX,
    ANALYSIS_INTERVAL_TABLE_INDICATOR_WIDTH_PX,
  ),
);

type IntervalColumnKey = 'player' | 'interval' | 'value';

function isColumnVisible(key: IntervalColumnKey): boolean {
  return columnFit.value.visible.some((c) => c.key === key);
}

// By-key lookup (not array-index) so the template's per-column
// minWidth binding stays correct regardless of the spec array's own
// declaration order.
function minWidthOf(key: IntervalColumnKey): number {
  return ANALYSIS_INTERVAL_TABLE_COLUMNS.find((c) => c.key === key)?.minWidth ?? 0;
}

const droppedColumnsTitle = computed(() =>
  columnFit.value.dropped.length > 0
    ? `Hidden for width: ${columnFit.value.dropped.map((c) => c.label).join(', ')}`
    : '',
);

onMounted(() => {
  if (contentEl.value) contentWidth.observe(contentEl.value);
});
onUnmounted(() => {
  contentWidth.stop();
});
</script>

<template>
  <div class="section">
    <div class="header">
      <span>Interval Summary</span>
    </div>
    <div ref="contentEl" class="content">
      <!--
        Resolution roadmap Phase 2 (audit R1): overflow-x: auto is the
        fallback the fit decision should make unreachable in practice
        (per-column `min-width` never exceeds the measured available
        width once a column is in `columnFit.visible`) — same posture
        as LibraryTable.vue's own header comment. It is the honest
        floor: this table never clips a rendered column silently.
      -->
      <div class="table-scroll">
        <table class="summary-table">
          <thead>
            <tr>
              <th v-if="isColumnVisible('player')" scope="col" :style="{ minWidth: minWidthOf('player') + 'px' }">Player</th>
              <th v-if="isColumnVisible('interval')" scope="col" :style="{ minWidth: minWidthOf('interval') + 'px' }">Interval</th>
              <th v-if="isColumnVisible('value')" scope="col" :style="{ minWidth: minWidthOf('value') + 'px' }">Value</th>
              <!--
                Elision indicator (audit R1's own fix shape): a
                dropped column is never silent — this header cell
                names how many, its title names which ones.
              -->
              <th
                v-if="columnFit.dropped.length > 0"
                scope="col"
                class="indicator-cell"
                :title="droppedColumnsTitle"
                :style="{ minWidth: ANALYSIS_INTERVAL_TABLE_INDICATOR_WIDTH_PX + 'px' }"
              >+{{ columnFit.dropped.length }} more</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rangeLabel" :key="row.color">
              <td
                v-if="isColumnVisible('player')"
                class="player-cell"
                :class="row.color === 'B' ? 'player-black' : 'player-white'"
              >
                {{ COLOR_LABEL[row.color] }}
              </td>
              <td v-if="isColumnVisible('interval')" class="range-cell">{{ row.label }}</td>
              <td v-if="isColumnVisible('value')" class="value-cell">
                {{ row.value === null ? 'no data' : row.value.toFixed(3) }}
              </td>
              <td v-if="columnFit.dropped.length > 0" class="indicator-cell"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section {
  background: var(--surface-2);
  border: 1px solid var(--surface-3);
  border-radius: var(--radius-default);
  overflow: hidden;
  margin-bottom: var(--space-medium);
}
.header {
  padding: var(--space-default) var(--space-medium);
  font-size: var(--text-body);
  font-weight: bold;
  color: var(--text-0);
  text-transform: uppercase;
  background: var(--surface-3);
  letter-spacing: var(--tracking-default);
}
.content {
  border-top: 1px solid var(--surface-3);
  background: var(--surface-0);
  padding: var(--space-default) var(--space-medium);
}
/* Resolution roadmap Phase 2 (audit R1): the real painted-scrollbar
   fallback for anything the fit decision still can't make fit —
   never `overflow-x: hidden`. See the template's own comment on why
   this should stay unreachable in the common case. */
.table-scroll {
  overflow-x: auto;
}
.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-body);
}
/* Elision indicator (audit R1 fix shape) — a visible, not silent,
   signal that columns were dropped for width. */
.indicator-cell {
  color: var(--text-2);
  font-size: var(--text-tiny);
  font-style: italic;
  white-space: nowrap;
}
.summary-table th {
  text-align: left;
  color: var(--text-2);
  font-weight: normal;
  padding: 2px var(--space-default) 4px 0;
  border-bottom: 1px solid var(--surface-3);
}
.summary-table td {
  padding: 4px var(--space-default) 4px 0;
  color: var(--text-1);
}
.player-cell { font-weight: bold; }
.player-black { color: var(--player-black); }
.player-white { color: var(--player-white); }
.value-cell { font-variant-numeric: tabular-nums; color: var(--text-0); }
</style>
