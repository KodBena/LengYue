/**
 * src/components/charts/panel-registry.ts
 *
 * The single ordered registry of the Analysis tab's scrollable panels.
 * `AnalysisDashboard` renders the active tab's panels via
 * `<component :is>`; Phase 2's tabs assign registry subsets to tabs
 * (resolving stored `AnalysisPanelId`s through `ANALYSIS_PANELS_BY_ID`),
 * and Phase 3's Settings editor mutates those assignments. The panels
 * are prop-less — each reads the per-board AnalysisContext via `inject`
 * (`provideAnalysisContext` in `useAnalysisContext.ts`), so a descriptor
 * needs only an id and the component.
 *
 * Id VALUES live in the SFC-free `panel-ids.ts` (so the store can
 * reference them); the branded `AnalysisPanelId` type lives in
 * `types.ts`. The timeline scrubber (`AnalysisTimelinePanel`) is
 * deliberately NOT here: it is the always-visible navigation header, not
 * a tab-assignable panel.
 *
 * License: Public Domain (The Unlicense)
 */
import type { Component } from 'vue';
import type { AnalysisPanelId } from '../../types';
import { PANEL_ID } from './panel-ids';

import ScoreLeadPanel from './ScoreLeadPanel.vue';
import MergedDeltaPanel from './MergedDeltaPanel.vue';
import MultiresolutionIntervalPanel from './MultiresolutionIntervalPanel.vue';
import StabilityPanel from './StabilityPanel.vue';
import StabilityCrossCorrelationPanel from './StabilityCrossCorrelationPanel.vue';
import DeltaDistributionPanel from './DeltaDistributionPanel.vue';
import MistakeGapPanel from './MistakeGapPanel.vue';

export interface AnalysisPanelDescriptor {
  /** Frozen-forever persistence / lookup key (see `panel-ids.ts`). */
  readonly id: AnalysisPanelId;
  /** The panel SFC. Prop-less; reads AnalysisContext via inject. */
  readonly component: Component;
}

/**
 * Every analysis panel, in the canonical pre-tab order. Phase 2 tabs
 * select ordered subsets of this; the order here is the fallback when no
 * tab layout applies.
 */
export const ANALYSIS_PANELS: readonly AnalysisPanelDescriptor[] = [
  { id: PANEL_ID.scoreLead, component: ScoreLeadPanel },
  { id: PANEL_ID.mergedDelta, component: MergedDeltaPanel },
  { id: PANEL_ID.multiresolutionInterval, component: MultiresolutionIntervalPanel },
  { id: PANEL_ID.stability, component: StabilityPanel },
  { id: PANEL_ID.stabilityCrossCorrelation, component: StabilityCrossCorrelationPanel },
  { id: PANEL_ID.deltaDistribution, component: DeltaDistributionPanel },
  { id: PANEL_ID.mistakeGap, component: MistakeGapPanel },
];

/** id → descriptor, for resolving a tab's stored `panelIds` at render. */
export const ANALYSIS_PANELS_BY_ID: ReadonlyMap<AnalysisPanelId, AnalysisPanelDescriptor> =
  new Map(ANALYSIS_PANELS.map((p) => [p.id, p]));
