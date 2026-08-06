/**
 * tests/integration/analysis-service-ruleset.test.ts
 *
 * Tier-3 (service integration) tests for the ruleset wire-value
 * assembly in `AnalysisService` (originally ruling §RULESETS,
 * `.claude/dispatch-reports/design-engine-features.md`, ledger row
 * 110; superseded by the live-testing adjudication in
 * `.claude/dispatch-reports/ruleset-default-wedge-fix.md`).
 *
 * Two things are load-bearing here and neither is decidable from a
 * pure-logic (Tier-1) test of `normalizeRuleset` alone:
 *
 *   1. A board whose root `RU` resolves to one of the four names sends
 *      that resolved name's wire spelling in the assembled query's
 *      `rules` field — not the old hardcoded `'tromp-taylor'` literal.
 *   2. A board whose root `RU` does NOT resolve now DEFAULTS to
 *      Tromp-Taylor and PROCEEDS through query construction — the
 *      vetoed original shape refused construction outright (ADR-0021
 *      Rule 2 tripwire) here; the adjudication supersedes that
 *      because it wedged review sessions with no in-session recovery
 *      (see the wedge-fix dispatch report and
 *      `tests/integration/useReviewSession.test.ts`'s
 *      "query-refused recovery" cases for the consumer-side half of
 *      that fix).
 *
 * Drives the REAL `analysisService` singleton against a mock
 * `WebSocket`, mirroring the harness in
 * `analysis-service-restart-thunk.test.ts` (same rationale: the
 * query-assembly logic under test lives inside the real service).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, resetWorkspace, store } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { analysisService } from '../../src/services/analysis-service';
import { getActiveVariationPath } from '../../src/engine/util';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId, BoardState, RootedPath } from '../../src/types';

interface SentQuery {
  readonly id?: string;
  readonly action?: string;
  readonly analyzeTurns?: readonly number[];
  readonly rules?: string;
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

function setupBoard(source: string): BoardId {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  return board.id;
}

function activePath(boardId: BoardId): RootedPath {
  const board: BoardState = store.boards.find(b => b.id === boardId)!;
  return getActiveVariationPath(board);
}

const SGF_JAPANESE = '(;FF[4]GM[1]SZ[19]RU[Japanese];B[pd];W[dp];B[pp])';
const SGF_AGA_MIXED_CASE = '(;FF[4]GM[1]SZ[19]RU[aGa];B[pd];W[dp];B[pp])';
const SGF_UNKNOWN_RU = '(;FF[4]GM[1]SZ[19]RU[New Zealand];B[pd];W[dp];B[pp])';
const SGF_NO_RU = '(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])';

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

describe('AnalysisService ruleset wire assembly (analyzeRange)', () => {
  it('sends the resolved ruleset wire name for a recognized RU', () => {
    const boardId = setupBoard(SGF_JAPANESE);
    const ws = MockWebSocket.last!;

    const queryId = analysisService.analyzeRange(
      boardId, activePath(boardId), 1, 3, 100, undefined, undefined, false, false,
    );
    expect(queryId).not.toBeNull();

    expect(ws.analysisQueries()).toHaveLength(1);
    expect(ws.analysisQueries()[0].rules).toBe('japanese');
  });

  it('is case-insensitive: a mixed-case RU still resolves and sends the canonical wire name', () => {
    const boardId = setupBoard(SGF_AGA_MIXED_CASE);
    const ws = MockWebSocket.last!;

    const queryId = analysisService.analyzeRange(
      boardId, activePath(boardId), 1, 3, 100, undefined, undefined, false, false,
    );
    expect(queryId).not.toBeNull();
    expect(ws.analysisQueries()[0].rules).toBe('aga');
  });

  // DELETE-WITH-JUSTIFICATION (vetoed expectations): this suite
  // previously pinned "refuses to build a query and surfaces a system
  // message when RU does not resolve" / "refuses ... when RU is
  // entirely absent" — the fail-loud refusal behaviour. The
  // live-testing adjudication (`.claude/dispatch-reports/
  // ruleset-default-wedge-fix.md`) vetoes that: an unrecognized/absent
  // RU must DEFAULT to Tromp-Taylor and let the query proceed, not
  // block it. Replaced by the two tests below (RED against the old
  // blocking behaviour: they'd have failed — queryId null, zero
  // queries sent — under the pre-adjudication code).

  it('defaults to Tromp-Taylor and proceeds when RU does not match one of the four names (no refusal, no system message)', () => {
    const boardId = setupBoard(SGF_UNKNOWN_RU);
    const ws = MockWebSocket.last!;
    const messagesBefore = store.engine.messages.length;

    const queryId = analysisService.analyzeRange(
      boardId, activePath(boardId), 1, 3, 100, undefined, undefined, false, false,
    );

    expect(queryId).not.toBeNull();
    expect(ws.analysisQueries()).toHaveLength(1);
    expect(ws.analysisQueries()[0].rules).toBe('tromp-taylor');
    // No refusal message — defaulting is silent-but-represented, not
    // a user-visible error. (The StatusBar dropdown's `source:
    // 'defaulted'` hint is the represented-fact surface, not a toast.)
    expect(store.engine.messages.length).toBe(messagesBefore);
  });

  it('defaults to Tromp-Taylor and proceeds when RU is entirely absent from the SGF', () => {
    const boardId = setupBoard(SGF_NO_RU);
    const ws = MockWebSocket.last!;

    const queryId = analysisService.analyzeRange(
      boardId, activePath(boardId), 1, 3, 100, undefined, undefined, false, false,
    );

    expect(queryId).not.toBeNull();
    expect(ws.analysisQueries()).toHaveLength(1);
    expect(ws.analysisQueries()[0].rules).toBe('tromp-taylor');
  });
});

describe('AnalysisService ruleset wire assembly — fresh (non-SGF) board', () => {
  // A board minted by createInitialBoard (the "New Game" path, not an
  // SGF load) carries the commissioner-adjudicated RU[Tromp-Taylor]
  // default (board-factory.ts) — `source: 'ru'` (authored at
  // construction), not `source: 'defaulted'` (the missing/
  // unrecognized-RU case the describe blocks above now cover). Both
  // proceed through query construction post-adjudication; this block
  // pins the authored-default case specifically.
  it('resolves to Tromp-Taylor and proceeds through analyzeRange (analyzeActiveNode)', () => {
    const board = createInitialBoard();
    addBoard(board);
    const ws = MockWebSocket.last!;

    const queryId = analysisService.analyzeActiveNode(board.id, 'analyze', 100);

    expect(queryId).not.toBeNull();
    expect(ws.analysisQueries()).toHaveLength(1);
    expect(ws.analysisQueries()[0].rules).toBe('tromp-taylor');
  });
});

describe('AnalysisService ruleset wire assembly (analyzeActiveNode)', () => {
  it('sends the resolved ruleset wire name for a recognized RU', () => {
    const boardId = setupBoard(SGF_JAPANESE);
    const ws = MockWebSocket.last!;

    const queryId = analysisService.analyzeActiveNode(boardId, 'analyze', 100);
    expect(queryId).not.toBeNull();
    expect(ws.analysisQueries()[0].rules).toBe('japanese');
  });

  // DELETE-WITH-JUSTIFICATION: see the analyzeRange describe block
  // above — same vetoed refusal expectation, same adjudication.
  it('defaults to Tromp-Taylor and proceeds when RU does not resolve (no refusal, no system message)', () => {
    const boardId = setupBoard(SGF_UNKNOWN_RU);
    const ws = MockWebSocket.last!;
    const messagesBefore = store.engine.messages.length;

    const queryId = analysisService.analyzeActiveNode(boardId, 'analyze', 100);

    expect(queryId).not.toBeNull();
    expect(ws.analysisQueries()).toHaveLength(1);
    expect(ws.analysisQueries()[0].rules).toBe('tromp-taylor');
    expect(store.engine.messages.length).toBe(messagesBefore);
  });
});
