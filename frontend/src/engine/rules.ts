/**
 * src/engine/rules.ts
 * Pure Go rule logic in TypeScript (Dynamic Size).
 * License: Public Domain (The Unlicense)
 */

import type { StoneColor, Point } from '../types';

/** Calculates neighbors on the fly to support dynamic board sizes */
function getNeighbors(x: number, y: number, size: number): string[] {
  const adj: string[] = [];
  if (x > 0) adj.push(`${x - 1},${y}`);
  if (x < size - 1) adj.push(`${x + 1},${y}`);
  if (y > 0) adj.push(`${x},${y - 1}`);
  if (y < size - 1) adj.push(`${x},${y + 1}`);
  return adj;
}

interface Chain {
  stones: Set<string>;
  liberties: Set<string>;
  color: StoneColor;
}

/** Finds a chain of stones and its liberties */
function getChain(stones: Record<string, StoneColor>, startKey: string, size: number): Chain | null {
  const color = stones[startKey];
  if (!color) return null;

  const chain = new Set<string>([startKey]);
  const liberties = new Set<string>();
  const queue = [startKey];

  let i = 0;
  while (i < queue.length) {
    const key = queue[i++];
    const [kx, ky] = key.split(',').map(Number);
    const neighbors = getNeighbors(kx, ky, size);
    
    for (const nb of neighbors) {
      if (chain.has(nb)) continue;
      
      const nbColor = stones[nb];
      if (!nbColor) {
        liberties.add(nb);
      } else if (nbColor === color) {
        chain.add(nb);
        queue.push(nb);
      }
    }
  }

  return { stones: chain, liberties, color };
}

export interface MoveResult {
  ok: boolean;
  reason?: string;
  captures: string[];
  newKoPoint: Point | null;
}

/**
 * Validates and calculates the result of a move.
 * No side effects on the input state.
 */
export function validateMove(
  stones: Record<string, StoneColor>,
  koPoint: Point | null,
  color: StoneColor,
  x: number,
  y: number,
  size: number
): MoveResult {
  const key = `${x},${y}`;
  const enemyColor: StoneColor = color === 'B' ? 'W' : 'B';

  // 1. Occupied?
  if (stones[key]) {
    return { ok: false, reason: 'occupied', captures: [], newKoPoint: null };
  }

  // 2. Ko?
  if (koPoint && koPoint.x === x && koPoint.y === y) {
    return { ok: false, reason: 'ko', captures: [], newKoPoint: null };
  }

  // 3. Simulate placement
  const tempStones = { ...stones, [key]: color };
  const captures: string[] = [];
  const neighbors = getNeighbors(x, y, size);

  // Check for enemy captures
  const checkedChains = new Set<string>();
  for (const nb of neighbors) {
    if (tempStones[nb] === enemyColor && !checkedChains.has(nb)) {
      const chain = getChain(tempStones, nb, size);
      if (chain) {
        chain.stones.forEach(s => checkedChains.add(s));
        if (chain.liberties.size === 0) {
          chain.stones.forEach(s => {
            captures.push(s);
            delete tempStones[s];
          });
        }
      }
    }
  }

  // 4. Suicide check
  const placedChain = getChain(tempStones, key, size);
  if (placedChain && placedChain.liberties.size === 0) {
    return { ok: false, reason: 'suicide', captures: [], newKoPoint: null };
  }

  // 5. New Ko point calculation
  let newKoPoint: Point | null = null;
  if (captures.length === 1 && placedChain?.stones.size === 1) {
    const [kx, ky] = captures[0].split(',').map(Number);
    newKoPoint = { x: kx, y: ky };
  }

  return { ok: true, captures, newKoPoint };
}
