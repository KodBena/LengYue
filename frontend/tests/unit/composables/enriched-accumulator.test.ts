/**
 * tests/unit/composables/enriched-accumulator.test.ts
 *
 * Tier-1 (pure-logic) tests for `EnrichedAccumulator`. The accumulator is the
 * incremental heart of the analysis projection: it must produce byte-identical
 * output to a from-scratch derivation, or the per-packet `patchNode` path
 * silently diverges from the chart a full re-render would show. That
 * equivalence is the one invariant the incremental rewrite trades for — and
 * unlike a throttle's "no consumer assumes freshness" invariant, it is
 * directly testable, which is exactly why B was chosen over a throttle.
 *
 * The crux cases are delta overlaps (multiple path nodes reporting the same
 * colour-local mIdx — last-path-order-wins) and adaptive window shifts (a node
 * changing which mIdx it reports between packets).
 *
 * No DOM, no Vue, no ledger — just packets in, snapshots compared.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { EnrichedAccumulator, type AccumulatorConfig } from '../../../src/composables/analysis/enriched-accumulator';
import type { KataAnalysisResponse } from '../../../src/engine/katago/types';
import type { NodeId } from '../../../src/types';

// Minimal packet builder — only the fields the accumulator reads.
function packet(
  turnNumber: number,
  opts: {
    state?: Record<string, number>;
    black?: Record<string, number>;
    white?: Record<string, number>;
  } = {},
): KataAnalysisResponse {
  return {
    turnNumber,
    isDuringSearch: false,
    rootInfo: { visits: 1000 },
    extra: {
      ...(opts.state ? { state: { [String(turnNumber)]: opts.state } } : {}),
      ...(opts.black ? { black: { deltas: opts.black } } : {}),
      ...(opts.white ? { white: { deltas: opts.white } } : {}),
    },
  } as unknown as KataAnalysisResponse;
}

const ids = (n: number): NodeId[] =>
  Array.from({ length: n }, (_, i) => `node-${i}` as NodeId);

function cfg(pathIds: NodeId[], seedNames: string[] = []): AccumulatorConfig {
  return { pathIds, seedNames };
}

/**
 * The core equivalence harness: feed a sequence of (nodeId, packet) writes to
 * an *incremental* accumulator (patchNode after each, simulating the merged
 * ledger — last write per node wins on merge) and assert its snapshot equals a
 * *rebuild* accumulator fed the final merged packet set.
 */
function assertIncrementalEqualsRebuild(
  pathIds: NodeId[],
  seedNames: string[],
  writes: Array<[NodeId, KataAnalysisResponse]>,
) {
  // Incremental: apply each write in order (the ledger merges, so the latest
  // packet per node is the merged state; these tests use replace-on-write).
  const inc = new EnrichedAccumulator();
  inc.reset(cfg(pathIds, seedNames));
  const merged = new Map<NodeId, KataAnalysisResponse>();
  for (const [nodeId, p] of writes) {
    merged.set(nodeId, p);
    inc.patchNode(nodeId, p);
  }

  // Rebuild: from the final merged set, in one pass.
  const reb = new EnrichedAccumulator();
  reb.reset(cfg(pathIds, seedNames));
  reb.rebuild((nodeId) => merged.get(nodeId) ?? null);

  expect(inc.snapshot()).toEqual(reb.snapshot());
  return inc.snapshot();
}

