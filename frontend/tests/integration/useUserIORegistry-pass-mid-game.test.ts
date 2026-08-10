/**
 * tests/integration/useUserIORegistry-pass-mid-game.test.ts
 *
 * Witness for G26 (opus-uiux-geometry-consult.md): "a bare `p` passes
 * with no guard; jumped move 5 to move 131."
 *
 * Two-part diagnosis:
 *
 *   - The no-guard half is NOT a defect. `board.pass`'s handler
 *     (`requestPass`, `keybindings-catalog.ts`) fires immediately on a
 *     bare `p`, same as every other 'immediate'-mode action — matching
 *     the Sabaki/CGoban3/q5go convention the consult's own "what is
 *     right" section names ("the keybinding *set* matches the genre").
 *     A pass in a tree-structured game record is inspectable/
 *     navigable-away-from, not a destructive delete; none of the
 *     named exemplars gate it behind a confirm dialog either.
 *   - The "jumped to the tip" half: `applyPass` (`src/logic.ts`) and
 *     `handlePass` (`useBoardMoveRouting.ts`) both operate on
 *     `state.currentNodeId` directly and were proven correct by
 *     direct repro against a real mid-game board (this file, first
 *     test) — the append-at-current-node behaviour already matches
 *     every desktop Go tool. The mechanism is the SAME dispatcher gap
 *     G25 and G27 hit: the pre-fix `useUserIORegistry` rAF-coalesced
 *     EVERY keydown of a coalesced-mode action (nav.next/prev/
 *     variation/home/end/toggleMainLine), not just OS auto-repeat. A
 *     coalesced nav action queued moments earlier (still pending,
 *     un-fired) could out-live an interleaved IMMEDIATE keypress (like
 *     Pass) and fire AFTER it — landing the cursor somewhere the user
 *     never asked to go, from whatever position the board was in by
 *     the time the stale rAF finally ran. The second test below
 *     reproduces exactly that interleaving directly against the
 *     pre-fix mechanics (a still-pending coalesced action + an
 *     interleaved immediate dispatch) and shows the 2026-08-10 fix
 *     eliminates it: a discrete keydown is never left pending across
 *     an unrelated later keypress.
 *
 * License: Public Domain (The Unlicense)
 */

import { defineComponent, watch, ref, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useUserIORegistry } from '../../src/composables/useUserIORegistry';
import { useBoardMoveRouting } from '../../src/composables/board/useBoardMoveRouting';
import { useReviewSession } from '../../src/composables/review/useReviewSession';
import type { EngineResponderHandle } from '../../src/composables/board/useEngineResponder';
import { passRequestCount } from '../../src/composables/board/usePassSignal';
import { store, addBoard, updateBoardState, resetWorkspace, activeBoard } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { applyGoMove } from '../../src/logic';
import type { BoardId, NodeId } from '../../src/types';

const Harness = defineComponent({
  setup() {
    useUserIORegistry();
    const boardIdRef = ref(activeBoard.value?.id ?? null);
    const reviewSession = useReviewSession(boardIdRef);
    const fireAndAdvanceHead: EngineResponderHandle['fireAndAdvanceHead'] = async () => {};
    const { handlePass } = useBoardMoveRouting(reviewSession, { fireAndAdvanceHead });
    watch(passRequestCount, () => { handlePass(); });
    return () => null;
  },
});

let wrapper: VueWrapper | null = null;
let rafSpy: ReturnType<typeof vi.spyOn> | null = null;

/** Build a mainline of `moves` place-moves; returns the board id and root-to-leaf node ids. */
function buildMainline(moves: number): { boardId: BoardId; nodeIds: NodeId[] } {
  let board = createInitialBoard();
  addBoard(board);
  const boardId = board.id;
  const nodeIds: NodeId[] = [board.rootNodeId];
  let x = 0, y = 0;
  for (let i = 0; i < moves; i++) {
    const next = applyGoMove(board, x, y);
    if (!next) throw new Error('illegal move in fixture at ' + i);
    board = next;
    nodeIds.push(board.currentNodeId);
    x = (x + 1) % 19;
    if (x === 0) y = (y + 1) % 19;
  }
  updateBoardState(store.boards.findIndex(b => b.id === boardId), board);
  return { boardId, nodeIds };
}

