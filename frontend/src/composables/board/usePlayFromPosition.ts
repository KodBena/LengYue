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
 *      polling. Mutates the global store via a surgical `mutateBoard`
 *      per-move merge (the match's delta-emission contract; see
 *      `EngineMoveApplied`).
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
  type PerQueryCapabilities,
  type Player,
  type KataCoord,
} from '../../engine/katago/types';
import type { BoardId, BoardState, GameNode, NodeId, QueryId } from '../../types';
import { asQueryId } from '../../services/query-id';
import { store } from '../../store';
import { applyGoMove } from '../../logic';
import { gtpToBoard } from './use-move-suggestions';
import { getPath } from '../../engine/navigator';
import { reconcileEngineMoveDelta } from './engine-move-delta-reconcile';
import {
  getActiveVariationPath,
  getBoardSize,
  getKomi,
  getInitialStones,
  moveToKataCoord,
} from '../../engine/util';
import { ENGINE_PLAY_MOVE_TIMEOUT_MS } from '../../lib/timing';

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
    // `query.id` is the QueryId the caller minted (passed via buildAnalyzeQuery,
    // stored into the wire-string `id`); lift it back to the brand for the
    // telemetry calls below — the one re-brand boundary in this module.
    const qid = asQueryId(query.id);
    let unsub: (() => void) | null = null;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub?.();
      if (telemetryMeta) telemetry.unregisterQuery(qid);
      fn();
    };
    if (telemetryMeta) {
      telemetry.registerQuery({
        queryId:       qid,
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
      // res is the broad KataGoResponse union; probe for an `error` field as
      // an open record (the proxy can surface a wire error in-band).
      if ('error' in (res as unknown as Record<string, unknown>)) {
        const errMsg = (res as unknown as { error: string }).error; // error branch confirmed above; read the message
        settle(() => reject(
          new Error(`KataGo error for queryId=${query.id}: ${errMsg}`),
        ));
        return;
      }
      // No error field: this is an analysis response on this analysis query.
      const r = res as KataAnalysisResponse;
      if (telemetryMeta) {
        const rootVisits = r.rootInfo?.visits ?? 0;
        telemetry.recordPacket(qid, r.turnNumber, rootVisits, r.isDuringSearch);
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
  queryId: QueryId,
  model?: string,
  capabilities?: PerQueryCapabilities,
): { query: KataGoAnalysisQuery; expectedTurn: number } {
  // Root-to-currentNodeId path — not root-to-leaf via
  // `getActiveVariationPath`. The query asks KataGo "given the
  // moves played to reach the current position, what's the best
  // move at the next turn?" If we sent the active-variation path
  // instead, KataGo would evaluate the position at the leaf of
  // any pre-existing future variation (the user navigated INTO a
  // tree that already extends past their cursor) and return the
  // top move for the wrong position; `applyGoMove(board, …)`
  // would then play that wrong-position move at the current node.
  // For the match call site this manifests as "first move wrong,
  // succeeding moves alright" — once a non-matching move is
  // played, the active variation collapses to root→current and
  // subsequent queries happen to use the correct expectedTurn.
  const path = getPath(board.nodes, board.currentNodeId);
  const moves = path
    .map((id) => board.nodes[id]?.move ?? null)
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => [m.color, moveToKataCoord(m)] as [Player, KataCoord]); // fix the 2-element literal to the [Player, KataCoord] move-pair tuple
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

/**
 * Per-move delta the self-play loop emits to `onMoveApplied`. The
 * single-engine register of `playEngineMatch`'s `MatchMoveApplied`
 * (see that interface's docstring for the full rationale) — same
 * three fields, same surgical-merge contract, applied to the
 * one-engine-playing-forward shape.
 *
 * It replaces the earlier `(board: BoardState) => void`, which
 * conflated two concepts: the loop's internal cursor (where the
 * engine just played from / to) and the store's user-visible cursor
 * (where the user is currently looking). Passing the full
 * `BoardState` forced the consumer to clobber the store wholesale
 * via `updateBoardState`, and `updateBoardState` re-converges object
 * identity — `store.boards[index]` becomes the loop's own object —
 * so a deep clone at the top of the loop alone is INSUFFICIENT (the
 * store and the loop re-share one graph after the first mirror).
 * Worse, any user navigation during the run then mutated the loop's
 * cursor in place through the shared reference, and the next engine
 * query went out from where the user had navigated to, not from
 * where the loop was playing.
 *
 * The delta-only shape removes both failure modes. The loop carries
 * its own deep-cloned `board` internally and emits just the per-move
 * change here; the consumer (`usePlayFromPosition.start`'s
 * `onMoveApplied`) does a surgical `mutateBoard` that appends the new
 * child to the parent (or bumps `activeChildIndex` for an
 * existing-child reuse) and navigates the user's view to the new
 * pointer only when they were tracking — i.e., their
 * `currentNodeId === previousPointer` at the moment the move lands.
 */
export interface EngineMoveApplied {
  /** The node the loop played FROM on this move. */
  readonly previousPointer: NodeId;
  /**
   * The node the loop is now at after applying its move. This is
   * either a freshly-created node (when `newNode !== null`) or an
   * existing child of `previousPointer` whose move duplicates what
   * the engine recommended (when `newNode === null`).
   */
  readonly newPointer: NodeId;
  /**
   * The full `GameNode` for the newly-created child, when the
   * engine's move did not duplicate an existing child of
   * `previousPointer`. `null` when the move descended into an
   * existing child instead — in that case the consumer only needs
   * to bump the parent's `activeChildIndex`.
   */
  readonly newNode: GameNode | null;
}

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
   * Fires after each engine move is applied to the loop's local
   * board. The consumer is responsible for reconciling the delta
   * into the store and deciding whether to follow with the user's
   * view. See `EngineMoveApplied`'s docstring for the rationale and
   * the surgical-merge contract — this is the single-engine register
   * of `playEngineMatch`'s `MatchMoveApplied` delta-emission contract.
   * The pure caller (the harness) leaves it undefined and reads only
   * the final return value.
   */
  readonly onMoveApplied?: (delta: EngineMoveApplied) => void;
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
  readonly capabilities?: PerQueryCapabilities;
}

/**
 * Drive engine self-play from `startBoard` until the active path
 * reaches `untilPathLength`. Returns the final board state. Does NOT
 * touch the global store; the optional `onMoveApplied` callback is
 * how the composable opt-in to store mirroring.
 *
 * Connection lifetime spans the whole loop — one WS open per call,
 * regardless of how many moves are played.
 *
 * **Cursor independence from the store.** Like `playEngineMatch`,
 * this loop deep-clones `opts.startBoard` at the top so the internal
 * `board` is fully independent of any reactive store object. Without
 * this, `mutateBoard` and `navigateTo` (called from the SPA's
 * user-navigation paths) would mutate the loop's cursor and stones in
 * place via shared object references — and the next engine query
 * would go out from where the user navigated to, not from where the
 * loop was playing. A clone at the top is necessary but not
 * sufficient: the product consumer used to mirror each applied board
 * back wholesale via `updateBoardState`, which re-converges object
 * identity (`store.boards[index]` becomes the loop's own object), so
 * the store and the loop re-shared one graph after the first mirror.
 * The per-move `onMoveApplied` callback now emits an
 * `EngineMoveApplied` delta instead, letting the consumer reconcile
 * the new node into the store surgically (and decide independently
 * whether to follow with the user's view). This is the single-engine
 * register of the match's 2026-05-16 cursor-independence fix; the
 * `playenginemoves-cursor-conflation-twin` work-status item is its
 * record. The per-move queries themselves are root→current via
 * `buildAnalyzeQuery` and unaffected by the path-shape class.
 */
export async function playEngineMoves(opts: PlayEngineMovesOptions): Promise<BoardState> {
  const timeoutMs = opts.perMoveTimeoutMs ?? ENGINE_PLAY_MOVE_TIMEOUT_MS;
  const client = await connectFresh(opts.katagoUrl);
  // Deep-clone so the loop's local cursor is independent of the
  // store. JSON round-trip is used deliberately for the same
  // reasons `playEngineMatch` documents at its own clone site
  // (structuredClone throws DataCloneError on a Vue reactive Proxy;
  // toRaw strips only the outer layer; the JSON round-trip reads
  // every property through the proxy's [[Get]] traps and reifies a
  // fresh POJO graph, lossless for `BoardState`'s pure-POJO shape).
  // See that site's comment and the docstring above for the full
  // rationale on why the loop's cursor must be store-independent.
  let board: BoardState = JSON.parse(JSON.stringify(opts.startBoard));
  try {
    // Root→leaf is the genuine shape for the stop condition:
    // `untilPathLength` is documented as "stop when the ACTIVE PATH
    // reaches this many nodes", which deliberately counts any
    // pre-existing forward variation (contrast `playEngineMatch`'s
    // per-iteration `numMoves` contract, the postmortem's Bug A).
    while (!(opts.shouldStop?.() ?? false)
        && getActiveVariationPath(board).length < opts.untilPathLength) {
      const turn = currentTurnNumber(board);
      const { query, expectedTurn } = buildAnalyzeQuery(
        board,
        opts.maxVisits,
        asQueryId(`play-${turn}-${Date.now()}`),
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
      const previousPointer = board.currentNodeId;
      const next = applyGoMove(board, coords.x, coords.y);
      if (!next) {
        throw new Error(`playEngineMoves: engine's top move ${best.move} is illegal at turn ${expectedTurn}`);
      }
      const newPointer = next.currentNodeId;
      // Existing-child reuse: when the engine's move duplicates an
      // existing child of `previousPointer`, `applyGoMove` descends
      // rather than creates. The discriminator (mirror of the
      // match's): was `newPointer` in the BEFORE-move `board.nodes`?
      const isNewNode = !board.nodes[newPointer];
      const newNode = isNewNode ? next.nodes[newPointer] : null;

      board = next;
      opts.onMoveApplied?.({ previousPointer, newPointer, newNode });
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
  readonly capabilities?: PerQueryCapabilities;
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
      asQueryId(`query-${Date.now()}`),
      opts.model,
      opts.capabilities,
    );
    const packet = await awaitFinalPacket(client, query, expectedTurn, opts.timeoutMs ?? ENGINE_PLAY_MOVE_TIMEOUT_MS);
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

// "What turn is the current position at?" is a root→current question —
// the prior `getActiveVariationPath(board).length - 1` answered with the
// LEAF's depth, which diverges from the cursor's whenever a pre-existing
// forward variation extends past it (the dedup-descend case). The value
// only labels query ids (`play-${turn}` / `match-${color}-${turn}`), so
// the divergence was cosmetic, but it was the same shape confusion the
// path brands close (match postmortem §4; history-lessons audit §3.4).
function currentTurnNumber(board: BoardState): number {
  return getPath(board.nodes, board.currentNodeId).length - 1;
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

/**
 * Per-move delta the match emits to `onMoveApplied`. Replaces the
 * earlier `(board: BoardState) => void` shape, which conflated two
 * concepts: the match's internal cursor (where the engine just
 * played from / to) and the store's user-visible cursor (where
 * the user is currently looking). Passing the full `BoardState`
 * forced the consumer to clobber the store wholesale, which in
 * turn meant any user navigation during the match got snapped
 * back to the match's cursor on the next move — and, more
 * insidiously, that the match's local `board` variable was the
 * same reactive object as the store's board, so user navigation
 * mid-match mutated the match's cursor and the next engine query
 * went out from where the user had navigated to.
 *
 * The delta-only shape removes both failure modes. The match
 * carries its own deep-cloned `matchBoard` internally and emits
 * just the per-move change here; the consumer
 * (`usePlayMatch.start`'s `onMoveApplied`) does a surgical
 * `mutateBoard` that appends the new child to the parent (or
 * bumps `activeChildIndex` for an existing-child reuse) and
 * navigates the user's view to the new pointer only when they
 * were tracking — i.e., their `currentNodeId === previousPointer`
 * at the moment the move lands.
 */
export interface MatchMoveApplied {
  /** The node the match played FROM on this move. */
  readonly previousPointer: NodeId;
  /**
   * The node the match is now at after applying its move. This is
   * either a freshly-created node (when `newNode !== null`) or an
   * existing child of `previousPointer` whose move duplicates what
   * the engine recommended (when `newNode === null`).
   */
  readonly newPointer: NodeId;
  /**
   * The full `GameNode` for the newly-created child, when the
   * engine's move did not duplicate an existing child of
   * `previousPointer`. `null` when the move descended into an
   * existing child instead — in that case the consumer only needs
   * to bump the parent's `activeChildIndex`.
   */
  readonly newNode: GameNode | null;
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
  /**
   * Fires after each engine move is applied to the match's local
   * board. The consumer is responsible for reconciling the delta
   * into the store and deciding whether to follow with the user's
   * view. See `MatchMoveApplied`'s docstring for the rationale and
   * the surgical-merge contract.
   */
  readonly onMoveApplied?: (delta: MatchMoveApplied) => void;
  /**
   * Optional per-query capability opt-in forwarded verbatim on every
   * query. The match doesn't need `delta_analysis` for its own
   * purposes (it only reads `moveInfos[0].move`), so leaving this
   * undefined and letting the proxy's legacy auto-engage path fire
   * is fine. Exposed as a pass-through so harness scenarios that
   * want explicit control (e.g., opting out of all enrichment to
   * measure raw KataGo throughput) can still author it.
   */
  readonly capabilities?: PerQueryCapabilities;
}

/**
 * Play a match between two engines (or the same engine vs itself)
 * from `startBoard` for `numMoves` moves. Per-iteration the side to
 * move is read from `matchBoard.turn`; the corresponding `black` /
 * `white` options supply the SELECTOR `model` (when in SELECTOR mode)
 * and the per-side `maxVisits`.
 *
 * Sibling to `playEngineMoves` — that one runs a single configured
 * engine; this one alternates per `matchBoard.turn`. The two share
 * helpers (`connectFresh`, `awaitFinalPacket`, `buildAnalyzeQuery`)
 * but the options shapes differ enough that one function with a
 * discriminator would be less clear than two siblings.
 *
 * **Cursor independence from the store.** The match deep-clones
 * `opts.startBoard` at the top so the internal `matchBoard` is
 * fully independent of any reactive store object. Without this,
 * `mutateBoard` and `navigateTo` (called from the SPA's
 * user-navigation paths) would mutate the match's cursor and
 * stones in place via shared object references — and the next
 * engine query would go out from where the user navigated to,
 * not from where the match was playing. The per-move
 * `onMoveApplied` callback emits a `MatchMoveApplied` delta that
 * lets the consumer reconcile the new node into the store
 * surgically (and decide independently whether to follow with the
 * user's view).
 *
 * Connection lifetime spans the whole match — one WS open per call,
 * regardless of how many moves are played; the SELECTOR's per-upstream
 * pool fans alternating queries out per-`model`. Returns the final
 * matchBoard. Does NOT touch the global store; the optional
 * `onMoveApplied` callback is how the composable opt-in to store
 * mirroring.
 */
export async function playEngineMatch(opts: PlayEngineMatchOptions): Promise<BoardState> {
  const timeoutMs = opts.perMoveTimeoutMs ?? ENGINE_PLAY_MOVE_TIMEOUT_MS;
  const client = await connectFresh(opts.katagoUrl);
  // Deep-clone so the match's local cursor is independent of the
  // store. JSON round-trip is used deliberately:
  //   - `structuredClone(opts.startBoard)` throws `DataCloneError`
  //     when `opts.startBoard` is a Vue reactive proxy (Proxy
  //     objects aren't in the structured-clone supported-types
  //     list).
  //   - `structuredClone(toRaw(opts.startBoard))` only unwraps the
  //     top level — nested object reads still go through Vue's
  //     reactivity layer and may yield proxies for the inner
  //     payloads (`nodes`, `stones`, …), which then trip the
  //     clone algorithm.
  //   - `JSON.parse(JSON.stringify(_))` reads every property
  //     through the proxy's [[Get]] traps (which Vue forwards to
  //     the underlying data), produces a plain JSON tree, and
  //     reifies a fresh POJO graph. `BoardState` is a pure POJO
  //     shape (primitives, `Record`s, arrays, `Point | null`) —
  //     no Dates / Maps / Sets / functions / undefined-fields-
  //     that-matter — so the round-trip is lossless. The branded
  //     `BoardId` / `NodeId` types erase at runtime, so the cast
  //     back to `BoardState` is honest.
  // See the docstring above for the rationale on why the match's
  // cursor must be independent of the store at all.
  let matchBoard: BoardState = JSON.parse(JSON.stringify(opts.startBoard));
  // Count iterations directly rather than tracking active-path length
  // growth. `applyGoMove` descends into a pre-existing matching child
  // when the engine's top move duplicates an existing variation node,
  // which leaves the active path's length unchanged — so a length-
  // delta termination condition lets the loop silently run through
  // every pre-existing forward node before counting any move toward
  // `numMoves`. Concretely: starting at ply 37 in a tree that already
  // extends to ply 148, a request for 20 moves used to descend 111
  // plies first (each iteration still consults KataGo) and then
  // create 20 new nodes, terminating at ply 168. The iteration
  // counter makes the intent explicit — each engine turn counts
  // exactly once, whether the move dedups into an existing child or
  // creates a fresh one.
  let movesPlayed = 0;
  try {
    while (!(opts.shouldStop?.() ?? false) && movesPlayed < opts.numMoves) {
      const turn = currentTurnNumber(matchBoard);
      const playerColor = matchBoard.turn;
      const side = playerColor === 'B' ? opts.black : opts.white;
      const { query, expectedTurn } = buildAnalyzeQuery(
        matchBoard,
        side.maxVisits,
        asQueryId(`match-${playerColor}-${turn}-${Date.now()}`),
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
      const previousPointer = matchBoard.currentNodeId;
      const next = applyGoMove(matchBoard, coords.x, coords.y);
      if (!next) {
        throw new Error(`playEngineMatch: engine's top move ${best.move} is illegal at turn ${expectedTurn}`);
      }
      const newPointer = next.currentNodeId;
      // Existing-child reuse: when the engine's move duplicates an
      // existing child of `previousPointer`, `applyGoMove` descends
      // rather than creates. The consumer's reconciliation only
      // needs to bump `activeChildIndex` in that case. The
      // discriminator: was `newPointer` in the BEFORE-move
      // `matchBoard.nodes`?
      const isNewNode = !matchBoard.nodes[newPointer];
      const newNode = isNewNode ? next.nodes[newPointer] : null;

      matchBoard = next;
      movesPlayed++;
      opts.onMoveApplied?.({ previousPointer, newPointer, newNode });
    }
    return matchBoard;
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
        // Surgical merge via the shared `reconcileEngineMoveDelta`
        // helper. Appends the new child (new-node case) or bumps
        // `activeChildIndex` (existing-child reuse), then advances
        // the user's cursor only when they were tracking. See
        // `engine-move-delta-reconcile.ts` for the full contract
        // and the ADR-0002 fail-loud invariants.
        onMoveApplied: (delta) => reconcileEngineMoveDelta(boardId, delta, 'usePlayMatch'),
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
        // Surgical merge via the shared `reconcileEngineMoveDelta`
        // helper. Appends the new child (new-node case) or bumps
        // `activeChildIndex` (existing-child reuse), then advances
        // the user's cursor only when they were tracking. See
        // `engine-move-delta-reconcile.ts` for the full contract
        // and the ADR-0002 fail-loud invariants.
        onMoveApplied: (delta) => reconcileEngineMoveDelta(boardId, delta, 'usePlayFromPosition'),
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
