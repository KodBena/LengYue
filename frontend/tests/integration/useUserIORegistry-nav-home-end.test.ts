/**
 * tests/integration/useUserIORegistry-nav-home-end.test.ts
 *
 * Witness for G27 (opus-uiux-geometry-consult.md): "declared Home/End
 * bindings (go to game start/end) are inert." Diagnosis: `nav.home` /
 * `nav.end` (`useNavigation.ts`) and their registry entries
 * (`keybindings-catalog.ts`, defaultKey 'Home' / 'End') were always
 * correctly bound and logically correct — proven directly against
 * `useNavigation` in `tests/integration/useNavigation-can-go.test.ts`'s
 * sibling coverage. The actual defect was upstream, in
 * `useUserIORegistry`'s dispatcher: Home/End are `dispatchMode:
 * 'coalesced'`, and the pre-fix dispatcher deferred EVERY keydown of a
 * coalesced action to the next `requestAnimationFrame` regardless of
 * whether the key was actually being held — a single discrete Home/End
 * tap was silently deferred a full paint frame, with no guarantee
 * anything observing the result synchronously (or on a race with an
 * interleaved keypress) would see it land. The 2026-08-10 fix in
 * `useUserIORegistry.ts` makes every discrete (non-repeat) keydown of
 * a coalesced action fire SYNCHRONOUSLY, closing the same class of gap
 * G25 and G26 hit — this file witnesses Home/End specifically, each at
 * three positions, dispatched through the real keyboard path (not a
 * direct `useNavigation()` call).
 *
 * License: Public Domain (The Unlicense)
 */

import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { useUserIORegistry } from '../../src/composables/useUserIORegistry';
import { store, addBoard, updateBoardState, mutateBoard, resetWorkspace } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { applyGoMove } from '../../src/logic';
import type { BoardId, NodeId } from '../../src/types';

const Harness = defineComponent({
  setup() {
    useUserIORegistry();
    return () => null;
  },
});

let wrapper: VueWrapper | null = null;

/** Build a 10-move mainline, returning the board id and each node id in root-to-leaf order. */
function buildMainline(): { boardId: BoardId; nodeIds: NodeId[] } {
  let board = createInitialBoard();
  addBoard(board);
  const boardId = board.id;
  const nodeIds: NodeId[] = [board.rootNodeId];
  let x = 0, y = 0;
  for (let i = 0; i < 10; i++) {
    const next = applyGoMove(board, x, y);
    if (!next) throw new Error('illegal move in fixture at ' + i);
    board = next;
    nodeIds.push(board.currentNodeId);
    x = (x + 1) % 19;
    if (x === 0) y += 1;
  }
  updateBoardState(store.boards.findIndex(b => b.id === boardId), board);
  return { boardId, nodeIds };
}

function liveCurrentNodeId(boardId: BoardId): NodeId {
  const board = store.boards.find(b => b.id === boardId);
  if (!board) throw new Error('test board missing from store');
  return board.currentNodeId;
}

function setCursor(boardId: BoardId, nodeId: NodeId): void {
  mutateBoard(boardId, draft => { draft.currentNodeId = nodeId; });
}

beforeEach(() => {
  resetWorkspace();
  wrapper = mount(Harness);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('useUserIORegistry — Home/End dispatch (G27 witness)', () => {
  it.each([
    ['game start (root)', 0],
    ['mid-game (move 5)', 5],
    ['game end (move 10)', 10],
  ] as const)('Home from %s jumps to the root, dispatched via the real keydown path', (_label, startIdx) => {
    const { boardId, nodeIds } = buildMainline();
    setCursor(boardId, nodeIds[startIdx]!);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));

    expect(liveCurrentNodeId(boardId)).toBe(nodeIds[0]);
  });

  it.each([
    ['game start (root)', 0],
    ['mid-game (move 5)', 5],
    ['game end (move 10)', 10],
  ] as const)('End from %s jumps to the mainline leaf, dispatched via the real keydown path', (_label, startIdx) => {
    const { boardId, nodeIds } = buildMainline();
    setCursor(boardId, nodeIds[startIdx]!);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));

    expect(liveCurrentNodeId(boardId)).toBe(nodeIds[nodeIds.length - 1]);
  });

  it('Home/End fire synchronously — no rAF is involved for a discrete press', async () => {
    const { vi } = await import('vitest');
    const { boardId, nodeIds } = buildMainline();
    setCursor(boardId, nodeIds[5]!);

    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(rafSpy).not.toHaveBeenCalled();
    expect(liveCurrentNodeId(boardId)).toBe(nodeIds[nodeIds.length - 1]);
    rafSpy.mockRestore();
  });
});
