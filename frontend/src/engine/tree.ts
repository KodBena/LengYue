/**
 * src/engine/tree.ts
 * Grid-based tree layout logic and tree graph transformations.
 */

import type { GameNode, NodeId } from '../types';

export interface NodePosition {
  gx: number; 
  gy: number; 
  //
  // NOTE ON AXIS CONVENTION
  // These names are intentionally abstract. The *renderer* (TreeWidget) decides
  // which screen axis each maps to via its `orientation` prop:
  //   'vertical'   → gx = screen-x (columns), gy = screen-y (rows, downward)
  //   'horizontal' → gx = screen-y (rows),    gy = screen-x (columns, rightward)
  // Layout algorithms must not encode any assumption about screen orientation.
}

// Branded-type signature discipline (Commit 5a-extension): the positions
// Map's key type was `string`, which forced the consumer (TreeWidget) into
// type errors when indexing `props.nodes` (Record<NodeId, GameNode>) with
// the Map's keys. Tightening the key type to NodeId here propagates honesty
// to the consumer with no consumer-side change required.
export interface LayoutResult {
  positions: Map<NodeId, NodePosition>;
  cols: number; // Total tracks occupied (gx dimension)
  rows: number; // Total depth occupied  (gy dimension)
}

/**
 * Produces a filtered view of the node graph.
 * 
 * NEW SEMANTICS:
 * 1. The first child (index 0) is the "mainline" and is ALWAYS visible.
 * 2. Subsequent children (index 1..N) are "variations" and are only visible 
 *    if `isExpanded(nodeId)` is true.
 */
export function filterToExpandedSubtree(
  nodes: Record<NodeId, GameNode>,
  isExpanded: (nodeId: NodeId) => boolean,
  rootId: NodeId,
): Record<NodeId, GameNode> {
  const result: Record<NodeId, GameNode> = {};

  function visit(nodeId: NodeId): void {
    const node = nodes[nodeId];
    if (!node) return;

    if (node.children.length <= 1) {
      // No siblings to hide, just pass through
      result[nodeId] = node;
    } else {
      const showVariations = isExpanded(nodeId);
      if (showVariations) {
        result[nodeId] = node;
      } else {
        // Prune everything except the mainline child
        result[nodeId] = { ...node, children: [node.children[0]] };
      }
    }

    // Recursively visit only the children that survived the filter
    for (const childId of result[nodeId].children) {
      visit(childId);
    }
  }

  visit(rootId);
  return result;
}

/**
 * Standard grid layout algorithm.
 * gy = depth from root (primary axis)
 * gx = branch track (secondary axis)
 */
export function computeLayout(
  nodes: Record<NodeId, GameNode>,
  rootId: NodeId,
): LayoutResult {
  const positions = new Map<NodeId, NodePosition>();
  let maxTrack = 0;
  let maxDepth = 0;

  function assign(nodeId: NodeId, track: number, depth: number): void {
    const node = nodes[nodeId];
    if (!node) return;

    positions.set(nodeId, { gx: track, gy: depth });
    if (depth > maxDepth) maxDepth = depth;

    for (let i = 0; i < node.children.length; i++) {
      if (i === 0) {
        assign(node.children[i], track, depth + 1);
      } else {
        maxTrack++;
        assign(node.children[i], maxTrack, depth + 1);
      }
    }
  }

  assign(rootId, 0, 0);

  return {
    positions,
    cols: maxTrack + 1,
    rows: maxDepth + 1,
  };
}
