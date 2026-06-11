/**
 * src/composables/board/useBoardMoveRouting.ts
 *
 * Board-mutation entry-point routing — the grading-integrity policy
 * extracted from App.vue (work-status item
 * app-vue-style-and-wiring-extraction; shape sketched in the
 * 2026-06-10 history-lessons audit's arch-ergonomics findings).
 *
 * Both board-mutation entry points (click-to-play and paste-PV) are
 * gated on the review session's state so free play cannot bypass the
 * SR loop's N-move discipline and per-move grading:
 *
 *   - AWAITING_MOVE  → click routes to the session's single-move
 *                      handler (which enforces the move count and
 *                      grades the move); paste-PV is refused.
 *   - LOADING /      → both entry points refuse (transient SR states;
 *     ANALYZING        a board mutation would race the SR lifecycle).
 *                      Shared predicate: `isReviewTransientState`
 *                      (ADR-0011 Rule 4 — one call per entry point,
 *                      never a copy of the state literals).
 *   - IDLE / FINISHED → free play and paste-PV are allowed (FINISHED
 *                      is the intermission — post-evaluation
 *                      exploration is part of the pedagogy).
 *
 * The "play vs engine" trigger rides the free-play branch: a move
 * played FROM a green-ringed game head fires the engine responder
 * after the move lands (see `useEngineResponder` for the head
 * contract).
 *
 * License: Public Domain (The Unlicense)
 */

import type { ComputedRef } from 'vue';
import {
  store,
  activeBoard,
  updateBoardState,
  pushSystemMessage,
} from '../../store';
import { i18n } from '../../i18n';
import { applyGoMove } from '../../logic';
import type { BoardState, ReviewStatus } from '../../types';
import type { PvMove } from './use-pv-animation';
import { findGameByHead, type EngineResponderHandle } from './useEngineResponder';
import { isReviewTransientState } from '../review/useReviewSession';

/**
 * The subset of `useReviewSession`'s return surface the routing gate
 * consults. Structural on purpose: tier-3 tests drive the routing
 * against the real composable, and the narrow shape documents exactly
 * which review surface the gating policy depends on.
 */
export interface ReviewSessionGate {
  state: ComputedRef<ReviewStatus>;
  processUserMove: (x: number, y: number) => Promise<void>;
}

export interface BoardMoveRoutingHandle {
  handleBoardMove: (x: number, y: number) => void;
  handlePastePv: (pv: PvMove[]) => void;
}

export function useBoardMoveRouting(
  reviewSession: ReviewSessionGate,
  engineResponder: EngineResponderHandle,
): BoardMoveRoutingHandle {
  function handleBoardMove(x: number, y: number): void {
    // AWAITING_MOVE: route to the review session's single-move
    // handler. The session enforces N-move discipline and grades
    // each move; a free-play applyGoMove here would silently bypass
    // both the count and the grading.
    if (reviewSession.state.value === 'AWAITING_MOVE') {
      // Self-handling fire-and-forget: processUserMove handles its
      // expected failures (timeout → IDLE + system message; abort →
      // silent return) internally; an unexpected error propagates to
      // the window unhandled-rejection backstop, surfacing loudly
      // (ADR-0002) — the same behaviour this call had at its
      // pre-extraction App.vue call site (where .vue scripts sit
      // outside the no-floating-promises lint surface).
      void reviewSession.processUserMove(x, y);
      return;
    }
    // LOADING / ANALYZING: transient SR states. Board is mid-load
    // or mid-evaluation; free play here would race the SR lifecycle
    // (LOADING's positioning, or ANALYZING's reading of the
    // just-played position to compute the grade). Shared guard
    // with handlePastePv — both entry points use isReviewTransientState
    // so a new board-mutation path needs only one call, not a copy of
    // the LOADING/ANALYZING literals (ADR-0011 Rule 4).
    if (isReviewTransientState(reviewSession.state.value)) {
      return;
    }
    // IDLE (no review running) or FINISHED (intermission — post-
    // evaluation exploration phase): free play. Intermission is when
    // the user reads branches off the evaluated position; per the
    // pedagogy in the umbrella handoff doc ("heredity tracking
    // offloads branching problems"), exploration here is part of
    // the learning experience the SR loop serves. Matches
    // `handlePastePv`'s policy of allowing exploration in
    // non-AWAITING_MOVE states.
    if (!activeBoard.value) return;
    // "Play vs engine" trigger: if the cursor was at a green-ringed
    // game head BEFORE this move, fire the responder AFTER the move
    // lands so the engine answers. Capture the head-game BEFORE
    // applyGoMove so we know which game (if any) to advance.
    // Off-line moves (cursor not at a head) don't trigger.
    const prevNodeId = activeBoard.value.currentNodeId;
    const boardId = activeBoard.value.id;
    const gameAtHead = findGameByHead(activeBoard.value, prevNodeId);
    const next = applyGoMove(activeBoard.value, x, y);
    if (!next) return;
    updateBoardState(store.activeBoardIndex, next);
    if (gameAtHead !== null) {
      // Self-handling fire-and-forget: fireAndAdvanceHead surfaces
      // its own failures via pushSystemMessage (see its contract).
      void engineResponder.fireAndAdvanceHead(boardId, gameAtHead.startNodeId);
    }
  }

  /**
   * Paste a principal variation into the active board's game tree.
   * Loops applyGoMove sequentially: each call either descends into
   * an existing child that already plays the coordinate, or creates
   * a new child. The dedup behaviour at logic.ts:79–82 means the
   * final tree is correct whether the PV is wholly new, wholly
   * pre-existing, or any partial overlap. After the loop the board's
   * currentNodeId sits at the PV leaf (the "advance to PV leaf"
   * cursor behaviour the user picked). Illegal moves surface a
   * system message and accept the legal prefix per ADR-0002 — fail
   * loudly, but don't discard useful work.
   *
   * No-op during AWAITING_MOVE review state: the review session
   * enforces single-move discipline and pasting a whole PV would
   * silently bypass it. Also blocked during LOADING and ANALYZING
   * (transient states where board mutation races the SR lifecycle),
   * matching handleBoardMove's posture. Both use isReviewTransientState
   * as the shared guard (ADR-0011 Rule 4). Other review states
   * (FINISHED / intermission) allow paste — those are study phases
   * where exploration is the point.
   */
  function handlePastePv(pv: PvMove[]): void {
    if (reviewSession.state.value === 'AWAITING_MOVE') return;
    if (isReviewTransientState(reviewSession.state.value)) return;
    if (!activeBoard.value || pv.length === 0) return;

    let board: BoardState = activeBoard.value;
    for (const move of pv) {
      const next = applyGoMove(board, move.x, move.y);
      if (!next) {
        // i18n.global.t (the composable-layer idiom useReviewSession
        // established) rather than useI18n()'s component-scoped t —
        // same catalogs, no component-instance requirement.
        pushSystemMessage('warning', i18n.global.t('moveSuggestions.pasteIllegal', {
          n: move.moveNumber,
          x: move.x,
          y: move.y,
        }));
        break;
      }
      board = next;
    }
    if (board !== activeBoard.value) {
      updateBoardState(store.activeBoardIndex, board);
    }
  }

  return { handleBoardMove, handlePastePv };
}
