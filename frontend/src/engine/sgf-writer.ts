/**
 * src/engine/sgf-writer.ts
 * SGF serialization.
 * License: Public Domain (The Unlicense)
 */

import type { BoardState, GameNode, NodeId } from '../types';
import { getPath } from './navigator';

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
  // SHAPE NOTE (branded-path-types arc, 2026-06-10): despite the name,
  // this serializes ROOT→CURRENT — the moves up to the cursor — NOT the
  // active variation line root→leaf. The minting consumer
  // (`useMinting.prepareDraft`) depends on exactly that: a card is
  // minted from the position the user is looking at, excluding any
  // forward variation past it. The path now comes from the branded
  // producer `getPath` (`RootToCurrentPath`) instead of the previous
  // hand-rolled walk, so the shape is compile-visible; the old walk's
  // silent `break` on a missing node — which would have serialized a
  // TRUNCATED SGF, a silent-corruption path for a minted card — is
  // replaced by getPath's fail-loud throw on a corrupt tree
  // (ADR-0002). The misleading name predates the brands; renaming is a
  // maintainer call because the symbol is exposed on the
  // `window.Writer` console-debug surface (`main.ts`).
  const path = getPath(state.nodes, state.currentNodeId);

  let out = '(';
  for (const nodeId of path) {
    out += serializeProperties(state.nodes[nodeId]);
  }
  out += ')';

  return out;
}
