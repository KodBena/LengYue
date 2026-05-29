/**
 * src/composables/analysis/useAnalysisContext.ts
 * The single reactive context for the Analysis tab. Bundles the analysis
 * projection (useAnalysisProjection) with the dashboard-level derived
 * state — mistake markers, the two distribution series, chart navigation,
 * and the engine-connection flag — and exposes it through a provide/inject
 * seam.
 *
 * Why this exists (performance). The dashboard previously read every one
 * of these high-frequency values in its own render in order to thread them
 * down as props, which re-rendered the whole analysis subtree on every
 * analysis packet — the render-coupling-at-composition-nodes class
 * (docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md,
 * Recommendation 2). The provider now `provide()`s these refs and never
 * reads their `.value`; each panel `inject()`s and reads only the slice it
 * displays, so a packet re-renders only the panels whose slice changed, not
 * the orchestrator.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, inject, provide, type InjectionKey } from 'vue';
import { store } from '../../store';
import { useAnalysisProjection } from './useAnalysisProjection';
import { useMistakeFinder } from './useMistakeFinder';
import { useChartNavigation } from './useChartNavigation';
import { consecutiveGaps } from '../../lib/distributions';
import { themeColor } from '../../utils/theme-color';
import type { DistributionSeries } from '../../components/charts/DistributionChart.vue';
import type { EnrichedSeries } from './useEnrichedData';
import type { BoardId } from '../../types';

// Pull the finite values out of a per-colour enriched-series set — the
// sample vector the KDE/histogram consume. Moved verbatim from the
// dashboard's prior inline helper.
function valuesFromSeries(series: EnrichedSeries[]): number[] {
  const out: number[] = [];
  for (const s of series) {
    for (const [, v] of s.data) if (v !== null) out.push(v);
  }
  return out;
}

export function useAnalysisContext(boardId: BoardId) {
  const projection = useAnalysisProjection(boardId);
  const mistakes = useMistakeFinder(projection.enriched);
  const navigation = useChartNavigation(projection.variationPath, boardId);
  const engineConnected = computed(() => store.engine.status === 'connected');

  // Distribution series — moved verbatim from AnalysisDashboard so the
  // dashboard no longer reads `enriched.value` / `mistakes.value` in its
  // own render (the whole point of the seam).
  const deltaKdeSeries = computed<DistributionSeries[]>(() => [
    { name: 'Black', samples: valuesFromSeries(projection.enriched.value.deltaSeries.black), color: themeColor('--player-black') },
    { name: 'White', samples: valuesFromSeries(projection.enriched.value.deltaSeries.white), color: themeColor('--player-white') },
  ]);
  const mistakeGapHistogramSeries = computed<DistributionSeries[]>(() => [
    { name: 'Black', samples: consecutiveGaps(mistakes.value.filter(m => m.color === 'B').map(m => m.colorLocalIdx)), color: themeColor('--player-black') },
    { name: 'White', samples: consecutiveGaps(mistakes.value.filter(m => m.color === 'W').map(m => m.colorLocalIdx)), color: themeColor('--player-white') },
  ]);

  return {
    boardId,
    ...projection,
    mistakes,
    navigation,
    engineConnected,
    deltaKdeSeries,
    mistakeGapHistogramSeries,
  };
}

export type AnalysisContext = ReturnType<typeof useAnalysisContext>;

export const AnalysisContextKey: InjectionKey<AnalysisContext> = Symbol('AnalysisContext');

/** Create the context for `boardId` and provide it to the subtree. */
export function provideAnalysisContext(boardId: BoardId): AnalysisContext {
  const ctx = useAnalysisContext(boardId);
  provide(AnalysisContextKey, ctx);
  return ctx;
}

/**
 * Inject the analysis context. Fails loudly (ADR-0002) if a panel is
 * mounted outside an AnalysisDashboard provider — a silent `undefined`
 * here would surface as an opaque null-read deep inside a chart.
 */
export function injectAnalysisContext(): AnalysisContext {
  const ctx = inject(AnalysisContextKey);
  if (!ctx) {
    throw new Error(
      'injectAnalysisContext: no AnalysisContext in scope — analysis panels must render within an AnalysisDashboard (provideAnalysisContext) subtree.',
    );
  }
  return ctx;
}
