/**
 * src/components/charts/panel-registry.ts
 *
 * The single ordered registry of the Analysis tab's scrollable panels.
 * `AnalysisDashboard` renders this list via `<component :is>`; Phase 2
 * will assign registry subsets to user-defined tabs, and Phase 3's
 * Settings editor will mutate those assignments. The panels are
 * prop-less — each reads the per-board AnalysisContext via `inject`
 * (`provideAnalysisContext` in `useAnalysisContext.ts`), so a descriptor
 * needs only an id and the component.
 *
 * The timeline scrubber (`AnalysisTimelinePanel`) is deliberately NOT
 * here: it is the always-visible navigation header, not a tab-assignable
 * panel.
 *
 * License: Public Domain (The Unlicense)
 */
import type { Component } from 'vue';

import ScoreLeadPanel from './ScoreLeadPanel.vue';
import MergedDeltaPanel from './MergedDeltaPanel.vue';
import MultiresolutionIntervalPanel from './MultiresolutionIntervalPanel.vue';
import StabilityPanel from './StabilityPanel.vue';
import StabilityCrossCorrelationPanel from './StabilityCrossCorrelationPanel.vue';
import DeltaDistributionPanel from './DeltaDistributionPanel.vue';
import MistakeGapPanel from './MistakeGapPanel.vue';

/**
 * Stable identity of an analysis panel. Becomes the persistence key for
 * Phase-2 tab assignment, so these string values are frozen-forever —
 * renaming one orphans any persisted tab layout that references it.
 */
export type AnalysisPanelId = string & { readonly __brand: 'AnalysisPanelId' };

/**
 * Brand constructor. This registry is the sole canonical source of panel
 * ids, so the cast is justified here (ADR-0002): raw strings do not flow
 * into `AnalysisPanelId` anywhere else.
 */
const panelId = (id: string): AnalysisPanelId => id as AnalysisPanelId;

export interface AnalysisPanelDescriptor {
  /** Frozen-forever persistence / lookup key. */
  readonly id: AnalysisPanelId;
  /** The panel SFC. Prop-less; reads AnalysisContext via inject. */
  readonly component: Component;
}

/**
 * The scrollable panels, in display order. This reproduces the exact
 * pre-Phase-1 hardcoded order in `AnalysisDashboard` — Phase 1 is
 * behaviour-preserving.
 */
export const ANALYSIS_PANELS: readonly AnalysisPanelDescriptor[] = [
  { id: panelId('score-lead'), component: ScoreLeadPanel },
  { id: panelId('merged-delta'), component: MergedDeltaPanel },
  { id: panelId('multiresolution-interval'), component: MultiresolutionIntervalPanel },
  { id: panelId('stability'), component: StabilityPanel },
  { id: panelId('stability-cross-correlation'), component: StabilityCrossCorrelationPanel },
  { id: panelId('delta-distribution'), component: DeltaDistributionPanel },
  { id: panelId('mistake-gap'), component: MistakeGapPanel },
];
