import { PANEL_ID } from './panel-ids';
import ScoreLeadPanel from './ScoreLeadPanel.vue';
import MergedDeltaPanel from './MergedDeltaPanel.vue';
import MultiresolutionIntervalPanel from './MultiresolutionIntervalPanel.vue';
import StabilityPanel from './StabilityPanel.vue';
import StabilityCrossCorrelationPanel from './StabilityCrossCorrelationPanel.vue';
import DeltaDistributionPanel from './DeltaDistributionPanel.vue';
import MistakeGapPanel from './MistakeGapPanel.vue';
/**
 * Every analysis panel, in the canonical pre-tab order. Phase 2 tabs
 * select ordered subsets of this; the order here is the fallback when no
 * tab layout applies.
 */
export const ANALYSIS_PANELS = [
    { id: PANEL_ID.scoreLead, label: 'Score Lead', component: ScoreLeadPanel },
    { id: PANEL_ID.mergedDelta, label: 'Merged Delta', component: MergedDeltaPanel },
    { id: PANEL_ID.multiresolutionInterval, label: 'Multiresolution Interval', component: MultiresolutionIntervalPanel },
    { id: PANEL_ID.stability, label: 'Stability', component: StabilityPanel },
    { id: PANEL_ID.stabilityCrossCorrelation, label: 'Cross-correlations', component: StabilityCrossCorrelationPanel },
    { id: PANEL_ID.deltaDistribution, label: 'Delta Distribution', component: DeltaDistributionPanel },
    { id: PANEL_ID.mistakeGap, label: 'Mistake Gap', component: MistakeGapPanel },
];
/** id → descriptor, for resolving a tab's stored `panelIds` at render. */
export const ANALYSIS_PANELS_BY_ID = new Map(ANALYSIS_PANELS.map((p) => [p.id, p]));
