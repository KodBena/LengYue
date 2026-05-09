/**
 * src/composables/usePlayFromPosition.ts
 *
 * "Engine plays from this position" — analyzes the current board state
 * against a caller-supplied KataGo URL, applies the engine's top move
 * (`moveInfos.find(m => m.order === 0).move`), and loops until a stop
 * condition fires.
 *
 * Two consumers share the same primitives:
 *
 *   1. Product (this composable) — a "play from here" affordance the
 *      UI can wire to a button. Reactive `isRunning` / `lastError`
 *      surfaces so the host component can render state without
 *      polling. Mutates the global store via `updateBoardState`.
 *
 *   2. Test (`tests/e2e/`, via the exported `playEngineMoves` /
 *      `queryEngineMove` pure functions) — runs against a separate
 *      proxy URL than `analysisService`'s singleton. Returns plain
 *      `BoardState` / coords without touching the store, so the
 *      harness can drive scenarios without coupling them to the
 *      reactive UI.
 *
 * The pure functions own their own `KataGoClient`, deliberately not
 * piggybacking on `analysisService` — the singleton is bound to the
 * user's profile URL and serving multiple URLs concurrently is the
 * test harness's load-bearing requirement.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';
import { KataGoClient } from '../engine/katago/katago-client';
import {
  type KataAnalysisResponse,
  type KataGoAnalysisQuery,
  type Player,
  type KataCoord,
} from '../engine/katago/types';
import type { BoardId, BoardState } from '../types';
import { store, updateBoardState } from '../store';
import { applyGoMove } from '../logic';
import { gtpToBoard } from './use-move-suggestions';
import {
  getActiveVariationPath,
  getBoardSize,
  getKomi,
  getInitialStones,
  moveToKataCoord,
} from '../engine/util';

const DEFAULT_TIMEOUT_MS = 60_000;

// ── Pure WS primitives ───────────────────────────────────────────────────────

/**
 * Connect a fresh KataGoClient and resolve once `onConnect` fires.
 * Rejects on disconnect-before-open and on `onError`. Wraps the
 * client's callback-shaped lifecycle into a single Promise.
 */
function connectFresh(url: string): Promise<KataGoClient> {
  return new Promise((resolve, reject) => {
    let opened = false;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const client = new KataGoClient('');
    client.connect(url, {
      onConnect: () => {
        opened = true;
        settle(() => resolve(client));
      },
      onDisconnect: (code, reason) => {
        if (!opened) {
          settle(() => reject(
            new Error(`KataGo WS closed before open (code=${code}, reason=${reason || 'n/a'}, url=${url})`),
          ));
        }
      },
      onError: (errorMsg) => {
        if (!opened) {
          settle(() => reject(
            new Error(`KataGo WS error before open: ${errorMsg} (url=${url})`),
          ));
        }
      },
    });
  });
}

/**
 * Subscribe a single query and resolve with the first final packet
 * (`isDuringSearch === false`) for `expectedTurn`. Intermediate
 * during-search packets are ignored. The subscription tears down via
 * the returned `unsub` regardless of which channel wins.
 */
function awaitFinalPacket(
  client: KataGoClient,
  query: KataGoAnalysisQuery,
  expectedTurn: number,
  timeoutMs: number,
): Promise<KataAnalysisResponse> {
  return new Promise((resolve, reject) => {
    let unsub: (() => void) | null = null;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub?.();
      fn();
    };
    const timer = setTimeout(() => {
      settle(() => reject(
        new Error(`No final packet for turn ${expectedTurn} within ${timeoutMs}ms (queryId=${query.id})`),
      ));
    }, timeoutMs);
    unsub = client.subscribe(query, (res) => {
      if ('error' in (res as unknown as Record<string, unknown>)) {
        const errMsg = (res as unknown as { error: string }).error;
        settle(() => reject(
          new Error(`KataGo error for queryId=${query.id}: ${errMsg}`),
        ));
        return;
      }
      const r = res as KataAnalysisResponse;
      if (r.turnNumber === expectedTurn && r.isDuringSearch === false) {
        settle(() => resolve(r));
      }
    });
  });
}

/**
 * Build the analyze query for "evaluate this position at the next
 * turn." Shared between the self-play loop and the one-shot top-move
 * helper.
 *
 * The `model` and `capabilities` parameters are optional pass-throughs
 * for proxy v1.0.14+ contracts: SELECTOR routing and per-query
 * capability opt-in. They have no SPA-side semantics here — the
 * harness gives the caller direct control over them, distinct from
 * the analysis-service's policy-driven injection (which is keyed on
 * snapshot-mode, registry toggles, and the connected proxy's
 * advertisement). This lets harness scenarios author multi-weights
 * and LLM-at-seat policies that the autonomous-SR-loop note sketches:
 * fire alternating `playEngineMoves({...,model:"strong"})` and
 * `playEngineMoves({...,model:"weak"})` against one URL and the
 * SELECTOR's labelled-pool routes them appropriately.
 */
