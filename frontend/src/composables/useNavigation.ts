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
} from '../engine/navigator';
import { getActiveVariationPath } from '../engine/util';
import type { NodeId } from '../types';

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

  return { next, prev, variation, home, end, goTo };
}
