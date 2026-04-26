/**
 * src/composables/useVariationPath.ts
 * Reactively tracks the full active game line: root → active leaf.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, type ComputedRef } from 'vue';
import { store, boardsVersion } from '../store';
import { getActiveVariationPath } from '../engine/util';

export function useVariationPath(getBoardId: () => string): ComputedRef<string[]> {
  let prevFingerprint = '';
  let prevPath: string[] = [];

  return computed(() => {
    // Primary subscription: fires on every mutateBoard call (due to boardsVersion++).
    void boardsVersion.value;
    
    const boardId = getBoardId();
    const board = store.boards.find(b => b.id === boardId);
    if (!board) return [];

    const path = getActiveVariationPath(board);
    const fingerprint = path.join(',');
    
    if (fingerprint === prevFingerprint) {
      return prevPath; 
    }
    
    prevFingerprint = fingerprint;
    prevPath = path;
    return path;
  });
}
