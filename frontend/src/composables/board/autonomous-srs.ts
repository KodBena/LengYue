/**
 * src/composables/board/autonomous-srs.ts
 *
 * First-slice abstractions for the autonomous SRS loop, per
 * `docs/notes/autonomous-srs-loop-revised.md`. Three named abstractions
 * (Policy / Driver / Recorder), each minimal, none coupled to where
 * the loop runs.
 *
 *   - `Policy`: produces a move for a board state (the autonomous
 *     "player"). Stateless from the driver's perspective; may issue
 *     proxy queries internally. The first-slice policy is
 *     `fixedNetworkPolicy`, which calls `queryEngineMove` against a
 *     configured proxy URL.
 *
 *   - `Driver` (`runAutonomousDriver`): orchestrates per-card and
 *     per-move iteration. Calls the Policy to generate each user move,
 *     drives `useReviewSession.processUserMove` to score it, calls the
 *     Recorder per move and per card. Handles the LOADING / AWAITING /
 *     ANALYZING / FINISHED / IDLE state machine.
 *
 *   - `Recorder`: writes results back. The interface is
 *     environment-agnostic; concrete implementations may write to
 *     stdout, a JSONL file (Node only), or any other sink. The driver
 *     never touches a filesystem directly.
 *
 * The runner (the script that brings up the store, authenticates, and
 * calls `runAutonomousDriver`) is a separate file — Node-only because
 * it depends on `process.env`, `fs`, etc. This file stays browser-
 * importable so a future in-browser observer slice can reuse the same
 * Policy / Driver code paths.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';
import type { BoardId, BoardState, CardId, NodeId, ReviewCard, ReviewStatus } from '../../types';
import { store } from '../../store';
import { useReviewSession } from '../review/useReviewSession';
import { waitForCondition } from '../reactive-settle';
import { queryEngineMove } from './usePlayFromPosition';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutonomousMove {
  readonly x: number;
  readonly y: number;
  /** GTP coordinate string for diagnostics ("Q16" etc.). */
  readonly gtp: string;
}

/**
 * Per-iteration policy hook. Receives the pre-move board snapshot and
 * the active card; returns the move to play. May `throw` to signal
 * "no legal move under this policy" (the driver records the failure
 * and moves on); throwing should be rare.
 */
export type Policy = (
  board: BoardState,
  card: ReviewCard,
) => Promise<AutonomousMove>;

/**
 * Per-event log entries the driver hands to the Recorder. Two shapes:
 * `move` (one per processed user move; carries the recorded score) and
 * `card-end` (one per card completion; carries pass/fail status).
 *
 * Discriminated by `kind` so a Recorder can fan-out to different sinks
 * (a CSV writer that ignores card-ends; a JSONL appender that writes
 * both; a stdout pretty-printer that summarizes).
 */
export type StopReason = 'card-budget' | 'stop-signal' | 'error-budget' | 'queue-exhausted';

export type RecorderEntry =
  | {
      readonly kind: 'move';
      readonly timestamp: number;
      readonly cardId: CardId;
      readonly cardIndex: number;
      readonly moveOrdinal: number;
      readonly userColor: 'B' | 'W';
      readonly userMoveGtp: string;
      readonly recordedScore: number | null;
      readonly elapsedMs: number;
    }
  | {
      readonly kind: 'card-end';
      readonly timestamp: number;
      readonly cardId: CardId;
      readonly cardIndex: number;
      readonly status: 'finished' | 'idle';
      readonly movesPlayed: number;
      readonly meanScore: number | null;
      readonly failureMessage?: string;
    }
  | {
      readonly kind: 'run-end';
      readonly timestamp: number;
      readonly cardsAttempted: number;
      readonly cardsFinished: number;
      readonly stopReason: StopReason;
    };

export interface Recorder {
  record(entry: RecorderEntry): Promise<void>;
  close(): Promise<void>;
}

export interface DriverOptions {
  readonly boardId: BoardId;
  readonly cards: readonly ReviewCard[];
  readonly policy: Policy;
  readonly recorder: Recorder;
  /**
   * Cooperative interrupt — checked before each move and at each
   * card boundary. Returns true to stop the loop after the in-flight
   * card resolves.
   */
  readonly shouldStop?: () => boolean;
  /**
   * Aborts the entire run when the running count of card-end entries
   * with `status: 'idle'` reaches this number. Defaults to 5; pass
   * `Infinity` to disable.
   */
  readonly errorBudget?: number;
}

