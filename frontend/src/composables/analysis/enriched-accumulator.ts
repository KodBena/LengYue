/**
 * src/composables/analysis/enriched-accumulator.ts
 * Incremental derivation of the analysis projection's enriched series.
 *
 * The full derivation (one pass over the variation path, reading each node's
 * merged packet) is O(path length). The naive reactive shape re-ran it on
 * every frame a path node received a packet — the dominant per-packet JS cost
 * in the combined-stress profile (Vue reactive `get`/`track` over ~N nodes).
 *
 * This accumulator maintains the derived state persistently and patches only
 * the node(s) that changed (`patchNode`), so a packet costs O(1) instead of
 * O(N). It is a *pure* unit — no Vue, no ledger, no effects — driven entirely
 * by the reactive wiring in `useEnrichedData`. That keeps the one invariant
 * that matters testable in isolation:
 *
 *     a sequence of `patchNode` calls  ===  a single `rebuild` from the same
 *     final packet set
 *
 * (the `enriched-accumulator.test.ts` equivalence check). Exactness is the
 * whole point: this is the analysis pipeline, so the incremental path must
 * produce byte-identical output to the from-scratch derivation, including the
 * delta arbitration below.
 *
 * ## Delta arbitration — last-path-order wins
 *
 * A per-colour delta is keyed by colour-local move index (`mIdx`). Because the
 * proxy's adaptive windows overlap, several path nodes can report a delta for
 * the same `mIdx` with slightly different estimates (empirically: cold,
 * independent samples agree to ~1% — the disagreement is immaterial, and visit
 * count never disambiguates because it reflects the *budget*, not estimate
 * quality). The original full-pass derivation resolved overlaps by
 * "last write in path order wins"; this reproduces it exactly via a per-`mIdx`
 * contributor map whose winner is the highest contributing path index.
 *
 * License: Public Domain (The Unlicense)
 */
import type { KataAnalysisResponse } from '../../engine/katago/types';
import type { NodeId } from '../../types';

// ── Output contract (the projection's chart-ready shape) ───────────────────────

/**
 * A chart-ready series entry: a name and an array of [index, value|null] pairs.
 * The tuple array is what ECharts consumes directly.
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

export const EMPTY_ENRICHED: EnrichedResult = {
  stateSeries: [],
  deltaSeries: { black: [], white: [] },
};

export interface AccumulatorConfig {
  /** The variation path, in order. Path position is the series index. */
  pathIds: readonly NodeId[];
  /** Active-palette state_fn names, pre-seeded so every metric has a (null) series. */
  seedNames: readonly string[];
}

// Pick the winner among a per-`mIdx` contributor map: the value at the highest
// path index (last-path-order-wins). Null when there are no contributors.
function winnerByMaxIndex(contrib: Map<number, number>): number | null {
  let bestIdx = -1;
  let value: number | null = null;
  for (const [idx, v] of contrib) {
    if (idx > bestIdx) {
      bestIdx = idx;
      value = v;
    }
  }
  return value;
}

export class EnrichedAccumulator {
  private pathIds: readonly NodeId[] = [];
  private nodeIndex = new Map<NodeId, number>();
  private len = 0;
  private halfLen = 0;

  // State metric name → per-path-index value array. Insertion order = seed
  // order then first-seen order, matching the original derivation's series
  // ordering.
  private stateMetrics = new Map<string, (number | null)[]>();

  // Delta arbitration: mIdx → (pathIdx → value); winner = max pathIdx.
  private blackContrib = new Map<number, Map<number, number>>();
  private whiteContrib = new Map<number, Map<number, number>>();
  // Per-node set of mIdx it currently contributes (to diff on patch — an
  // adaptive window can shift which mIdx a node reports between packets).
  private blackNodeMIdx = new Map<number, Set<number>>();
  private whiteNodeMIdx = new Map<number, Set<number>>();
  // Materialised winners, indexed by mIdx.
  private blackDeltas: (number | null)[] = [];
  private whiteDeltas: (number | null)[] = [];

  /** (Re)configure for a path/palette/theme. Clears all accumulated state. */
  reset(config: AccumulatorConfig): void {
    this.pathIds = config.pathIds;
    this.len = config.pathIds.length;
    this.halfLen = Math.ceil(this.len / 2);

    this.nodeIndex = new Map();
    for (let i = 0; i < this.len; i++) this.nodeIndex.set(config.pathIds[i], i);

    this.stateMetrics = new Map();
    for (const name of config.seedNames) {
      this.stateMetrics.set(name, new Array(this.len).fill(null));
    }

    this.blackContrib = new Map();
    this.whiteContrib = new Map();
    this.blackNodeMIdx = new Map();
    this.whiteNodeMIdx = new Map();
    this.blackDeltas = new Array(this.halfLen).fill(null);
    this.whiteDeltas = new Array(this.halfLen).fill(null);
  }

