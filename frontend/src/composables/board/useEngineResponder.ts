/**
 * src/composables/board/useEngineResponder.ts
 *
 * "Play vs engine" trigger surface. Exposes a single async verb:
 * `fireAndAdvanceHead(boardId, gameStartNodeId)` — queries the
 * engine at the board's current position, applies the engine's
 * top move via `applyGoMove` + `updateBoardState`, then advances
 * the named game's `currentHeadNodeId` to the post-engine-move
 * position so the single green ring tracks the new user-turn
 * position.
 *
 * Design (per the user's clarification on
 * `docs/worklog/2026-05-27-play-vs-engine.md`):
 *
 *   - Green ring marks exactly one node per game (the current
 *     head); engine fires only when the user makes a move FROM
 *     the head. Off-line navigation does not fire. The head
 *     advances forward each round, and the prior head is no
 *     longer green.
 *   - No reactive watcher — the caller (App.vue's
 *     `handleBoardMove`) explicitly invokes the responder when
 *     it detects a move from a current head. This is the
 *     "much simpler" shape the user contrasted against the
 *     prior descendant-tree responder (which fired on any
 *     cursor change inside a game's subtree).
 *   - Start-game with an engine-turn position: caller invokes
 *     this verb right after creating the game entry; the
 *     responder plays one move and advances the head past the
 *     engine's response so the user can resume from a user-turn
 *     head.
 *
 * Engine query: uses `queryEngineMove` from `usePlayFromPosition`,
 * which opens its own KataGoClient via `connectFresh` — same
 * posture as `usePlayMatch`, independent of the analysis-service
 * singleton's ponder/range traffic.
 *
 * Errors surface via `pushSystemMessage`; the engine query is
 * best-effort (if KataGo can't be reached, the head stays at its
 * current position so the next attempt retries from the same
 * state).
 *
 * License: Public Domain (The Unlicense)
 */

import { useI18n } from 'vue-i18n';
import {
  store,
  mutateBoard,
  updateBoardState,
  pushSystemMessage,
} from '../../store';
import { applyGoMove } from '../../logic';
import { queryEngineMove } from './usePlayFromPosition';
import { KATAGO_WS_URL } from '../../config/env';
import type {
  BoardId,
  BoardState,
  EnginePlayGameSession,
  NodeId,
  StoneColor,
} from '../../types';

/**
 * Find the game (if any) whose `currentHeadNodeId` equals
 * `headNodeId`. Used by `App.vue::handleBoardMove` to detect
 * "user played a move from a green-ringed head" — captured BEFORE
 * `applyGoMove` so the responder can fire after.
 *
 * Returns the start NodeId (the game's stable identity key) plus
 * the session, or null if no game is at this head.
 */
export function findGameByHead(
  board: BoardState,
  headNodeId: NodeId,
): { startNodeId: NodeId; session: EnginePlayGameSession } | null {
  for (const [startNodeId, session] of Object.entries(board.games)) {
    if (session.currentHeadNodeId === headNodeId) {
      return { startNodeId: startNodeId as NodeId, session }; // re-brand: board.games is keyed by NodeId; Object.entries widens the key to string
    }
  }
  return null;
}

/** Engine's color = whichever the user is not playing. */
export function engineColorFor(userColor: StoneColor): StoneColor {
  return userColor === 'B' ? 'W' : 'B';
}

export interface EngineResponderHandle {
  /**
   * Fire one engine move at the board's current position, apply
   * it, and advance the named game's `currentHeadNodeId` to the
   * post-engine-move position. Idempotent under concurrent
   * invocation: a per-board `inFlight` flag short-circuits
   * re-entry.
   *
   * Preconditions checked at call time (no-op if any fails):
   *   - The board still exists in the store.
   *   - The named game still exists on the board (caller may
   *     have ended it concurrently).
   *   - It's the engine's color's turn at the board's current
   *     position (the caller is expected to invoke this only
   *     in that case, but defensive recheck guards races).
   *   - The engine is connected (else surfaces a system-warning
   *     and skips; the head stays at the current position so
   *     the next attempt retries).
   *
   * Errors during the engine query surface via system-message
   * push; the head is NOT advanced (retry-on-next-attempt
   * semantics).
   */
  fireAndAdvanceHead: (boardId: BoardId, gameStartNodeId: NodeId) => Promise<void>;
}

export function useEngineResponder(): EngineResponderHandle {
  const { t } = useI18n();

  const inFlight = new Set<BoardId>();

  async function fireAndAdvanceHead(boardId: BoardId, gameStartNodeId: NodeId): Promise<void> {
    if (inFlight.has(boardId)) return;
    const idx = store.boards.findIndex(b => b.id === boardId);
    if (idx === -1) return;
    const board = store.boards[idx];
    const session = board.games[gameStartNodeId];
    if (!session) return;
    const engineColor = engineColorFor(session.config.userColor);
    if (board.turn !== engineColor) return;
    if (store.engine.status !== 'connected') {
      // Engine not connected — surface a warning and skip. The
      // head stays put; the next attempt (user moves from head
      // again after reconnect, or game-start triggers a retry)
      // tries fresh.
      pushSystemMessage('warning', t('playEngine.notConnected'));
      return;
    }
    inFlight.add(boardId);
    try {
      const url = store.profile.settings.engine.katago.url || KATAGO_WS_URL;
      const result = await queryEngineMove({
        katagoUrl: url,
        board,
        maxVisits: session.config.engineMaxVisits,
        model: session.config.engineModel ?? undefined,
      });
      // Re-resolve after async — the user may have closed boards
      // or the cursor may have moved. Both invalidate the
      // response.
      const writeIdx = store.boards.findIndex(b => b.id === boardId);
      if (writeIdx === -1) return;
      const beforeMove = store.boards[writeIdx];
      if (beforeMove.currentNodeId !== board.currentNodeId) return;
      // Re-check session — user may have ended it mid-query.
      if (!beforeMove.games[gameStartNodeId]) return;
      const next = applyGoMove(beforeMove, result.x, result.y);
      if (!next) return;
      updateBoardState(writeIdx, next);
      // Advance the head. `next.currentNodeId` is the new
      // user-turn position; the green ring re-renders there
      // automatically via the reactive `Object.values(games)`
      // computed in App.vue.
      mutateBoard(boardId, draft => {
        const s = draft.games[gameStartNodeId];
        if (s) s.currentHeadNodeId = next.currentNodeId;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushSystemMessage('error', t('playEngine.queryFailed', { error: msg }));
    } finally {
      inFlight.delete(boardId);
    }
  }

  return { fireAndAdvanceHead };
}
