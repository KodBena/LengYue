/**
 * src/composables/board/useKnownPositionNodes.ts
 *
 * Composition-layer derivation of the active board's known-position
 * highlight set — card-position-annotations Stage B (see
 * `.claude/dispatch-reports/card-position-annotations-design.md`,
 * §4 "Annotation render"). Mirrors `usePlayVsEngine.ts`'s
 * `activeBoardGameHeadIds`: a `ComputedRef<ReadonlySet<NodeId> |
 * undefined>` derived from already-loaded reactive state and passed
 * to `TreeWidget` as a prop, precomputed at the composition layer
 * (App.vue) rather than read inside TreeWidget's own render.
 *
 * ── The membership test ────────────────────────────────────────────────────
 * A NodeId belongs to the set iff (a) `node-position-hashes.ts` has
 * already cached its content hash — which only happens for nodes
 * `TreeWidget`'s viewport-driven `useNodePositionHashes.requestHashFill`
 * has actually asked the backend about, per §5's on-demand-per-viewport
 * design — AND (b) that hash is present in `known-positions.ts`'s
 * per-user `ContentHash -> CardId` map (Stage A). A node whose hash
 * hasn't been fetched yet is simply absent from the set (not
 * "known-false") until the fetch lands; this is the same
 * "fill lazily, not eagerly" posture the design's §5 recommends, and
 * why this Set can be empty on first paint of a large tree without
 * that being a bug.
 *
 * ── Reactivity shape ───────────────────────────────────────────────────────
 * Iterates `Object.keys(activeBoard.value.nodes)` — the SAME
 * `Object.values(board.games)`-style iteration `activeBoardGameHeadIds`
 * already uses for its own membership set — so this recomputes when
 * either `activeBoard.value.nodes` changes (a new node is played) or
 * the node-hash / known-position reactive Maps gain an entry (a fill
 * lands, or a mint/delete updates known-positions). No network I/O in
 * the computed itself — purely a set intersection over two already-
 * populated caches, same cost class as `activeBoardGameHeadIds`.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, type ComputedRef } from 'vue';
import { activeBoard } from '../../store';
import { getCachedNodeHash } from '../../state/node-position-hashes';
import { isKnownPosition } from '../../state/known-positions';
import type { NodeId } from '../../types';

export interface KnownPositionNodesHandle {
  activeBoardKnownPositionNodeIds: ComputedRef<ReadonlySet<NodeId> | undefined>;
}

export function useKnownPositionNodes(): KnownPositionNodesHandle {
  const activeBoardKnownPositionNodeIds = computed((): ReadonlySet<NodeId> | undefined => {
    const board = activeBoard.value;
    if (!board) return undefined;
    const result = new Set<NodeId>();
    // Object.keys widens Record<NodeId,…> keys to string[] (the TS
    // "Category C" boundary, IDENTIFIERS.md NodeId row); re-brand.
    for (const nodeId of Object.keys(board.nodes) as NodeId[]) {
      const hash = getCachedNodeHash(nodeId);
      if (hash !== undefined && isKnownPosition(hash)) {
        result.add(nodeId);
      }
    }
    return result;
  });

  return { activeBoardKnownPositionNodeIds };
}
