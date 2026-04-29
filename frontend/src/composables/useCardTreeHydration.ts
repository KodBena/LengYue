/**
 * src/composables/useCardTreeHydration.ts
 *
 * Lazy-hydration walker for the card-tree widget. Walks every
 * `card`-kind node in the projected render forest and asks the
 * caller to hydrate any cardId not present in the supplied
 * ReviewCard map. The de-dup set is plain (non-reactive) and
 * cleared on input replacement.
 *
 * Effects: yes — emits via the supplied callback (typically a
 * Vue `emit('request-card', ...)`). Read-only over its inputs.
 *
 * License: Public Domain (The Unlicense)
 */

import { watchEffect, type Ref } from 'vue';
import type { CardId, ReviewCard } from '../types';
import {
  forEachCardNode,
  type RenderTree,
} from './useCardTreeProjection';

export interface CardTreeHydration {
  /**
   * Discards the de-dup memory. Caller invokes on full input
   * replacement (forest or active-set identity change) so the
   * hydrator re-emits requests for ids the new forest needs.
   */
  resetHydration: () => void;
}

export function useCardTreeHydration(
  renderForestRef: Ref<RenderTree[]>,
  cardsRef: Ref<ReadonlyMap<CardId, ReviewCard>>,
  onRequest: (cardId: CardId) => void,
): CardTreeHydration {
  const requested = new Set<number>();

  watchEffect(() => {
    for (const tree of renderForestRef.value) {
      forEachCardNode(tree.root, cardId => {
        // CardId widens to number for the de-dup set — the brand is
        // phantom; value-equality is the requirement.
        const id = cardId as unknown as number;
        if (!cardsRef.value.has(cardId) && !requested.has(id)) {
          requested.add(id);
          onRequest(cardId);
        }
      });
    }
  });

  return {
    resetHydration: () => requested.clear(),
  };
}
