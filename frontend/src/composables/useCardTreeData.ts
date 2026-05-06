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
  runPipeline: (deck: CardSet, contextIds: number[]) => Promise<ReviewCard[]>;
  setForestStats: (stats: ForestStat[]) => void;
  requestCard: (cardId: CardId) => Promise<void>;
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
    for (const s of stats) m.set(s.root_card_id as CardId, s);
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
      const matchedIds = matched.map(c => c.id);
      const grouped: ResolveRootsResult = await backendService.resolveRoots(matchedIds);
      if (grouped.unmatchedCardIds.length > 0) {
        console.warn(
          '[useCardTreeData] resolve-roots reported unmatched ids:',
          grouped.unmatchedCardIds,
        );
      }
      const trees = await Promise.all(
        grouped.roots.map((g: RootGroup) =>
          backendService
            .fetchTreeByRoot(g.rootCardId)
            .catch(treeErr => {
              // Per ADR-0002, surface the per-root failure rather than
              // dropping it silently. The host page also gets the
              // remainder of the trees that did succeed.
              console.error(
                '[useCardTreeData] tree-by-root failed for',
                g.rootCardId,
                treeErr,
              );
              return null;
            }),
        ),
      );
      const target = getOrCreateBoardCardTree(id);
      target.forest = trees.filter((t): t is CardLineageTree => t !== null);
      target.activeSet = new Set(matchedIds);
      target.cards = new Map(matched.map(c => [c.id, c] as const));
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
    runPipeline,
    setForestStats,
    requestCard,
  };
}

function formatError(err: unknown): string {
  if (err instanceof CardTreeOverflowError) {
    return `Tree exceeds the size cap (${err.actualSize} > ${err.maxNodes}). Narrow the query.`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
