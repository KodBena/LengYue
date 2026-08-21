/**
 * tests/unit/composables/mint-selection.test.ts
 *
 * Tier-1 tests for `mint-selection.ts` — the batch card-minting
 * affordance's per-board selection registry (commissioner-designed,
 * ledger rows 926/957/1008). Exercises the toggle/add/remove semantics
 * TreeWidget's ctrl+click handler and `useLearnPath.explore()` both
 * write through, plus the board-close teardown.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSelectedNodeIds,
  isNodeSelected,
  addToSelection,
  toggleNodeSelection,
  removeFromSelection,
  removeFromSelectionOne,
  clearSelection,
  removeSelectionSlot,
} from '../../../src/composables/cards/mint-selection';
import { runBoardCloseHandlers, runWorkspaceResetHandlers } from '../../../src/store/teardown-registry';
import { asNodeId } from '../../../src/store/board-factory';
import type { BoardId, NodeId } from '../../../src/types';

const BOARD_A = 'board-a' as BoardId;
const BOARD_B = 'board-b' as BoardId;
const N1 = asNodeId('n1');
const N2 = asNodeId('n2');
const N3 = asNodeId('n3');

beforeEach(() => {
  removeSelectionSlot(BOARD_A);
  removeSelectionSlot(BOARD_B);
});

describe('getSelectedNodeIds — untouched board reads as the shared empty set', () => {
  it('returns an empty set for a board with no selection activity', () => {
    expect(getSelectedNodeIds(BOARD_A).size).toBe(0);
  });
});

describe('toggleNodeSelection — the ctrl+click primitive', () => {
  it('adds on first toggle, removes on second (idempotent round trip)', () => {
    expect(isNodeSelected(BOARD_A, N1)).toBe(false);
    toggleNodeSelection(BOARD_A, N1);
    expect(isNodeSelected(BOARD_A, N1)).toBe(true);
    expect(getSelectedNodeIds(BOARD_A).has(N1)).toBe(true);
    toggleNodeSelection(BOARD_A, N1);
    expect(isNodeSelected(BOARD_A, N1)).toBe(false);
    expect(getSelectedNodeIds(BOARD_A).has(N1)).toBe(false);
  });

  it('toggling one node does not affect a sibling node\'s membership', () => {
    toggleNodeSelection(BOARD_A, N1);
    toggleNodeSelection(BOARD_A, N2);
    expect(getSelectedNodeIds(BOARD_A)).toEqual(new Set([N1, N2]));
    toggleNodeSelection(BOARD_A, N1);
    expect(getSelectedNodeIds(BOARD_A)).toEqual(new Set([N2]));
  });

  it('is keyed per board — toggling on board A never touches board B\'s selection', () => {
    toggleNodeSelection(BOARD_A, N1);
    expect(getSelectedNodeIds(BOARD_B).has(N1)).toBe(false);
    toggleNodeSelection(BOARD_B, N1);
    expect(getSelectedNodeIds(BOARD_A).has(N1)).toBe(true);
    expect(getSelectedNodeIds(BOARD_B).has(N1)).toBe(true);
  });
});

describe('addToSelection — idempotent add (used by useLearnPath.explore)', () => {
  it('adding an already-selected node is a no-op, not a toggle-off', () => {
    addToSelection(BOARD_A, N1);
    addToSelection(BOARD_A, N1);
    expect(getSelectedNodeIds(BOARD_A)).toEqual(new Set([N1]));
  });
});

describe('removeFromSelection — "a successful mint clears the minted entries" lifecycle rule', () => {
  it('removes exactly the given NodeIds, leaving everything else selected', () => {
    addToSelection(BOARD_A, N1);
    addToSelection(BOARD_A, N2);
    addToSelection(BOARD_A, N3);
    removeFromSelection(BOARD_A, [N1, N3]);
    expect(getSelectedNodeIds(BOARD_A)).toEqual(new Set([N2]));
  });

  it('is a safe no-op against a board with no selection slot yet', () => {
    expect(() => removeFromSelection(BOARD_A, [N1])).not.toThrow();
    expect(getSelectedNodeIds(BOARD_A).size).toBe(0);
  });

  it('removeFromSelectionOne removes a single id, safe when absent', () => {
    addToSelection(BOARD_A, N1);
    removeFromSelectionOne(BOARD_A, N2); // absent — no-op
    expect(getSelectedNodeIds(BOARD_A)).toEqual(new Set([N1]));
    removeFromSelectionOne(BOARD_A, N1);
    expect(getSelectedNodeIds(BOARD_A).size).toBe(0);
  });
});

describe('clearSelection — board/game switch lifecycle rule', () => {
  it('drops every selected node for the board, leaving other boards untouched', () => {
    addToSelection(BOARD_A, N1);
    addToSelection(BOARD_A, N2);
    addToSelection(BOARD_B, N1);
    clearSelection(BOARD_A);
    expect(getSelectedNodeIds(BOARD_A).size).toBe(0);
    expect(getSelectedNodeIds(BOARD_B)).toEqual(new Set([N1]));
  });
});

describe('board-close / workspace-reset teardown', () => {
  it('board-close drops the slot entirely for the closed board only', () => {
    addToSelection(BOARD_A, N1);
    addToSelection(BOARD_B, N1);
    runBoardCloseHandlers(BOARD_A, [N1]);
    expect(getSelectedNodeIds(BOARD_A).size).toBe(0);
    expect(getSelectedNodeIds(BOARD_B)).toEqual(new Set([N1]));
  });

  it('workspace-reset drops every board\'s selection', () => {
    addToSelection(BOARD_A, N1);
    addToSelection(BOARD_B, N1);
    runWorkspaceResetHandlers();
    expect(getSelectedNodeIds(BOARD_A).size).toBe(0);
    expect(getSelectedNodeIds(BOARD_B).size).toBe(0);
  });
});
