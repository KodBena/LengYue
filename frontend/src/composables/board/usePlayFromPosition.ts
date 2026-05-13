/**
 * src/composables/board/usePlayFromPosition.ts
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
import { KataGoClient } from '../../engine/katago/katago-client';
import { useQueryTelemetry } from '../useQueryTelemetry';

const telemetry = useQueryTelemetry();
import {
  type KataAnalysisResponse,
  type KataGoAnalysisQuery,
  type Player,
  type KataCoord,
} from '../../engine/katago/types';
import type { BoardId, BoardState } from '../../types';
import { store, updateBoardState } from '../../store';
import { applyGoMove } from '../../logic';
import { gtpToBoard } from './use-move-suggestions';
import {
  getActiveVariationPath,
  getBoardSize,
  getKomi,
  getInitialStones,
  moveToKataCoord,
} from '../../engine/util';

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
 * Telemetry meta the caller passes when it wants this query to
 * appear in the SPA's Toolbar queue tooltip. Optional — single-shot
 * test-harness helpers can skip it; the production match loop
 * passes it so each turn appears in the queue with model and ETA.
 */
interface AwaitTelemetryMeta {
  readonly kind: import('../useQueryTelemetry').QueryKind;
  readonly model: string | null;
  readonly visitsPerTurn: number | null;
  readonly label?: string;
}

/**
 * Subscribe a single query and resolve with the first final packet
 * (`isDuringSearch === false`) for `expectedTurn`. Intermediate
 * during-search packets are ignored. The subscription tears down via
 * the returned `unsub` regardless of which channel wins.
 *
 * When `telemetryMeta` is supplied, the call also registers the
 * query with the SPA's queue-telemetry singleton, records each
 * packet's `(turnNumber, visits, isDuringSearch)` for ETA
 * computation, and unregisters on settle (regardless of which
 * channel — final / timeout / error — wins). This is how the
 * engine-match loop surfaces in the Toolbar queue alongside
 * analysis-service-issued queries.
 */
