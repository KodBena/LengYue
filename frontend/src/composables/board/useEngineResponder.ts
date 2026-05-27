/**
 * src/composables/board/useEngineResponder.ts
 *
 * "Play vs engine" trigger surface. Watches the active board's
 * cursor (currentNodeId) and the per-board `games` map; when the
 * user is at a descendant of any game-root and it's the engine's
 * turn (per that game's config), fires a single engine query and
 * applies the result via `applyGoMove` + `updateBoardState`.
 *
 * Trigger semantics (per the design recorded in the worklog
 * `docs/worklog/2026-05-27-play-vs-engine.md`):
 *
 *   - Game identity = node identity. Each entry in `board.games`
 *     marks a game-root NodeId with its engine config. The engine
 *     "follows the cursor" — wherever the user navigates inside
 *     a game-root's descendant tree, the engine plays when it's
 *     its color's turn.
 *   - Single watcher on the active board's
 *     (currentNodeId, gamesKey) tuple. Doesn't fire on
 *     board-switch (same posture as the "Follow Me" ponder
 *     watcher in `App.vue`).
 *   - Per-board in-flight flag prevents double-firing if multiple
 *     reactive changes land in quick succession.
 *
 * Engine query: uses `queryEngineMove` from `usePlayFromPosition`,
 * which opens its own KataGoClient via `connectFresh` — same
 * posture as `usePlayMatch`, independent of the analysis-service
 * singleton's ponder/range traffic. The per-game `engineMaxVisits`
 * and `engineModel` are threaded through.
 *
 * Errors surface via `pushSystemMessage`; the engine query is
 * best-effort (if KataGo can't be reached, the user can still
 * navigate / explore — the game-root annotation persists in
 * `board.games` and the responder resumes when the engine is
 * back). The exposed `tryFireResponder(boardId)` lets callers
 * (e.g., the modal's "Start game" handler) synchronously trigger
 * the responder after mutating `board.games`, so the engine
 * opens the game if it's its color's turn at the start position.
 *
 * License: Public Domain (The Unlicense)
 */

import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  store,
  activeBoard,
  updateBoardState,
  pushSystemMessage,
} from '../../store';
import { applyGoMove } from '../../logic';
import { queryEngineMove } from './usePlayFromPosition';
import { KATAGO_WS_URL } from '../../config/env';
import type {
  BoardId,
  BoardState,
  EnginePlayGameConfig,
  NodeId,
} from '../../types';

/**
 * Walk parents bottom-up from `nodeId`, returning the closest
 * game-root ancestor (a node with an entry in `board.games`) and
 * its config, or null if none found. The walk is O(depth) per
 * call — depth is bounded by the variation path length.
 *
 * Exported for `useEngineResponder`'s callers that need to query
 * the same "am I inside a game?" relation (e.g., a future
 * tree-tooltip that explains why a node has the green ring).
 */
export function findGameRootAncestor(
  board: BoardState,
  nodeId: NodeId,
): { rootId: NodeId; config: EnginePlayGameConfig } | null {
  let cur: NodeId | null = nodeId;
  while (cur !== null) {
    const config = board.games[cur];
    if (config !== undefined) {
      return { rootId: cur, config };
    }
    cur = board.nodes[cur]?.parent ?? null;
  }
  return null;
}

export interface EngineResponderHandle {
  /**
   * Synchronously check + fire the responder for the given board
   * id. Used by callers that mutate `board.games` and want the
   * engine to open the game immediately if it's its color's turn
   * at the start position (the reactive watcher also catches the
   * change, but firing synchronously avoids waiting for the next
   * tick of Vue's scheduler — keeps the modal's "Start game"
   * feel snappy).
   *
   * Safe to call at any time; no-ops if conditions aren't met
   * (no game-root ancestor at currentNodeId, not engine's turn,
   * already in-flight for this board, engine not connected).
   */
  tryFireResponder: (boardId: BoardId) => Promise<void>;
}

