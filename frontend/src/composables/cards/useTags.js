/**
 * src/composables/cards/useTags.ts
 *
 * The single chokepoint for the client-side tag dictionary
 * (`store.knownTags`, the autocomplete source). EVERY path that
 * attaches a tag to a card must route its resulting tag set through
 * `learnTags`, so the dictionary stays coherent with the cards.
 *
 * Why this exists: before it, only the mint path (`useMinting.commitMint`)
 * folded new tags into the dictionary; the metadata-edit path
 * (`useCardMetadata.updateMetadata`, used by both ReviewSessionPanel and
 * ForestDirectory) attached the tag to the card server-side but never
 * told the dictionary — so a tag added via the editor was invisible to
 * autocomplete until the next boot's `getTags()` re-fetch. That SSOT
 * divergence is what this chokepoint closes: both writers now call
 * `learnTags`, and a future tag-write site is wrong unless it does too.
 *
 * `store.knownTags` is a non-persisted, server-derived cache (re-fetched
 * every boot — see the `GlobalStore.knownTags` / `ProfileState`
 * invariant); `learnTags` is an in-session augmentation that survives
 * until the next `getTags()`, exactly as the mint path always did.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2) — speaks the card/tag
 * vocabulary, no Go rules.
 *
 * License: Public Domain (The Unlicense)
 */
import { store } from '../../store';
/**
 * Union brand-new tag names into `store.knownTags`. Idempotent: a no-op
 * when every name is already known (so callers can pass a card's full
 * tag set unconditionally). Replaces the array by identity only when it
 * actually changes, to avoid churning reactive dependents.
 */
export function learnTags(names) {
    const current = new Set(store.knownTags);
    let changed = false;
    for (const name of names) {
        if (!current.has(name)) {
            current.add(name);
            changed = true;
        }
    }
    if (changed)
        store.knownTags = Array.from(current);
}
/** Composable wrapper, for component/composable call sites that prefer
 *  the `useX()` idiom. The chokepoint is `learnTags`. */
export function useTags() {
    return { learnTags };
}
