/**
 * src/engine/navigator.ts
 * LCA-based tree traversal with setup and capture tracking.
 * Strictly typed with NodeId and BoardId.
 * License: Public Domain (The Unlicense)
 */

import type { BoardState, GameNode, NodeId } from '../types';
import { getActiveVariationPath } from './util';

export function getPath(nodes: Record<NodeId, GameNode>, targetId: NodeId): NodeId[] {
  const path: NodeId[] = [];
  let curr: NodeId | null = targetId;
  while (curr) {
    path.unshift(curr);
    curr = nodes[curr].parent;
  }
  return path;
}

export function navigateTo(state: BoardState, targetNodeId: NodeId): void {
  if (state.currentNodeId === targetNodeId) return;

  const currentPath = getPath(state.nodes, state.currentNodeId);
  const targetPath = getPath(state.nodes, targetNodeId);

  let lcaIndex = 0;
  while (
    lcaIndex < currentPath.length &&
    lcaIndex < targetPath.length &&
    currentPath[lcaIndex] === targetPath[lcaIndex]
  ) {
    lcaIndex++;
  }

  // 1. Undo (Backwards from Current to LCA)
  for (let i = currentPath.length - 1; i >= lcaIndex; i--) {
    const node = state.nodes[currentPath[i]];
    if (!node.delta) continue;

    if (node.move && node.move.type === 'place') {
      delete state.stones[`${node.move.x},${node.move.y}`];
      const enemyColor = node.move.color === 'B' ? 'W' : 'B';
      for (const capKey of node.delta.captures) {
        state.stones[capKey] = enemyColor;
        state.captures[node.move.color] -= 1;
      }
    }

    for (const [posKey, prevColor] of Object.entries(node.delta.setupOverwritten ?? {})) {
      if (prevColor === null) delete state.stones[posKey];
      else state.stones[posKey] = prevColor;
    }

    state.koPoint = node.delta.prevKoPoint;
    state.turn = node.move ? node.move.color : state.turn;
  }

  // 2. Replay (Forwards from LCA to Target)
  const size = parseInt(state.nodes[state.rootNodeId].properties['SZ']?.[0] ?? '19', 10);
  for (let i = lcaIndex; i < targetPath.length; i++) {
    const node = state.nodes[targetPath[i]];
    
    if (node.parent) {
      const parent = state.nodes[node.parent];
      const childIdx = parent.children.indexOf(node.id);
      if (childIdx !== -1) parent.activeChildIndex = childIdx;
    }

    if (!node.delta) continue;

    // Apply Setup (Forward)
    for (const posKey of Object.keys(node.delta.setupOverwritten ?? {})) {
      const [x, y] = posKey.split(',').map(Number);
      const sgfCoord = String.fromCharCode(97 + x) + String.fromCharCode(97 + (size - 1 - y));
      
      if (node.properties.AB?.includes(sgfCoord)) state.stones[posKey] = 'B';
      else if (node.properties.AW?.includes(sgfCoord)) state.stones[posKey] = 'W';
      else if (node.properties.AE?.includes(sgfCoord)) delete state.stones[posKey];
    }

    // Apply Move (Forward)
    if (node.move) {
      const { x, y, color, type } = node.move;
      if (type === 'place') {
        state.stones[`${x},${y}`] = color;
        for (const capKey of node.delta.captures) {
          delete state.stones[capKey];
          state.captures[color] += 1;
        }
      }
      state.turn = color === 'B' ? 'W' : 'B';
    }
    
    state.koPoint = node.delta.newKoPoint;
  }

  state.currentNodeId = targetNodeId;
}

export function navigateNext(state: BoardState) {
  const curr = state.nodes[state.currentNodeId];
  if (curr.children.length > 0) {
    const nextId = curr.children[curr.activeChildIndex] ?? curr.children[0];
    navigateTo(state, nextId);
  }
}

export function navigatePrev(state: BoardState) {
  const curr = state.nodes[state.currentNodeId];
  if (curr.parent) navigateTo(state, curr.parent);
}

export function navigateVariation(state: BoardState, direction: number) {
  const curr = state.nodes[state.currentNodeId];
  if (!curr.parent) return;
  const parent = state.nodes[curr.parent];
  const myIdx = parent.children.indexOf(state.currentNodeId);
  const nextIdx = myIdx + direction;
  if (nextIdx >= 0 && nextIdx < parent.children.length) {
    navigateTo(state, parent.children[nextIdx]);
  }
}

/**
 * Find the active-path node closest to current where a move
 * placed a stone at the clicked vertex (x, y). Searches backward
 * first — the "where did this stone come from?" reading — then
 * forward to handle empty intersections the active path will play
 * later. Returns null when (x, y) is never played on the active
 * path's move sequence.
 *
 * Notes:
 *   - A stone placed at index N and later captured at N+k leaves
 *     (x, y) visually empty for currentIdx > N+k. Backward search
 *     still returns N (the placement) — the user sees the move
 *     that placed the now-captured stone and can step forward to
 *     observe the capture.
 *   - The active path is the user-selected line via
 *     `navigateVariation`; this helper does not search sibling
 *     variations.
 *   - Root setup stones (AB / AW properties for handicap and
 *     problem-position imports) are not currently in the search
 *     domain. Adding them is a single conditional on the root
 *     node + the SGF-coord encoding navigator's setup-stone path
 *     already uses, when a handicap use case surfaces.
 */
export function findPlacementOnActivePath(
  state: BoardState,
  x: number,
  y: number,
): NodeId | null {
  const path = getActiveVariationPath(state);
  if (path.length === 0) return null;
  const currentIdx = path.indexOf(state.currentNodeId);
  if (currentIdx === -1) return null;

  function isPlacementAt(nodeId: NodeId): boolean {
    const node = state.nodes[nodeId];
    if (!node) return false;
    return node.move?.type === 'place'
        && node.move.x === x
        && node.move.y === y;
  }

  // Backward — inclusive of current so shift-clicking the
  // current-move's own vertex resolves to current (a coherent
  // no-op rather than a fall-through to a forward search).
  for (let i = currentIdx; i >= 0; i--) {
    if (isPlacementAt(path[i])) return path[i];
  }
  // Forward — empty intersection the active path will play later.
  for (let i = currentIdx + 1; i < path.length; i++) {
    if (isPlacementAt(path[i])) return path[i];
  }
  return null;
}
