/**
 * src/composables/analysis/useStabilityMetrics.ts
 *
 * Per-move stability-metric series for the StabilityPanel display.
 * Reads each variation-path nodeId's trajectory from
 * `stabilityTrajectoryStore` for the user-selected extractor and
 * computes `stableFractionLogV` per position. Reactive to:
 *   - the path (`variationPath.value`),
 *   - the active config hash (palette switch invalidates the
 *     keyed-by-hash trajectories),
 *   - the chosen extractor id (`extractorId.value`),
 *   - any new packets feeding the per-(hash, extractor, nodeId)
 *     trajectories (per-key version refs touched by
 *     `getTrajectory()` propagate the dependency transparently).
 *
 * v1 metric is log-V-weighted stable-fraction (the design note's
 * canonical choice — rescale-invariant across deployment V budgets).
 * The V_term and threshold inputs default to 20 visits / 0.97
 * fraction respectively; both are exposed as composable options so
 * a future panel-level control can override per-render without a
 * substrate change. The choices themselves are documented as
 * deferred-knob calibration in
 * `docs/notes/stability-surface-design-space.md` §"What this note
 * does not settle".
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, type ComputedRef, type Ref } from 'vue';
import { stabilityTrajectoryStore } from '../../services/stability-trajectory-store';
import { activeAnalysisKeys } from '../../services/analysis-config';
import {
  STABILITY_METRICS,
  anchoredAtVTerm,
} from '../../lib/stability-trajectory';
import type { NodeId, ExtractorId, MetricId } from '../../types';

export interface TurnStabilityMetric {
  nodeId: NodeId;
  /** Turn index along the variation path (0-based; turn 0 is the
   *  root / empty board). "Turn" not "move" per the project's
   *  fixed nomenclature: a turn is a position (a game state), a
   *  move is a transition between turns. Stability is per-turn. */
  turn: number;
  /** `stable_fraction_logV` over the trajectory's `[V_term, V_max]`
   *  window. NaN if the trajectory has fewer than two observations
   *  or never reached `V_term` (the position is too lightly analyzed
   *  for the metric to be meaningful). Consumers should render NaN
   *  as "no data" rather than zero. */
  fraction: number;
  /** Number of packets that have arrived for this turn's trajectory.
   *  0 means no analysis packet ever reached this turn (engine
   *  hasn't analyzed it, or the configHash changed and discarded
   *  the prior trajectory). Surfaced in the panel tooltip as the
   *  diagnostic for NaN fractions: "0 packets" = no analysis;
   *  "≥1 packet but V_max < V_term" = too lightly analyzed; "n
   *  packets with V_max ≥ V_term but still NaN" = something
   *  unexpected (worth investigating). */
  nPackets: number;
  /** Highest visit count observed in this trajectory. 0 if no
   *  packets have arrived. Useful for diagnosing why fraction is
   *  NaN — if vMax < vTerm, the window is empty. */
  vMax: number;
  /** Visit count of the first observation (first changepoint). 0
   *  if no packets have arrived. Combined with vMax brackets the
   *  observed range; if vMin > vTerm, the stability anchor at
   *  V_term is undefined (no observation at or before V_term)
   *  and the fraction is NaN — distinct from the vMax < vTerm
   *  case (window simply hasn't reached V_term yet). */
  vMin: number;
  /** Visit count actually used as the anchor (anchor-based metrics
   *  only). For anchored_at_v_term: V_term unless the value there
   *  was UNKNOWN, in which case the V of the first known observation
   *  past V_term (the lenient-anchor fallback). For anchored_at_v_max:
   *  V_max. For anchor-independent metrics (longest_run, change_rate):
   *  NaN. */
  anchorV: number;
  /** Diagnostic: number of distinct-value transitions inside
   *  (V_term, V_max], skipping UNKNOWN-bridging pairs. Same across
   *  all metrics — surfaces the underlying volatility independent
   *  of which scalar the chosen metric reports. */
  nChanges: number;
}

export interface StabilityMetricsOptions {
  /** Visit count at which the stable-fraction window starts. Default
   *  20 — skips the very-early chaotic phase where the value-at-V
   *  thrashes due to tiny visit counts, while staying low enough to
   *  produce a non-NaN result for moderately-analyzed positions. */
  vTerm?: number;
  /** Fraction threshold for the `isStable` companion (not currently
   *  surfaced in the v1 panel). Default 0.97 matches the research
   *  arc's convention. */
  threshold?: number;
}

export function useStabilityMetrics(
  variationPath: Ref<NodeId[]>,
  extractorId: Ref<ExtractorId>,
  metricId: Ref<MetricId>,
  options: StabilityMetricsOptions = {},
): ComputedRef<TurnStabilityMetric[]> {
  return computed<TurnStabilityMetric[]>(() => {
    const vTerm = options.vTerm ?? 20;
    const threshold = options.threshold ?? 0.97;
    const rawKey = activeAnalysisKeys.value.rawKey;
    const path = variationPath.value;
    const extractor = extractorId.value;
    // Anchored-at-V_term is the default fallback so an unknown
    // metric-id silently falls back to the design-note canonical
    // rather than rendering NaN everywhere. The dropdown surfaces
    // only registry entries, so this defensive default is only
    // reached on metric-id drift (e.g., a removed metric still in
    // persisted UI state) — fail-loud-via-warning would be louder
    // but blanket-NaN is worse UX for a renamed metric.
    const metricFn = STABILITY_METRICS.get(metricId.value) ?? anchoredAtVTerm;

    if (!extractor) return [];

    const out: TurnStabilityMetric[] = new Array(path.length);
    for (let turn = 0; turn < path.length; turn++) {
      const nodeId = path[turn];
      const trajectory = stabilityTrajectoryStore.getTrajectory(rawKey, extractor, nodeId);
      if (!trajectory) {
        out[turn] = {
          nodeId, turn, fraction: NaN,
          nPackets: 0, vMax: 0, vMin: 0, anchorV: NaN, nChanges: 0,
        };
        continue;
      }
      const { value, anchorV, nChanges } = metricFn(trajectory, vTerm, { threshold });
      const cps = trajectory.changepoints;
      out[turn] = {
        nodeId,
        turn,
        fraction: value,
        nPackets: trajectory.n_packets,
        vMax: trajectory.V_max,
        vMin: cps.length > 0 ? cps[0].V : 0,
        anchorV,
        nChanges,
      };
    }
    return out;
  });
}
