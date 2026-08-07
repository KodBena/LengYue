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
import { useMistakeFinder, type MistakeMarker } from './useMistakeFinder';
import { useChartNavigation } from './useChartNavigation';
import { colorMoveToPly } from './useTriangularHeatmap';
import { consecutiveGaps } from '../../lib/distributions';
import { themeColor } from '../../utils/theme-color';
import type { DistributionSeries } from '../../components/charts/DistributionChart.vue';
import type { EnrichedSeries } from './useEnrichedData';
import type { BoardId, ColorMoveIndex, PlyIndex, StoneColor } from '../../types';

// Pull the finite values out of a per-colour enriched-series set that fall
// within the analysis selection range — the sample vector the KDE consumes.
//
// Mapping anchor: `EnrichedSeries.data` entries are keyed by colour-local
// move index (`mIdx`; see enriched-accumulator.ts's "Delta arbitration"
// doc), NOT by PlyIndex and NOT by array position — `deltaSeries.black[i]`
// is not "the move at ply i". `range` is `[PlyIndex, PlyIndex]` (whole-game
// plies, root-anchored), so each entry's ply is derived via
// `colorMoveToPly` — the codebase's sole (ColorMoveIndex, StoneColor) ->
// PlyIndex authority (also used by MergedDeltaPanel / useChartNavigation
// for this exact series shape) — rather than an inline `2*i+parity` guess,
// which would be unsound the moment a game seeds handicap stones outside
// `variationPath` (colour-local index 0 would then not sit at ply 1).
// `range` is treated as inclusive at both ends, matching
// AnalysisTimelinePanel's displayed `turnsRange`.
function valuesFromSeriesInRange(
  series: EnrichedSeries[],
  color: StoneColor,
  range: [PlyIndex, PlyIndex],
): number[] {
  const [start, end] = range;
  const out: number[] = [];
  for (const s of series) {
    for (const [k, v] of s.data) {
      if (v === null) continue;
      const ply = colorMoveToPly(k as ColorMoveIndex, color); // brand mint: `k` is a colour-local move index by construction (see doc above)
      if (ply >= start && ply <= end) out.push(v);
    }
  }
  return out;
}

// Same range-membership test as above, applied to a MistakeMarker (whose
// `colorLocalIdx` lives in the same colour-local move-index space as
// `EnrichedSeries.data`'s `k`; `.ply` on the marker is a different,
// parity-interleaved *chart* axis, not a PlyIndex, so it is not used here).
function mistakeInRange(m: MistakeMarker, range: [PlyIndex, PlyIndex]): boolean {
  const [start, end] = range;
  const ply = colorMoveToPly(m.colorLocalIdx as ColorMoveIndex, m.color); // brand mint: colorLocalIdx is a colour-local move index by construction
  return ply >= start && ply <= end;
}

export function useAnalysisContext(boardId: BoardId) {
  const projection = useAnalysisProjection(boardId);
  const mistakes = useMistakeFinder(projection.enriched);
  const navigation = useChartNavigation(projection.variationPath, boardId);
  const engineConnected = computed(() => store.engine.status === 'connected');

  // Distribution series — moved verbatim from AnalysisDashboard so the
  // dashboard no longer reads `enriched.value` / `mistakes.value` in its
  // own render (the whole point of the seam). Both read
  // `projection.selectionRange.value` so the computed genuinely subscribes
  // to the analysis move-range picker — previously neither read it at all,
  // so changing the range never recomputed either series (a missing
  // reactive read, not a stale cache).
  const deltaKdeSeries = computed<DistributionSeries[]>(() => {
    const range = projection.selectionRange.value;
    return [
      { name: 'Black', samples: valuesFromSeriesInRange(projection.enriched.value.deltaSeries.black, 'B', range), color: themeColor('--player-black') },
      { name: 'White', samples: valuesFromSeriesInRange(projection.enriched.value.deltaSeries.white, 'W', range), color: themeColor('--player-white') },
    ];
  });
  const mistakeGapHistogramSeries = computed<DistributionSeries[]>(() => {
    const range = projection.selectionRange.value;
    return [
      { name: 'Black', samples: consecutiveGaps(mistakes.value.filter(m => m.color === 'B' && mistakeInRange(m, range)).map(m => m.colorLocalIdx)), color: themeColor('--player-black') },
      { name: 'White', samples: consecutiveGaps(mistakes.value.filter(m => m.color === 'W' && mistakeInRange(m, range)).map(m => m.colorLocalIdx)), color: themeColor('--player-white') },
    ];
  });

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