export interface DriverResult {
  readonly cardsAttempted: number;
  readonly cardsFinished: number;
  readonly stopReason: StopReason;
}

// ─── Built-in policies ────────────────────────────────────────────────────────

export interface FixedNetworkPolicyOptions {
  readonly katagoUrl: string;
  readonly maxVisits: number;
  /**
   * SELECTOR routing key. Omit for non-SELECTOR proxies (LEAF / RELAY /
   * ECHO) — the wire `model` field is then absent and the proxy
   * dispatches per its native role.
   */
  readonly model?: string;
  /**
   * Per-query proxy timeout. Defaults to 60s — same as
   * `usePlayFromPosition`'s default.
   */
  readonly perMoveTimeoutMs?: number;
}

/**
 * Fixed-network, fixed-visits Policy. Issues `queryEngineMove`
 * against the configured proxy on each call; the engine's top
 * (`order === 0`) move is what the policy plays. First-slice
 * policy — multi-network and adaptive policies extend the pattern.
 *
 * Pass-shape: KataGo's response carries a GTP "pass" string when no
 * legal move is preferred. `queryEngineMove` already throws on this
 * (and on un-decodable returns); the driver catches and records the
 * card as IDLE.
 */
export function fixedNetworkPolicy(opts: FixedNetworkPolicyOptions): Policy {
  return async (board: BoardState, _card: ReviewCard) => {
    const result = await queryEngineMove({
      katagoUrl: opts.katagoUrl,
      board,
      maxVisits: opts.maxVisits,
      timeoutMs: opts.perMoveTimeoutMs,
      model: opts.model,
    });
    return { x: result.x, y: result.y, gtp: result.gtp };
  };
}

// ─── Driver ───────────────────────────────────────────────────────────────────

// The reactive-settle bridge (`waitForCondition`) lives in
// `composables/reactive-settle.ts` — extracted as a shared B1 primitive
// so the performance-scenario context reuses the same bridge. Here it
// bridges the driver's procedural loop to the review session's reactive
// state machine: `nextCard()` triggers a transition through Vue's
// reactivity graph; the driver awaits it before issuing the next move.

/**
 * Snapshot the latest engine system message for failure-mode
 * classification (timeout vs missing-delta vs other). Read after a
 * card transitions to IDLE — the message that triggered the
 * transition is the most recent entry.
 */
function lastSystemMessageText(): string | undefined {
  return store.engine.messages[0]?.text;
}

/**
 * Mean of a numeric array; null on empty. Used for the per-card
 * meanScore summary.
 */
function meanOrNull(scores: readonly number[]): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((a, b) => a + b, 0);
  return sum / scores.length;
}

/**
 * Run the autonomous driver against a fixed card queue. Returns when
 * the queue exhausts, the card-budget hits, the error-budget hits,
 * or the stop signal fires. The session is left in IDLE on exit
 * (clean post-condition for the runner).
 *
 * The driver instantiates its own `useReviewSession(boardIdRef)`
 * binding because Vue composables encapsulate per-board state in
 * closures — sharing one session instance across board changes would
 * be wrong, but the autonomous loop binds to a single board for the
 * whole run.
 */
