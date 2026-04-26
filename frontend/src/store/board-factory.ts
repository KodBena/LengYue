/**
 * src/store/board-factory.ts
 * Pure factory functions for board state construction.
 *
 * All exports are pure functions — no side effects, no reactive state,
 * no Vue imports. This module can be tested in isolation with plain
 * TypeScript and has no runtime dependencies beyond the domain types.
 *
 * License: Public Domain (The Unlicense)
 */

import type { BoardState, GameNode, BoardId, NodeId } from '../types';

// ── Newtype constructors ───────────────────────────────────────────────────────
// These are identity functions at runtime; their value is purely in the
// type system — preventing BoardId and NodeId from being interchanged.

export const asBoardId = (s: string): BoardId => s as BoardId;
export const asNodeId  = (s: string): NodeId  => s as NodeId;

// ── Internal helpers ──────────────────────────────────────────────────────────

export const uuid = (): string => Math.random().toString(36).substring(2, 9);

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Produces a blank 19×19 board with a single root node.
 *
 * Pure function: every call returns a fresh object graph with no shared
 * references. The root node contains the minimal set of SGF properties
 * needed for downstream consumers (SZ, GM, FF).
 */
export function createInitialBoard(): BoardState {
  const rootId = asNodeId('root-' + uuid());

  const rootNode: GameNode = {
    id: rootId,
    parent: null,
    children: [],
    activeChildIndex: 0,
    properties: { SZ: ['19'], GM: ['1'], FF: ['4'] },
    move: null,
  };

  return {
    id: asBoardId(uuid()),
    rootNodeId: rootId,
    currentNodeId: rootId,
    stones: {},
    captures: { B: 0, W: 0 },
    nodes: { [rootId]: rootNode },
    koPoint: null,
    turn: 'B',
    lastActivity: 0,
  };
}
