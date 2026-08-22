/**
 * tests/integration/usePlayFromPosition-engine-pass.test.ts
 *
 * Witness for ledger item `engine-pass-throw`: when the engine's
 * order-0 recommendation for a turn is a pass, `playEngineMoves` (the
 * pure loop `usePlayFromPosition.start` drives) used to `throw new
 * Error(...)` — `gtpToBoard('pass')` returns `null`, and the pre-fix
 * code treated a null coordinate as a hard failure rather than the
 * real move it is (KataProxy move semantics: a move IS a state
 * transition, and `pass` is one of the vocabulary's members). This is
 * user-reachable via `EngineMatchModal`'s per-player overrides steering
 * the engine toward a pass (`pass-support-review.md` finding 5); the
 * sibling `playEngineMatch` (the match loop `EngineMatchModal` itself
 * drives) carries the identical fix.
 *
 * The fix: a `null` coordinate now applies via `applyPass` instead of
 * throwing, so the loop's turn advances like a placed move would.
 *
 * This test drives the REAL `playEngineMoves` export (via the product
 * composable `usePlayFromPosition`) against a step-driven mock
 * `WebSocket`, mirroring the harness shape in
 * `usePlayFromPosition-cursor-independence.test.ts` (read in full
 * before authoring this file). The first engine turn is scripted to
 * recommend `pass`; the test asserts the run settles with no thrown
 * error, the turn flips, and a real pass node (an SGF-shaped `{ [turn]:
 * [''] }` property, `move.type === 'pass'`) lands as the new child —
 * not merely that the promise resolves.
 *
 * Reverting the fix (restoring the `if (!coords) throw` branches in
 * `usePlayFromPosition.ts`) turns this test red: `player.lastError`
 * becomes the thrown Error and the board never advances — verified by
 * hand before filing.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

import { store, addBoard, resetWorkspace } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { getPath } from '../../src/engine/navigator';
import { usePlayFromPosition } from '../../src/composables/board/usePlayFromPosition';
import type { BoardId, BoardState } from '../../src/types';

/**
 * Step-driven WS stand-in, same shape as the cursor-independence
 * harness: each analysis query is queued, `deliverNext()` releases
 * exactly one final packet so the test can script per-turn moves.
 */
class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static last: MockWebSocket | null = null;

  readyState = MockWebSocket.CLOSED;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  private pending: Array<{ id: string; expectedTurn: number }> = [];

  constructor(public url: string) {
    MockWebSocket.last = this;
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(data: string): void {
    const query = JSON.parse(data) as { id?: string; analyzeTurns?: readonly number[] };
    const turns = query.analyzeTurns;
    if (!Array.isArray(turns) || turns.length === 0) return; // action cmd (terminate, etc.)
    this.pending.push({ id: String(query.id), expectedTurn: turns[0] });
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  /** Release the oldest pending query's final packet with the given recommended move. */
  deliverNext(move: string): boolean {
    const next = this.pending.shift();
    if (!next) return false;
    this.onmessage?.({
      data: JSON.stringify({
        id: next.id,
        turnNumber: next.expectedTurn,
        isDuringSearch: false,
        moveInfos: [{ order: 0, move, visits: 100 }],
        rootInfo: { currentPlayer: 'B', visits: 100, winrate: 0.5, scoreLead: 0 },
      }),
    });
    return true;
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: 'mock-close' });
  }
}

const KATAGO_URL = 'ws://mock';

async function waitForPending(ws: MockWebSocket): Promise<void> {
  for (let g = 0; g < 50 && !ws.hasPending(); g++) await flushPromises();
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
  MockWebSocket.last = null;
  resetWorkspace();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePlayFromPosition — engine-recommended pass (engine-pass-throw)', () => {
  it('applies the pass instead of throwing: turn flips, a real pass node lands, no lastError', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;
    const rootId = board.currentNodeId;
    const startTurn = board.turn;

    const player = usePlayFromPosition(ref<BoardId | null>(boardId));
    const liveBoard = (): BoardState => store.boards.find((b) => b.id === boardId)!;

    // Stop after one move: root + 1 pass → path length 2.
    const runPromise = player.start({
      katagoUrl: KATAGO_URL,
      untilPathLength: 2,
      maxVisits: 100,
    });
    onTestFinished(async () => { await runPromise.catch(() => { /* settled */ }); });

    await flushPromises(); // connection opens
    const ws = MockWebSocket.last!;

    await waitForPending(ws);
    expect(ws.deliverNext('pass')).toBe(true);
    await flushPromises();

    await runPromise;
    await flushPromises();

    // No thrown error surfaced through the composable's reactive state.
    expect(player.lastError.value).toBeNull();
    expect(player.isRunning.value).toBe(false);

    // The board actually advanced past root — a real move landed.
    const after = liveBoard();
    expect(getPath(after.nodes, after.currentNodeId).length).toBe(2);
    expect(after.currentNodeId).not.toBe(rootId);

    // The new node is a genuine pass: SGF-shaped `{ [turn]: [''] }`
    // property (per `applyPass` in src/logic.ts) and a `move.type ===
    // 'pass'` for the color that was to move.
    const passNode = after.nodes[after.currentNodeId];
    expect(passNode.move?.type).toBe('pass');
    expect(passNode.move?.color).toBe(startTurn);
    expect(passNode.properties[startTurn]).toEqual(['']);

    // The turn flipped to the other color — a real state transition,
    // not a no-op.
    expect(after.turn).not.toBe(startTurn);
  });
});