function buildAnalyzeQuery(
  board: BoardState,
  maxVisits: number,
  queryId: string,
  model?: string,
  capabilities?: Record<string, Record<string, unknown>>,
): { query: KataGoAnalysisQuery; expectedTurn: number } {
  const path = getActiveVariationPath(board);
  const moves = path
    .map((id) => board.nodes[id]?.move ?? null)
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => [m.color, moveToKataCoord(m)] as [Player, KataCoord]);
  const initialStones = getInitialStones(board);
  const expectedTurn = moves.length;
  // Both consumers (engine self-play loop, one-shot top-move query)
  // wait for the FINAL packet only — `awaitFinalPacket` filters on
  // `isDuringSearch === false`. Omitting `reportDuringSearchEvery`
  // tells the proxy not to emit during-search updates, saving
  // bandwidth and avoiding churn through the subscription callback.
  return {
    query: {
      id: queryId,
      moves,
      ...(initialStones.length ? { initialStones } : {}),
      rules: 'tromp-taylor',
      boardXSize: getBoardSize(board),
      boardYSize: getBoardSize(board),
      komi: getKomi(board),
      maxVisits,
      analyzeTurns: [expectedTurn],
      ...(model !== undefined ? { model } : {}),
      ...(capabilities !== undefined ? { capabilities } : {}),
    },
    expectedTurn,
  };
}

// ── Pure exports — no store, no Vue reactivity ───────────────────────────────

export interface PlayEngineMovesOptions {
  readonly katagoUrl: string;
  readonly startBoard: BoardState;
  /** Stop when the active path reaches this many nodes (root counted). */
  readonly untilPathLength: number;
  readonly maxVisits: number;
  readonly perMoveTimeoutMs?: number;
  /**
   * Cooperative interrupt: checked at the top of each iteration.
   * Returning `true` stops the loop after the in-flight move resolves.
   */
  readonly shouldStop?: () => boolean;
  /**
   * Fires after each move is applied locally, before the next query.
   * The composable wrapper uses this to mirror the new board into
   * the global store (and thereby into the reactive UI). The pure
   * caller (the harness) leaves it undefined and reads only the
   * final return value.
   */
  readonly onMoveApplied?: (board: BoardState) => void;
  /**
   * SELECTOR routing key (proxy v1.0.15+). When set, every query
   * fired by this loop carries `model: <label>`; the SELECTOR
   * dispatches each to the corresponding upstream LEAF. Enables
   * multi-weights harness policies — alternate strong/weak
   * networks across moves by issuing two `playEngineMoves` calls
   * with different `model` values against the same SELECTOR URL,
   * or interleave per-position by stitching `queryEngineMove`
   * calls in a host loop.
   *
   * On non-SELECTOR proxies the field is benign — the proxy
   * forwards or ignores per its role contract; on SELECTOR with
   * an unknown label, the proxy returns a `KataErrorResponse`
   * (loud failure per ADR-0002) which surfaces through
   * `awaitFinalPacket`'s error branch.
   */
  readonly model?: string;
  /**
   * Per-query capability opt-in (proxy v1.0.14+). When set,
   * forwarded verbatim on every query. The harness owns the
   * decision rather than reading from store — a test scenario
   * may want to opt out of `delta_analysis` (skip the enricher
   * for raw-packet timing measurement) or opt into
   * `adaptive_reevaluate` with a custom `worst_quantile` that
   * isn't represented in the user's registry. Pure pass-through.
   */
  readonly capabilities?: Record<string, Record<string, unknown>>;
}

/**
 * Drive engine self-play from `startBoard` until the active path
 * reaches `untilPathLength`. Returns the final board state. Does NOT
 * touch the global store; the optional `onMoveApplied` callback is
 * how the composable opt-in to store mirroring.
 *
 * Connection lifetime spans the whole loop — one WS open per call,
 * regardless of how many moves are played.
 */
export async function playEngineMoves(opts: PlayEngineMovesOptions): Promise<BoardState> {
  const timeoutMs = opts.perMoveTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const client = await connectFresh(opts.katagoUrl);
  let board = opts.startBoard;
  try {
    while (!(opts.shouldStop?.() ?? false)
        && getActiveVariationPath(board).length < opts.untilPathLength) {
      const turn = currentTurnNumber(board);
      const { query, expectedTurn } = buildAnalyzeQuery(
        board,
        opts.maxVisits,
        `play-${turn}-${Date.now()}`,
        opts.model,
        opts.capabilities,
      );
      const packet = await awaitFinalPacket(client, query, expectedTurn, timeoutMs);
      const best = packet.moveInfos.find((m) => m.order === 0);
      if (!best) {
        throw new Error(`playEngineMoves: turn ${expectedTurn} packet has no order-0 moveInfo`);
      }
      const coords = gtpToBoard(best.move);
      if (!coords) {
        throw new Error(`playEngineMoves: engine recommended pass at turn ${expectedTurn}`);
      }
      const next = applyGoMove(board, coords.x, coords.y);
      if (!next) {
        throw new Error(`playEngineMoves: engine's top move ${best.move} is illegal at turn ${expectedTurn}`);
      }
      board = next;
      opts.onMoveApplied?.(board);
    }
    return board;
  } finally {
    client.disconnect();
  }
}

