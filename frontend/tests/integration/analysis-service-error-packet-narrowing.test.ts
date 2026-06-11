/**
 * tests/integration/analysis-service-error-packet-narrowing.test.ts
 *
 * Tier-3 (service integration) tests for the response-union narrowing
 * at `AnalysisService`'s subscribe callbacks (work-status item
 * `analysis-subscribe-union-narrowing`).
 *
 * The bug: the two subscribe callbacks cast the broad `KataGoResponse`
 * union straight to `KataAnalysisResponse`
 * (`res as KataAnalysisResponse`). An error packet (`{id, error}`)
 * routed onto an analysis query's id was read as if it carried
 * `rootInfo` / `moveInfos` / `isDuringSearch`. Its absent
 * `isDuringSearch` read as a finalized turn, corrupting telemetry
 * `turnsCompleted`, firing the false ponder-exhausted warning, reaping
 * the restart thunk prematurely, and leaking the `activeQueries` /
 * `activeSubscriptions` entry (the subscription was never torn down
 * because the query looked complete).
 *
 * These tests drive the REAL `analysisService` singleton against a
 * mock `WebSocket` — the same harness shape as
 * `analysis-service-restart-thunk.test.ts`, because the behaviour
 * under test lives inside the real service's per-query bookkeeping and
 * its narrowing of the wire union. The mock socket's `inject` delivers
 * a raw response object to the real `KataGoClient`'s id-keyed
 * subscriber via `handleIncomingMessage`, so an injected error packet
 * exercises BOTH the client's global `onError` surface AND the
 * per-query narrowing — exactly the production path.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

// Persistence service is mocked to keep `resetWorkspace` (and the
// per-final `markDirty` the analyze path fires) quiet — out of scope
// for the narrowing behaviour, same posture as the sibling
// restart-thunk integration test.
vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, clearSystemMessages, resetWorkspace, store } from '../../src/store';
import { analysisService } from '../../src/services/analysis-service';
import { getActiveVariationPath } from '../../src/engine/util';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import { useQueryTelemetry, __resetQueryTelemetryForTests } from '../../src/composables/useQueryTelemetry';
import type { BoardId, BoardState, RootedPath } from '../../src/types';

const { inFlight } = useQueryTelemetry();

// ── Mock WebSocket ──────────────────────────────────────────────────────────
//
// Minimal stand-in for the browser WebSocket the real KataGoClient
// constructs. Records every JSON the service sends and exposes
// `inject` so a test can deliver a response packet to the service's
// id-keyed subscriber. `readyState` starts OPEN so `sendRaw`'s guard
// passes without an async handshake (the sibling restart-thunk test
// documents the jsdom-IDL-onopen escape this avoids).

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

  /** `terminate` action commands the service sent — the wire signal
   *  `stopQuery` emits when it releases a query. */
  terminateCommands(): SentQuery[] {
    return this.sent.filter(q => q.action === 'terminate');
  }
}

// The proxy's KataErrorResponse wire shape — `{id, error}` (with an
// optional `field`). Faithful to `engine/katago/types.ts`'s
// `KataErrorResponse`; this is the packet a bad palette / unknown
// SELECTOR model / proxy-side abort routes onto the query's id. It
// carries NO `rootInfo` / `moveInfos` / `isDuringSearch` — the absence
// the bug misread as a finalized turn.
function errorPacketFor(queryId: string, message: string): Record<string, unknown> {
  return { id: queryId, error: message };
}

function setupBoard(source: string): BoardId {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  return board.id;
}

/** The board's active variation path (root→leaf) as a RootedPath. */
function activePath(boardId: BoardId): RootedPath {
  const board: BoardState = store.boards.find(b => b.id === boardId)!;
  return getActiveVariationPath(board);
}

const PONDER_CEILING_PREFIX = 'Ponder reached its visit ceiling';

// A 3-move game: root + B[pd] + W[dp] + B[pp] → 4 path entries
// (turns 0..3). Enough turns for a multi-turn range query.
const SGF = '(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', MockWebSocket);
  MockWebSocket.last = null;
  __resetQueryTelemetryForTests();
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
  // `resetWorkspace` deliberately does NOT clear `store.engine.messages`
  // (the system log survives a workspace reset); clear it here so each
  // case asserts against a clean log.
  clearSystemMessages();
  analysisService.connect('ws://mock');
});

