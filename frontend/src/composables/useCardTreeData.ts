/**
 * src/composables/useCardTreeData.ts
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

import { computed, type ComputedRef, type Ref } from 'vue';
import type {
  BoardId,
  CardId,
  CardLineageTree,
  CardSet,
  ForestStat,
  ResolveRootsResult,
  ReviewCard,
  RootGroup,
} from '../types';
import { CardTreeOverflowError } from '../types';
import { backendService } from '../services/backend-service';
import { pushSystemMessage } from '../store';
import { i18n } from '../i18n';
import {
  getOrCreateBoardCardTree,
  getBoardCardTree,
} from './board-card-trees';

export interface CardTreeData {
  // Render inputs for `CardTreeWidget`. These are computeds projecting
  // the active board's slot; they swap atomically when boardIdRef
  // changes.
  forest: ComputedRef<CardLineageTree[]>;
  activeSet: ComputedRef<ReadonlySet<CardId>>;
  cards: ComputedRef<ReadonlyMap<CardId, ReviewCard>>;
  forestStats: ComputedRef<ReadonlyMap<CardId, ForestStat>>;
  // Lifecycle flags.
  isLoading: ComputedRef<boolean>;
  error: ComputedRef<string | null>;
  // Consumption-mode entry points and a hydration callback. Each
  // operates on the active board's slot at call time.
  loadBrowse: (rootCardId: CardId) => Promise<void>;
  // Multi-root browse mode — fetches each root's lineage tree in
  // parallel and combines them into the slot's forest. Used by the
  // Forest Directory navigator's game-node selection path (see
  // `MULTI_ROOT_DISPLAY_CAP` for the caller-side cap policy). No
  // active set / hydrated cards (browse semantics, not pipeline);
  // per-root fetch failures surface via `pushSystemMessage` per
  // ADR-0002, mirroring `populateSlotFromMatched`'s pattern.
  loadBrowseForest: (rootCardIds: CardId[]) => Promise<void>;
  // Clear the slot's browse state (forest, error, isLoading) without
  // a fetch. Called when the navigator's selection is null — drops
  // the right pane to its empty state cleanly.
  clearBrowse: () => void;
  runPipeline: (deck: CardSet, contextIds: number[]) => Promise<ReviewCard[]>;
  setForestStats: (stats: ForestStat[]) => void;
  requestCard: (cardId: CardId) => Promise<void>;
  // Re-hydrate the forest from a known queue of matched cards
  // without re-running the deck pipeline. Used by the cards-tab
  // re-hydrate path (browser reopen mid-session): the review
  // queue persists via SyncService but the forest doesn't, and
  // without this seed the user lands mid-session with no view of
  // where they are in the forest. Idempotent — short-circuits if
  // the slot's forest is already populated. See
  // `ForestDirectory.vue`'s seed-from-queue watcher.
  seedFromQueue: (queue: ReviewCard[]) => Promise<void>;
}

const EMPTY_FOREST: CardLineageTree[] = [];
const EMPTY_ACTIVE_SET: ReadonlySet<CardId> = new Set();
const EMPTY_CARDS: ReadonlyMap<CardId, ReviewCard> = new Map();
const EMPTY_FOREST_STATS: ReadonlyMap<CardId, ForestStat> = new Map();

// Per-composable-instance set of in-flight `requestCard` ids, scoped
// across all boards the composable instance has seen. This is fine
// because requestCard's job is to dedupe concurrent requests from
// the same component tree; cross-board contention isn't a real shape
// (each component instance focuses on one board at a time).
export function useCardTreeData(boardIdRef: Ref<BoardId | null>): CardTreeData {
  const inflight = new Set<number>();

  const forest = computed<CardLineageTree[]>(() => {
    const id = boardIdRef.value;
    return id ? (getBoardCardTree(id)?.forest ?? EMPTY_FOREST) : EMPTY_FOREST;
  });
  const activeSet = computed<ReadonlySet<CardId>>(() => {
    const id = boardIdRef.value;
    return id ? (getBoardCardTree(id)?.activeSet ?? EMPTY_ACTIVE_SET) : EMPTY_ACTIVE_SET;
  });
  const cards = computed<ReadonlyMap<CardId, ReviewCard>>(() => {
    const id = boardIdRef.value;
    return id ? (getBoardCardTree(id)?.cards ?? EMPTY_CARDS) : EMPTY_CARDS;
  });
  const forestStats = computed<ReadonlyMap<CardId, ForestStat>>(() => {
    const id = boardIdRef.value;
    return id ? (getBoardCardTree(id)?.forestStats ?? EMPTY_FOREST_STATS) : EMPTY_FOREST_STATS;
  });
  const isLoading = computed<boolean>(() => {
    const id = boardIdRef.value;
    return id ? (getBoardCardTree(id)?.isLoading ?? false) : false;
  });
  const error = computed<string | null>(() => {
    const id = boardIdRef.value;
    return id ? (getBoardCardTree(id)?.error ?? null) : null;
  });

  function reset(boardId: BoardId): void {
    const slot = getOrCreateBoardCardTree(boardId);
    slot.forest = [];
    slot.activeSet = new Set();
    slot.cards = new Map();
    slot.error = null;
  }

  function setForestStats(stats: ForestStat[]): void {
    const id = boardIdRef.value;
    if (!id) return;
    const slot = getOrCreateBoardCardTree(id);
    const m = new Map<CardId, ForestStat>();
    for (const s of stats) m.set(s.rootCardId, s);
    slot.forestStats = m;
  }

  async function loadBrowse(rootCardId: CardId): Promise<void> {
    const id = boardIdRef.value;
    if (!id) return;
    const slot = getOrCreateBoardCardTree(id);
    slot.isLoading = true;
    reset(id);
    try {
      const tree = await backendService.fetchTreeByRoot(rootCardId);
      // Re-resolve the slot (boardIdRef may have changed mid-fetch;
      // we always write into the slot the call started against).
      const target = getOrCreateBoardCardTree(id);
      target.forest = [tree];
    } catch (err) {
      const target = getOrCreateBoardCardTree(id);
      target.error = formatError(err);
    } finally {
      const target = getOrCreateBoardCardTree(id);
      target.isLoading = false;
    }
  }

  async function loadBrowseForest(rootCardIds: CardId[]): Promise<void> {
    const id = boardIdRef.value;
    if (!id) return;
    const slot = getOrCreateBoardCardTree(id);
    slot.isLoading = true;
    reset(id);
    try {
      // Same per-root failure-aggregation pattern as
      // populateSlotFromMatched — a 422 CardTreeOverflowError on
      // one root shouldn't blank the whole forest.
      const failed: { rootCardId: number; reason: string }[] = [];
      const trees = await Promise.all(
        rootCardIds.map(rcid =>
          backendService
            .fetchTreeByRoot(rcid)
            .catch(treeErr => {
              console.error('[useCardTreeData] tree-by-root failed for', rcid, treeErr);
              failed.push({
                rootCardId: rcid as unknown as number,
                reason: treeErr instanceof Error ? treeErr.message : String(treeErr),
              });
              return null;
            }),
        ),
      );
      const target = getOrCreateBoardCardTree(id);
      target.forest = trees.filter((t): t is CardLineageTree => t !== null);
      if (failed.length > 0) {
        const head = failed.slice(0, 3).map(f => `#${f.rootCardId}`).join(', ');
        const tail = failed.length > 3 ? i18n.global.t('lineage.failedTail', { n: failed.length - 3 }) : '';
        pushSystemMessage(
          'warning',
          i18n.global.t('lineage.fetchFailedBrowse', {
            count: failed.length,
            head,
            tail,
            reason: failed[0].reason,
          }),
        );
      }
    } catch (err) {
      const target = getOrCreateBoardCardTree(id);
      target.error = formatError(err);
    } finally {
      const target = getOrCreateBoardCardTree(id);
      target.isLoading = false;
    }
  }

  function clearBrowse(): void {
    const id = boardIdRef.value;
    if (!id) return;
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
   * Returns `[]` if the pipeline produces no matches; the slot's
   * `error` is also set in that case so the UI can surface it.
   */
  async function runPipeline(deck: CardSet, contextIds: number[]): Promise<ReviewCard[]> {
    const id = boardIdRef.value;
    if (!id) return [];
    const slot = getOrCreateBoardCardTree(id);
    slot.isLoading = true;
    reset(id);
    try {
      const matched: ReviewCard[] = await backendService.queryForest(contextIds, deck.pipeline);
      if (matched.length === 0) {
        const target = getOrCreateBoardCardTree(id);
        target.error = 'Pipeline returned no cards.';
        return [];
      }
      await populateSlotFromMatched(id, matched);
      return matched;
    } catch (err) {
      const target = getOrCreateBoardCardTree(id);
      target.error = formatError(err);
      return [];
    } finally {
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
  async function seedFromQueue(queue: ReviewCard[]): Promise<void> {
    const id = boardIdRef.value;
    if (!id) return;
    if (queue.length === 0) return;
    const existingSlot = getBoardCardTree(id);
    if (existingSlot && existingSlot.forest.length > 0) return;
    if (existingSlot && existingSlot.isLoading) return;
    const slot = getOrCreateBoardCardTree(id);
    slot.isLoading = true;
    slot.error = null;
    try {
      await populateSlotFromMatched(id, queue);
    } catch (err) {
      const target = getOrCreateBoardCardTree(id);
      target.error = formatError(err);
    } finally {
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
  async function populateSlotFromMatched(
    id: BoardId,
    matched: ReviewCard[],
  ): Promise<void> {
    const matchedIds = matched.map(c => c.id);
    const grouped: ResolveRootsResult = await backendService.resolveRoots(matchedIds);
    if (grouped.unmatchedCardIds.length > 0) {
      console.warn(
        '[useCardTreeData] resolve-roots reported unmatched ids:',
        grouped.unmatchedCardIds,
      );
    }
    const failed: { rootCardId: number; reason: string }[] = [];
    const trees = await Promise.all(
      grouped.roots.map((g: RootGroup) =>
        backendService
          .fetchTreeByRoot(g.rootCardId)
          .catch(treeErr => {
            // Per ADR-0002, surface the per-root failure to the user.
            // Aggregating across failures (rather than one toast per
            // root) keeps the system-log noise bounded for the
            // common "deck spans many trees of which N are too large"
            // case.
            console.error(
              '[useCardTreeData] tree-by-root failed for',
              g.rootCardId,
              treeErr,
            );
            failed.push({
              rootCardId: g.rootCardId as unknown as number,
              reason: treeErr instanceof Error ? treeErr.message : String(treeErr),
            });
            return null;
          }),
      ),
    );
    const target = getOrCreateBoardCardTree(id);
    target.forest = trees.filter((t): t is CardLineageTree => t !== null);
    target.activeSet = new Set(matchedIds);
    target.cards = new Map(matched.map(c => [c.id, c] as const));
    if (failed.length > 0) {
      const head = failed.slice(0, 3).map(f => `#${f.rootCardId}`).join(', ');
      const tail = failed.length > 3 ? i18n.global.t('lineage.failedTail', { n: failed.length - 3 }) : '';
      pushSystemMessage(
        'warning',
        i18n.global.t('lineage.fetchFailedDeck', {
          count: failed.length,
          head,
          tail,
          reason: failed[0].reason,
        }),
      );
    }
  }

  async function requestCard(cardId: CardId): Promise<void> {
    const id = boardIdRef.value;
    if (!id) return;
    const slot = getOrCreateBoardCardTree(id);
    const rawId = cardId as unknown as number;
    if (slot.cards.has(cardId) || inflight.has(rawId)) return;
    inflight.add(rawId);
    try {
      const card = await backendService.fetchCard(cardId);
      const target = getOrCreateBoardCardTree(id);
      const next = new Map(target.cards);
      next.set(cardId, card);
      target.cards = next;
    } catch (err) {
      console.error('[useCardTreeData] fetchCard failed for', cardId, err);
    } finally {
      inflight.delete(rawId);
    }
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
    seedFromQueue,
  };
}

function formatError(err: unknown): string {
  if (err instanceof CardTreeOverflowError) {
    return `Tree exceeds the size cap (${err.actualSize} > ${err.maxNodes}). Narrow the query.`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
