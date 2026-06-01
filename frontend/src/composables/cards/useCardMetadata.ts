/**
 * src/composables/cards/useCardMetadata.ts
 *
 * The effectful boundary for card-metadata edits. Wraps
 * `backendService.updateCardMetadata` so components don't import the
 * backend service singleton directly (frontend CLAUDE.md layering: effects
 * live in services and are called from composables, never from a component).
 * The returned card is spliced into each caller's own local state — the
 * panel's review queue, the Browse tree's card map — so that
 * component-specific writeback stays in the component; only the effectful
 * round-trip is owned here.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2) — speaks `CardId` /
 * `ReviewCard`, the card vocabulary, but no Go rules.
 *
 * License: Public Domain (The Unlicense)
 */
import { backendService } from '../../services/backend-service';
import type { CardId, CardMetadataPatch, ReviewCard } from '../../types';

export function useCardMetadata(): {
  updateMetadata: (cardId: CardId, patch: CardMetadataPatch) => Promise<ReviewCard>;
} {
  /** Persist a metadata patch; resolves to the updated card. */
  function updateMetadata(cardId: CardId, patch: CardMetadataPatch): Promise<ReviewCard> {
    return backendService.updateCardMetadata(cardId, patch);
  }
  return { updateMetadata };
}