afterEach(() => {
  analysisService.stopAllBoardAnalyses();
  analysisService.disconnect();
  __resetQueryTelemetryForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AnalysisService subscribe-callback union narrowing (error packets)', () => {
  it('surfaces an error packet loudly via the system log (existing onError channel)', () => {
    const boardId = setupBoard(SGF);
    const ws = MockWebSocket.last!;
    const queryId = analysisService.analyzeRange(
      boardId, activePath(boardId), 1, 3, 100, undefined, undefined, false, false,
    );
    expect(queryId).not.toBeNull();

    const beforeCount = store.engine.messages.length;
    ws.inject(errorPacketFor(queryId!, 'palette compile failed: NameError x'));

    // Loud: the proxy error string reaches the system log through the
    // client's global onError → pushSystemMessage('error', …). The
    // narrowing does not silently drop it.
    const fresh = store.engine.messages.slice(0, store.engine.messages.length - beforeCount);
    const errMsg = fresh.find(m => m.type === 'error' && m.text.includes('palette compile failed'));
    expect(errMsg).toBeDefined();
  });

  it('does NOT corrupt telemetry turnsCompleted on an error packet (range query)', () => {
    const boardId = setupBoard(SGF);
    const ws = MockWebSocket.last!;
    // Range over turns 1..3 (turnsTotal = 3). The telemetry row is
    // registered at submit. With the bug, the error packet's
    // recordPacket would treat isDuringSearch=undefined as a finalized
    // turn and bump turnsCompleted to 1 (3 not reached, so the row
    // SURVIVES with turnsCompleted === 1). With the fix, the error
    // packet never reaches recordPacket; stopQuery removes the row
    // cleanly. So a surviving row with turnsCompleted ≥ 1 is the bug
    // signature; an absent row is the fixed signature.
    const queryId = analysisService.analyzeRange(
      boardId, activePath(boardId), 1, 3, 100, undefined, undefined, false, false,
    );
    expect(inFlight.value.find(q => q.queryId === queryId)).toBeDefined();
    expect(inFlight.value.find(q => q.queryId === queryId)!.progress.turnsCompleted).toBe(0);

    ws.inject(errorPacketFor(queryId!, 'upstream LEAF down'));

    const row = inFlight.value.find(q => q.queryId === queryId);
    // The row is released (not left behind with a corrupted count).
    expect(row).toBeUndefined();
  });

  it('does NOT fire the false ponder-exhausted warning on an error packet', () => {
    const boardId = setupBoard(SGF);
    const ws = MockWebSocket.last!;
    // Position the cursor at the leaf so analyzeActiveNode has a valid
    // current index. A ponder query carries a ponderCeiling, arming
    // the exhausted-warning path that the bug tripped on the absent
    // isDuringSearch.
    const queryId = analysisService.analyzeActiveNode(boardId, 'ponder');
    expect(queryId).not.toBeNull();

    ws.inject(errorPacketFor(queryId!, 'model "strong" unknown to SELECTOR'));

    const falseExhausted = store.engine.messages.find(
      m => m.text.startsWith(PONDER_CEILING_PREFIX),
    );
    expect(falseExhausted).toBeUndefined();
  });

  it('releases bookkeeping (no leaked activeQueries / subscription) on an error packet', () => {
    const boardId = setupBoard(SGF);
    const ws = MockWebSocket.last!;
    const queryId = analysisService.analyzeActiveNode(boardId, 'ponder');
    expect(queryId).not.toBeNull();
    // The ponder is live: isPondering reads the activeQueries entry.
    expect(analysisService.isPondering(boardId)).toBe(true);

    ws.inject(errorPacketFor(queryId!, 'proxy-side abort'));

    // stopQuery released the activeQueries entry — isPondering now
    // false (the bug left it true, because the query looked complete
    // without ever calling stopQuery).
    expect(analysisService.isPondering(boardId)).toBe(false);

    // The release emitted exactly one wire `terminate` for this query.
    expect(
      ws.terminateCommands().filter(q => q.terminateId === queryId),
    ).toHaveLength(1);

    // The per-id subscription is torn down: a SECOND error packet on
    // the same id no longer reaches `routeSubscriptionResponse`, so no
    // second `terminate` is emitted. (The client's GLOBAL onError still
    // surfaces the second packet to the system log — that channel is
    // connection-scoped, not query-scoped — so we assert on the
    // query-routing path, not on the message count.)
    ws.inject(errorPacketFor(queryId!, 'second packet after release'));
    expect(
      ws.terminateCommands().filter(q => q.terminateId === queryId),
    ).toHaveLength(1);

    // And a toolbar-view toggle does not resurrect the released query
    // (the restart thunk was reaped by stopQuery, not by a premature
    // natural-completion reap).
    const queriesBefore = ws.analysisQueries().length;
    analysisService.restartActiveAnalyses();
    expect(ws.analysisQueries().length).toBe(queriesBefore);
  });

  it('still records a genuine final normally (the narrowing is variant-correct, not a blanket drop)', () => {
    const boardId = setupBoard(SGF);
    const ws = MockWebSocket.last!;
    const queryId = analysisService.analyzeRange(
      boardId, activePath(boardId), 1, 1, 100, undefined, undefined, false, false,
    );
    expect(queryId).not.toBeNull();

    // A well-formed analysis final (no `error` field) narrows to the
    // analysis variant and drives normal completion: telemetry
    // turnsCompleted advances and the single-turn row auto-releases.
    ws.inject({
      id: queryId,
      turnNumber: 1,
      isDuringSearch: false,
      moveInfos: [],
      rootInfo: { currentPlayer: 'B', visits: 100, winrate: 0.5, scoreLead: 0 },
    });

    // No error message surfaced for a clean final.
    const errMsg = store.engine.messages.find(m => m.type === 'error');
    expect(errMsg).toBeUndefined();

    // The single-turn range completed naturally → restart thunk reaped
    // the same way the sibling restart-thunk test asserts.
    const queriesBefore = ws.analysisQueries().length;
    analysisService.restartActiveAnalyses();
    expect(ws.analysisQueries().length).toBe(queriesBefore);
  });
});