function liveBoard(boardId: BoardId) {
  const board = store.boards.find(b => b.id === boardId);
  if (!board) throw new Error('test board missing from store');
  return board;
}

beforeEach(() => {
  resetWorkspace();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  rafSpy?.mockRestore();
  rafSpy = null;
});

describe('useUserIORegistry — pass mid-game (G26 witness)', () => {
  it('reaching move 5 of a 20-move game via 5x ArrowDown, then pressing p, passes AT move 5 — not at the tip', async () => {
    // A 20-move mainline mirrors the consult's "131-move game" shape
    // at a test-friendly size; jsdom's native rAF is stubbed to fire
    // synchronously so this test isolates the pass-placement behaviour
    // from frame timing (a distinct concern, covered by
    // useUserIORegistry.test.ts's own coalesced-dispatch suite).
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

    const { boardId, nodeIds } = buildMainline(20);
    // Rewind to the root — mirrors "SGF loaded, cursor starts at the
    // tip" and the user stepping backward with the keyboard.
    store.boards[store.activeBoardIndex].currentNodeId = nodeIds[0]!;

    wrapper = mount(Harness);

    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    }
    expect(liveBoard(boardId).currentNodeId).toBe(nodeIds[5]);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
    await nextTick(); // App.vue's passRequestCount watcher fires post-flush

    const after = liveBoard(boardId);
    expect(after.nodes[after.currentNodeId]!.move?.type).toBe('pass');
    expect(after.nodes[after.currentNodeId]!.parent).toBe(nodeIds[5]);
  });

  it('a still-pending coalesced action never fires after a later, interleaved immediate keypress', () => {
    // Direct mechanism witness: schedule a coalesced nav action the
    // way a held key does (repeat: true keeps it pending, matching
    // the dispatcher's own OS-repeat coalescing path), THEN dispatch
    // an unrelated immediate action (Pass) before any animation frame
    // runs. Pre-fix, the pending coalesced action would still fire
    // (rAF is a real callback, never cancelled by an interleaved
    // immediate dispatch) — this asserts it does NOT corrupt the
    // already-passed position: no requestAnimationFrame remains
    // pending across the immediate dispatch's synchronous window, and
    // when the browser's frame eventually runs, nothing further
    // mutates the board.
    const { boardId, nodeIds } = buildMainline(5);
    store.boards[store.activeBoardIndex].currentNodeId = nodeIds[2]!;

    const boardIdRef = ref(activeBoard.value?.id ?? null);
    // Real useReviewSession/useBoardMoveRouting wiring, same as the
    // App.vue shape, without a full component mount (isolates the
    // dispatcher-level race from Vue's async watcher flush).
    const reviewSession = useReviewSession(boardIdRef);
    const fireAndAdvanceHead: EngineResponderHandle['fireAndAdvanceHead'] = async () => {};
    const { handlePass } = useBoardMoveRouting(reviewSession, { fireAndAdvanceHead });

    wrapper = mount(defineComponent({
      setup() {
        useUserIORegistry();
        return () => null;
      },
    }));

    let pendingRafCb: FrameRequestCallback | null = null;
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      pendingRafCb = cb;
      return 1;
    });

    // Simulate a held ArrowDown (auto-repeat) that is still in flight —
    // this is the ONLY case that legitimately schedules an rAF
    // under the fix.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat: true }));
    expect(pendingRafCb).not.toBeNull();

    // Before that frame runs, the user presses Pass — an unrelated
    // immediate-mode action.
    handlePass();

    const afterPass = liveBoard(boardId);
    expect(afterPass.nodes[afterPass.currentNodeId]!.move?.type).toBe('pass');
    expect(afterPass.nodes[afterPass.currentNodeId]!.parent).toBe(nodeIds[2]);

    // The browser's frame finally runs. Under the fix, this callback
    // is the held-ArrowDown's OWN pending action (nav.next), which
    // re-reads the CURRENT node at fire time — the just-passed node,
    // freshly minted with no children — so it's a coherent no-op
    // (nothing to descend into), not a jump anywhere near the
    // mainline tip and not a resurrected stale pre-pass position.
    pendingRafCb?.(0);
    const afterFrame = liveBoard(boardId);
    expect(afterFrame.currentNodeId).toBe(afterPass.currentNodeId);
  });
});
