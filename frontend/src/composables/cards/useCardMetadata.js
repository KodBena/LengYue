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
import { learnTags } from './useTags';
export function useCardMetadata() {
    /** Persist a metadata patch; resolves to the updated card. */
    async function updateMetadata(cardId, patch) {
        const updated = await backendService.updateCardMetadata(cardId, patch);
        // Tag-dictionary chokepoint (see useTags.ts): fold the updated
        // card's tags into store.knownTags so a tag added through the
        // metadata editor is immediately known to autocomplete — the SSOT
        // gap this path used to have. Idempotent; the returned card's tag
        // set is authoritative.
        learnTags(updated.tags ?? []);
        return updated;
    }
    return { updateMetadata };
}
