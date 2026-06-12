const pid = (id) => id; // brand factory: sole AnalysisPanelId mint
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
};
