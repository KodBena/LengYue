/**
 * src/composables/auth-app/useMetadata.ts
 * Projects SGF Root Properties into a UI-friendly Metadata object.
 *
 * `gameName` resolution delegates to `engine/util.ts::resolveGameName`,
 * which carries the four-rung ladder (GN → EV → sourceFileName →
 * date-stamped catch-all). The same helper is consumed at the mint
 * boundary by `useMinting.prepareDraft` so display and wire payload
 * agree on what the game's "user-friendly name" is.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, type Ref } from 'vue';
import type { BoardState } from '../../types';
import { resolveGameName } from '../../engine/util';

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
      gameName: resolveGameName(b),
    };
  });
}
