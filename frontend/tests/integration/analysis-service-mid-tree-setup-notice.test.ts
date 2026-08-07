/**
 * tests/integration/analysis-service-mid-tree-setup-notice.test.ts
 *
 * Tier-3 (service integration) coverage for the mid-tree-setup-drop
 * notice (ADR-0002; maintainer adjudication ledger row 622). The
 * setup toolkit (ledger rows 603/604) lets a user place AB/AW on ANY
 * current node, not just root — but KataGo's analysis-engine wire
 * protocol only has a primitive for root-level setup
 * (`initialStones`); a mid-tree setup edit is silently absent from
 * every outgoing query (`analyzeRange` / `analyzeActiveNode` both
 * build `moves` from `node.move` only — see `buildMovesAndTurnIndex`'s
 * own docstring). This suite pins the query-construction-time notice
 * `analysisService.warnIfMidTreeSetupDropped` fires to surface that
 * divergence loudly instead of shipping a silently-wrong analysis.
 *
 * Harness mirrors `analysis-service-error-packet-narrowing.test.ts`'s
 * shape (real `analysisService` singleton against a mock `WebSocket`)
 * but is lighter: the notice fires at QUERY-CONSTRUCTION time, before
 * any packet round-trips, so no `inject()` is needed — only that the
 * engine is "connected" (`analysisService.connect` sets
 * `store.engine.status` synchronously, no `onopen` simulation
 * required — see that method's body).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Persistence service is mocked to keep `resetWorkspace` quiet — same
// posture as the sibling error-packet-narrowing integration test.
vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

import { addBoard, clearSystemMessages, resetWorkspace, store } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { applySetup } from '../../src/logic';
import { applyGoMove } from '../../src/logic';
import { analysisService } from '../../src/services/analysis-service';
import { getActiveVariationPath } from '../../src/engine/util';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId, BoardState } from '../../src/types';

// Minimal WebSocket stand-in — no `inject()` machinery needed since
// this notice fires before any response packet, only satisfying
// `KataGoClient.connect`'s `new WebSocket(url)` construction.
class MockWebSocket {
  static readonly OPEN = 1;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  readonly sent: unknown[] = [];
  constructor(public url: string) {}
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {}
}

const MID_TREE_SETUP_PREFIX = 'This game tree has a setup stone placed after the first move';

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
  clearSystemMessages(); // resetWorkspace deliberately preserves the system log
  analysisService.connect('ws://mock');
});

afterEach(() => {
  analysisService.stopAllBoardAnalyses();
  analysisService.disconnect();
  vi.unstubAllGlobals();
});

/** A board with a REAL PLAYED MOVE, then a setup stone on THAT (non-root) node. */
function boardWithMidTreeSetup(): BoardState {
  let board = createInitialBoard();
  board = applyGoMove(board, 3, 3)!; // a real move — board.currentNodeId is now the move's node
  board = applySetup(board, 15, 15, 'W'); // setup edit on the CURRENT (non-root) node
  return board;
}

describe('AnalysisService — mid-tree-setup-drop notice', () => {
  it('fires the notice when analyzeRange queries a path containing a mid-tree setup node', () => {
    const board = boardWithMidTreeSetup();
    addBoard(board);
    const boardId: BoardId = board.id;
    const path = getActiveVariationPath(store.boards.find(b => b.id === boardId)!);

    const queryId = analysisService.analyzeRange(boardId, path, 0, path.length - 1, 100);

    expect(queryId).not.toBeNull();
    const notice = store.engine.messages.find(m => m.text.startsWith(MID_TREE_SETUP_PREFIX));
    expect(notice).toBeDefined();
    expect(notice!.type).toBe('warning');
  });

  it('fires the notice when analyzeActiveNode is parked ON the mid-tree setup node', () => {
    const board = boardWithMidTreeSetup();
    addBoard(board);
    const boardId: BoardId = board.id;

    const queryId = analysisService.analyzeActiveNode(boardId, 'analyze', 100);

    expect(queryId).not.toBeNull();
    const notice = store.engine.messages.find(m => m.text.startsWith(MID_TREE_SETUP_PREFIX));
    expect(notice).toBeDefined();
  });

  it('does NOT fire for a board whose only setup is at ROOT (the wire-correct, already-handled case)', () => {
    let board = createInitialBoard();
    board = applySetup(board, 3, 3, 'B'); // root has no move yet — this IS the root node
    addBoard(board);
    const boardId: BoardId = board.id;
    const path = getActiveVariationPath(store.boards.find(b => b.id === boardId)!);

    const queryId = analysisService.analyzeRange(boardId, path, 0, Math.max(0, path.length - 1), 100);

    expect(queryId).not.toBeNull();
    const notice = store.engine.messages.find(m => m.text.startsWith(MID_TREE_SETUP_PREFIX));
    expect(notice).toBeUndefined();
  });

  it('does NOT fire for a board with no setup stones at all (negative control)', () => {
    let board = createInitialBoard();
    board = applyGoMove(board, 3, 3)!;
    addBoard(board);
    const boardId: BoardId = board.id;
    const path = getActiveVariationPath(store.boards.find(b => b.id === boardId)!);

    const queryId = analysisService.analyzeRange(boardId, path, 0, path.length - 1, 100);

    expect(queryId).not.toBeNull();
    const notice = store.engine.messages.find(m => m.text.startsWith(MID_TREE_SETUP_PREFIX));
    expect(notice).toBeUndefined();
  });

  it('fires at most ONCE per board per session — a second query on the same board does not repeat it', () => {
    const board = boardWithMidTreeSetup();
    addBoard(board);
    const boardId: BoardId = board.id;
    const path = getActiveVariationPath(store.boards.find(b => b.id === boardId)!);

    analysisService.analyzeRange(boardId, path, 0, path.length - 1, 100);
    const firstCount = store.engine.messages.filter(m => m.text.startsWith(MID_TREE_SETUP_PREFIX)).length;
    expect(firstCount).toBe(1);

    analysisService.analyzeRange(boardId, path, 0, path.length - 1, 100);
    const secondCount = store.engine.messages.filter(m => m.text.startsWith(MID_TREE_SETUP_PREFIX)).length;
    expect(secondCount).toBe(1); // unchanged — not re-fired
  });

  it('resetWorkspace releases the per-board dedup — a fresh identity sees the notice again', () => {
    const board = boardWithMidTreeSetup();
    addBoard(board);
    const boardId: BoardId = board.id;
    const path = getActiveVariationPath(store.boards.find(b => b.id === boardId)!);
    analysisService.analyzeRange(boardId, path, 0, path.length - 1, 100);
    expect(store.engine.messages.filter(m => m.text.startsWith(MID_TREE_SETUP_PREFIX)).length).toBe(1);

    resetWorkspace();
    clearSystemMessages();
    analysisService.connect('ws://mock');

    const board2 = boardWithMidTreeSetup();
    addBoard(board2);
    const path2 = getActiveVariationPath(store.boards.find(b => b.id === board2.id)!);
    analysisService.analyzeRange(board2.id, path2, 0, path2.length - 1, 100);

    expect(store.engine.messages.filter(m => m.text.startsWith(MID_TREE_SETUP_PREFIX)).length).toBe(1);
  });
});
