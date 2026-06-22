/**
 * src/composables/cards/board-card-trees.ts
 *
 * Per-board card-tree state at module scope. The forest, active set,
 * hydrated cards map, per-tree forest stats, and lifecycle flags all
 * become projections of "what this board is currently exploring," in
 * the same shape `store.session.reviews[boardId]` carries the review
 * session's projection.
 *
 * Why module-scope rather than per-composable-instance: the same
 * board may be displayed by multiple components — `ForestDirectory`'s
 * Decks panel, the future `CardTreeWidget` overlay in a review panel —
 * and they must read the same accumulated state. A composable-instance
 * map would split the state by callsite. Module-scope mirrors the
 * existing pattern in `useReviewSession.pendingAnalysisAborts` and
 * `analysisService.activeQueryIds`.
 *
 * Lifecycle: a slot is lazily initialised on first `getOrCreate`
 * call. `removeBoardCardTree` is invoked from `closeBoard` (per-board
 * cleanup) and `resetWorkspace` calls `clearAllBoardCardTrees`
 * (identity flip). Both calls are safe when no slot exists. Resource-
 * ownership audit tag O12 (board-card-trees — per-board card-tree
 * state; a code-minted tag past the archived plan's inventory, so the
 * slug, not the number, is the stable handle).
 *
 * Persistence: not persisted via SyncService. The forest, active set,
 * and hydrated cards are analysis-shaped data — large, regenerable
 * from the backend on demand, and ephemeral within a session. Same
 * reasoning as `pendingAnalysisAborts` and the analysis ledger.
 *
 * License: Public Domain (The Unlicense)
 */

import { reactive } from 'vue';
import type {
  BoardId,
  CardId,
  CardLineageTree,
  ForestStat,
  ReviewCard,
} from '../../types';
import {
  registerBoardCloseHandler,
  registerWorkspaceResetHandler,
} from '../../store/teardown-registry';

/**
 * Which producer last populated the slot's forest. The slot has three
 * writers — the deck pipeline (`runPipeline`), the review session
 * (`seedFromQueue`), and the navigator browse (`loadBrowse` /
 * `loadBrowseForest`) — and one *persist-relevant* clearer: the browse
 * policy's null-selection `clearBrowse`, which fires while the slot must
 * still be on screen. (The whole-slot teardowns `removeBoardCardTree` on
 * board-close and `clearAllBoardCardTrees` on identity-flip also clear, but
 * destroy the entry outright and SHOULD ignore `source`.) Tracking ownership
 * lets `clearBrowse` target ONLY browse-loaded content and leave a slot a
 * pipeline or review owns; clearing those is the card-metadata-during-review
 * / pipeline-preview-vanishes bug. `'browse'` = navigator-selection content;
 * `'matched'` = pipeline OR review content (both flow through
 * `populateSlotFromMatched`); `null` = empty. A future producer that forgets
 * to stamp inherits `null` and is therefore left alone by `clearBrowse` — the
 * forget-failure is "persists" (safe), never "vanishes". See
 * `frontend/docs/notes/board-scope.md`.
 */
export type ForestSource = 'browse' | 'matched' | null;

export interface BoardCardTreeState {
  forest: CardLineageTree[];
  activeSet: ReadonlySet<CardId>;
  cards: ReadonlyMap<CardId, ReviewCard>;
  forestStats: ReadonlyMap<CardId, ForestStat>;
  isLoading: boolean;
  error: string | null;
  // Ownership of the current forest (see `ForestSource`) — drives whether
  // `clearBrowse` may clear this slot. Ephemeral/module-scope like the rest
  // of the slot; not persisted.
  source: ForestSource;
}

const emptyState = (): BoardCardTreeState => ({
  forest: [],
  activeSet: new Set(),
  cards: new Map(),
  forestStats: new Map(),
  isLoading: false,
  error: null,
  source: null,
});

// Reactive map so consumers' `computed`s and `watch`es re-fire when a
// slot's contents change. The map itself is reactive; per-slot fields
// are reassigned wholesale (new Set / new Map) rather than mutated in
// place — same pattern as `useCardTreeData` already followed before
// this refactor.
const boardCardTrees = reactive(new Map<BoardId, BoardCardTreeState>());

export function getOrCreateBoardCardTree(boardId: BoardId): BoardCardTreeState {
  let slot = boardCardTrees.get(boardId);
  if (!slot) {
    slot = emptyState();
    boardCardTrees.set(boardId, slot);
  }
  return slot;
}

export function getBoardCardTree(boardId: BoardId): BoardCardTreeState | null {
  return boardCardTrees.get(boardId) ?? null;
}

/**
 * Drop the per-board card-tree slot. Called from `closeBoard` so the
 * map doesn't accumulate dead entries over the session. Safe when no
 * slot exists.
 */
export function removeBoardCardTree(boardId: BoardId): void {
  boardCardTrees.delete(boardId);
}

/**
 * Drop every card-tree slot. Called from `resetWorkspace` on identity
 * flip so the prior identity's exploration state can't leak into the
 * new identity's session. The slots hold accumulated forests / cards
 * which are tenant-scoped data; clearing them on identity change is
 * privacy-correct.
 */
export function clearAllBoardCardTrees(): void {
  boardCardTrees.clear();
}

// ── Teardown registration (ADR-0012 dependency inversion) ────────────────────
// The store no longer imports these slot teardowns to drive its cleanup (that
// store → module out-edge was part of the import cycle Tranche D broke); this
// module registers them. Order-independent of the other teardown handlers.
registerBoardCloseHandler({
  label: 'board-card-trees:remove',
  // Drops the closing board's slot (forest, active set, hydrated cards keyed
  // by raw CardId, forestStats). Must run before closeBoard's splice so a
  // subsequent reactive read sees the empty state; the registry's
  // before-splice run position preserves that. (Audit O12 — board-card-trees.)
  run: (boardId) => removeBoardCardTree(boardId),
});
registerWorkspaceResetHandler({
  label: 'board-card-trees',
  // Drops every card-tree slot on identity flip. Privacy-relevant: hydrated
  // cards are keyed by raw per-tenant CardId, which collides across users.
  // (Audit O12 — board-card-trees.)
  run: () => clearAllBoardCardTrees(),
});
