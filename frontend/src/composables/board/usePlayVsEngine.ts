/**
 * src/composables/board/usePlayVsEngine.ts
 *
 * "Play vs engine" game-session wiring, extracted from App.vue
 * (work-status item app-vue-style-and-wiring-extraction; shape
 * sketched in the 2026-06-10 history-lessons audit's arch-ergonomics
 * findings). Owns the per-board game-session lifecycle on
 * `BoardState.games` (schema 52):
 *
 *   - `handleStartGame` creates a game entry at the board's current
 *     node and, when the start position is the engine's turn, kicks
 *     the responder once so the game opens without the user being
 *     stuck at an engine-turn head.
 *   - `handleEndGame` deletes a game entry.
 *   - `activeBoardGameHeadIds` is the green-ring head set the tree
 *     widget renders (one NodeId per game session).
 *
 * The modal surface stays in App.vue (`PlayEngineModal` ref + open
 * trigger — template wiring, not policy); the engine responder is
 * injected so the session policy composes with the same handle
 * `useBoardMoveRouting`'s head-trigger uses.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, type ComputedRef } from 'vue';
import { activeBoard, mutateBoard } from '../../store';
import type { NodeId, StoneColor } from '../../types';
import { engineColorFor, type EngineResponderHandle } from './useEngineResponder';

export interface StartGameOptions {
  userColor: StoneColor;
  engineMaxVisits: number;
  engineModel: string | null;
}

export interface PlayVsEngineHandle {
  handleStartGame: (opts: StartGameOptions) => void;
  handleEndGame: (nodeId: NodeId) => void;
  activeBoardGameHeadIds: ComputedRef<ReadonlySet<NodeId> | undefined>;
}

export function usePlayVsEngine(
  engineResponder: EngineResponderHandle,
): PlayVsEngineHandle {
  function handleStartGame(opts: StartGameOptions): void {
    const board = activeBoard.value;
    if (!board) return;
    const startNodeId = board.currentNodeId;
    mutateBoard(board.id, draft => {
      draft.games[startNodeId] = {
        config: {
          userColor: opts.userColor,
          engineMaxVisits: opts.engineMaxVisits,
          engineModel: opts.engineModel,
        },
        currentHeadNodeId: startNodeId,
      };
    });
    // If it's the engine's color's turn at the start position, fire
    // one engine move so the game kicks off without the user being
    // stuck at an engine-turn head. After the engine plays, the
    // responder advances `currentHeadNodeId` to the post-engine-move
    // position, which is the user's turn — a normal head the user
    // can play from. If it's the user's turn at start, no kick;
    // the user plays first, which then triggers the responder
    // (the board-move routing's head-trigger branch). Colour
    // derivation composes with the responder's own `engineColorFor`
    // (one definition, not a re-derived ternary).
    const engineColor = engineColorFor(opts.userColor);
    if (board.turn === engineColor) {
      // Self-handling fire-and-forget: fireAndAdvanceHead surfaces
      // its own failures via pushSystemMessage (see its contract).
      void engineResponder.fireAndAdvanceHead(board.id, startNodeId);
    }
  }

  function handleEndGame(nodeId: NodeId): void {
    const board = activeBoard.value;
    if (!board) return;
    mutateBoard(board.id, draft => {
      delete draft.games[nodeId];
    });
  }

  // Currently-active green-ring NodeIds for the active board — one
  // per game-session, at that session's `currentHeadNodeId`. Passed
  // to TreeWidget as a ReadonlySet so the tree renders the green
  // ring on each head. Recomputes when `activeBoard.value.games`
  // changes (Object.values iteration registers reactive deps on the
  // games map and each session's currentHeadNodeId field).
  const activeBoardGameHeadIds = computed((): ReadonlySet<NodeId> | undefined => {
    const board = activeBoard.value;
    if (!board) return undefined;
    return new Set(Object.values(board.games).map(g => g.currentHeadNodeId));
  });

  return { handleStartGame, handleEndGame, activeBoardGameHeadIds };
}
