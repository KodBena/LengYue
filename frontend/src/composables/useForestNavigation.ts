/**
 * src/composables/useForestNavigation.ts
 *
 * State and tree-shaping for the Forest Directory file-manager-style
 * navigator. Pure-ish: takes a reactive `Ref<ForestStat[]>`, returns
 * a `nodes` ComputedRef that groups stats by `gameSourceId` into a
 * games → roots hierarchy with per-game aggregates, plus the
 * persisted expanded-set and selection (read-side ComputedRefs +
 * named mutators that write through `store.session.ui.forestNav`).
 *
 * No backend calls; no effects beyond store writes. The composable
 * is the typed seam between the navigator's persistence shape
 * (`ForestNavState` in `types.ts`, schema-version 21) and the
 * navigator's render shape (`ForestNavGameNode` / `ForestNavRootNode`
 * here, consumed by the SFC). Card-level expansion is intentionally
 * out of scope for v1 — the union and mutator surface are designed to
 * admit it later without a breaking change to existing callers.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, type ComputedRef, type Ref } from 'vue';
import type {
  CardId,
  ForestStat,
  GameSourceId,
  NavNodeId,
  NavSelection,
} from '../types';
import { store } from '../store';

// ── Render-shape types ───────────────────────────────────────────────────────
//
// What the SFC consumes. Distinct from the persistence shape
// (`NavNodeId`, `NavSelection`, `ForestNavState` in `types.ts`) — these
// types carry the rendered tree itself plus the per-node payload the
// renderer needs (titles, aggregates, the `ForestStat` reference for
// per-root stats display). The render-shape is recomputed from
// `forestStats` on each ref change; the persistence-shape is mutated
// only through the named mutators below.

export interface ForestNavGameAggregate {
  readonly rootCount: number;
  readonly totalCards: number;
  readonly totalReviews: number;
  // Weighted by `totalReviews` per root so games with many under-
  // reviewed roots don't dominate the average. Defined as 0 when
  // every root has zero reviews (rather than NaN from 0/0).
  readonly averageRecall: number;
}

export interface ForestNavRootNode {
  readonly kind: 'root';
  readonly nodeId: NavNodeId;
  readonly rootCardId: CardId;
  readonly gameSourceId: GameSourceId;
  // Pass-through reference to the source `ForestStat` so the SFC can
  // render the per-root inline stats (totalCards / totalReviews /
  // averageRecall) without re-projecting.
  readonly stat: ForestStat;
}

export interface ForestNavGameNode {
  readonly kind: 'game';
  readonly nodeId: NavNodeId;
  readonly gameSourceId: GameSourceId;
  // First non-empty `description` across the game's roots; falls
  // back to "Game source #N" when every root has null/blank
  // metadata. The fallback uses the game-source id since there's no
  // game-level identity beyond it (cross-upload dedupe is v2 — see
  // `docs/notes/forest-directory-hierarchy-redesign.md`).
  readonly title: string;
  readonly aggregate: ForestNavGameAggregate;
  readonly roots: readonly ForestNavRootNode[];
}

// ── Composable interface ─────────────────────────────────────────────────────

export interface ForestNavigation {
  // The grouped tree: one entry per distinct `gameSourceId` in the
  // input, with its roots nested. Recomputed when `forestStats`
  // changes; iteration order is insertion order over the input
  // (i.e., the backend's order from `/stats/forests`).
  readonly nodes: ComputedRef<readonly ForestNavGameNode[]>;
  // O(1)-lookup projection of the persisted `expanded` array. The
  // SFC reads `expanded.value.has(node.nodeId)` to decide whether to
  // render a node's children.
  readonly expanded: ComputedRef<ReadonlySet<NavNodeId>>;
  // The persisted selection. Drives the right-pane Lineage Explorer
  // when the SFC consumes it.
  readonly selection: ComputedRef<NavSelection | null>;

  // Mutators — write through `store.session.ui.forestNav`. Each
  // mutation reassigns the field with a fresh array / object so
  // SyncService's deep-watch picks up the change.
  toggle: (nodeId: NavNodeId) => void;
  expandAll: () => void;
  collapseAll: () => void;
  select: (selection: NavSelection | null) => void;
}

// ── NodeId helpers ───────────────────────────────────────────────────────────
//
// Template-literal types narrow on string-literal templates but not
// on `\`game:${number}\`` where `number` is a runtime value (the
// branded id) — TypeScript widens to `string`. The cast back to
// `NavNodeId` is justified by the helpers themselves: format is
// guaranteed by construction. The helpers are exported so consumers
// (and PR 2's SFC) can produce node ids without re-deriving the
// format from scratch.

export function gameNodeId(gameSourceId: GameSourceId): NavNodeId {
  return `game:${gameSourceId}` as NavNodeId;
}

export function rootNodeId(rootCardId: CardId): NavNodeId {
  return `root:${rootCardId}` as NavNodeId;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function useForestNavigation(
  forestStats: Ref<ForestStat[]>,
): ForestNavigation {
  const nodes = computed<readonly ForestNavGameNode[]>(() =>
    groupByGameSource(forestStats.value),
  );

  const expanded = computed<ReadonlySet<NavNodeId>>(
    () => new Set(store.session.ui.forestNav.expanded),
  );

  const selection = computed<NavSelection | null>(
    () => store.session.ui.forestNav.selection,
  );

  function toggle(nodeId: NavNodeId): void {
    const current = store.session.ui.forestNav.expanded;
    store.session.ui.forestNav.expanded = current.includes(nodeId)
      ? current.filter(id => id !== nodeId)
      : [...current, nodeId];
  }

  function expandAll(): void {
    store.session.ui.forestNav.expanded = nodes.value.map(g => g.nodeId);
  }

  function collapseAll(): void {
    store.session.ui.forestNav.expanded = [];
  }

  function select(s: NavSelection | null): void {
    store.session.ui.forestNav.selection = s;
  }

  return { nodes, expanded, selection, toggle, expandAll, collapseAll, select };
}

// ── Pure tree-shaping ────────────────────────────────────────────────────────

function groupByGameSource(
  stats: readonly ForestStat[],
): readonly ForestNavGameNode[] {
  // Insertion-order Map preserves the backend's stat ordering. Two
  // passes: first bucket stats by gameSourceId, then materialise
  // game nodes with aggregates. Single-pass is possible but would
  // require recomputing the aggregate as roots accumulate; the two-
  // pass shape is clearer and the input size (a few thousand stats
  // worst-case) doesn't motivate the optimisation.
  const grouped = new Map<GameSourceId, ForestStat[]>();
  for (const s of stats) {
    const list = grouped.get(s.gameSourceId);
    if (list) list.push(s);
    else grouped.set(s.gameSourceId, [s]);
  }

  const games: ForestNavGameNode[] = [];
  for (const [gameSourceId, gameStats] of grouped) {
    const roots: ForestNavRootNode[] = gameStats.map(stat => ({
      kind: 'root' as const,
      nodeId: rootNodeId(stat.rootCardId),
      rootCardId: stat.rootCardId,
      gameSourceId: stat.gameSourceId,
      stat,
    }));
    games.push({
      kind: 'game' as const,
      nodeId: gameNodeId(gameSourceId),
      gameSourceId,
      title: titleFor(gameStats),
      aggregate: aggregateFor(gameStats),
      roots,
    });
  }
  return games;
}

function titleFor(gameStats: readonly ForestStat[]): string {
  const firstNamed = gameStats.find(s => s.description?.trim());
  if (firstNamed?.description) return firstNamed.description.trim();
  // The game-source id is the only stable identifier when every
  // root has null metadata. Visible enough that the user can match
  // it against the backend if needed; not so prominent it pretends
  // to be a name.
  return `Game source #${gameStats[0]?.gameSourceId ?? '?'}`;
}

function aggregateFor(
  gameStats: readonly ForestStat[],
): ForestNavGameAggregate {
  let totalCards = 0;
  let totalReviews = 0;
  let weightedRecall = 0;
  for (const s of gameStats) {
    totalCards += s.totalCards;
    totalReviews += s.totalReviews;
    weightedRecall += s.averageRecall * s.totalReviews;
  }
  return {
    rootCount: gameStats.length,
    totalCards,
    totalReviews,
    averageRecall: totalReviews > 0 ? weightedRecall / totalReviews : 0,
  };
}
