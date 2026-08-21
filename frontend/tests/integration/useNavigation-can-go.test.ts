/**
 * tests/integration/useNavigation-can-go.test.ts
 *
 * Resolution roadmap Phase 3 + S7 rider (ledger rows 929/926):
 * `useNavigation.ts`'s `canGoPrev`/`canGoNext` computeds — the
 * disabled-state signal the new move-navigation toolbar cluster
 * (`ToolbarMoveNav.vue`) reads. Drives the REAL store (`addBoard`,
 * `resetWorkspace`) and the real navigator against an SGF-loaded board
 * with a branch — same pattern as
 * `useNavigation-toggle-memory-cleanup.test.ts`, no fakes needed, no
 * network boundary crossed.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

import { loadSgf } from '../../src/engine/sgf-loader';
import { navigateTo } from '../../src/engine/navigator';
import { resetWorkspace, addBoard } from '../../src/store';
import { useNavigation } from '../../src/composables/useNavigation';
import type { BoardState } from '../../src/types';

function boardWithFork(): BoardState {
  return loadSgf(sgf.parse('(;FF[4]GM[1]SZ[19];B[pd](;W[dp])(;W[pp]))'));
}

beforeEach(() => {
  resetWorkspace();
});

describe('useNavigation — canGoPrev / canGoNext (move-nav disabled state)', () => {
  it('both are false with no active board', () => {
    const nav = useNavigation();
    expect(nav.canGoPrev.value).toBe(false);
    expect(nav.canGoNext.value).toBe(false);
  });

  it('at the root node: canGoPrev is false (no parent), canGoNext is true (has children)', () => {
    const board = boardWithFork();
    addBoard(board);
    const nav = useNavigation();
    expect(nav.canGoPrev.value).toBe(false);
    expect(nav.canGoNext.value).toBe(true);
  });

  it('mid-game: both true (has a parent and has children)', () => {
    const board = boardWithFork();
    addBoard(board);
    const branchPoint = board.nodes[board.rootNodeId].children[0];
    navigateTo(board, branchPoint);
    const nav = useNavigation();
    expect(nav.canGoPrev.value).toBe(true);
    expect(nav.canGoNext.value).toBe(true);
  });

  it('at a leaf (end of the active line): canGoNext is false, canGoPrev is true', () => {
    const board = boardWithFork();
    addBoard(board);
    const branchPoint = board.nodes[board.rootNodeId].children[0];
    const leaf = board.nodes[branchPoint].children[0];
    navigateTo(board, leaf);
    const nav = useNavigation();
    expect(nav.canGoPrev.value).toBe(true);
    expect(nav.canGoNext.value).toBe(false);
  });

  it('nav.prev()/nav.next() actually move the cursor when enabled, and canGo* track the new position', () => {
    const board = boardWithFork();
    addBoard(board);
    const nav = useNavigation();
    expect(nav.canGoPrev.value).toBe(false);

    nav.next(); // root -> branch point
    expect(nav.canGoPrev.value).toBe(true);
    expect(nav.canGoNext.value).toBe(true);

    nav.next(); // branch point -> a leaf (first child by default)
    expect(nav.canGoNext.value).toBe(false);

    nav.prev(); // leaf -> branch point
    expect(nav.canGoNext.value).toBe(true);
  });

  it('nav.home()/nav.end() land at the ends of the active path, matching canGoPrev/canGoNext', () => {
    const board = boardWithFork();
    addBoard(board);
    const branchPoint = board.nodes[board.rootNodeId].children[0];
    const leaf = board.nodes[branchPoint].children[0];
    navigateTo(board, leaf);

    const nav = useNavigation();
    nav.home();
    expect(nav.canGoPrev.value).toBe(false);
    expect(nav.canGoNext.value).toBe(true);

    nav.end();
    expect(nav.canGoPrev.value).toBe(true);
    expect(nav.canGoNext.value).toBe(false);
  });
});
