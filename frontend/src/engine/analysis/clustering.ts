/**
 * src/engine/analysis/clustering.ts
 * Pure utilities for grouping transpositions.
 * License: Public Domain (The Unlicense)
 */
import type { KataMoveInfo } from '../katago/types';

/**
 * Groups an array of KataMoveInfo by their clusterId.
 * Moves without a clusterId are ignored.
 */
export function groupMovesByCluster(moveInfos: readonly KataMoveInfo[]): Map<string, KataMoveInfo[]> {
  const map = new Map<string, KataMoveInfo[]>();
  for (const move of moveInfos) {
    if (move.clusterId !== undefined) {
      const cid = String(move.clusterId);
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(move);
    }
  }
  return map;
}