  /** Full derivation from a packet reader. Also the equivalence reference. */
  rebuild(getPacket: (nodeId: NodeId) => KataAnalysisResponse | null): void {
    for (let idx = 0; idx < this.len; idx++) {
      this.applyNode(idx, getPacket(this.pathIds[idx]));
    }
  }

  /**
   * Incremental: apply a single node's (possibly null) packet. O(1) amortised.
   * Returns true iff the node is on the current path (and was applied), so the
   * caller can skip republishing when an off-path node changed.
   */
  patchNode(nodeId: NodeId, packet: KataAnalysisResponse | null): boolean {
    const idx = this.nodeIndex.get(nodeId);
    if (idx === undefined) return false; // node not on the current path
    this.applyNode(idx, packet);
    return true;
  }

  private applyNode(idx: number, packet: KataAnalysisResponse | null): void {
    // ── State metrics ──────────────────────────────────────────────────────
    // Clear this index across all known metrics first (handles purge → null
    // and is harmless under the additive-merge common case), then set the
    // packet's metrics. New metric names lazy-initialise their array, matching
    // the original derivation's first-seen behaviour.
    for (const arr of this.stateMetrics.values()) arr[idx] = null;

    let blackDeltas: Record<string, number> | undefined;
    let whiteDeltas: Record<string, number> | undefined;

    if (packet?.extra) {
      const turnMetrics = packet.extra.state?.[String(packet.turnNumber)];
      if (turnMetrics) {
        for (const [key, value] of Object.entries(turnMetrics)) {
          let arr = this.stateMetrics.get(key);
          if (!arr) {
            arr = new Array(this.len).fill(null);
            this.stateMetrics.set(key, arr);
          }
          arr[idx] = value;
        }
      }
      blackDeltas = packet.extra.black?.deltas;
      whiteDeltas = packet.extra.white?.deltas;
    }

    // ── Per-player deltas ──────────────────────────────────────────────────
    this.applyDeltas(idx, blackDeltas, this.blackContrib, this.blackNodeMIdx, this.blackDeltas);
    this.applyDeltas(idx, whiteDeltas, this.whiteContrib, this.whiteNodeMIdx, this.whiteDeltas);
  }

  private applyDeltas(
    idx: number,
    deltas: Record<string, number> | undefined,
    contrib: Map<number, Map<number, number>>,
    nodeMIdx: Map<number, Set<number>>,
    materialised: (number | null)[],
  ): void {
    const oldSet = nodeMIdx.get(idx) ?? new Set<number>();
    const newSet = new Set<number>();

    if (deltas) {
      for (const [key, val] of Object.entries(deltas)) {
        const m = parseInt(key, 10);
        newSet.add(m);
        let c = contrib.get(m);
        if (!c) {
          c = new Map();
          contrib.set(m, c);
        }
        c.set(idx, val);
      }
    }

    // Drop this node's contribution to mIdx it no longer reports.
    for (const m of oldSet) {
      if (!newSet.has(m)) {
        const c = contrib.get(m);
        if (c) {
          c.delete(idx);
          if (c.size === 0) contrib.delete(m);
        }
      }
    }
    nodeMIdx.set(idx, newSet);

    // Recompute the winner for every mIdx this node touched (added or removed).
    for (const m of oldSet) this.recomputeDelta(m, contrib, materialised);
    for (const m of newSet) this.recomputeDelta(m, contrib, materialised);
  }

  private recomputeDelta(
    m: number,
    contrib: Map<number, Map<number, number>>,
    materialised: (number | null)[],
  ): void {
    const c = contrib.get(m);
    materialised[m] = c && c.size ? winnerByMaxIndex(c) : null;
  }

  /** Assemble the chart-ready result. Pure read of the accumulated state. */
  snapshot(): EnrichedResult {
    if (this.len === 0) return EMPTY_ENRICHED;

    const stateSeries: EnrichedSeries[] = [];
    for (const [name, values] of this.stateMetrics) {
      stateSeries.push({
        name,
        data: values.map((v, i) => [i, v] as [number, number | null]),
      });
    }

    return {
      stateSeries,
      // Colour is presentation and is applied by the consuming chart
      // (MergedDeltaPanel), not the data projection — keeping this unit pure
      // data (and free of `themeColor`, which is browser-only).
      deltaSeries: {
        black: [{
          name: 'Black Delta',
          data: this.blackDeltas.map((v, i) => [i, v] as [number, number | null]),
        }],
        white: [{
          name: 'White Delta',
          data: this.whiteDeltas.map((v, i) => [i, v] as [number, number | null]),
        }],
      },
    };
  }
}