function awaitFinalPacket(
  client: KataGoClient,
  query: KataGoAnalysisQuery,
  expectedTurn: number,
  timeoutMs: number,
  telemetryMeta?: AwaitTelemetryMeta,
): Promise<KataAnalysisResponse> {
  return new Promise((resolve, reject) => {
    let unsub: (() => void) | null = null;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub?.();
      if (telemetryMeta) telemetry.unregisterQuery(query.id);
      fn();
    };
    if (telemetryMeta) {
      telemetry.registerQuery({
        queryId:       query.id,
        kind:          telemetryMeta.kind,
        boardId:       null,
        model:         telemetryMeta.model,
        startTimeMs:   Date.now(),
        turnsTotal:    1,
        visitsPerTurn: telemetryMeta.visitsPerTurn,
        label:         telemetryMeta.label,
        // Cancel: terminate the proxy-side query (so the engine
        // stops computing the deeper analysis), then settle the
        // promise with a rejection. The `playEngineMatch` loop's
        // try/catch handles the rejection and tears the match
        // down — cancelling one turn cancels the match, since
        // the loop can't skip past an aborted turn.
        cancel: () => {
          void client.sendCommand({
            id: `term-cancel-${Date.now()}`,
            action: 'terminate',
            terminateId: query.id,
          });
          settle(() => reject(
            new Error(`Cancelled by user (queue-tooltip) for queryId=${query.id}`),
          ));
        },
      });
    }
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
      if (telemetryMeta) {
        const rootVisits = r.rootInfo?.visits ?? 0;
        telemetry.recordPacket(query.id, r.turnNumber, rootVisits, r.isDuringSearch);
      }
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
 * caller-supplied flags, registry toggles, and the connected proxy's
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

// ── Engine-vs-engine match (per-color options) ────────────────────────────────

export interface PlayEngineMatchSide {
  /**
   * SELECTOR routing key for this side's queries (omitted if
   * undefined). When the connected proxy is not in SELECTOR mode the
   * field is benign — proxy ignores it, both sides play through the
   * single connected LEAF.
   */
  readonly model?: string;
  readonly maxVisits: number;
}

export interface PlayEngineMatchOptions {
  readonly katagoUrl: string;
  readonly startBoard: BoardState;
  /**
   * Number of moves to play from the starting position (each
   * placement counts; passes still count as a move). The match
   * stops when the active path has grown by this many nodes
   * relative to the start.
   */
  readonly numMoves: number;
  readonly black: PlayEngineMatchSide;
  readonly white: PlayEngineMatchSide;
  readonly perMoveTimeoutMs?: number;
  readonly shouldStop?: () => boolean;
  readonly onMoveApplied?: (board: BoardState) => void;
  /**
   * Optional per-query capability opt-in forwarded verbatim on every
   * query. The match doesn't need `delta_analysis` for its own
   * purposes (it only reads `moveInfos[0].move`), so leaving this
   * undefined and letting the proxy's legacy auto-engage path fire
   * is fine. Exposed as a pass-through so harness scenarios that
   * want explicit control (e.g., opting out of all enrichment to
   * measure raw KataGo throughput) can still author it.
   */
  readonly capabilities?: Record<string, Record<string, unknown>>;
}

/**
 * Play a match between two engines (or the same engine vs itself)
 * from `startBoard` for `numMoves` moves. Per-iteration the side to
 * move is read from `board.turn`; the corresponding `black` / `white`
 * options supply the SELECTOR `model` (when in SELECTOR mode) and
 * the per-side `maxVisits`.
 *
 * Sibling to `playEngineMoves` — that one runs a single configured
 * engine; this one alternates per `board.turn`. The two share helpers
 * (`connectFresh`, `awaitFinalPacket`, `buildAnalyzeQuery`) but the
 * options shapes differ enough that one function with a discriminator
 * would be less clear than two siblings.
 *
 * Connection lifetime spans the whole match — one WS open per call,
 * regardless of how many moves are played; the SELECTOR's per-upstream
 * pool fans alternating queries out per-`model`. Returns the final
 * board state. Does NOT touch the global store; the optional
 * `onMoveApplied` callback is how the composable opt-in to store
 * mirroring.
 */
export async function playEngineMatch(opts: PlayEngineMatchOptions): Promise<BoardState> {
  const timeoutMs = opts.perMoveTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const client = await connectFresh(opts.katagoUrl);
  let board = opts.startBoard;
  const startPathLength = getActiveVariationPath(board).length;
  const targetPathLength = startPathLength + opts.numMoves;
  try {
    while (!(opts.shouldStop?.() ?? false)
        && getActiveVariationPath(board).length < targetPathLength) {
      const turn = currentTurnNumber(board);
      const playerColor = board.turn;
      const side = playerColor === 'B' ? opts.black : opts.white;
      const { query, expectedTurn } = buildAnalyzeQuery(
        board,
        side.maxVisits,
        `match-${playerColor}-${turn}-${Date.now()}`,
        side.model,
        opts.capabilities,
      );
      const packet = await awaitFinalPacket(client, query, expectedTurn, timeoutMs, {
        kind:          'match',
        model:         side.model ?? null,
        visitsPerTurn: side.maxVisits,
        label:         playerColor,
      });
      const best = packet.moveInfos.find((m) => m.order === 0);
      if (!best) {
        throw new Error(`playEngineMatch: turn ${expectedTurn} packet has no order-0 moveInfo`);
      }
      const coords = gtpToBoard(best.move);
      if (!coords) {
        throw new Error(`playEngineMatch: engine recommended pass at turn ${expectedTurn}`);
      }
      const next = applyGoMove(board, coords.x, coords.y);
      if (!next) {
        throw new Error(`playEngineMatch: engine's top move ${best.move} is illegal at turn ${expectedTurn}`);
      }
      board = next;
      opts.onMoveApplied?.(board);
    }
    return board;
  } finally {
    client.disconnect();
  }
}

// ── Composable — reactive wrapper for product UI ─────────────────────────────

/**
 * Vue composable driving `playEngineMatch` against the active board
 * in the global store. Surfaces reactive `isRunning` / `lastError`
 * and a cooperative `stop()` for host-component wiring (the Toolbar's
 * STOP MATCH button is the canonical caller). The store is mirrored
 * after each move via `onMoveApplied`, so the reactive UI sees each
 * engine move land before the next query starts.
 *
 * Sibling to `usePlayFromPosition` — that one drives a single engine
 * playing forward; this one drives an engine-vs-engine match. The
 * lifecycle shape is identical; the option surface differs (per-color
 * `{model, maxVisits}` vs. single `maxVisits`), so two composables
 * keep each call site honest about which mode is in use.
 */
export function usePlayMatch(boardIdRef: Ref<BoardId | null>) {
  const isRunning = ref(false);
  const lastError = ref<Error | null>(null);
  let stopRequested = false;

  async function start(opts: {
    katagoUrl: string;
    numMoves: number;
    black: PlayEngineMatchSide;
    white: PlayEngineMatchSide;
    perMoveTimeoutMs?: number;
  }): Promise<void> {
    if (isRunning.value) {
      throw new Error('usePlayMatch.start called while a previous match is still active');
    }
    const boardId = boardIdRef.value;
    if (!boardId) throw new Error('usePlayMatch.start requires a non-null boardIdRef');

    const idx = store.boards.findIndex((b) => b.id === boardId);
    if (idx === -1) throw new Error(`usePlayMatch: board ${boardId} not in store`);

    isRunning.value = true;
    lastError.value = null;
    stopRequested = false;

    try {
      await playEngineMatch({
        katagoUrl: opts.katagoUrl,
        startBoard: store.boards[idx],
        numMoves: opts.numMoves,
        black: opts.black,
        white: opts.white,
        perMoveTimeoutMs: opts.perMoveTimeoutMs,
        shouldStop: () => stopRequested,
        onMoveApplied: (next) => {
          // Re-resolve the index — concurrent store mutations could
          // have shifted positions. boardId is stable.
          const writeIdx = store.boards.findIndex((b) => b.id === boardId);
          if (writeIdx === -1) {
            throw new Error(`usePlayMatch: board ${boardId} disappeared mid-match`);
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
