/**
 * src/composables/useMetadata.ts
 * Projects SGF Root Properties into a UI-friendly Metadata object.
 */
import { computed, type Ref } from 'vue';
import type { BoardState } from '../types';

export function useMetadata(board: Ref<BoardState | null>) {
  return computed(() => {
    const b = board.value;
    if (!b) return null;

    const root = b.nodes[b.rootNodeId];
    const props = root?.properties || {};

    return {
      blackName: props['PB']?.[0] || 'Black',
      whiteName: props['PW']?.[0] || 'White',
      komi: parseFloat(props['KM']?.[0] || '6.5'),
      rules: props['RU']?.[0] || 'Japanese',
      boardSize: parseInt(props['SZ']?.[0] || '19', 10),
      gameName: props['GN']?.[0] || props['EV']?.[0] || 'Untitled Game'
    };
  });
}
