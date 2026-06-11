/**
 * tests/integration/analysis-service-restart-thunk.test.ts
 *
 * Tier-3 (service integration) tests for the restart-thunk in-flight
 * semantics in `AnalysisService` (work-status item
 * `restart-thunk-inflight-semantics`).
 *
 * The maintainer decision (2026-06-10): "active" — the set
 * `restartActiveAnalyses` re-issues — means IN-FLIGHT, not "every
 * query not explicitly stopped". `onAnalysisUpdate` reaps a query's
 * restart thunk once every analyzed turn has settled
 * (`isDuringSearch === false`), so a completed query is not re-issued
 * on a later toolbar-view toggle or post-reconnect restart. A query
 * still in flight at disconnect IS restarted, because the bookkeeping
 * maps (and the un-reaped thunk) deliberately survive the reconnect
 * (the O15 reconcile-on-next-interaction decision).
 *
 * These tests drive the REAL `analysisService` singleton against a
 * mock `WebSocket` — not the spy-backed fake the composable-tier tests
 * use, because the behaviour under test (the reap) lives inside the
 * real service's per-query bookkeeping. The mock WebSocket captures
 * the queries the service sends (so we can count re-issues) and lets
 * the test inject response packets by id (so we can drive a query to
 * natural completion). jsdom's native WebSocket wrapper is replaced
 * wholesale via `vi.stubGlobal`, so the documented jsdom IDL-onopen
 * defect (which the e2e harness escapes with a node env) does not
 * apply here — there is no real socket.
 *
 * Fake timers gate the service's metrics / watchdog `setInterval`s:
 * the watchdog awaits a `query_version` `sendCommand` the mock never
 * answers, so we never advance timers past registration; `disconnect`
 * in teardown clears them.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

// Persistence service is mocked to keep `resetWorkspace` (and the
// per-final `markDirty` the analyze path fires) quiet — out of scope
// for the restart-thunk behaviour, same posture as the other
// integration tests in this tree.
vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, resetWorkspace, store } from '../../src/store';
import { analysisService } from '../../src/services/analysis-service';
import { getActiveVariationPath } from '../../src/engine/util';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId, BoardState, KataAnalysisResponse, RootedPath } from '../../src/types';

// ── Mock WebSocket ──────────────────────────────────────────────────────────
//
// Minimal stand-in for the browser WebSocket the real KataGoClient
// constructs. Records every JSON the service sends (the `sent` array)
// and exposes `inject` so a test can deliver a response packet to the
// service's id-keyed subscriber. `readyState` starts OPEN so the
// service's `sendRaw` guard (`readyState !== WebSocket.OPEN`) passes
// without needing an async open handshake — `markEngineConnected` is
// synchronous in `connect()` anyway.

interface SentQuery {
  readonly id?: string;
  readonly action?: string;
  readonly analyzeTurns?: readonly number[];
  readonly [k: string]: unknown;
}

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static last: MockWebSocket | null = null;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  readonly sent: SentQuery[] = [];

  constructor(public url: string) {
    MockWebSocket.last = this;
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as SentQuery);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: 'mock-close' });
  }

  /** Deliver a raw response object to the id-keyed subscriber. */
  inject(packet: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(packet) });
  }

  /** Queries the service sent as analysis subscriptions (not action
   *  commands like terminate / query_version). Discriminated by the
   *  presence of `analyzeTurns`. */
  analysisQueries(): SentQuery[] {
    return this.sent.filter(q => Array.isArray(q.analyzeTurns));
  }
}

// A `range-…` query reports on turns [startTurn .. endTurn]; this
// helper synthesises the authoritative final packet for one turn so a
// test can drive a query to natural completion turn-by-turn.
function finalPacketFor(queryId: string, turnNumber: number): KataAnalysisResponse {
  return {
    id: queryId,
    turnNumber,
    isDuringSearch: false,
    moveInfos: [],
    rootInfo: {
      currentPlayer: 'B',
      visits: 100,
      winrate: 0.5,
      scoreLead: 0,
      scoreSelfplay: 0,
      scoreStdev: 0,
    },
  } as unknown as KataAnalysisResponse;
}

function setupBoard(source: string): BoardId {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  return board.id;
}

/** The board's active variation path (root→leaf) as a RootedPath —
 *  the shape `analyzeRange` accepts. */
function activePath(boardId: BoardId): RootedPath {
  const board: BoardState = store.boards.find(b => b.id === boardId)!;
  return getActiveVariationPath(board);
}

// A 3-move game: root + B[pd] + W[dp] + B[pp] → 4 path entries
// (turns 0..3). Enough turns for a multi-turn range query.
const SGF = '(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', MockWebSocket);
  MockWebSocket.last = null;
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
  // Connect the real service against the mock socket. `connect` sets
  // status='connected' synchronously (markEngineConnected) and starts
  // the metrics / watchdog timers (gated by the fake clock).
  analysisService.connect('ws://mock');
});

