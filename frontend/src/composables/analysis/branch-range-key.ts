/**
 * src/composables/analysis/branch-range-key.ts
 *
 * Branch-stem identity for analysis-range memory (design/
 * design-analysis-ux.md §1, Candidate C; commissioner adjudication,
 * ledger rows 112/119). Answers "which branch am I on" for the
 * purpose of keying a per-branch remembered chart selection range.
 *
 * Per the keyed-cache rule (frontend/CLAUDE.md "Type-driven design";
 * worked example `RawKey`/`EnrichedKey` in `src/state/analysis-config.ts`),
 * the brand's declaration names every input the bucketed value (a
 * `[PlyIndex, PlyIndex]` selection range) depends on:
 *
 *   decisionSequence [tree-positional, B2] — the ordered sequence of
 *     `(decisionNodeId, chosenChildId)` pairs at every node along the
 *     active `RootToLeafPath` that has MORE THAN ONE child. A node with
 *     exactly one child contributes nothing — so extending the mainline
 *     (or any line) without ever revisiting a fork leaves the key
 *     unchanged, and the existing length-based clamp behavior for plain
 *     forward play is preserved exactly. Switching a child at ANY
 *     ancestor (near the root or one ply from the leaf) changes the key
 *     from that decision point forward.
 *
 * No other leg participates: a range's identity depends on WHICH
 * POSITIONS it spans (the branch choices that produced the active
 * line), not on how those positions are being analyzed (palette,
 * engine settings, etc). An input the range's identity depends on but
 * this key omitted would surface as one branch's remembered selection
 * silently leaking into an unrelated branch — the same failure class
 * `RawKey`/`EnrichedKey`'s under-keyed predecessor produced (2026-06-08
 * ledger palette-swap stranding).
 *
 * License: Public Domain (The Unlicense)
 */

import type { Brand } from '../../types/ids';
import type { GameNode, NodeId, RootToLeafPath } from '../../types/game';

export type BranchRangeKey = Brand<string, 'BranchRangeKey'>;

/**
 * Sole factory for `BranchRangeKey`. O(path length); no hashing needed
 * at realistic branch-stem cardinality — the joined string is small and
 * human-legible, which also makes a persisted blob debuggable by eye.
 *
 * Walks `path` root→leaf. For each consecutive pair `(path[i],
 * path[i+1])`, `path[i]` contributed a real choice iff
 * `nodes[path[i]].children.length > 1`; contribute `${path[i]}:${path[i+1]}`
 * to the key for those nodes only. The empty path (no board resolved)
 * and a path with no decision nodes both mint the same empty-stem key —
 * both mean "no branch choice has been made yet," which is the correct
 * shared identity (the mainline before any fork exists).
 */
export function deriveBranchRangeKey(
  path: RootToLeafPath,
  nodes: Record<NodeId, GameNode>,
): BranchRangeKey {
  const legs: string[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const nodeId = path[i];
    const node = nodes[nodeId];
    if (node && node.children.length > 1) {
      legs.push(`${nodeId}:${path[i + 1]}`);
    }
  }
  // BranchRangeKey brand mint: sole factory (see file header).
  return legs.join('|') as BranchRangeKey;
}
