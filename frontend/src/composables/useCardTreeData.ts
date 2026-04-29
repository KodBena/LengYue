/**
 * src/composables/useCardTreeData.ts
 *
 * Owns the data state for the card-tree view: the forest, active
 * set, per-card hydration map, per-tree forest stats, and loading /
 * error flags. Two entry points — `loadBrowse` (single tree, no
 * active set; the Roots-tab UX) and `runPipeline` (deck pipeline →
 * resolve roots → fetch trees; the Decks-tab UX) — mirror the two
 * spec consumption modes. Lazy `requestCard` covers context-card
 * thumbnails the pipeline result didn't include.
 *
 * Effects: yes — calls `backendService` over the network. Composable
 * exists to keep the SFC small and its data flow inspectable.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, shallowRef, type Ref } from 'vue';
import type {
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

export interface CardTreeData {
  // Render inputs for `CardTreeWidget`.
  forest: Ref<CardLineageTree[]>;
  activeSet: Ref<ReadonlySet<CardId>>;
  cards: Ref<ReadonlyMap<CardId, ReviewCard>>;
  forestStats: Ref<ReadonlyMap<CardId, ForestStat>>;
  // Lifecycle flags.
  isLoading: Ref<boolean>;
  error: Ref<string | null>;
  // Two consumption-mode entry points and a hydration callback.
  loadBrowse: (rootCardId: CardId) => Promise<void>;
  runPipeline: (deck: CardSet) => Promise<void>;
  setForestStats: (stats: ForestStat[]) => void;
  requestCard: (cardId: CardId) => Promise<void>;
}

export function useCardTreeData(): CardTreeData {
  const forest = shallowRef<CardLineageTree[]>([]);
  const activeSet = shallowRef<ReadonlySet<CardId>>(new Set());
  const cards = shallowRef<ReadonlyMap<CardId, ReviewCard>>(new Map());
  const forestStats = shallowRef<ReadonlyMap<CardId, ForestStat>>(new Map());
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const inflight = new Set<number>();

  function reset(): void {
    forest.value = [];
    activeSet.value = new Set();
    cards.value = new Map();
    error.value = null;
  }

  function setForestStats(stats: ForestStat[]): void {
    const m = new Map<CardId, ForestStat>();
    for (const s of stats) m.set(s.root_card_id as CardId, s);
    forestStats.value = m;
  }

  async function loadBrowse(rootCardId: CardId): Promise<void> {
    isLoading.value = true;
    reset();
    try {
      const tree = await backendService.fetchTreeByRoot(rootCardId);
      forest.value = [tree];
    } catch (err) {
      error.value = formatError(err);
    } finally {
      isLoading.value = false;
    }
  }

  async function runPipeline(deck: CardSet): Promise<void> {
    isLoading.value = true;
    reset();
    try {
      const matched: ReviewCard[] = await backendService.fetchCardSet(deck);
      if (matched.length === 0) {
        error.value = 'Pipeline returned no cards.';
        return;
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
      forest.value = trees.filter((t): t is CardLineageTree => t !== null);
      activeSet.value = new Set(matchedIds);
      cards.value = new Map(matched.map(c => [c.id, c] as const));
    } catch (err) {
      error.value = formatError(err);
    } finally {
      isLoading.value = false;
    }
  }

  async function requestCard(cardId: CardId): Promise<void> {
    const id = cardId as unknown as number;
    if (cards.value.has(cardId) || inflight.has(id)) return;
    inflight.add(id);
    try {
      const card = await backendService.fetchCard(cardId);
      const next = new Map(cards.value);
      next.set(cardId, card);
      cards.value = next;
    } catch (err) {
      console.error('[useCardTreeData] fetchCard failed for', cardId, err);
    } finally {
      inflight.delete(id);
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
