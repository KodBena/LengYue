/**
 * src/engine/util.ts
 * License: Public Domain (The Unlicense)
 */
import type { Move, StoneColor, BoardState, NodeId } from '../types';

/**
 * Converts SGF coordinate string to internal Point.
 * @param sgfStr e.g. "pd"
 * @param color 'B' | 'W'
 * @param size Board size from root node
 */
export function sgfToMove(sgfStr: string | undefined, color: StoneColor, size: number): Move {
  if (!sgfStr || sgfStr.trim() === "" || (sgfStr === 'tt' && size <= 19)) {
    return { type: 'pass', color, x: 0, y: 0 };
  }

  const x = sgfStr.charCodeAt(0) - 97;
  const y = (size - 1) - (sgfStr.charCodeAt(1) - 97);

  return { type: 'place', color, x, y };
}

export function pointToKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function keyToPoint(key: string): { x: number, y: number } {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function setDeep(obj: any, path: string[], value: any): void {
  if (!path.length) return;
  
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] === null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  const finalKey = path[path.length - 1];
  current[finalKey] = value;
}

/**
 * Walks the active variation from the current node to the deepest leaf
 * (following `activeChildIndex` at each branch), then walks back up to
 * collect the lineage as a NodeId[] from root to leaf.
 *
 * ─── Return-type tightening (Commit 2-tail) ──────────────────────────────────
 * Previously typed as `string[]` — a signature lie, since every element
 * is a key in `board.nodes` (Record<NodeId, GameNode>) and therefore by
 * construction a NodeId. The loose `string[]` return type forced
 * downstream consumers (notably useVariationPath, useAnalysisProjection,
 * useChartNavigation) to either accept loose `string[]` themselves or
 * cast at every indexing site.
 *
 * Tightening here is the source-side fix: NodeId[] propagates through
 * useVariationPath to its consumers automatically. The three "safe-by-
 * construction" casts left in useAnalysisProjection.ts (Commit 2a) are
 * now redundant — strict mode may even start flagging them. Worth
 * revisiting that file to remove them as a follow-up cleanup.
 * ──────────────────────────────────────────────────────────────────────────
 */
export function getActiveVariationPath(board: BoardState): NodeId[] {
  let leafId = board.currentNodeId;
  let leafNode = board.nodes[leafId];
  while (leafNode && leafNode.children.length > 0) {
    leafId = leafNode.children[leafNode.activeChildIndex] || leafNode.children[0];
    leafNode = board.nodes[leafId];
  }

  const path: NodeId[] = [];
  let curr: NodeId | null = leafId;
  while (curr) {
    path.unshift(curr);
    curr = board.nodes[curr].parent;
  }
  return path;
}

const GTP_ALPHABET = "ABCDEFGHJKLMNOPQRSTUVWXYZ".split("");

export function toGtp(x: number, y: number): string {
  if (x < 0 || x >= GTP_ALPHABET.length) {
    console.warn(`[util.ts:toGtp] X-coordinate ${x} out of GTP range.`);
    return "pass";
  }
  
  const col = GTP_ALPHABET[x];
  const row = y + 1; 
  return `${col}${row}`;
}

export function getBoardSize(state: BoardState): number {
  return parseInt(state.nodes[state.rootNodeId]?.properties['SZ']?.[0] ?? '19', 10);
}

/**
 * Extracts the komi from the SGF root node.
 * Defaults to 6.5 if missing or unparseable.
 */
export function getKomi(state: BoardState): number {
  const kmStr = state.nodes[state.rootNodeId]?.properties['KM']?.[0];
  const km = parseFloat(kmStr ?? '6.5');
  return isNaN(km) ? 6.5 : km;
}

export function updateRegistry<T extends object>(
  root: T, 
  path: string[], 
  value: any
): void {
  setDeep(root, path, value);
}
