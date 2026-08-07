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

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useIntervalSummary } from '../../composables/analysis/useIntervalSummary';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';
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
</script>

<template>
  <div class="section">
    <div class="header">
      <span>Interval Summary</span>
    </div>
    <div class="content">
      <table class="summary-table">
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Interval</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rangeLabel" :key="row.color">
            <td class="player-cell" :class="row.color === 'B' ? 'player-black' : 'player-white'">
              {{ COLOR_LABEL[row.color] }}
            </td>
            <td class="range-cell">{{ row.label }}</td>
            <td class="value-cell">
              {{ row.value === null ? 'no data' : row.value.toFixed(3) }}
            </td>
          </tr>
        </tbody>
      </table>
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
.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-body);
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
