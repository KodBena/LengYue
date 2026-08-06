/**
 * tests/integration/analysis-service-pass-moves.test.ts
 *
 * Tier-3 (service integration) engine-wire test for the pass-support
 * design's acceptance criterion 3 (`.claude/dispatch-reports/
 * design-engine-features.md`, PASS SUPPORT): "a KataGo query built
 * from a board with a pass in its move history is accepted (reuses
 * existing wire path — no proxy-side change needed for this
 * criterion)."
 *
 * `moveToKataCoord` (src/engine/util.ts) already serializes a pass to
 * the literal `"pass"` and `AnalysisService.buildMovesAndTurnIndex`
 * already calls it for every node carrying a `Move` — this suite pins
 * that wiring against the REAL `analysisService` singleton and a mock
 * `WebSocket` (same harness as `analysis-service-moveless-node.test.ts`),
 * so a regression that reintroduces a `type === 'place'`-only filter
 * upstream of the wire (dropping passes from `moves` rather than
 * encoding them) fails here, not just at the pure-function level
 * `tests/unit/engine/util.test.ts::moveToKataCoord` already covers.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

import { addBoard, resetWorkspace, store } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { applyGoMove, applyPass } from '../../src/logic';
import { analysisService } from '../../src/services/analysis-service';
import { getActiveVariationPath } from '../../src/engine/util';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId, BoardState } from '../../src/types';

interface SentQuery {
  readonly id?: string;
  readonly moves?: readonly unknown[];
  readonly initialStones?: readonly unknown[];
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

  analysisQueries(): SentQuery[] {
    return this.sent.filter(q => Array.isArray(q.analyzeTurns));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', MockWebSocket);
  MockWebSocket.last = null;
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
  analysisService.connect('ws://mock');
});

afterEach(() => {
  analysisService.stopAllBoardAnalyses();
  analysisService.disconnect();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AnalysisService — a position containing passes sends them correctly on the wire', () => {
  it('a mid-game pass appears in `moves` as ["<color>", "pass"], not dropped and not sent as a placement', () => {
    let board = createInitialBoard();
    board = applyGoMove(board, 3, 3)!; // B D4
    board = applyPass(board); // W passes
    board = applyGoMove(board, 15, 15)!; // B plays again
    addBoard(board);
    const boardId: BoardId = board.id;
    const live: BoardState = store.boards.find(b => b.id === boardId)!;
    const path = getActiveVariationPath(live);
    const ws = MockWebSocket.last!;

    const queryId = analysisService.analyzeRange(
      boardId, path, 0, path.length - 1, 100, undefined, undefined, false, false,
    );
    expect(queryId).not.toBeNull();

    const sent = ws.analysisQueries()[0];
    const moves = sent.moves as [string, string][];

    // 3 real moves (B place, W pass, B place) — the pass consumed a
    // turn and occupies a slot in `moves`, it was not filtered out.
    expect(moves).toHaveLength(3);
    expect(moves[0]).toEqual(['B', 'D4']);
    expect(moves[1]).toEqual(['W', 'pass']);
    expect(moves[2][0]).toBe('B');
    // `analyzeTurns` covers exactly the real-move count — the pass
    // contributes one valid turn like any other move (regression
    // guard against the moveless-node off-by-one class: a pass is
    // NOT moveless, so it must NOT be treated like the trailing
    // scoring node in analysis-service-moveless-node.test.ts).
    expect(Math.max(...sent.analyzeTurns!)).toBe(3);
  });

  it('two consecutive passes both appear on the wire in turn order', () => {
    let board = createInitialBoard();
    board = applyPass(board); // B passes
    board = applyPass(board); // W passes
    addBoard(board);
    const boardId: BoardId = board.id;
    const live: BoardState = store.boards.find(b => b.id === boardId)!;
    const path = getActiveVariationPath(live);
    const ws = MockWebSocket.last!;

    const queryId = analysisService.analyzeRange(
      boardId, path, 0, path.length - 1, 100, undefined, undefined, false, false,
    );
    expect(queryId).not.toBeNull();

    const sent = ws.analysisQueries()[0];
    const moves = sent.moves as [string, string][];
    expect(moves).toEqual([['B', 'pass'], ['W', 'pass']]);
  });
});