afterEach(() => {
  // Release every per-board query and tear the transport down so the
  // singleton carries no state into the next test (the maps and the
  // mock socket would otherwise leak across cases). `disconnect`
  // clears the metrics / watchdog timers.
  analysisService.stopAllBoardAnalyses();
  analysisService.disconnect();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AnalysisService restart-thunk in-flight semantics', () => {
  it('does NOT re-issue a query that completed naturally', () => {
    const boardId = setupBoard(SGF);
    const ws = MockWebSocket.last!;

    // Range over turns 1..3 (3 analyzed turns). isRealtime=false so
    // the wire query is a single deterministic submission.
    const queryId = analysisService.analyzeRange(
      boardId, activePath(boardId), 1, 3, 100, undefined, undefined, false, false,
    );
    expect(queryId).not.toBeNull();

    expect(ws.analysisQueries()).toHaveLength(1);
    const analyzed = ws.analysisQueries()[0].analyzeTurns!;
    expect(analyzed).toEqual([1, 2, 3]);

    // Drive every analyzed turn to its authoritative final → natural
    // completion → the restart thunk is reaped.
    for (const turn of analyzed) {
      ws.inject(finalPacketFor(queryId!, turn));
    }

    // A toolbar-view toggle fires restartActiveAnalyses. The completed
    // query must NOT re-issue: no second analysis query on the wire.
    analysisService.restartActiveAnalyses();
    expect(ws.analysisQueries()).toHaveLength(1);
  });

  it('DOES re-issue a query still in flight when a toolbar toggle fires', () => {
    const boardId = setupBoard(SGF);
    const ws = MockWebSocket.last!;
    const fullPath = activePath(boardId);

    const queryId = analysisService.analyzeRange(boardId, fullPath, 1, 3, 100, undefined, undefined, false, false);
    expect(queryId).not.toBeNull();
    expect(ws.analysisQueries()).toHaveLength(1);

    // Finalize only 2 of the 3 turns — the query is still in flight.
    ws.inject(finalPacketFor(queryId!, 1));
    ws.inject(finalPacketFor(queryId!, 2));

    // Toolbar toggle → the in-flight query re-issues (self-stop +
    // fresh submission), so a second analysis query hits the wire.
    analysisService.restartActiveAnalyses();
    expect(ws.analysisQueries().length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT restart a query that completed before a disconnect+reconnect', () => {
    const boardId = setupBoard(SGF);
    const ws = MockWebSocket.last!;
    const fullPath = activePath(boardId);

    const queryId = analysisService.analyzeRange(boardId, fullPath, 1, 3, 100, undefined, undefined, false, false);
    expect(ws.analysisQueries()).toHaveLength(1);

    // Complete the query naturally BEFORE the drop.
    for (const turn of [1, 2, 3]) ws.inject(finalPacketFor(queryId!, turn));

    // WS drops. The bookkeeping maps deliberately survive (O15), but
    // the restart thunk was already reaped on completion.
    ws.onclose?.({ code: 1006, reason: 'mock-drop' });
    expect(store.engine.status).toBe('disconnected');

    // Reconnect, then a toolbar toggle. A completed-pre-disconnect
    // query must NOT resurrect — the reap already removed its thunk.
    analysisService.connect('ws://mock');
    const ws2 = MockWebSocket.last!;
    analysisService.restartActiveAnalyses();
    expect(ws2.analysisQueries()).toHaveLength(0);
  });

  it('DOES restart a query still in flight at disconnect after reconnect', () => {
    const boardId = setupBoard(SGF);
    const ws = MockWebSocket.last!;
    const fullPath = activePath(boardId);

    const queryId = analysisService.analyzeRange(boardId, fullPath, 1, 3, 100, undefined, undefined, false, false);
    expect(ws.analysisQueries()).toHaveLength(1);

    // Only one of three turns finalized — still in flight at the drop.
    ws.inject(finalPacketFor(queryId!, 1));

    ws.onclose?.({ code: 1006, reason: 'mock-drop' });
    expect(store.engine.status).toBe('disconnected');

    // Reconnect → status connected again → the surviving (un-reaped)
    // restart thunk re-issues the still-in-flight query on the new
    // socket when the toggle fires.
    analysisService.connect('ws://mock');
    const ws2 = MockWebSocket.last!;
    expect(store.engine.status).toBe('connected');
    analysisService.restartActiveAnalyses();
    expect(ws2.analysisQueries().length).toBeGreaterThanOrEqual(1);
  });

  it('reaps a single-turn analyze query on its first final', () => {
    const boardId = setupBoard(SGF);
    const ws = MockWebSocket.last!;
    // Position the cursor at the leaf so analyzeActiveNode has a
    // valid current index on the active path.
    const queryId = analysisService.analyzeActiveNode(boardId, 'analyze', 100);
    expect(queryId).not.toBeNull();
    const analyzed = ws.analysisQueries()[0].analyzeTurns!;
    expect(analyzed).toHaveLength(1);

    // One authoritative final completes the single-turn query.
    ws.inject(finalPacketFor(queryId!, analyzed[0]));

    analysisService.restartActiveAnalyses();
    expect(ws.analysisQueries()).toHaveLength(1);
  });
});
