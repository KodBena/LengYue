/**
 * src/composables/cards/useCardTreeHydration.ts
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
import { watchEffect } from 'vue';
import { forEachCardNode, } from './useCardTreeProjection';
export function useCardTreeHydration(renderForestRef, cardsRef, onRequest) {
    const requested = new Set();
    watchEffect(() => {
        for (const tree of renderForestRef.value) {
            forEachCardNode(tree.root, cardId => {
                // CardId widens to number for the de-dup set — the brand is
                // phantom; value-equality is the requirement.
                const id = cardId;
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
