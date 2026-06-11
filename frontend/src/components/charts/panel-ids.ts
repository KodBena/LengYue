/**
 * src/components/charts/panel-ids.ts
 *
 * SFC-free single source of truth for the analysis-panel id VALUES.
 * Split from `panel-registry.ts` (which imports the panel SFCs) so the
 * store layer — `defaults.ts` and the schema migration — can reference
 * the frozen ids without pulling Vue components into the store graph.
 * The id→component map lives in `panel-registry.ts`; the branded types
 * (`AnalysisPanelId`) live in `types.ts`.
 *
 * License: Public Domain (The Unlicense)
 */
import type { AnalysisPanelId } from '../../types';

const pid = (id: string): AnalysisPanelId => id as AnalysisPanelId; // brand factory: sole AnalysisPanelId mint

/**
 * The frozen-forever panel id values. These are the persistence keys an
 * `AnalysisTab` stores; renaming a value orphans any saved tab that
 * references it.
 */
export const PANEL_ID = {
  scoreLead: pid('score-lead'),
  mergedDelta: pid('merged-delta'),
  multiresolutionInterval: pid('multiresolution-interval'),
  stability: pid('stability'),
  stabilityCrossCorrelation: pid('stability-cross-correlation'),
  deltaDistribution: pid('delta-distribution'),
  mistakeGap: pid('mistake-gap'),
} as const;
