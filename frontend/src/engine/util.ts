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

/**
 * Converts a `Move` to the wire-coordinate string KataGo's analysis
 * engine accepts: a GTP coordinate for placed stones, or the literal
 * `"pass"` for passes. The pass branch is load-bearing — without it,
 * any game with a pass in its history sends a move list shorter than
 * the actual move count, and KataGo analyses positions that diverge
 * from the user's board state from the first pass onward.
 */
export function moveToKataCoord(m: Move): string {
  return m.type === 'pass' ? 'pass' : toGtp(m.x, m.y);
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

/**
 * Decodes a flat KataGo board-shaped array (length = size²) into per-cell
 * records in our internal coordinate convention.
 *
 * KataGo emits board arrays (`ownership`, `policy`) in row-major order
 * with row 0 at the *top* of the board. Our internal coordinate system
 * places y=0 at the *bottom* (matching `BoardDisplay.toSVG`'s y-flip),
 * so the row index inverts: row = size - 1 - y.
 *
 * Returns an empty array on length mismatch with a console warning
 * (per ADR-0002 — surfaces the deviation rather than silently rendering
 * a misaligned heatmap).
 *
 * Note: `policy` is conventionally length size² + 1 (the trailing slot
 * is the "pass" probability). Strip the pass slot before passing here,
 * or this function will warn and return empty.
 */
export function decodeBoardArray(
  values: readonly number[],
  size: number,
): { x: number; y: number; value: number }[] {
  if (values.length !== size * size) {
    console.warn(`[decodeBoardArray] length ${values.length} != size² ${size * size}`);
    return [];
  }
  const out: { x: number; y: number; value: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    const x = i % size;
    const row = Math.floor(i / size);
    const y = size - 1 - row;
    out.push({ x, y, value: values[i] });
  }
  return out;
}

export function updateRegistry<T extends object>(
  root: T,
  path: string[],
  value: any
): void {
  setDeep(root, path, value);
}

/**
 * RFC4122 v4 UUID. Prefers `crypto.randomUUID()`; falls back to a
 * manual construction over `crypto.getRandomValues` when the former
 * is unavailable.
 *
 * `crypto.randomUUID` is only present on **secure contexts** —
 * HTTPS or localhost. Accessing the Vite dev server via a LAN IP
 * (e.g. `http://192.168.x.x:5173`) is not a secure context, so the
 * method is undefined there. `crypto.getRandomValues` is available
 * in every context, so the fallback works regardless. Per ADR-0002,
 * the call site (currently `useQeubo`'s `pinCurrent`) goes through
 * this helper rather than the bare API to avoid silent context-
 * dependent failures.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex: string[] = [];
  for (const b of bytes) hex.push(b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
