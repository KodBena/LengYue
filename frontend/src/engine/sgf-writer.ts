/**
 * src/engine/sgf-writer.ts
 * SGF serialization.
 * License: Public Domain (The Unlicense)
 */

import type { BoardState, GameNode, NodeId } from '../types';

function escapeSgf(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/]/g, '\\]');
}

function serializeProperties(node: GameNode): string {
  let out = ';';
  for (const [key, values] of Object.entries(node.properties)) {
    if (!values || values.length === 0) {
      if (import.meta.env.DEV) console.warn(`[SgfWriter] node ${node.id} has empty value array for key "${key}" — skipping`);
      continue;
    }
    out += key + values.map(v => `[${escapeSgf(v)}]`).join('');
  }
  return out;
}

/**
 * ─── Branded-type signature discipline (Commit 2-tail) ──────────────────────
 * Both parameters tightened from `string` and `Record<string, GameNode>`
 * to their branded forms. The function only ever receives values that are
 * by construction NodeIds and a Record<NodeId, GameNode>: callers thread
 * `state.nodes` (Record<NodeId, GameNode>) and `state.rootNodeId` (NodeId)
 * from BoardState, and the recursion threads `node.children[i]` (NodeId
 * from GameNode.children: NodeId[]).
 *
 * After tightening, the recursive `serializeSubtree(node.children[0], nodes)`
 * and the `node.children.map(childId => ...)` both typecheck without any
 * cast or implicit-any annotation: `childId` infers as NodeId from the
 * children array's element type.
 * ──────────────────────────────────────────────────────────────────────────
 */
function serializeSubtree(nodeId: NodeId, nodes: Record<NodeId, GameNode>): string {
  const node = nodes[nodeId];
  if (!node) {
    console.error(`[SgfWriter] serializeSubtree: nodeId "${nodeId}" not found in nodes`);
    return '';
  }

  const props = serializeProperties(node);

  if (node.children.length === 0) {
    return props;
  }

  if (node.children.length === 1) {
    return props + serializeSubtree(node.children[0], nodes);
  }

  const branches = node.children
    .map(childId => '(' + serializeSubtree(childId, nodes) + ')')
    .join('');
  return props + branches;
}

export function serializeBoard(state: BoardState): string {
  const result = '(' + serializeSubtree(state.rootNodeId, state.nodes) + ')';
  return result;
}

export function serializeActivePath(state: BoardState): string {
  // Same NodeId tightening pattern as getActiveVariationPath in engine/util.ts:
  // the walk starts at state.currentNodeId (NodeId) and proceeds via
  // node.parent (NodeId | null); the loose `string` was a signature lie
  // covering for the loose Record-indexing site below.
  const path: NodeId[] = [];
  let curr: NodeId | null = state.currentNodeId;
  while (curr) {
    // Explicit annotation breaks TS7022 circular inference. After
    // ADR-0001's readonly removal, TS can no longer use the readonly
    // hint to break the cycle between `node`'s inferred type and
    // `curr`'s reassignment from `node.parent`. Annotating `node`
    // breaks the cycle by removing one side of the inference.
    const node: GameNode | undefined = state.nodes[curr];
    if (!node) break;
    path.unshift(curr);
    curr = node.parent;
  }

  let out = '(';
  for (const nodeId of path) {
    out += serializeProperties(state.nodes[nodeId]);
  }
  out += ')';

  return out;
}