export function useEngineResponder(): EngineResponderHandle {
  const { t } = useI18n();

  // Per-board in-flight flag — prevents double-firing if multiple
  // reactive changes land in quick succession (e.g., the cursor
  // moves while an existing query is still resolving).
  const inFlight = new Set<BoardId>();

  async function tryFireResponder(boardId: BoardId): Promise<void> {
    if (inFlight.has(boardId)) return;
    const idx = store.boards.findIndex(b => b.id === boardId);
    if (idx === -1) return;
    const board = store.boards[idx];
    const ancestor = findGameRootAncestor(board, board.currentNodeId);
    if (!ancestor) return;
    // `board.turn` reflects who moves NEXT at currentNodeId. The
    // engine plays whichever color the user is not playing — so
    // we fire when `board.turn` matches the engine's color.
    const engineColor = ancestor.config.userColor === 'B' ? 'W' : 'B';
    if (board.turn !== engineColor) return;
    if (store.engine.status !== 'connected') {
      // Engine not connected — surface a user-visible warning and
      // skip. The game-root annotation persists in board.games;
      // when the engine reconnects, the next navigation / move /
      // game-add fires the watcher and the responder retries.
      pushSystemMessage('warning', t('playEngine.notConnected'));
      return;
    }
    inFlight.add(boardId);
    try {
      const url = store.profile.settings.engine.katago.url || KATAGO_WS_URL;
      const result = await queryEngineMove({
        katagoUrl: url,
        board,
        maxVisits: ancestor.config.engineMaxVisits,
        model: ancestor.config.engineModel ?? undefined,
      });
      // Re-resolve the board index — it may have shifted while
      // the query was in flight. Also re-read the board's current
      // state in case the user navigated away mid-query: if
      // currentNodeId changed, the response is stale relative to
      // the user's intent and we drop it silently rather than
      // playing a move at the (now-different) position.
      const writeIdx = store.boards.findIndex(b => b.id === boardId);
      if (writeIdx === -1) return;
      const after = store.boards[writeIdx];
      if (after.currentNodeId !== board.currentNodeId) return;
      const next = applyGoMove(after, result.x, result.y);
      if (next) updateBoardState(writeIdx, next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushSystemMessage('error', t('playEngine.queryFailed', { error: msg }));
    } finally {
      inFlight.delete(boardId);
    }
  }

  // Reactive trigger: watcher on the active board's (currentNodeId,
  // gamesKey) tuple. Doesn't fire on board-switch (the prev / curr
  // id check matches the "Follow Me" ponder watcher's posture in
  // App.vue — switching to a board where it's the engine's turn
  // doesn't auto-fire; the user navigating or playing within the
  // game IS the trigger). Doesn't fire when nothing relevant
  // changed (the explicit nodeId + gamesKey equality check covers
  // the case where the watcher re-runs due to another field on the
  // tuple, which shouldn't happen but stays defensive).
  watch(
    () => activeBoard.value
      ? {
          id: activeBoard.value.id,
          nodeId: activeBoard.value.currentNodeId,
          // `Object.keys().join` is a cheap fingerprint of the
          // games-map keys. Watching the keys directly (not the
          // map's reference identity) means same-content reassignments
          // don't fire spuriously, and key-set changes (add / remove
          // a game-root) DO fire. Values aren't part of the
          // fingerprint — editing a game's `engineMaxVisits` post-
          // start doesn't re-fire the responder (no current UI path
          // does this; if one is added, extend the fingerprint).
          gamesKey: Object.keys(activeBoard.value.games).join('|'),
        }
      : null,
    (curr, prev) => {
      if (!curr || !prev) return;
      if (curr.id !== prev.id) return;
      if (curr.nodeId === prev.nodeId && curr.gamesKey === prev.gamesKey) return;
      void tryFireResponder(curr.id);
    },
  );

  return { tryFireResponder };
}
