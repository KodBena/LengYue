/**
 * tests/integration/engine-move-delta-reconcile.test.ts
 *
 * Tier-3 (composable integration) tests for `reconcileEngineMoveDelta`
 * (work-status item `engine-move-delta-consumer-residue`).
 *
 * Covers the paths that neither `usePlayFromPosition-cursor-independence`
 * nor any existing test exercised:
 *
 *   1. **existing-child-reuse (`newNode === null`) happy path** — the
 *      parent's `activeChildIndex` is bumped to the matching child and
 *      the user's cursor follows when tracking. This is the
 *      `applyGoMove`-dedup shape flagged as runtime-unproven by the
 *      branded-path worklog (row 9) and the hack-rationalization audit
 *      on PR #422; no previous test constructed a board with a
 *      pre-existing child and drove the helper into the reuse branch.
 *
 *   2. **fail-loud else (ADR-0002)** — `newNode === null` with
 *      `newPointer` absent from `parent.children` throws a structured
 *      error. This branch was unreachable before PR #422's extraction
 *      arc; the throw makes the contract explicit and the test confirms
 *      it fires rather than swallowing the inconsistency silently.
 *
 *   3. **board-disappeared guard** — the helper throws if the board is
 *      gone from the store at call time.
 *
 *   4. **parent-missing guard** — the helper throws if `previousPointer`
 *      is absent from the board's node map.
 *
 *   5. **new-node case** — the happy path the existing
 *      cursor-independence tests exercise indirectly via the composables;
 *      included here so this file covers the full helper surface
 *      against the shared helper directly.
 *
 * The helper is tested directly rather than through the composable
 * wrappers (`usePlayMatch` / `usePlayFromPosition`) so that:
 *   - the existing-child-reuse fixture can be set up precisely without
 *     needing a real or mock proxy connection;
 *   - the fail-loud throw can be triggered in isolation without building
 *     an entire WS mock.
 *
 * Both consumer labels ("usePlayMatch", "usePlayFromPosition") are
 * exercised to confirm the label parameter threads through error messages.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  addBoard,
  resetWorkspace,
  mutateBoard,
} from '../../src/store';
import { createInitialBoard, asNodeId } from '../../src/store/board-factory';
import { applyGoMove } from '../../src/logic';
import { reconcileEngineMoveDelta } from '../../src/composables/board/engine-move-delta-reconcile';
import type { BoardId, BoardState, NodeId, GameNode } from '../../src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve the live board from the store. */
function liveBoard(boardId: BoardId): BoardState {
  const b = store.boards.find((b) => b.id === boardId);
  if (!b) throw new Error(`liveBoard: board ${boardId} not found in store`);
  return b;
}

/**
 * Build a fresh 19×19 board, add it to the store, and play a known move
 * into it so there is a single child of root. Returns the board id, the
 * root node id, and the child node id.
 */
function boardWithOneChild(): {
  boardId: BoardId;
  rootId: NodeId;
  childId: NodeId;
} {
  const board = createInitialBoard();
  addBoard(board);
  const boardId = board.id;
  const rootId = board.rootNodeId;

  // Apply a legal move at A1 (0,0) to create a child node.
  const next = applyGoMove(liveBoard(boardId), 0, 0);
  if (!next) throw new Error('test setup: applyGoMove failed at A1');
  const childId = next.currentNodeId;

  // Mirror the result into the store so subsequent reconciliation calls
  // find the child.
  mutateBoard(boardId, (draft) => {
    const root = draft.nodes[rootId]!;
    draft.nodes[rootId] = {
      ...root,
      children: [...root.children, childId],
      activeChildIndex: root.children.length,
    };
    draft.nodes[childId] = next.nodes[childId]!;
    draft.currentNodeId = childId;
  });

  return { boardId, rootId, childId };
}

// ── Suite ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetWorkspace();
});

