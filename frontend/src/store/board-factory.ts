/**
 * src/store/board-factory.ts
 * Pure factory functions for board state construction.
 *
 * All exports are pure functions — no side effects, no reactive state,
 * no Vue imports. This module can be tested in isolation with plain
 * TypeScript and has no runtime dependencies beyond the domain types
 * and the engine's pure helpers.
 *
 * License: Public Domain (The Unlicense)
 */

import type { BoardState, GameNode, BoardId, NodeId } from '../types';
import { generateUUID } from '../engine/util';

// ── Newtype constructors ───────────────────────────────────────────────────────
// These are identity functions at runtime; their value is purely in the
// type system — preventing BoardId and NodeId from being interchanged.

export const asBoardId = (s: string): BoardId => s as BoardId;
export const asNodeId  = (s: string): NodeId  => s as NodeId;

// ── Internal helpers ──────────────────────────────────────────────────────────

// Short id generator for NodeId. Distinct from
// `engine/util.ts::generateUUID` (RFC4122 v4) — the short form is
// fine for board-scoped node identifiers where collision risk is
// per-session and human-readable hashes are friendlier in DevTools.
//
// BoardId no longer uses this — it uses `generateUUID` instead, since
// it crosses the wire to backend's UUID-typed `analysis_bundles.board_id`
// column. The cutover happened in migration 24 → 25 (see
// `migrations.ts`); `clientGameId` adopted `generateUUID` earlier in
// migration 22 → 23.
export const uuid = (): string => Math.random().toString(36).substring(2, 9);

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Produces a blank 19×19 board with a single root node.
 *
 * Pure function: every call returns a fresh object graph with no shared
 * references. The root node contains the minimal set of SGF properties
 * needed for downstream consumers (SZ, GM, FF). `clientGameId` gets a
 * fresh RFC4122 v4 UUID — that's the dedup handle the mint flow sends
 * to the backend so subsequent mints from this board's lifetime resolve
 * to the same game_source row.
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
    id: asBoardId(generateUUID()),
    rootNodeId: rootId,
    currentNodeId: rootId,
    stones: {},
    captures: { B: 0, W: 0 },
    nodes: { [rootId]: rootNode },
    koPoint: null,
    turn: 'B',
    clientGameId: generateUUID(),
    games: {},
  };
}
