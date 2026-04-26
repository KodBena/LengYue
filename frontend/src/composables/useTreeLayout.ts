/**
 * src/composables/useTreeLayout.ts
 *
 * Pluggable Tree Layout Composable.
 *
 * ## Reactivity
 *
 * `watchEffect` is used instead of `watch` so that all reactive reads made
 * during layout computation are automatically tracked as dependencies. This
 * covers two sources:
 *   1. `nodesRef.value`                 — the node graph (structural changes)
 *   2. `expansion.expandedNodes.value`  — the expansion set (UI state changes)
 *
 * License: Public Domain (The Unlicense)
 */

import { shallowRef, watchEffect, markRaw, type Ref } from 'vue';
import type { GameNode, NodeId } from '../types';
import {
  computeLayout,
  filterToExpandedSubtree,
  type LayoutResult,
} from '../engine/tree';
import type { TreeExpansionState } from './useTreeExpansion';

/**
 * A pure function from a (filtered) node graph to a LayoutResult.
 *
 * Branded-type signature discipline (Commit 5a-extension): the algorithm
 * type's `nodes` and `rootId` parameters were `Record<string, GameNode>`
 * and `string` — loose types that didn't match the upstream BoardState
 * (Record<NodeId, GameNode>). Tightening here propagates from tree.ts's
 * tightening of computeLayout/filterToExpandedSubtree, and propagates
 * downstream to TreeWidget's forEach((pos, id) => ...) callbacks where
 * `id` now infers as NodeId from LayoutResult.positions's key type.
 */
export type TreeLayoutAlgorithm = (
  nodes: Record<NodeId, GameNode>,
  rootId: NodeId,
) => LayoutResult;

export interface TreeLayoutState {
  readonly layout: Ref<LayoutResult>;
}

export const gridTreeLayout: TreeLayoutAlgorithm = computeLayout;

const EMPTY_LAYOUT: LayoutResult = {
  positions: new Map(),
  cols: 1,
  rows: 1,
};

/**
 * Returns a reactive `LayoutResult` that recomputes whenever the node graph
 * or expansion state changes.
 */
export function useTreeLayout(
  nodesRef: Ref<Record<NodeId, GameNode>>,
  algorithm: TreeLayoutAlgorithm = gridTreeLayout,
  expansion?: TreeExpansionState,
): TreeLayoutState {
  const layout = shallowRef<LayoutResult>(markRaw({ ...EMPTY_LAYOUT }));

  watchEffect(() => {
    const nodes = nodesRef.value;

    // Read the expansion set to register it as a reactive dependency.
    // `void` signals intent: we care about the tracking side-effect, not the value.
    // FIX: Updated from collapsedNodes to expandedNodes to match the new semantics.
    void expansion?.expandedNodes.value;

    const rootId = Object.values(nodes).find(n => n.parent === null)?.id;
    if (!rootId) {
      layout.value = markRaw({ ...EMPTY_LAYOUT });
      return;
    }

    const nodesToLayout = expansion
      ? filterToExpandedSubtree(nodes, expansion.isExpanded, rootId)
      : nodes;

    layout.value = markRaw(algorithm(nodesToLayout, rootId));
  });

  return { layout };
}