describe('EnrichedAccumulator', () => {
  it('empty path → empty result', () => {
    const a = new EnrichedAccumulator();
    a.reset(cfg([], ['Complexity']));
    expect(a.snapshot()).toEqual({ stateSeries: [], deltaSeries: { black: [], white: [] } });
  });

  it('seeds state-metric series with nulls before any packet', () => {
    const a = new EnrichedAccumulator();
    a.reset(cfg(ids(3), ['Complexity', 'Winrate']));
    const snap = a.snapshot();
    expect(snap.stateSeries.map(s => s.name)).toEqual(['Complexity', 'Winrate']);
    expect(snap.stateSeries[0].data).toEqual([[0, null], [1, null], [2, null]]);
  });

  it('state metric lands at the node’s path index', () => {
    const path = ids(4);
    const snap = assertIncrementalEqualsRebuild(path, ['Complexity'], [
      [path[1], packet(1, { state: { Complexity: 0.5 } })],
      [path[3], packet(3, { state: { Complexity: 0.9 } })],
    ]);
    expect(snap.stateSeries[0].data).toEqual([[0, null], [1, 0.5], [2, null], [3, 0.9]]);
  });

  it('lazy-adds a metric not in the seed set', () => {
    const path = ids(2);
    const snap = assertIncrementalEqualsRebuild(path, ['Seeded'], [
      [path[0], packet(0, { state: { Seeded: 1, Surprise: 2 } })],
    ]);
    expect(snap.stateSeries.map(s => s.name)).toEqual(['Seeded', 'Surprise']);
  });

  it('delta overlap: last-path-order wins (higher index)', () => {
    const path = ids(4);
    // Both node1 and node2 report black mIdx 0, with different values.
    const snap = assertIncrementalEqualsRebuild(path, [], [
      [path[1], packet(1, { black: { '0': -1523 } })],
      [path[2], packet(2, { black: { '0': 0 } })],
    ]);
    // Higher path index (node2) wins → 0.
    expect(snap.deltaSeries.black[0].data[0]).toEqual([0, 0]);
  });

  it('delta overlap winner survives whichever order packets arrive', () => {
    const path = ids(4);
    const a = new EnrichedAccumulator();
    a.reset(cfg(path));
    a.patchNode(path[2], packet(2, { black: { '0': 0 } }));     // higher index first
    a.patchNode(path[1], packet(1, { black: { '0': -1523 } })); // lower index later
    // last-path-order (index), not last-arrival: node2 still wins.
    expect(a.snapshot().deltaSeries.black[0].data[0]).toEqual([0, 0]);
  });

  it('adaptive window shift: removing a mIdx restores the prior contributor', () => {
    const path = ids(4);
    const a = new EnrichedAccumulator();
    a.reset(cfg(path));
    a.patchNode(path[1], packet(1, { black: { '0': -100 } }));
    a.patchNode(path[2], packet(2, { black: { '0': -200 } })); // node2 wins (higher idx)
    expect(a.snapshot().deltaSeries.black[0].data[0]).toEqual([0, -200]);
    // node2's window shifts: it no longer reports mIdx 0.
    a.patchNode(path[2], packet(2, { black: { '1': -50 } }));
    // mIdx 0 falls back to node1; mIdx 1 is node2.
    const snap = a.snapshot();
    expect(snap.deltaSeries.black[0].data[0]).toEqual([0, -100]);
    expect(snap.deltaSeries.black[0].data[1]).toEqual([1, -50]);
  });

  it('purge (null packet) drops the node’s state and delta contribution', () => {
    const path = ids(3);
    const a = new EnrichedAccumulator();
    a.reset(cfg(path, ['Complexity']));
    a.patchNode(path[1], packet(1, { state: { Complexity: 0.5 }, black: { '0': -10 } }));
    expect(a.snapshot().stateSeries[0].data[1]).toEqual([1, 0.5]);
    a.patchNode(path[1], null);
    const snap = a.snapshot();
    expect(snap.stateSeries[0].data[1]).toEqual([1, null]);
    expect(snap.deltaSeries.black[0].data[0]).toEqual([0, null]);
  });

  it('equivalence under a realistic interleaved, multi-packet, overlapping stream', () => {
    const path = ids(6);
    assertIncrementalEqualsRebuild(path, ['Complexity', 'Winrate'], [
      [path[0], packet(0, { state: { Complexity: 0.1, Winrate: 0.5 }, black: { '0': -10 } })],
      [path[1], packet(1, { state: { Complexity: 0.2 }, white: { '0': -5 } })],
      [path[2], packet(2, { state: { Complexity: 0.3, Winrate: 0.55 }, black: { '0': -8, '1': -3 } })],
      // node0 refines (new packet, merged-replace), changing its delta + adding a metric.
      [path[0], packet(0, { state: { Complexity: 0.12, Winrate: 0.51, Extra: 9 }, black: { '0': -11 } })],
      [path[3], packet(3, { white: { '0': -6, '1': -2 } })],
      [path[4], packet(4, { state: { Complexity: 0.4 }, black: { '1': -4, '2': -1 } })],
      // node2's window shifts off mIdx 0.
      [path[2], packet(2, { state: { Complexity: 0.31, Winrate: 0.56 }, black: { '1': -3 } })],
      [path[5], packet(5, { state: { Winrate: 0.6 } })],
    ]);
  });
});
