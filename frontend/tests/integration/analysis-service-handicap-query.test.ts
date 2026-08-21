/**
 * tests/integration/analysis-service-handicap-query.test.ts
 *
 * Tier-3 (service integration) coverage for the handicap affordance's
 * engine-query side (wiki Mechanics #4, "No handicap setup support",
 * ACCEPTANCE item 5: "Engine initialStones on analysis — verify with a
 * test at the query-builder level, don't assume"). `applyHandicap`
 * (`src/engine/handicap.ts`) writes root `AB[]` setup stones and
 * `PL[W]`; this suite pins that the REAL `AnalysisService` singleton
 * turns that into a wire query carrying both `initialStones` (the
 * KataGo analysis-engine's root-setup primitive, already exercised for
 * the plain setup toolkit by the mid-tree-setup-notice suite) AND the
 * NEW `initialPlayer: 'W'` field this feature adds — turn 0 has no
 * `moves` entry to hang a colour off, so `initialPlayer` is the only
 * wire channel that tells KataGo White moves first.
 *
 * Harness mirrors `analysis-service-mid-tree-setup-notice.test.ts`:
 * the real `analysisService` against a mock `WebSocket`, asserting on
 * the actual assembled query — not a unit-level re-derivation that
 * could drift from what `analyzeRange`/`analyzeActiveNode` really
 * send.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

import { addBoard, clearSystemMessages, resetWorkspace, store } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { applyHandicap } from '../../src/engine/handicap';
import { applyGoMove } from '../../src/logic';
import { analysisService } from '../../src/services/analysis-service';
import { getActiveVariationPath } from '../../src/engine/util';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId, BoardState } from '../../src/types';

// Minimal WebSocket stand-in — mirrors the mid-tree-setup-notice
// suite's own MockWebSocket exactly; only `send`'s captured payload
// is inspected, no response round-trip is needed at query-build time.
class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static last: MockWebSocket | null = null;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  readonly sent: any[] = [];
  constructor(public url: string) {
    MockWebSocket.last = this;
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  // Fires `onclose` synchronously, same as the error-packet-narrowing
  // suite's mock — this is what resets KataGoClient's `isConnecting`
  // latch (`katago-client.ts`'s `ws.onclose` handler), which otherwise
  // stays stuck `true` forever since this mock never fires `onopen`
  // and `connect()`'s own guard (`this.ws?.readyState === OPEN ||
  // this.isConnecting`) would then skip constructing a fresh mock
  // socket on every subsequent test's `beforeEach`.
  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: 'mock-close' });
  }
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
  MockWebSocket.last = null;
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
  clearSystemMessages();
  analysisService.connect('ws://mock');
});

afterEach(() => {
  analysisService.stopAllBoardAnalyses();
  analysisService.disconnect();
  vi.unstubAllGlobals();
});

function mockSocket(): MockWebSocket {
  return MockWebSocket.last!;
}

describe('AnalysisService — handicap board query construction', () => {
  it('analyzeRange on a fresh handicap board sends initialStones for every AB point and initialPlayer: "W"', () => {
    const board = applyHandicap(createInitialBoard(), 19, 4);
    addBoard(board);
    const boardId: BoardId = board.id;
    const path = getActiveVariationPath(store.boards.find((b) => b.id === boardId)!);

    const queryId = analysisService.analyzeRange(boardId, path, 0, Math.max(0, path.length - 1), 100);
    expect(queryId).not.toBeNull();

    const sent = mockSocket().sent.find((m) => m.id === queryId);
    expect(sent).toBeDefined();
    expect(sent.initialPlayer).toBe('W');
    expect(sent.initialStones).toBeDefined();
    expect(sent.initialStones.length).toBe(4);
    // Wire shape: KataGo initialStones entries are [color, coord] pairs.
    for (const entry of sent.initialStones) {
      expect(entry[0]).toBe('B');
    }
  });

  it('analyzeActiveNode on a fresh handicap board also carries initialStones + initialPlayer: "W"', () => {
    const board = applyHandicap(createInitialBoard(), 19, 4);
    addBoard(board);
    const boardId: BoardId = board.id;

    const queryId = analysisService.analyzeActiveNode(boardId, 'analyze', 100);
    expect(queryId).not.toBeNull();

    const sent = mockSocket().sent.find((m) => m.id === queryId);
    expect(sent).toBeDefined();
    expect(sent.initialPlayer).toBe('W');
    expect(sent.initialStones?.length).toBe(4);
  });

  it('a NON-handicap board omits initialPlayer entirely (KataGo default, Black to move) — negative control', () => {
    const board = createInitialBoard();
    addBoard(board);
    const boardId: BoardId = board.id;
    const path = getActiveVariationPath(store.boards.find((b) => b.id === boardId)!);

    const queryId = analysisService.analyzeRange(boardId, path, 0, Math.max(0, path.length - 1), 100);
    const sent = mockSocket().sent.find((m) => m.id === queryId);

    expect(sent).toBeDefined();
    expect(sent.initialPlayer).toBeUndefined();
    expect(sent.initialStones).toBeUndefined();
  });

  it('a handicap board that has since had a move played sends initialStones/initialPlayer for the root but moves for the rest (sanity: query construction still succeeds after a normal move)', () => {
    let board = applyHandicap(createInitialBoard(), 19, 4);
    board = applyGoMove(board, 15, 9)!; // White's forced first move, legal off-handicap-stones
    addBoard(board);
    const boardId: BoardId = board.id;
    const path = getActiveVariationPath(store.boards.find((b) => b.id === boardId)!);

    const queryId = analysisService.analyzeRange(boardId, path, 0, Math.max(0, path.length - 1), 100);
    const sent = mockSocket().sent.find((m) => m.id === queryId);

    expect(sent).toBeDefined();
    expect(sent.initialPlayer).toBe('W');
    expect(sent.initialStones?.length).toBe(4);
    expect(sent.moves.length).toBe(1);
    expect(sent.moves[0][0]).toBe('W'); // the played move is White's, per PL[W]
  });
});
