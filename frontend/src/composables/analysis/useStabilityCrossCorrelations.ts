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

import { computed, type ComputedRef, type Ref } from 'vue';
import { stabilityTrajectoryStore } from '../../services/stability-trajectory-store';
import { activeConfigHash } from '../../services/analysis-config';
import {
  STABILITY_METRICS,
  STABILITY_METRIC_LABELS,
} from '../../lib/stability-trajectory';
import { STABILITY_EXTRACTORS, STABILITY_EXTRACTOR_LABELS } from '../../engine/analysis/stability-extractors';
import { pearson, type CorrelationResult } from '../../lib/correlation';
import type { NodeId } from '../../types';

export interface CorrelationMatrix {
  /** Row / column labels in display order. */
  ids: string[];
  /** Human-readable labels per id (parallel to ids). */
  labels: string[];
  /** matrix[i][j] = correlation of ids[i] against ids[j]. Symmetric;
   *  diagonal is { value: 1, n: count-of-finite-entries-in-that-series }
   *  when the series itself is non-empty. */
  matrix: CorrelationResult[][];
}

export interface StabilityCrossCorrelations {
  /** Extractor × extractor, with `fixedMetricId` held constant. */
  extractor: CorrelationMatrix;
  /** Metric × metric, with `fixedExtractorId` held constant. */
  metric: CorrelationMatrix;
  /** The fixed axes used for the matrices — exposed for the panel
   *  header so the user knows what cross-section they're looking at. */
  fixedExtractorId: string;
  fixedMetricId: string;
}

export interface CrossCorrelationOptions {
  vTerm?: number;
  threshold?: number;
}

function computeSeries(
  path: NodeId[],
  hash: string,
  extractorId: string,
  metricFn: (typeof STABILITY_METRICS) extends ReadonlyMap<string, infer F> ? F : never,
  vTerm: number,
  threshold: number,
): number[] {
  const out: number[] = new Array(path.length);
  for (let i = 0; i < path.length; i++) {
    const trajectory = stabilityTrajectoryStore.getTrajectory(hash, extractorId, path[i]);
    if (!trajectory) {
      out[i] = NaN;
      continue;
    }
    const { value } = metricFn(trajectory, vTerm, { threshold });
    out[i] = value;
  }
  return out;
}

function buildMatrix(
  ids: string[],
  labels: string[],
  seriesById: Map<string, number[]>,
): CorrelationMatrix {
  // Compute every cell. Pearson is symmetric so the lower-triangle-
  // only optimisation is tempting, but mirroring requires that the
  // earlier row already be allocated — which doesn't hold during
  // row-major iteration when reading matrix[j][i] for j > i. With
  // 6×6 and 4×4 matrices the redundant work is ~25 extra Pearson
  // calls, each O(turns) — trivial. Diagonal cells get r=1 (or
  // NaN if the series is constant — zero variance is undefined).
  const matrix: CorrelationResult[][] = new Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    matrix[i] = new Array(ids.length);
    for (let j = 0; j < ids.length; j++) {
      matrix[i][j] = pearson(seriesById.get(ids[i])!, seriesById.get(ids[j])!);
    }
  }
  return { ids, labels, matrix };
}

export function useStabilityCrossCorrelations(
  variationPath: Ref<NodeId[]>,
  fixedExtractorId: Ref<string>,
  fixedMetricId: Ref<string>,
  options: CrossCorrelationOptions = {},
): ComputedRef<StabilityCrossCorrelations> {
  return computed<StabilityCrossCorrelations>(() => {
    const vTerm = options.vTerm ?? 20;
    const threshold = options.threshold ?? 0.97;
    const hash = activeConfigHash.value;
    const path = variationPath.value;
    const fixedExtractor = fixedExtractorId.value;
    const fixedMetric = fixedMetricId.value;

    // Extractor matrix: vary extractor, hold metric fixed.
    const extractorIds = Array.from(STABILITY_EXTRACTORS.keys());
    const extractorLabels = extractorIds.map(
      id => STABILITY_EXTRACTOR_LABELS.get(id) ?? id,
    );
    const metricFn = STABILITY_METRICS.get(fixedMetric);
    const extractorSeries = new Map<string, number[]>();
    if (metricFn) {
      for (const id of extractorIds) {
        extractorSeries.set(id, computeSeries(path, hash, id, metricFn, vTerm, threshold));
      }
    } else {
      for (const id of extractorIds) extractorSeries.set(id, []);
    }

    // Metric matrix: vary metric, hold extractor fixed.
    const metricIds = Array.from(STABILITY_METRICS.keys());
    const metricLabels = metricIds.map(
      id => STABILITY_METRIC_LABELS.get(id) ?? id,
    );
    const metricSeries = new Map<string, number[]>();
    for (const id of metricIds) {
      const fn = STABILITY_METRICS.get(id);
      if (!fn) {
        metricSeries.set(id, []);
        continue;
      }
      metricSeries.set(id, computeSeries(path, hash, fixedExtractor, fn, vTerm, threshold));
    }

    return {
      extractor: buildMatrix(extractorIds, extractorLabels, extractorSeries),
      metric: buildMatrix(metricIds, metricLabels, metricSeries),
      fixedExtractorId: fixedExtractor,
      fixedMetricId: fixedMetric,
    };
  });
}