export interface QueryEngineMoveOptions {
  readonly katagoUrl: string;
  readonly board: BoardState;
  readonly maxVisits: number;
  readonly timeoutMs?: number;
  /** See `PlayEngineMovesOptions.model` for the SELECTOR contract. */
  readonly model?: string;
  /** See `PlayEngineMovesOptions.capabilities` for the per-query opt-in contract. */
  readonly capabilities?: Record<string, Record<string, unknown>>;
}

export interface EngineMoveResult {
  readonly x: number;
  readonly y: number;
  readonly gtp: string;
  readonly packet: KataAnalysisResponse;
}

/**
 * One-shot "ask the engine for its top move from this position."
 * Connects, queries, disconnects. Used by the harness's human-
 * simulator: feed the returned `(x, y)` into
 * `useReviewSession.processUserMove`.
 */
export async function queryEngineMove(opts: QueryEngineMoveOptions): Promise<EngineMoveResult> {
  const client = await connectFresh(opts.katagoUrl);
  try {
    const { query, expectedTurn } = buildAnalyzeQuery(
      opts.board,
      opts.maxVisits,
      `query-${Date.now()}`,
      opts.model,
      opts.capabilities,
    );
    const packet = await awaitFinalPacket(client, query, expectedTurn, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const best = packet.moveInfos.find((m) => m.order === 0);
    if (!best) {
      throw new Error(`queryEngineMove: turn ${expectedTurn} packet has no order-0 moveInfo`);
    }
    const coords = gtpToBoard(best.move);
    if (!coords) {
      throw new Error(`queryEngineMove: engine recommended pass / un-decodable "${best.move}"`);
    }
    return { x: coords.x, y: coords.y, gtp: best.move, packet };
  } finally {
    client.disconnect();
  }
}

function currentTurnNumber(board: BoardState): number {
  return getActiveVariationPath(board).length - 1;
}

// ── Composable — reactive wrapper for product UI ─────────────────────────────

/**
 * Vue composable driving `playEngineMoves` against the active board
 * in the global store. Surfaces reactive `isRunning` / `lastError`
 * and a cooperative `stop()` for host-component wiring. The store
 * is mirrored after each move via `onMoveApplied`, so the reactive
 * UI sees each engine move land before the next query starts.
 */
export function usePlayFromPosition(boardIdRef: Ref<BoardId | null>) {
  const isRunning = ref(false);
  const lastError = ref<Error | null>(null);
  let stopRequested = false;

  async function start(opts: {
    katagoUrl: string;
    untilPathLength: number;
    maxVisits: number;
    perMoveTimeoutMs?: number;
  }): Promise<void> {
    if (isRunning.value) {
      throw new Error('usePlayFromPosition.start called while a previous run is still active');
    }
    const boardId = boardIdRef.value;
    if (!boardId) throw new Error('usePlayFromPosition.start requires a non-null boardIdRef');

    const idx = store.boards.findIndex((b) => b.id === boardId);
    if (idx === -1) throw new Error(`usePlayFromPosition: board ${boardId} not in store`);

    isRunning.value = true;
    lastError.value = null;
    stopRequested = false;

    try {
      await playEngineMoves({
        katagoUrl: opts.katagoUrl,
        startBoard: store.boards[idx],
        untilPathLength: opts.untilPathLength,
        maxVisits: opts.maxVisits,
        perMoveTimeoutMs: opts.perMoveTimeoutMs,
        shouldStop: () => stopRequested,
        onMoveApplied: (next) => {
          // Re-resolve the index — concurrent store mutations could
          // have shifted positions. boardId is stable.
          const writeIdx = store.boards.findIndex((b) => b.id === boardId);
          if (writeIdx === -1) {
            throw new Error(`usePlayFromPosition: board ${boardId} disappeared mid-run`);
          }
          updateBoardState(writeIdx, next);
        },
      });
    } catch (err) {
      lastError.value = err instanceof Error ? err : new Error(String(err));
      throw lastError.value;
    } finally {
      isRunning.value = false;
    }
  }

  function stop(): void {
    stopRequested = true;
  }

  return { start, stop, isRunning, lastError };
}
