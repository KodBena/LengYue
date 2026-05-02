/**
 * src/composables/useEnrichedData.ts
 * Reactive transformation of enriched KataGo data.
 *
 * ## Design
 *
 * This composable accepts a reactive path (`Ref<NodeId[]>`) and returns
 * a single `ComputedRef<EnrichedResult>` that:
 *
 *   1. Reads each node's packet directly via `ledger.getRaw()`, which now
 *      carries its own per-node reactive dependency (see analysis-ledger.ts).
 *      This means the output reactive re-evaluates only when a node in the
 *      path actually receives new analysis data — not on every packet globally.
 *
 *   2. Combines key-discovery and value-population into a *single pass* over
 *      the sequence, using a Map<string, (number|null)[]> to accumulate state
 *      metric series. The previous implementation made two full passes: one
 *      to discover metric names, one to populate arrays.
 *
 * ## Why getRaw() instead of getSequenceForPath()
 *
 * `getSequenceForPath()` returns a ComputedRef. Calling it inside another
 * computed() creates an orphaned inner ComputedRef on every evaluation —
 * wasteful and opaque. Using `getRaw()` directly inside the outer computed
 * is both simpler and correct: each call to `getRaw(id)` reads that node's
 * version ref, which Vue's tracking system transparently registers as a
 * dependency of the enclosing computed.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, type Ref } from 'vue';
import { ledger } from '../services/analysis-ledger';
import { type NodeId } from '../types';
import { activeConfigHash } from '../services/analysis-config';

// ── Output contract ───────────────────────────────────────────────────────────

/**
 * A chart-ready series entry: a name and an array of [index, value|null] pairs.
 * The `any[]` on the outer type is intentional — ECharts consumes these directly.
 */
export interface EnrichedSeries {
  name: string;
  data: [number, number | null][];
  color?: string;
}

export interface EnrichedResult {
  /** One series per backend-defined state metric (e.g. Complexity, Win Probability). */
  stateSeries: EnrichedSeries[];
  /** Per-player move-quality delta series. */
  deltaSeries: {
    black: EnrichedSeries[];
    white: EnrichedSeries[];
  };
}

const EMPTY_RESULT: EnrichedResult = {
  stateSeries: [],
  deltaSeries: { black: [], white: [] },
};

// ── Composable ────────────────────────────────────────────────────────────────

/**
 * Returns a ComputedRef<EnrichedResult> that re-evaluates when:
 *   - the path changes (pathIdsRef.value changes), OR
 *   - any node in the current path receives new analysis data.
 *
 * The second condition is handled transparently by per-node reactive version
 * refs inside `ledger.getRaw()`. No explicit `watch` or `ledgerVersion` needed.
 */
export function useEnrichedData(pathIdsRef: Ref<NodeId[]>) {
  return computed<EnrichedResult>(() => {
    const pathIds = pathIdsRef.value;
    if (pathIds.length === 0) return EMPTY_RESULT;

    // Pre-size the delta arrays based on the number of half-moves per player.
    const halfLen = Math.ceil(pathIds.length / 2);
    const blackDeltas: (number | null)[] = new Array(halfLen).fill(null);
    const whiteDeltas: (number | null)[] = new Array(halfLen).fill(null);

    // State metric accumulator: metric-name → per-index value array.
    // Using a Map avoids re-keying an object on every write.
    const stateMetrics = new Map<string, (number | null)[]>();

    // Single pass: for each node in the path, read its packet and populate
    // all three outputs simultaneously. Each getRaw() call registers a
    // fine-grained reactive dependency on that specific node.
    for (let idx = 0; idx < pathIds.length; idx++) {
      const packet = ledger.getRaw(activeConfigHash.value, pathIds[idx]);
      if (!packet?.extra) continue;

      const turnStr = packet.turnNumber.toString();

      // ── State metrics ──────────────────────────────────────────────────────
      const turnMetrics = packet.extra.state?.[turnStr];
      if (turnMetrics) {
        for (const [key, value] of Object.entries(turnMetrics)) {
          // Lazily initialise each metric's array on first encounter.
          // For stable analyses the Map is populated in the first pass and
          // reused on subsequent re-evaluations.
          if (!stateMetrics.has(key)) {
            stateMetrics.set(key, new Array(pathIds.length).fill(null));
          }
          stateMetrics.get(key)![idx] = value;
        }
      }

      // ── Per-player deltas ──────────────────────────────────────────────────
      if (packet.extra.black?.deltas) {
        for (const [mIdx, val] of Object.entries(packet.extra.black.deltas)) {
          blackDeltas[parseInt(mIdx)] = val;
        }
      }
      if (packet.extra.white?.deltas) {
        for (const [mIdx, val] of Object.entries(packet.extra.white.deltas)) {
          whiteDeltas[parseInt(mIdx)] = val;
        }
      }
    }

    // ── Assemble output ────────────────────────────────────────────────────────
    const stateSeries: EnrichedSeries[] = Array.from(
      stateMetrics.entries(),
      ([name, values]) => ({
        name,
        data: values.map((v, i) => [i, v] as [number, number | null]),
      })
    );

    return {
      stateSeries,
      deltaSeries: {
        black: [{
          name: 'Black Delta',
          data: blackDeltas.map((v, i) => [i, v] as [number, number | null]),
          color: '#4aaef0',
        }],
        white: [{
          name: 'White Delta',
          data: whiteDeltas.map((v, i) => [i, v] as [number, number | null]),
          color: '#f04a4a',
        }],
      },
    };
  });
}
