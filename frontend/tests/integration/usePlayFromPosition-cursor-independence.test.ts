/**
 * tests/integration/usePlayFromPosition-cursor-independence.test.ts
 *
 * Tier-3 (composable integration) tests for the cursor-conflation twin
 * fix in `playEngineMoves` / `usePlayFromPosition`
 * (work-status item `playenginemoves-cursor-conflation-twin`).
 *
 * The bug (structurally identical to the 2026-05-16 match-cursor arc,
 * fixed there for `playEngineMatch` first): the single-engine self-play
 * loop aliased the user-visible cursor. The product consumer
 * (`usePlayFromPosition.start`) passed the reactive store board
 * straight into `playEngineMoves` and mirrored each applied board back
 * WHOLESALE via `updateBoardState`. Because `updateBoardState`
 * re-converges object identity (`store.boards[i]` becomes the loop's
 * own object), a deep clone at the top of the loop alone was
 * insufficient — the store and the loop re-shared one object graph
 * after the first mirror. From then on, any user navigation mid-run
 * mutated the loop's cursor in place through the shared reference, and
 * the next engine query went out from where the user had navigated to,
 * not from where the loop was playing.
 *
 * The fix is the match's delta-emission contract applied to
 * `playEngineMoves`: the loop deep-clones `startBoard` and emits an
 * `EngineMoveApplied` delta per move; the consumer does a surgical
 * `mutateBoard` merge that appends the new child (or bumps
 * `activeChildIndex` on existing-child reuse) and follows the user's
 * view only when they were tracking.
 *
 * These tests drive the REAL `playEngineMoves` pure export against a
 * mock global `WebSocket` (the `vi.stubGlobal('WebSocket', …)` shape of
 * `analysis-service-error-packet-narrowing.test.ts`). The mock is
 * STEP-DRIVEN: each analysis query enqueues a pending response that the
 * test releases one move at a time via `deliverNext()`. This gives the
 * mid-run test a genuine suspended point at which to navigate — a
 * mock that auto-answered every query would run the whole loop to
 * completion inside a single `flushPromises()`, so the "mid-run"
 * navigation would land AFTER the loop finished and the test would pass
 * for the wrong reason (verified: it does not fail when the
 * user-tracking gate is removed). Step-driving is the load-bearing
 * shape.
 *
 * The recommended move per turn is a fixed, spaced-out, always-legal
 * GTP coordinate keyed on the turn index, so the loop advances
 * deterministically without a real proxy.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

import {
  store,
  addBoard,
  resetWorkspace,
  mutateBoard,
} from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { navigateTo, getPath } from '../../src/engine/navigator';
import {
  playEngineMoves,
  usePlayFromPosition,
} from '../../src/composables/board/usePlayFromPosition';
import type { BoardId, BoardState, NodeId } from '../../src/types';

// ── Mock WebSocket ──────────────────────────────────────────────────────────
//
// GTP column letters skip 'I'. Spaced columns (0, 2, 4, …) keep
// successive stones non-adjacent so no capture / suicide makes a move
// illegal across the short runs these tests drive.
const GTP_ALPHABET = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

/** A legal, distinct GTP point for `turn` — column 2*turn, row 1. */
function gtpForTurn(turn: number): string {
  const col = (turn * 2) % GTP_ALPHABET.length;
  return `${GTP_ALPHABET[col]}1`;
}

interface SentQuery {
  readonly id?: string;
  readonly analyzeTurns?: readonly number[];
  readonly [k: string]: unknown;
}

