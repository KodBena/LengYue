/**
 * tests/integration/useNavigation-toggle-memory-cleanup.test.ts
 *
 * Tier-3 (composable / store integration) coverage for the review-nit
 * fix: `useNavigation.ts`'s module-scope `mainLineToggleMemory` Map
 * (the `nav.toggleMainLine` keybinding's per-fork toggle history, see
 * `navigateToggleMainLine` in `src/engine/navigator.ts`) is released
 * on `closeBoard` and on `resetWorkspace`, mirroring
 * `useReviewSession.ts`'s `pendingAnalysisAborts` precedent
 * (`review:abort` / `review:abort-all`). Drives the REAL store
 * (`closeBoard`, `resetWorkspace`, `addBoard`) and the REAL navigator
 * against an SGF-loaded board with a branch — no fakes needed, no
 * network-boundary crossed.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

import { loadSgf } from '../../src/engine/sgf-loader';
import { navigateTo } from '../../src/engine/navigator';
import { resetWorkspace, store, addBoard, closeBoard } from '../../src/store';
import {
  useNavigation,
  clearMainLineToggleMemoryForBoard,
  _mainLineToggleMemoryKeyCountForBoard,
} from '../../src/composables/useNavigation';
import type { BoardState } from '../../src/types';

function boardWithFork(): BoardState {
  return loadSgf(sgf.parse('(;FF[4]GM[1]SZ[19];B[pd](;W[dp])(;W[pp]))'));
}

beforeEach(() => {
  resetWorkspace();
});

describe('mainLineToggleMemory cleanup', () => {
  it('closeBoard drops the closing board\'s toggle-memory entries', () => {
    const board = boardWithFork();
    addBoard(board); // becomes the active board
    const branchPoint = board.nodes[board.rootNodeId].children[0];
    navigateTo(board, board.nodes[branchPoint].children[0]);

    // Populate the module-scope memory via the real dispatch path.
    const nav = useNavigation();
    nav.toggleMainLine();
    expect(_mainLineToggleMemoryKeyCountForBoard(board.id)).toBeGreaterThan(0);

    closeBoard(board.id);

    expect(_mainLineToggleMemoryKeyCountForBoard(board.id)).toBe(0);
  });

  it('closing a DIFFERENT board does not disturb the untouched board\'s entries', () => {
    const boardA = boardWithFork();
    const boardB = boardWithFork();
    addBoard(boardA);
    addBoard(boardB); // active
    const branchA = boardA.nodes[boardA.rootNodeId].children[0];
    const branchB = boardB.nodes[boardB.rootNodeId].children[0];
    navigateTo(boardA, boardA.nodes[branchA].children[0]);
    navigateTo(boardB, boardB.nodes[branchB].children[0]);

    // Populate both boards' memory directly against the real store's
    // board copies via useNavigation (bound to whichever is active).
    const nav = useNavigation();
    // boardB is active from the second addBoard call.
    nav.toggleMainLine();
    expect(_mainLineToggleMemoryKeyCountForBoard(boardB.id)).toBeGreaterThan(0);

    // Switch active board to A and toggle there too.
    store.activeBoardIndex = store.boards.findIndex((b) => b.id === boardA.id);
    nav.toggleMainLine();
    expect(_mainLineToggleMemoryKeyCountForBoard(boardA.id)).toBeGreaterThan(0);

    closeBoard(boardB.id);

    expect(_mainLineToggleMemoryKeyCountForBoard(boardB.id)).toBe(0);
    expect(_mainLineToggleMemoryKeyCountForBoard(boardA.id)).toBeGreaterThan(0);
  });

  it('resetWorkspace clears every board\'s toggle-memory entries (identity flip)', () => {
    const board = boardWithFork();
    addBoard(board);
    const branchPoint = board.nodes[board.rootNodeId].children[0];
    navigateTo(board, board.nodes[branchPoint].children[0]);

    useNavigation().toggleMainLine();
    expect(_mainLineToggleMemoryKeyCountForBoard(board.id)).toBeGreaterThan(0);

    resetWorkspace();

    expect(_mainLineToggleMemoryKeyCountForBoard(board.id)).toBe(0);
  });

  it('clearMainLineToggleMemoryForBoard is idempotent / a no-op with no entries for that board', () => {
    const board = boardWithFork();
    addBoard(board);
    expect(() => clearMainLineToggleMemoryForBoard(board.id)).not.toThrow();
    expect(_mainLineToggleMemoryKeyCountForBoard(board.id)).toBe(0);
  });
});
