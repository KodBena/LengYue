/**
 * src/composables/cards/useCardTreeData.ts
 *
 * Per-board projection over the card-tree exploration state held in
 * `board-card-trees.ts`. Returns reactive refs that read from the
 * active board's slot and named operations that mutate the same slot.
 * Two consumption-mode entry points — `loadBrowse` (single tree, no
 * active set; the Roots-tab UX) and `runPipeline` (deck pipeline →
 * resolve roots → fetch trees; the Decks-tab UX) — mirror the two
 * spec consumption modes. `runPipeline` returns the matched cards
 * so its caller can hand them to `useReviewSession.startSession`
 * without a second backend round-trip. Lazy `requestCard` covers
 * context-card thumbnails the pipeline result didn't include.
 *
 * Effects: yes — calls `backendService` over the network. The
 * composable itself is a thin projection; effects mutate the
 * board's slot in `board-card-trees.ts`. Switching the input ref
 * to a different `BoardId` swaps the projected content atomically.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { CardTreeOverflowError } from '../../types';
import { backendService } from '../../services/backend-service';
import { store, pushSystemMessage, toggleCardTreeManualExpand, setCardTreeManualExpand, } from '../../store';
import { i18n } from '../../i18n';
import { substitute } from '../../lib/dsl-harness';
import { getOrCreateBoardCardTree, getBoardCardTree, } from './board-card-trees';
import { cardExpandKeyFor, bucketIdFor } from './useCardTreeProjection';
const EMPTY_FOREST = [];
const EMPTY_ACTIVE_SET = new Set();
const EMPTY_CARDS = new Map();
const EMPTY_FOREST_STATS = new Map();
const EMPTY_MANUAL_EXPAND = new Set();
// Per-composable-instance set of in-flight `requestCard` ids, scoped
// across all boards the composable instance has seen. This is fine
// because requestCard's job is to dedupe concurrent requests from
// the same component tree; cross-board contention isn't a real shape
// (each component instance focuses on one board at a time).
export function useCardTreeData(boardIdRef) {
    const inflight = new Set();
    const forest = computed(() => {
        const id = boardIdRef.value;
        return id ? (getBoardCardTree(id)?.forest ?? EMPTY_FOREST) : EMPTY_FOREST;
    });
    const activeSet = computed(() => {
        const id = boardIdRef.value;
        return id ? (getBoardCardTree(id)?.activeSet ?? EMPTY_ACTIVE_SET) : EMPTY_ACTIVE_SET;
    });
    const cards = computed(() => {
        const id = boardIdRef.value;
        return id ? (getBoardCardTree(id)?.cards ?? EMPTY_CARDS) : EMPTY_CARDS;
    });
    const forestStats = computed(() => {
        const id = boardIdRef.value;
        return id ? (getBoardCardTree(id)?.forestStats ?? EMPTY_FOREST_STATS) : EMPTY_FOREST_STATS;
    });
    const isLoading = computed(() => {
        const id = boardIdRef.value;
        return id ? (getBoardCardTree(id)?.isLoading ?? false) : false;
    });
    const error = computed(() => {
        const id = boardIdRef.value;
        return id ? (getBoardCardTree(id)?.error ?? null) : null;
    });
    // Persisted manual-expand state for the active board. Reads
    // `store.session.ui.cardTreeNav[id]` (schema-version 45) and
    // projects the stored array into a Set for the projection. New
    // Set instance per dependency change is fine — the projection
    // composable's `computed` re-fires on `manualExpand.value`'s
    // identity change, and the Set's contents are derived from a
    // stable array.
    const manualExpand = computed(() => {
        const id = boardIdRef.value;
        if (!id)
            return EMPTY_MANUAL_EXPAND;
        const slot = store.session.ui.cardTreeNav[id];
        return slot ? new Set(slot.manuallyExpanded) : EMPTY_MANUAL_EXPAND;
    });
    function toggleManualExpand(key) {
        const id = boardIdRef.value;
        if (!id)
            return;
        toggleCardTreeManualExpand(id, key);
    }
    function clearManualExpandForTree(rootCardId) {
        const id = boardIdRef.value;
        if (!id)
            return;
        const slot = getBoardCardTree(id);
        if (!slot)
            return;
        const tree = slot.forest.find(t => t.rootCardId === rootCardId);
        if (!tree)
            return;
        // Build the set of keys this tree could contribute to the
        // persisted manual-expand array. The projection's two key
        // shapes (see `useCardTreeProjection`: `cardExpandKeyFor` and
        // `bucketIdFor`) are `String(cardId)` for stub-expanded card
        // nodes and `bucket:${parentCardId}` for cold-leaf bucket
        // expansion under that node — both forms cover every card in
        // the tree, so walking the tree once collects every key the
        // tree could contribute. Iterative walk (explicit stack)
        // rather than recursion so deep trees don't risk a stack
        // overflow on the largest forests.
        const treeKeys = new Set();
        const stack = [tree.tree];
        while (stack.length > 0) {
            const node = stack.pop();
            // Use the canonical factories rather than re-spelling the two key
            // shapes inline, so this set can't drift from `useCardTreeProjection`.
            treeKeys.add(cardExpandKeyFor(node.id));
            treeKeys.add(bucketIdFor(node.id));
            for (const c of node.children)
                stack.push(c);
        }
        const cur = store.session.ui.cardTreeNav[id];
        if (!cur || cur.manuallyExpanded.length === 0)
            return;
        const next = cur.manuallyExpanded.filter(k => !treeKeys.has(k));
        if (next.length === cur.manuallyExpanded.length)
            return;
        setCardTreeManualExpand(id, next);
    }
    function reset(boardId) {
        const slot = getOrCreateBoardCardTree(boardId);
        slot.forest = [];
        slot.activeSet = new Set();
        slot.cards = new Map();
        slot.error = null;
        // Drop ownership — an empty slot is owned by no producer. Each producer
        // re-stamps `source` when it repopulates (see `BoardCardTreeState.source`).
        slot.source = null;
        // Manual-expand state is deliberately NOT cleared here. Its
        // keys are CardId-based and stable across forest reloads: if
        // the new forest contains the same cards, the entries remain
        // meaningful and the user's exploration is restored; if some
        // cards are gone, the orphaned entries are harmless dead
        // weight (the projection simply doesn't match them). Clearing
        // would re-introduce the bug the persistence work was meant
        // to fix — `useForestBrowsePolicy`'s `immediate: true` watch
        // fires `loadBrowse` on every mount of ForestDirectory,
        // including the post-hydrate mount that restored the entries
        // in the first place. The user-facing escape hatch for
        // accumulated entries is the per-tree "Collapse all" button
        // on CardTreeWidget (`clearManualExpandForTree`).
    }
    function setForestStats(stats) {
        const id = boardIdRef.value;
        if (!id)
            return;
        const slot = getOrCreateBoardCardTree(id);
        const m = new Map();
        for (const s of stats)
            m.set(s.rootCardId, s);
        slot.forestStats = m;
    }
    async function loadBrowse(rootCardId) {
        const id = boardIdRef.value;
        if (!id)
            return;
        const slot = getOrCreateBoardCardTree(id);
        slot.isLoading = true;
        reset(id);
        // Take browse ownership — see `BoardCardTreeState.source`. The slot now
        // holds navigator-selection content, which `clearBrowse` may clear.
        getOrCreateBoardCardTree(id).source = 'browse';
        try {
            const tree = await backendService.fetchTreeByRoot(rootCardId);
            // Re-resolve the slot (boardIdRef may have changed mid-fetch;
            // we always write into the slot the call started against).
            const target = getOrCreateBoardCardTree(id);
            target.forest = [tree];
        }
        catch (err) {
            const target = getOrCreateBoardCardTree(id);
            target.error = formatError(err);
        }
        finally {
            const target = getOrCreateBoardCardTree(id);
            target.isLoading = false;
        }
    }
    async function loadBrowseForest(rootCardIds) {
        const id = boardIdRef.value;
        if (!id)
            return;
        const slot = getOrCreateBoardCardTree(id);
        slot.isLoading = true;
        reset(id);
        // Take browse ownership — see `BoardCardTreeState.source`.
        getOrCreateBoardCardTree(id).source = 'browse';
        try {
            // Same per-root failure-aggregation pattern as
            // populateSlotFromMatched — a 422 CardTreeOverflowError on
            // one root shouldn't blank the whole forest.
            const failed = [];
            const trees = await Promise.all(rootCardIds.map(rcid => backendService
                .fetchTreeByRoot(rcid)
                .catch(treeErr => {
                console.error('[useCardTreeData] tree-by-root failed for', rcid, treeErr);
                failed.push({
                    // Brand-strip CardId → raw number for the `failed` log array
                    // (typed `number`); the double hop is required because
                    // Brand<number,_> isn't assignable to bare number. Documented
                    // debt: IDENTIFIERS.md "Known erosions" (b) (maintainer-
                    // directed: these belong behind a re-brand helper, not fixed here).
                    rootCardId: rcid,
                    reason: treeErr instanceof Error ? treeErr.message : String(treeErr),
                });
                return null;
            })));
            const target = getOrCreateBoardCardTree(id);
            target.forest = trees.filter((t) => t !== null);
            if (failed.length > 0) {
                const head = failed.slice(0, 3).map(f => `#${f.rootCardId}`).join(', ');
                const tail = failed.length > 3 ? i18n.global.t('lineage.failedTail', { n: failed.length - 3 }) : '';
                pushSystemMessage('warning', i18n.global.t('lineage.fetchFailedBrowse', {
                    count: failed.length,
                    head,
                    tail,
                    reason: failed[0].reason,
                }));
            }
        }
        catch (err) {
            const target = getOrCreateBoardCardTree(id);
            target.error = formatError(err);
        }
        finally {
            const target = getOrCreateBoardCardTree(id);
            target.isLoading = false;
        }
    }
    function clearBrowse() {
        const id = boardIdRef.value;
        if (!id)
            return;
        // Only browse-loaded content is browse-cleared. A slot a deck-pipeline or
        // review owns ('matched') must survive a null/absent navigator selection —
        // clearing it on every ForestDirectory remount is the
        // card-metadata-during-review / pipeline-preview-vanishes bug (the slot has
        // three producers and this is the one clearer). See
        // `frontend/docs/notes/board-scope.md`.
        const slot = getBoardCardTree(id);
        if (!slot || slot.source !== 'browse')
            return;
        reset(id);
    }
    /**
     * Runs the deck pipeline against `contextIds` and populates the
     * board's slot with the resulting forest, active set, and hydrated
     * cards. Returns the matched ReviewCard[] so the caller can hand
     * them directly to `useReviewSession.startSession` without a second
     * round-trip — the cards-tab-merge arc collapses two backend calls
     * (pipeline + start-session) to one.
     *
     * `hyperparameterValues` resolves any `{ $param: name }` holes the
     * deck's pipeline carries (per the harness scaffolded in schema-
     * version 33). The caller is responsible for collecting them from
     * the user before calling — typically via the prompt modal. An
     * empty record is fine when the deck has no holes; an unresolved
     * hole throws `UnboundHoleError` via `substitute()` and surfaces
     * through the slot's `error`. The throw is the loud-failure
     * surface ADR-0002 calls for; silent skip would let a holey deck
     * reach the backend with `{ $param: ... }` literals.
     *
     * Returns `[]` if the pipeline produces no matches; the slot's
     * `error` is also set in that case so the UI can surface it.
     */
    async function runPipeline(deck, contextIds, hyperparameterValues = {}) {
        const id = boardIdRef.value;
        if (!id)
            return [];
        const slot = getOrCreateBoardCardTree(id);
        slot.isLoading = true;
        reset(id);
        try {
            const resolved = substitute(deck.pipeline, hyperparameterValues);
            const matched = await backendService.queryForest(contextIds, resolved);
            if (matched.length === 0) {
                const target = getOrCreateBoardCardTree(id);
                target.error = 'Pipeline returned no cards.';
                return [];
            }
            await populateSlotFromMatched(id, matched);
            return matched;
        }
        catch (err) {
            const target = getOrCreateBoardCardTree(id);
            target.error = formatError(err);
            return [];
        }
        finally {
            const target = getOrCreateBoardCardTree(id);
            target.isLoading = false;
        }
    }
    /**
     * Re-hydrate the slot's forest from a pre-fetched queue of matched
     * cards, skipping the deck-pipeline call. Used by the cards-tab
     * re-hydrate path: when a review queue persists across a browser
     * reload (via SyncService) but the forest doesn't (per
     * `board-card-trees.ts`'s ephemeral-data rationale), the user
     * lands mid-session with `inReviewSession === true` but
     * `tree.forest === []`. Without re-fetching the trees, the
     * Lineage Explorer is empty and the user has no view of where
     * they are in the session.
     *
     * Idempotent: short-circuits when the slot's forest is already
     * populated, so the watcher in ForestDirectory can fire freely on
     * any board / queue change without producing duplicate fetches.
     *
     * Doesn't touch the active set or hydrated-cards map until the
     * tree fetches actually complete — keeps the spinner visible
     * until the forest is renderable rather than flashing an empty
     * "0 active" header.
     */
    async function seedFromQueue(queue) {
        const id = boardIdRef.value;
        if (!id)
            return;
        if (queue.length === 0)
            return;
        const existingSlot = getBoardCardTree(id);
        if (existingSlot && existingSlot.forest.length > 0)
            return;
        if (existingSlot && existingSlot.isLoading)
            return;
        const slot = getOrCreateBoardCardTree(id);
        slot.isLoading = true;
        slot.error = null;
        try {
            await populateSlotFromMatched(id, queue);
        }
        catch (err) {
            const target = getOrCreateBoardCardTree(id);
            target.error = formatError(err);
        }
        finally {
            const target = getOrCreateBoardCardTree(id);
            target.isLoading = false;
        }
    }
    /**
     * Shared between `runPipeline` and `seedFromQueue`: given a
     * pre-fetched matched-card list, resolve roots, fetch trees, and
     * write into the slot. Per-root tree-fetch failures (typically a
     * 422 `CardTreeOverflowError` for trees exceeding the backend's
     * max-nodes cap) are surfaced via `pushSystemMessage` per
     * ADR-0002 — without it, the failures are silently dropped and
     * the user sees fewer trees than the active set's count would
     * suggest, with no diagnostic to explain why. Long-standing
     * pre-existing behaviour; this function makes the failure mode
     * audible.
     */
    async function populateSlotFromMatched(id, matched) {
        const matchedIds = matched.map(c => c.id);
        const grouped = await backendService.resolveRoots(matchedIds);
        if (grouped.unmatchedCardIds.length > 0) {
            console.warn('[useCardTreeData] resolve-roots reported unmatched ids:', grouped.unmatchedCardIds);
        }
        const failed = [];
        const trees = await Promise.all(grouped.roots.map((g) => backendService
            .fetchTreeByRoot(g.rootCardId)
            .catch(treeErr => {
            // Per ADR-0002, surface the per-root failure to the user.
            // Aggregating across failures (rather than one toast per
            // root) keeps the system-log noise bounded for the
            // common "deck spans many trees of which N are too large"
            // case.
            console.error('[useCardTreeData] tree-by-root failed for', g.rootCardId, treeErr);
            failed.push({
                // Brand-strip CardId → raw number for the `failed` log array;
                // documented debt, IDENTIFIERS.md erosion (b) (re-brand-helper
                // fix is maintainer-directed, not done here).
                rootCardId: g.rootCardId,
                reason: treeErr instanceof Error ? treeErr.message : String(treeErr),
            });
            return null;
        })));
        const target = getOrCreateBoardCardTree(id);
        target.forest = trees.filter((t) => t !== null);
        target.activeSet = new Set(matchedIds);
        target.cards = new Map(matched.map(c => [c.id, c]));
        // Pipeline / review content — NOT browse-clearable. This seam serves both
        // runPipeline and seedFromQueue, so a single 'matched' stamp covers the
        // review and pipeline-preview cases. See `BoardCardTreeState.source`.
        target.source = 'matched';
        if (failed.length > 0) {
            const head = failed.slice(0, 3).map(f => `#${f.rootCardId}`).join(', ');
            const tail = failed.length > 3 ? i18n.global.t('lineage.failedTail', { n: failed.length - 3 }) : '';
            pushSystemMessage('warning', i18n.global.t('lineage.fetchFailedDeck', {
                count: failed.length,
                head,
                tail,
                reason: failed[0].reason,
            }));
        }
    }
    async function requestCard(cardId) {
        const id = boardIdRef.value;
        if (!id)
            return;
        const slot = getOrCreateBoardCardTree(id);
        // Brand-strip CardId → raw number to key the `inflight` Set<number>;
        // documented debt, IDENTIFIERS.md erosion (b) (re-brand-helper fix is
        // maintainer-directed, not done here).
        const rawId = cardId;
        if (slot.cards.has(cardId) || inflight.has(rawId))
            return;
        inflight.add(rawId);
        try {
            const card = await backendService.fetchCard(cardId);
            const target = getOrCreateBoardCardTree(id);
            const next = new Map(target.cards);
            next.set(cardId, card);
            target.cards = next;
        }
        catch (err) {
            console.error('[useCardTreeData] fetchCard failed for', cardId, err);
        }
        finally {
            inflight.delete(rawId);
        }
    }
    /**
     * Upsert a card into the active board's card map. Used by the
     * Browse-view metadata edit panel to splice a PATCH-returned
     * card back into the local store so tooltips and the
     * inline-edit panel re-read the new values without a follow-up
     * fetch. Mirrors `requestCard`'s writeback shape (fresh Map →
     * assign back to `target.cards`) so Vue picks up the change.
     * No-op when the active board's slot is missing (caller raced
     * past a board switch).
     */
    function setCard(card) {
        const id = boardIdRef.value;
        if (!id)
            return;
        const target = getOrCreateBoardCardTree(id);
        const next = new Map(target.cards);
        next.set(card.id, card);
        target.cards = next;
    }
    return {
        forest,
        activeSet,
        cards,
        forestStats,
        isLoading,
        error,
        loadBrowse,
        loadBrowseForest,
        clearBrowse,
        runPipeline,
        setForestStats,
        requestCard,
        setCard,
        seedFromQueue,
        manualExpand,
        toggleManualExpand,
        clearManualExpandForTree,
    };
}
function formatError(err) {
    if (err instanceof CardTreeOverflowError) {
        return `Tree exceeds the size cap (${err.actualSize} > ${err.maxNodes}). Narrow the query.`;
    }
    if (err instanceof Error)
        return err.message;
    return String(err);
}