/**
 * Step-driven WS stand-in for the browser `WebSocket` the real
 * `KataGoClient` constructs. Opens on the next microtask (the client
 * sets `onopen` after `new WebSocket(...)` returns, so a synchronous
 * open would miss the handler). Each analysis query (`analyzeTurns`
 * present) is recorded as a pending response; `deliverNext()` releases
 * exactly one, letting the test pace the loop move-by-move.
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

  readonly sent: SentQuery[] = [];
  private pending: Array<{ id: string; expectedTurn: number }> = [];

  constructor(public url: string) {
    MockWebSocket.last = this;
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(data: string): void {
    const query = JSON.parse(data) as SentQuery;
    this.sent.push(query);
    const turns = query.analyzeTurns;
    if (!Array.isArray(turns) || turns.length === 0) return; // action cmd
    this.pending.push({ id: String(query.id), expectedTurn: turns[0] });
  }

  /** True while a query is in flight awaiting its final packet. */
  hasPending(): boolean {
    return this.pending.length > 0;
  }

  /**
   * Release the oldest pending query's final packet (order-0 move for
   * its turn). Returns false when nothing is pending. The test awaits
   * `flushPromises()` afterward to let the loop apply the move and
   * issue its next query.
   */
  deliverNext(): boolean {
    const next = this.pending.shift();
    if (!next) return false;
    this.onmessage?.({
      data: JSON.stringify({
        id: next.id,
        turnNumber: next.expectedTurn,
        isDuringSearch: false,
        moveInfos: [{ order: 0, move: gtpForTurn(next.expectedTurn), visits: 100 }],
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

/**
 * Drive the loop one engine move at a time: wait until a query is
 * pending (or already delivered enough), release it, and flush so the
 * move applies and the next query is issued. Bounded so a stalled loop
 * fails loudly rather than hanging.
 */
async function pumpMoves(ws: MockWebSocket, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    // Wait for the loop to issue its next query.
    for (let g = 0; g < 50 && !ws.hasPending(); g++) await flushPromises();
    if (!ws.deliverNext()) {
      throw new Error(`pumpMoves: no pending query at move ${i} (loop stalled or finished early)`);
    }
    await flushPromises();
  }
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
  MockWebSocket.last = null;
  resetWorkspace();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('playEngineMoves cursor independence (pure level)', () => {
  it('does not mutate the caller-held startBoard while the loop advances', async () => {
    const startBoard = createInitialBoard();
    const startRoot = startBoard.currentNodeId;
    const startNodeCount = Object.keys(startBoard.nodes).length;

    // Drive 3 engine moves (root + 3 → path length 4). No
    // `onMoveApplied`: the pure caller reads only the return value.
    const runPromise = playEngineMoves({
      katagoUrl: KATAGO_URL,
      startBoard,
      untilPathLength: 4,
      maxVisits: 100,
    });
    onTestFinished(async () => { await runPromise.catch(() => { /* settled */ }); });

    // Let the connection open, then pump three moves.
    await flushPromises();
    const ws = MockWebSocket.last!;
    await pumpMoves(ws, 3);
    const finalBoard = await runPromise;

    // The returned board advanced past the start.
    expect(getPath(finalBoard.nodes, finalBoard.currentNodeId).length).toBe(4);

    // The caller's own object is untouched — cursor and node set are
    // exactly as handed in. (A loop that aliased its argument would
    // have walked this cursor forward and grown this node map.)
    expect(startBoard.currentNodeId).toBe(startRoot);
    expect(Object.keys(startBoard.nodes).length).toBe(startNodeCount);
    expect(finalBoard).not.toBe(startBoard);
  });
});

describe('usePlayFromPosition cursor independence (product level)', () => {
  it('leaves the user where they navigated mid-run; the engine line extends past them', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;
    const rootId = board.currentNodeId;

    const player = usePlayFromPosition(ref<BoardId | null>(boardId));
    const liveBoard = (): BoardState => store.boards.find(b => b.id === boardId)!;

    // Start a 6-move run. Do NOT await it — we interrupt mid-run.
    // Register the promise for end-of-test settling so a leaked loop
    // can't bleed an `onMoveApplied` throw into the next test
    // (failure-safe teardown).
    const runPromise = player.start({
      katagoUrl: KATAGO_URL,
      untilPathLength: 7,
      maxVisits: 100,
    });
    onTestFinished(async () => { await runPromise.catch(() => { /* settled */ }); });

    await flushPromises(); // connection opens
    const ws = MockWebSocket.last!;

    // Pump exactly two engine moves into the store — a genuine mid-run
    // point (the loop is now suspended awaiting its third query, which
    // it has NOT issued yet because the test holds the pacing).
    await pumpMoves(ws, 2);
    expect(Object.keys(liveBoard().nodes).length).toBe(3); // root + 2 moves

    // The user has been tracking so far (gate fired each move): their
    // cursor sits at the loop's leaf, two plies deep.
    const trackedLeaf = liveBoard().currentNodeId;
    expect(trackedLeaf).not.toBe(rootId);

    // User navigates back to root mid-run — genuinely while the loop is
    // suspended between moves.
    mutateBoard(boardId, (draft) => {
      navigateTo(draft, rootId);
    });
    expect(liveBoard().currentNodeId).toBe(rootId);

    // Let the loop finish its remaining moves.
    await pumpMoves(ws, 4);
    await runPromise;
    await flushPromises();

    // The user is STILL at root — the engine's subsequent moves did NOT
    // snap their view forward. With the conflation (or an unconditional
    // navigate), the loop's cursor would have re-aliased the store
    // cursor and dragged the user along to the loop's leaf.
    expect(liveBoard().currentNodeId).toBe(rootId);

    // And the engine line kept extending in the store past where the
    // user is sitting: the full self-play line reached path length 7
    // (root + 6 moves) on the loop's own variation, which descends from
    // the node the user had tracked to before navigating away.
    const finalBoard = liveBoard();
    let leaf: NodeId = finalBoard.rootNodeId;
    let node = finalBoard.nodes[leaf];
    while (node && node.children.length > 0) {
      leaf = node.children[node.activeChildIndex] ?? node.children[0];
      node = finalBoard.nodes[leaf];
    }
    expect(getPath(finalBoard.nodes, leaf).length).toBe(7);
    // The deep line passes through the node the user had tracked to —
    // the loop kept playing from its own cursor, not from root.
    expect(getPath(finalBoard.nodes, leaf)).toContain(trackedLeaf);

    expect(player.isRunning.value).toBe(false);
    expect(player.lastError.value).toBeNull();
  });

  it('follows the user forward when they are tracking the loop', async () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;

    const player = usePlayFromPosition(ref<BoardId | null>(boardId));
    const liveBoard = (): BoardState => store.boards.find(b => b.id === boardId)!;

    // No mid-run navigation: the user starts at root, which is the node
    // the first move plays from, so the tracking gate fires and the
    // view follows each move forward — the case-1 (no-navigation)
    // behaviour the match arc preserves.
    const runPromise = player.start({
      katagoUrl: KATAGO_URL,
      untilPathLength: 4,
      maxVisits: 100,
    });
    onTestFinished(async () => { await runPromise.catch(() => { /* settled */ }); });

    await flushPromises();
    const ws = MockWebSocket.last!;
    await pumpMoves(ws, 3);
    await runPromise;
    await flushPromises();

    // The user's cursor tracked all the way to the engine line's leaf.
    expect(liveBoard().nodes[liveBoard().currentNodeId].children.length).toBe(0);
    expect(getPath(liveBoard().nodes, liveBoard().currentNodeId).length).toBe(4);

    expect(player.isRunning.value).toBe(false);
    expect(player.lastError.value).toBeNull();
  });
});
