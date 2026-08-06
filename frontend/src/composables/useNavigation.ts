/**
 * src/composables/useNavigation.ts
 * Headless Controller for Board Navigation.
 * Provides pure domain actions for moving within the Game Tree.
 */

import { activeBoard, mutateBoard } from '../store';
import {
  navigateNext,
  navigatePrev,
  navigateVariation,
  navigateTo,
  navigateToggleMainLine,
} from '../engine/navigator';
import { getActiveVariationPath } from '../engine/util';
import type { NodeId } from '../types';

// Module-scope: the toggle-history `navigateToggleMainLine` reads and
// writes, keyed `${boardId}::${forkNodeId}` inside that function.
// Shared across every `useNavigation()` call site (TreeWidget,
// BoardWidget, the keybindings catalog, autonav) deliberately — the
// toggle is a per-board-per-fork history, not a per-caller one.
// Mirrors the module-scope `pendingAnalysisAborts` map in
// `useReviewSession.ts` (see `tests/CLAUDE.md`'s "Module-scope state
// in composables" gotcha).
const mainLineToggleMemory = new Map<string, number>();

export function useNavigation() {
  const next = () => {
    if (activeBoard.value) {
      mutateBoard(activeBoard.value.id, draft => navigateNext(draft));
    }
  };

  const prev = () => {
    if (activeBoard.value) {
      mutateBoard(activeBoard.value.id, draft => navigatePrev(draft));
    }
  };

  const variation = (dir: number) => {
    if (activeBoard.value) {
      mutateBoard(activeBoard.value.id, draft => navigateVariation(draft, dir));
    }
  };

  // Jump to the first node of the active variation path (the root).
  // Home-key + UI affordance for "go to the beginning of the game."
  const home = () => {
    if (!activeBoard.value) return;
    mutateBoard(activeBoard.value.id, draft => {
      const path = getActiveVariationPath(draft);
      if (path.length > 0) navigateTo(draft, path[0]);
    });
  };

  // Jump to the last node of the active variation path (the leaf
  // along the user-selected line). End-key + UI affordance for
  // "go to the latest position on this line."
  const end = () => {
    if (!activeBoard.value) return;
    mutateBoard(activeBoard.value.id, draft => {
      const path = getActiveVariationPath(draft);
      if (path.length > 0) navigateTo(draft, path[path.length - 1]);
    });
  };

  // Generic per-node navigation, used by the shift-click handler in
  // BoardWidget that resolves a clicked vertex to a placement node
  // via `findPlacementOnActivePath`. Caller is responsible for
  // ensuring the target node exists on the active board's tree —
  // `navigateTo` will silently no-op on `currentNodeId === target`
  // but throws on a missing node.
  const goTo = (nodeId: NodeId) => {
    if (!activeBoard.value) return;
    mutateBoard(activeBoard.value.id, draft => navigateTo(draft, nodeId));
  };

  // "Toggle main line variation" — switch the active line at the
  // nearest ancestor fork between the two most recent choices there,
  // and back. See `navigateToggleMainLine`'s docstring (`engine/navigator.ts`)
  // for the fork-search and toggle-memory semantics, and its
  // ambiguity note for the reading this implements.
  const toggleMainLine = () => {
    if (activeBoard.value) {
      mutateBoard(activeBoard.value.id, draft => navigateToggleMainLine(draft, mainLineToggleMemory));
    }
  };

  return { next, prev, variation, home, end, goTo, toggleMainLine };
}
