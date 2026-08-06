/**
 * tests/integration/analysis-service-moveless-node.test.ts
 *
 * Tier-3 (service integration) regression test for the turn-index vs.
 * tree-node-index conflation diagnosed in
 * `.claude/dispatch-reports/sgf-pass-diagnosis.md` ("WITH-ENGINE
 * REPRODUCTION (2026-08-06)"): `AnalysisService.analyzeRange` built its
 * `moves` list (filtered to real moves) and its `analyzeTurns` list
 * (raw tree-index range) independently, with no cross-check that
 * `max(analyzeTurns) <= moves.length` — the wire-protocol ceiling. A
 * moveless node in the active path (a territory/scoring node, a
 * comment-only node — anywhere in the path, not just the leaf) let a
 * requested turn index run past the real move count, and KataGo/the
 * proxy rejected the ENTIRE query (`Invalid turn number: N`), silently
 * discarding analysis for every valid turn in the selection too.
 *
 * The witnessed specimen (`/home/bork/lost_games/30996072.sgf`, 250
 * tree nodes / 248 real moves, trailing `TW`/`TB` scoring node) produced
 * `analyzeTurns` spanning 0..249 (250 values) against only 248 real
 * moves — `max(analyzeTurns) === 249 > moves.length === 248`. This
 * suite mirrors that shape with small fixtures: a trailing-moveless
 * case (the witnessed shape) and a mid-path-moveless case (named as an
 * open question in the diagnosis's fix plan, resolved here — see
 * `buildMovesAndTurnIndex` in `src/services/analysis-service.ts`), plus
 * a normal (no moveless node) sibling as a regression guard that the
 * fix didn't narrow full-range analysis for ordinary games.
 *
 * **REPAIR (2026-08-06), after fresh-context review REJECTED the first
 * pass** (`.claude/dispatch-reports/sgf-analyzeturns-review.md`): the
 * first pass bounded the OUTBOUND `analyzeTurns` correctly but left
 * `onAnalysisUpdate`'s response→nodeId resolution
 * (`queryInfo.path[response.turnNumber]`) un-updated — a raw tree-index
 * lookup in a wire query that now sends real-move-count turn indices.
 * The two tests under "response ingestion resolves nodeId..." below are
 * the witness this gap needed: they simulate a response packet for a
 * turn reached AFTER a mid-path moveless node and assert which nodeId
 * the ledger records it under. Confirmed red against the un-repaired
 * ingestion (`git stash` the `analysis-service.ts` repair, keep this
 * file): the first assertion failed because the packet landed on the
 * moveless node's own id instead of the real-move node's id — the
 * exact mis-keying the review's trace table names. Green after routing
 * ingestion through the shared `turnToNodeId` map.
 *
 * Driven the same way as `analysis-service-restart-thunk.test.ts`: the
 * REAL `analysisService` singleton against a mock `WebSocket`, so the
 * assertion is on the actual wire query the service assembles — not a
 * unit-level re-derivation that could drift from what `analyzeRange`
 * really sends.
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
import { addBoard, mutateBoard, resetWorkspace, store } from '../../src/store';
import { analysisService } from '../../src/services/analysis-service';
import { getActiveVariationPath } from '../../src/engine/util';
import { navigateTo } from '../../src/engine/navigator';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import { activeAnalysisKeys } from '../../src/state/analysis-config';
import { ledger } from '../../src/state/analysis-ledger';
import type { BoardId, BoardState, RootedPath } from '../../src/types';

// ── Mock WebSocket (mirrors analysis-service-restart-thunk.test.ts) ────────

interface SentQuery {
  readonly id?: string;
  readonly action?: string;
  readonly moves?: readonly unknown[];
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

  analysisQueries(): SentQuery[] {
    return this.sent.filter(q => Array.isArray(q.analyzeTurns));
  }
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

// Trailing-moveless specimen shape: 5 real moves (B, W, B, W-pass,
// B-pass — mirroring the PlayOK empty-bracket pass convention), then a
// moveless comment-only node standing in for the specimen's trailing
// TW/TB scoring node. Path: root, pd, dp, pp, pass, pass, comment-only
// → 6 tree nodes past root, 5 of them real moves.
const SGF_TRAILING_MOVELESS =
  '(;FF[4]GM[1]SZ[19]RU[Tromp-Taylor];B[pd];W[dp];B[pp];W[];B[];C[final scoring node, no move])';

// Mid-path-moveless shape: a comment-only node sits BETWEEN two real
// moves, not at the leaf. Path: root, pd (move #1), comment-only,
// dp (move #2), pp (move #3) → 4 tree nodes past root, 3 real moves.
const SGF_MIDPATH_MOVELESS =
  '(;FF[4]GM[1]SZ[19]RU[Tromp-Taylor];B[pd];C[mid-path comment, no move];W[dp];B[pp])';

// Normal game, no moveless node anywhere on the path — every non-root
// node is a real move. Regression guard: full-range analysis must
// still cover every move after the fix.
const SGF_NORMAL = '(;FF[4]GM[1]SZ[19]RU[Tromp-Taylor];B[pd];W[dp];B[pp])';

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

describe('AnalysisService — analyzeTurns vs. moves.length (moveless-node invariant)', () => {
  it('trailing moveless node: full-range analyzeTurns never exceeds moves.length (red today: 249 vs 248 on the witnessed specimen)', () => {
    const boardId = setupBoard(SGF_TRAILING_MOVELESS);
    const path = activePath(boardId);
    const ws = MockWebSocket.last!;

    // Full game, exactly as useAnalysisTimeline's auto-initialized
    // selection does: [0, path.length - 1].
    const queryId = analysisService.analyzeRange(
      boardId, path, 0, path.length - 1, 100, undefined, undefined, false, false,
    );
    expect(queryId).not.toBeNull();

    const sent = ws.analysisQueries()[0];
    const moves = sent.moves as unknown[];
    const analyzeTurns = sent.analyzeTurns!;

    // The wire-protocol invariant the diagnosis names: a turn index is
    // only valid up to and including the position after the last real
    // move. 5 real moves on this fixture (B pd, W dp, B pp, W pass,
    // B pass) → moves.length === 5; the trailing comment-only node
    // must contribute no turn past that.
    expect(moves).toHaveLength(5);
    expect(Math.max(...analyzeTurns)).toBeLessThanOrEqual(moves.length);
    expect(Math.max(...analyzeTurns)).toBe(5);
    // Every real turn 0..5 is still covered (nothing under-trimmed).
    expect(analyzeTurns).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('mid-path moveless node: analyzeTurns stays within moves.length even when the moveless node is not the leaf', () => {
    const boardId = setupBoard(SGF_MIDPATH_MOVELESS);
    const path = activePath(boardId);
    const ws = MockWebSocket.last!;

    const queryId = analysisService.analyzeRange(
      boardId, path, 0, path.length - 1, 100, undefined, undefined, false, false,
    );
    expect(queryId).not.toBeNull();

    const sent = ws.analysisQueries()[0];
    const moves = sent.moves as unknown[];
    const analyzeTurns = sent.analyzeTurns!;

    // 3 real moves (B pd, W dp, B pp); the mid-path comment-only node
    // must not inflate the turn count or shift alignment past it.
    expect(moves).toHaveLength(3);
    expect(Math.max(...analyzeTurns)).toBeLessThanOrEqual(moves.length);
    expect(Math.max(...analyzeTurns)).toBe(3);
    // The mid-path moveless tree index collapses onto its predecessor's
    // turn rather than minting a phantom turn of its own, so the
    // covered turns are exactly 0..3 with no duplicate/gap.
    expect(analyzeTurns).toEqual([0, 1, 2, 3]);
  });

  it('normal game (no moveless node): full-range analysis still covers every real move (regression guard)', () => {
    const boardId = setupBoard(SGF_NORMAL);
    const path = activePath(boardId);
    const ws = MockWebSocket.last!;

    const queryId = analysisService.analyzeRange(
      boardId, path, 0, path.length - 1, 100, undefined, undefined, false, false,
    );
    expect(queryId).not.toBeNull();

    const sent = ws.analysisQueries()[0];
    const moves = sent.moves as unknown[];
    const analyzeTurns = sent.analyzeTurns!;

    expect(moves).toHaveLength(3);
    expect(Math.max(...analyzeTurns)).toBe(moves.length);
    expect(analyzeTurns).toEqual([0, 1, 2, 3]);
  });
});

describe('AnalysisService — response ingestion resolves nodeId through the SAME turn-index authority as analyzeTurns (mid-path moveless node)', () => {
  it('routes a range-query response for a post-moveless-node turn to the correct nodeId, not the moveless node or a shifted neighbour', () => {
    const boardId = setupBoard(SGF_MIDPATH_MOVELESS);
    const path = activePath(boardId);
    const board = store.boards.find(b => b.id === boardId)!;
    const ws = MockWebSocket.last!;

    // Fixture shape this test's node-identity assertions depend on:
    // path = [root, pd(#1 real move), comment-only(moveless),
    // dp(#2 real move), pp(#3 real move, leaf)].
    expect(path).toHaveLength(5);
    expect(board.nodes[path[2]].move).toBeNull();
    expect(board.nodes[path[3]].move).not.toBeNull();
    expect(board.nodes[path[4]].move).not.toBeNull();

    const queryId = analysisService.analyzeRange(
      boardId, path, 0, path.length - 1, 100, undefined, undefined, false, false,
    );
    expect(queryId).not.toBeNull();
    const rawKey = activeAnalysisKeys.value.rawKey;

    // Turn 2 = the position after 2 real moves, reached at path[3]
    // (W[dp]) — NOT path[2] (the moveless comment-only node, one tree
    // index earlier). The un-repaired ingestion resolved this via
    // `path[turnNumber]` (raw tree index) and landed on path[2].
    ws.inject({
      id: queryId, turnNumber: 2, isDuringSearch: false, moveInfos: [],
      rootInfo: { currentPlayer: 'B', visits: 111, winrate: 0.5, scoreLead: 0 },
    });
    expect(ledger.getRaw(rawKey, path[3])?.rootInfo?.visits).toBe(111);
    expect(ledger.getRaw(rawKey, path[2])).toBeNull();

    // Turn 3 = the position after 3 real moves, reached at path[4]
    // (B[pp], the leaf) — NOT path[3] (the un-repaired ingestion's
    // one-tree-index-short target, which would have had turn3's result
    // OVERWRITE turn2's own entry, and the true leaf would never
    // receive a result at all).
    ws.inject({
      id: queryId, turnNumber: 3, isDuringSearch: false, moveInfos: [],
      rootInfo: { currentPlayer: 'W', visits: 222, winrate: 0.5, scoreLead: 0 },
    });
    expect(ledger.getRaw(rawKey, path[4])?.rootInfo?.visits).toBe(222);
    // turn2's entry at path[3] must still read its own value, not have
    // been clobbered by turn3's packet landing on the same (wrong) node.
    expect(ledger.getRaw(rawKey, path[3])?.rootInfo?.visits).toBe(111);
  });

  it('single-turn analyzeActiveNode routes its result to the cursor node itself when the cursor IS the moveless node', () => {
    const boardId = setupBoard(SGF_MIDPATH_MOVELESS);
    const path = activePath(boardId); // [root, pd(#1), comment-only, dp(#2), pp(#3, leaf)]
    const ws = MockWebSocket.last!;

    // Cursor parked ON the moveless comment-only node itself (tree
    // index 2, one real move — B[pd] — behind it). The wire turn for
    // "the position at the cursor" is `moves.length === 1`.
    // `buildMovesAndTurnIndex`'s generic per-move rule alone would map
    // turn 1 to path[1] (the node WHERE the 1st real move was played),
    // not to the cursor (path[2]) — correct for a range query with more
    // real moves later on the same path, but wrong for "analyze what
    // I'm looking at right now". `analyzeActiveNode`'s explicit
    // override (`turnToNodeId.set(moves.length, board.currentNodeId)`)
    // is exactly what keeps this case attaching the result to the
    // node the user is actually viewing.
    mutateBoard(boardId, draft => navigateTo(draft, path[2]));

    const queryId = analysisService.analyzeActiveNode(boardId, 'analyze', 100);
    expect(queryId).not.toBeNull();
    const sent = ws.analysisQueries()[0];
    expect(sent.analyzeTurns).toEqual([1]);

    const rawKey = activeAnalysisKeys.value.rawKey;
    ws.inject({
      id: queryId, turnNumber: 1, isDuringSearch: false, moveInfos: [],
      rootInfo: { currentPlayer: 'W', visits: 333, winrate: 0.5, scoreLead: 0 },
    });

    // Lands on the cursor (the moveless node), not on path[1] (the
    // ancestor real-move node the generic per-move rule alone would
    // have named).
    expect(ledger.getRaw(rawKey, path[2])?.rootInfo?.visits).toBe(333);
    expect(ledger.getRaw(rawKey, path[1])).toBeNull();
  });
});
