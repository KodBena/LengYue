/**
 * src/composables/useNavigation.ts
 * Headless Controller for Board Navigation.
 * Provides pure domain actions for moving within the Game Tree.
 */

import { activeBoard, mutateBoard } from '../store';
import { 
  navigateNext, 
  navigatePrev, 
  navigateVariation 
} from '../engine/navigator';

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

  return { next, prev, variation };
}
