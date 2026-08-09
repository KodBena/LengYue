/**
 * tests/integration/ToolbarMoveNav.test.ts
 *
 * Resolution roadmap Phase 3 + S7 rider (commissioner-adjudicated,
 * ledger rows 929/926): component-level coverage for the move-
 * navigation toolbar cluster — first/prev/next/last buttons dispatch
 * the SAME `useNavigation()` actions the existing Home/ArrowUp/
 * ArrowDown/End keybindings already call (`keybindings-catalog.ts`),
 * and disable at the start/end of the active line exactly where
 * `useNavigation-can-go.test.ts` pins `canGoPrev`/`canGoNext`.
 *
 * Mounts the real component against the real store (same
 * `addBoard`/`resetWorkspace` pattern as
 * `useNavigation-toggle-memory-cleanup.test.ts`) — no fakes, no
 * network boundary crossed; `ToolbarMoveNav.vue` has no service
 * dependency of its own.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

import { i18n } from '../../src/i18n';
import { loadSgf } from '../../src/engine/sgf-loader';
import { navigateTo } from '../../src/engine/navigator';
import { resetWorkspace, addBoard } from '../../src/store';
import ToolbarMoveNav from '../../src/components/chrome/ToolbarMoveNav.vue';
import type { BoardState } from '../../src/types';

function boardWithFork(): BoardState {
  return loadSgf(sgf.parse('(;FF[4]GM[1]SZ[19];B[pd](;W[dp])(;W[pp]))'));
}

function mountNav() {
  return mount(ToolbarMoveNav, { global: { plugins: [i18n] } });
}

beforeEach(() => {
  resetWorkspace();
});

describe('ToolbarMoveNav — genre move-navigation cluster (|< < > >|)', () => {
  it('renders exactly four buttons: first, prev, next, last', () => {
    const wrapper = mountNav();
    expect(wrapper.findAll('button')).toHaveLength(4);
  });

  it('with no active board, all four buttons are disabled', () => {
    const wrapper = mountNav();
    for (const btn of wrapper.findAll('button')) {
      expect(btn.attributes('disabled')).toBeDefined();
    }
  });

  it('at the root of an active board: first/prev disabled, next/last enabled', () => {
    addBoard(boardWithFork());
    const wrapper = mountNav();
    const [first, prev, next, last] = wrapper.findAll('button');
    expect(first.attributes('disabled')).toBeDefined();
    expect(prev.attributes('disabled')).toBeDefined();
    expect(next.attributes('disabled')).toBeUndefined();
    expect(last.attributes('disabled')).toBeUndefined();
  });

  it('at a leaf of the active line: first/prev enabled, next/last disabled', () => {
    const board = boardWithFork();
    addBoard(board);
    const branchPoint = board.nodes[board.rootNodeId].children[0];
    navigateTo(board, board.nodes[branchPoint].children[0]);

    const wrapper = mountNav();
    const [first, prev, next, last] = wrapper.findAll('button');
    expect(first.attributes('disabled')).toBeUndefined();
    expect(prev.attributes('disabled')).toBeUndefined();
    expect(next.attributes('disabled')).toBeDefined();
    expect(last.attributes('disabled')).toBeDefined();
  });

  it('clicking next/prev/first/last dispatches the SAME board navigation the keybindings use', async () => {
    const board = boardWithFork();
    addBoard(board);
    const branchPoint = board.nodes[board.rootNodeId].children[0];
    const leaf = board.nodes[branchPoint].children[0];

    const wrapper = mountNav();
    const [first, prev, next, last] = wrapper.findAll('button');

    await next.trigger('click'); // root -> branch point
    expect(board.currentNodeId).toBe(branchPoint);

    await next.trigger('click'); // branch point -> leaf (default first child)
    expect(board.currentNodeId).toBe(leaf);

    await prev.trigger('click'); // leaf -> branch point
    expect(board.currentNodeId).toBe(branchPoint);

    await last.trigger('click'); // -> leaf of the active line
    expect(board.currentNodeId).toBe(leaf);

    await first.trigger('click'); // -> root
    expect(board.currentNodeId).toBe(board.rootNodeId);
  });
});