export async function runAutonomousDriver(opts: DriverOptions): Promise<DriverResult> {
  const errorBudget = opts.errorBudget ?? 5;

  const boardIdRef: Ref<BoardId | null> = ref(opts.boardId);
  const session = useReviewSession(boardIdRef);

  let cardsAttempted = 0;
  let cardsFinished = 0;
  let cardsIdle = 0;
  let stopReason: StopReason = 'queue-exhausted';

  // Begin the session with the full prefetched queue. This loads the
  // first card; subsequent cards advance via `session.nextCard()`.
  await session.startSession(Array.from(opts.cards));
  await waitForCondition(
    () => session.state.value === 'AWAITING_MOVE' || session.state.value === 'IDLE',
  );

  // Per-card loop. Each iteration: play moves until the card finishes
  // or fails; record the card-end; advance.
  for (let cardIndex = 0; cardIndex < opts.cards.length; cardIndex++) {
    if (opts.shouldStop?.()) {
      stopReason = 'stop-signal';
      break;
    }
    if (cardsIdle >= errorBudget) {
      stopReason = 'error-budget';
      break;
    }

    const card = opts.cards[cardIndex];
    cardsAttempted++;

    const perCardScores: number[] = [];
    let moveOrdinal = 0;
    let cardStatus: 'finished' | 'idle' = 'idle';
    let failureMessage: string | undefined;

    // Per-move loop. Exits when the session leaves AWAITING_MOVE.
    while (session.state.value === 'AWAITING_MOVE' && !(opts.shouldStop?.())) {
      const board = store.boards.find((b) => b.id === opts.boardId);
      if (!board) {
        // The board disappeared mid-run — the workspace was reset, the
        // user navigated away, or some other catastrophic condition.
        // Per ADR-0002 fail loudly: bail rather than guess what to do.
        throw new Error(`runAutonomousDriver: board ${opts.boardId} disappeared mid-card (cardIndex=${cardIndex})`);
      }

      moveOrdinal++;
      let move: AutonomousMove;
      const t0 = Date.now();
      try {
        move = await opts.policy(board, card);
      } catch (err) {
        // Policy failure (proxy error, illegal-move surface from
        // queryEngineMove, etc.). Record the failure as a card-end
        // IDLE and break to the next card.
        failureMessage = `policy error: ${err instanceof Error ? err.message : String(err)}`;
        cardStatus = 'idle';
        break;
      }

      const scoresBefore = session.userMoveScores.value.length;
      await session.processUserMove(move.x, move.y);
      const elapsedMs = Date.now() - t0;

      const scoresAfter = session.userMoveScores.value.length;
      const recordedScore = scoresAfter > scoresBefore
        ? session.userMoveScores.value[scoresAfter - 1]
        : null;
      if (recordedScore !== null) perCardScores.push(recordedScore);

      // Determine user color from the move just played: applyGoMove
      // advances the board's `turn`, so the move belongs to the
      // OPPOSITE of the current `turn` after `processUserMove` returns.
      // Read from the active node instead — its `move.color` is the
      // authoritative record.
      const postBoard = store.boards.find((b) => b.id === opts.boardId);
      const postNode = postBoard?.nodes[postBoard.currentNodeId as NodeId];
      const userColor: 'B' | 'W' = (postNode?.move?.color ?? 'B') as 'B' | 'W';

      await opts.recorder.record({
        kind: 'move',
        timestamp: Date.now(),
        cardId: card.id,
        cardIndex,
        moveOrdinal,
        userColor,
        userMoveGtp: move.gtp,
        recordedScore,
        elapsedMs,
      });

      // Refresh state for the loop guard. processUserMove returns once
      // the session has transitioned out of ANALYZING; the new state
      // is AWAITING_MOVE (more moves to play), FINISHED (last move),
      // or IDLE (loud-failure branch).
    }

    // Card finished one way or another. Read the terminal status.
    const finalState: ReviewStatus = session.state.value;
    if (finalState === 'FINISHED') {
      cardStatus = 'finished';
      cardsFinished++;
    } else if (finalState === 'IDLE' && failureMessage === undefined) {
      // session-driven IDLE (timeout / missing-delta) — distinct from
      // policy-error IDLE which already set failureMessage above.
      // Guard on `failureMessage === undefined` (not on `cardStatus`)
      // because `cardStatus` defaults to 'idle'; using cardStatus as
      // the discriminator would silently skip the system-message read
      // on every session-driven IDLE.
      cardStatus = 'idle';
      failureMessage = lastSystemMessageText();
    }
    if (cardStatus === 'idle') cardsIdle++;

    await opts.recorder.record({
      kind: 'card-end',
      timestamp: Date.now(),
      cardId: card.id,
      cardIndex,
      status: cardStatus,
      movesPlayed: moveOrdinal,
      meanScore: meanOrNull(perCardScores),
      failureMessage,
    });

    // Advance the session — either to the next card (loadCard fires
    // and transitions back to AWAITING_MOVE) or to endSession (queue
    // exhausted, state goes to IDLE with empty queue). After IDLE we
    // wait for AWAITING_MOVE on the new card; after queue-exhaust the
    // outer `for` exits naturally.
    if (cardIndex < opts.cards.length - 1) {
      session.nextCard();
      await waitForCondition(
        () => session.state.value === 'AWAITING_MOVE' || session.state.value === 'IDLE',
      );
    } else {
      session.endSession();
    }
  }

  // If we stopped early, ensure the session is wound down so the
  // runner's cleanup is straightforward.
  if (stopReason === 'stop-signal' || stopReason === 'error-budget') {
    session.endSession();
  }

  await opts.recorder.record({
    kind: 'run-end',
    timestamp: Date.now(),
    cardsAttempted,
    cardsFinished,
    stopReason,
  });
  await opts.recorder.close();

  return { cardsAttempted, cardsFinished, stopReason };
}
