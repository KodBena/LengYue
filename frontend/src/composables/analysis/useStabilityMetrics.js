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
import { computed } from 'vue';
import { stabilityTrajectoryStore } from '../../state/stability-trajectory-store';
import { activeAnalysisKeys } from '../../state/analysis-config';
import { STABILITY_METRICS, anchoredAtVTerm, } from '../../lib/stability-trajectory';
export function useStabilityMetrics(
// Root→leaf by contract: per-turn stability spans the whole active
// line (branded-path-types arc; fed by `useVariationPath`).
variationPath, extractorId, metricId, options = {}) {
    return computed(() => {
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
        if (!extractor)
            return [];
        const out = new Array(path.length);
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
