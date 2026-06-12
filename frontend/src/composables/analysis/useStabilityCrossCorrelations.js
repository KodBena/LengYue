/**
 * src/composables/analysis/useStabilityCrossCorrelations.ts
 *
 * Pairwise Pearson correlations across the two stability axes:
 *
 *   - extractor × extractor (with the currently-selected metric
 *     held fixed) — "which extractors carry similar signal across
 *     this game's per-turn stability series?"
 *   - metric × metric (with the currently-selected extractor held
 *     fixed) — "which metrics agree on which turns are stable?"
 *
 * Both reactive on the path, the active configHash (palette
 * switch invalidates trajectories), and the trajectory store's
 * per-key version refs (touched transparently by
 * `getTrajectory()`). The two "anchor" selections (the currently-
 * selected extractor and metric in the panel) parameterise which
 * cross-section the matrices show — the panel re-renders the
 * tables when the user changes either dropdown.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { stabilityTrajectoryStore } from '../../state/stability-trajectory-store';
import { activeAnalysisKeys } from '../../state/analysis-config';
import { STABILITY_METRICS, STABILITY_METRIC_LABELS, } from '../../lib/stability-trajectory';
import { STABILITY_EXTRACTORS, STABILITY_EXTRACTOR_LABELS } from '../../engine/analysis/stability-extractors';
import { pearson } from '../../lib/correlation';
function computeSeries(path, rawKey, extractorId, metricFn, vTerm, threshold) {
    const out = new Array(path.length);
    for (let i = 0; i < path.length; i++) {
        const trajectory = stabilityTrajectoryStore.getTrajectory(rawKey, extractorId, path[i]);
        if (!trajectory) {
            out[i] = NaN;
            continue;
        }
        const { value } = metricFn(trajectory, vTerm, { threshold });
        out[i] = value;
    }
    return out;
}
function buildMatrix(ids, labels, seriesById) {
    // Compute every cell. Pearson is symmetric so the lower-triangle-
    // only optimisation is tempting, but mirroring requires that the
    // earlier row already be allocated — which doesn't hold during
    // row-major iteration when reading matrix[j][i] for j > i. With
    // 6×6 and 4×4 matrices the redundant work is ~25 extra Pearson
    // calls, each O(turns) — trivial. Diagonal cells get r=1 (or
    // NaN if the series is constant — zero variance is undefined).
    const matrix = new Array(ids.length);
    for (let i = 0; i < ids.length; i++) {
        matrix[i] = new Array(ids.length);
        for (let j = 0; j < ids.length; j++) {
            matrix[i][j] = pearson(seriesById.get(ids[i]), seriesById.get(ids[j]));
        }
    }
    return { ids, labels, matrix };
}
export function useStabilityCrossCorrelations(
// Root→leaf by contract: the correlation series span the whole
// active line (branded-path-types arc; fed by `useVariationPath`).
variationPath, fixedExtractorId, fixedMetricId, options = {}) {
    return computed(() => {
        const vTerm = options.vTerm ?? 20;
        const threshold = options.threshold ?? 0.97;
        const rawKey = activeAnalysisKeys.value.rawKey;
        const path = variationPath.value;
        const fixedExtractor = fixedExtractorId.value;
        const fixedMetric = fixedMetricId.value;
        // Extractor matrix: vary extractor, hold metric fixed.
        const extractorIds = Array.from(STABILITY_EXTRACTORS.keys());
        const extractorLabels = extractorIds.map(id => STABILITY_EXTRACTOR_LABELS.get(id) ?? id);
        const metricFn = STABILITY_METRICS.get(fixedMetric);
        const extractorSeries = new Map();
        if (metricFn) {
            for (const id of extractorIds) {
                extractorSeries.set(id, computeSeries(path, rawKey, id, metricFn, vTerm, threshold));
            }
        }
        else {
            for (const id of extractorIds)
                extractorSeries.set(id, []);
        }
        // Metric matrix: vary metric, hold extractor fixed.
        const metricIds = Array.from(STABILITY_METRICS.keys());
        const metricLabels = metricIds.map(id => STABILITY_METRIC_LABELS.get(id) ?? id);
        const metricSeries = new Map();
        for (const id of metricIds) {
            const fn = STABILITY_METRICS.get(id);
            if (!fn) {
                metricSeries.set(id, []);
                continue;
            }
            metricSeries.set(id, computeSeries(path, rawKey, fixedExtractor, fn, vTerm, threshold));
        }
        return {
            extractor: buildMatrix(extractorIds, extractorLabels, extractorSeries),
            metric: buildMatrix(metricIds, metricLabels, metricSeries),
            fixedExtractorId: fixedExtractor,
            fixedMetricId: fixedMetric,
        };
    });
}