describe('reconcileEngineMoveDelta — new-node case', () => {
  it('appends the new node and advances cursor when user is tracking', () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId = board.id;
    const rootId = board.rootNodeId;

    // Synthesise a fresh node (simulating what `applyGoMove` would build).
    const newId = asNodeId('test-node-1');
    const newNode: GameNode = {
      id: newId,
      parent: rootId,
      children: [],
      activeChildIndex: 0,
      properties: {},
      move: { color: 'B', x: 2, y: 2 },
    };

    reconcileEngineMoveDelta(boardId, {
      previousPointer: rootId,
      newPointer: newId,
      newNode,
    }, 'usePlayMatch');

    const b = liveBoard(boardId);
    // New node was inserted.
    expect(b.nodes[newId]).toBeDefined();
    // Parent's children list was extended.
    expect(b.nodes[rootId]!.children).toContain(newId);
    // User was at root (tracking) → cursor followed.
    expect(b.currentNodeId).toBe(newId);
  });

  it('does not advance cursor when user has navigated away', () => {
    const { boardId, rootId, childId } = boardWithOneChild();

    // User navigates back to root.
    mutateBoard(boardId, (draft) => {
      draft.currentNodeId = rootId;
    });

    const newId = asNodeId('test-node-2');
    const newNode: GameNode = {
      id: newId,
      parent: childId,
      children: [],
      activeChildIndex: 0,
      properties: {},
      move: { color: 'W', x: 3, y: 3 },
    };

    // Engine is playing from `childId` (where user is NOT).
    reconcileEngineMoveDelta(boardId, {
      previousPointer: childId,
      newPointer: newId,
      newNode,
    }, 'usePlayFromPosition');

    const b = liveBoard(boardId);
    expect(b.nodes[newId]).toBeDefined();
    // User stayed at root — gate did not fire.
    expect(b.currentNodeId).toBe(rootId);
  });
});

describe('reconcileEngineMoveDelta — existing-child-reuse case (newNode === null)', () => {
  it('bumps activeChildIndex without moving the cursor when the user is not at previousPointer', () => {
    const { boardId, rootId, childId } = boardWithOneChild();

    // User sits at childId — NOT at previousPointer (rootId) — so the
    // tracking gate must not fire.
    mutateBoard(boardId, (draft) => { draft.currentNodeId = childId; });

    // Engine's move deduped into the existing child of root. Force
    // activeChildIndex to a wrong slot first so the bump is observable
    // (boardWithOneChild leaves it already at childId's slot).
    mutateBoard(boardId, (draft) => {
      draft.nodes[rootId] = { ...draft.nodes[rootId]!, activeChildIndex: 99 };
    });

    reconcileEngineMoveDelta(boardId, {
      previousPointer: rootId,
      newPointer: childId,
      newNode: null, // existing-child reuse
    }, 'usePlayMatch');

    const b = liveBoard(boardId);
    // activeChildIndex bumped to the index of childId in root.children.
    const idx = b.nodes[rootId]!.children.indexOf(childId);
    expect(b.nodes[rootId]!.activeChildIndex).toBe(idx);
    // User was at childId (not at previousPointer=rootId), gate did not
    // fire — cursor stays at childId.
    expect(b.currentNodeId).toBe(childId);
  });

  it('advances cursor when user is tracking (at previousPointer)', () => {
    const { boardId, rootId, childId } = boardWithOneChild();

    // User is at root (tracking the engine's previousPointer).
    mutateBoard(boardId, (draft) => { draft.currentNodeId = rootId; });

    reconcileEngineMoveDelta(boardId, {
      previousPointer: rootId,
      newPointer: childId,
      newNode: null, // existing-child reuse
    }, 'usePlayFromPosition');

    const b = liveBoard(boardId);
    // Cursor followed to childId.
    expect(b.currentNodeId).toBe(childId);
    // activeChildIndex was bumped.
    const idx = b.nodes[rootId]!.children.indexOf(childId);
    expect(b.nodes[rootId]!.activeChildIndex).toBe(idx);
  });

  it('throws (ADR-0002) when newNode===null but newPointer not in parent.children', () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId = board.id;
    const rootId = board.rootNodeId;

    // `absentId` is not a child of root — delta is internally inconsistent.
    const absentId = asNodeId('not-a-child');

    expect(() => reconcileEngineMoveDelta(boardId, {
      previousPointer: rootId,
      newPointer: absentId,
      newNode: null,
    }, 'usePlayMatch')).toThrow(
      /existing-child reuse signalled \(newNode===null\) but newPointer/,
    );

    // Error message includes the label.
    expect(() => reconcileEngineMoveDelta(boardId, {
      previousPointer: rootId,
      newPointer: absentId,
      newNode: null,
    }, 'usePlayFromPosition')).toThrow(/usePlayFromPosition/);
  });
});

describe('reconcileEngineMoveDelta — guard paths', () => {
  it('throws when the board has been removed from the store', () => {
    const board = createInitialBoard();
    // Do NOT add to store.
    const boardId = board.id;
    const rootId = board.rootNodeId;

    expect(() => reconcileEngineMoveDelta(boardId, {
      previousPointer: rootId,
      newPointer: asNodeId('x'),
      newNode: null,
    }, 'usePlayMatch')).toThrow(/board .* disappeared mid-run/);
  });

  it('throws when previousPointer is absent from the board node map', () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId = board.id;

    const missingId = asNodeId('ghost-node');

    expect(() => reconcileEngineMoveDelta(boardId, {
      previousPointer: missingId,
      newPointer: asNodeId('x'),
      newNode: null,
    }, 'usePlayFromPosition')).toThrow(
      /parent node .* missing from board/,
    );
  });
});
