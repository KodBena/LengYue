/**
 * src/store/index.ts
 * Central reactive store. Holds the single GlobalStore singleton and
 * exports both pure mutators and the small set of orchestrator
 * functions (createBoard, closeBoard, resetWorkspace) that
 * coordinate workspace-level state changes with their downstream
 * service-side cleanup. The latter is why this module imports both
 * analysis-service and analysis-ledger — closing a board is a
 * workspace mutation that must release the board's external
 * resources (in-flight analysis subscription at the proxy, cached
 * packets and per-node version refs in the ledger) as part of the
 * same operation; see closeBoard's docstring.
 *
 * License: Public Domain (The Unlicense)
 */

import { reactive, computed, ref } from 'vue';
import { deepMerge } from '../lib/utils';

import type {
  GlobalStore,
  BoardState,
  BoardId,
  ProfileId,
  SessionId,
  ReviewSessionData,
  SystemMessage,
  CardTreeExpandKey,
} from '../types';

import { defaultProfile, defaultSessionUI, defaultKnownTags, NIL_UUID } from './defaults';
import { createInitialBoard } from './board-factory';
import { migrate, CURRENT_SCHEMA_VERSION } from './migrations';
import { analysisService } from '../services/analysis-service';
import { ledger } from '../services/analysis-ledger';
import { stabilityTrajectoryStore } from '../services/stability-trajectory-store';
import { analysisPersistenceService } from '../services/analysis-persistence-service';
import { clearCardThumbnailCache } from '../composables/cards/useCardThumbnail';
import { abortAllReviews, abortBoardReview } from '../composables/review/useReviewSession';
import { purgeAllThumbnails, purgeBoardThumbnails } from '../composables/cards/useThumbnailCache';
import { removeBoardCardTree, clearAllBoardCardTrees } from '../composables/cards/board-card-trees';

export { createInitialBoard }        from './board-factory';
export { DEFAULTS }                  from './defaults';
export { CURRENT_SCHEMA_VERSION, migrate } from './migrations';

export const boardsVersion = ref(0);

/**
 * Counter incremented only on board *set* changes (add / remove /
 * replace), not on per-board content mutations. Composables that
 * maintain per-board watchers (e.g., `useAutoSaveAnalyses`,
 * `useAppBootstrap`'s analysis-persistence restore) reconcile
 * against this rather than against `boardsVersion` — `boardsVersion`
 * fires on every `mutateBoard` and would force the iterate-all-
 * boards work the per-board pattern is meant to avoid.
 *
 * Bumped at: `addBoard`, `closeBoard`, `updateBoardState`
 * (conservative — id may change across SGF-load paths),
 * `resetWorkspace`, `updateFromRemote`. NOT bumped at:
 * `mutateBoard`, `setActiveBoard`, `mutateReviewSession` (per-board
 * content / per-board UI state).
 *
 * Per `docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md` Bug A
 * (secondary causes).
 */
export const boardsSetVersion = ref(0);

export const store = reactive<GlobalStore>({
  activeBoardIndex: 0,
  boards: [createInitialBoard()],
  profile: defaultProfile,
  // Non-persisted server-derived tag dictionary (see GlobalStore /
  // ProfileState). Cloned so the boot fetch / commitMint don't mutate
  // the module-level default array.
  knownTags: structuredClone(defaultKnownTags),
  session: {
    id: '00000000-0000-0000-0000-000000000000' as SessionId,
    profileId: '00000000-0000-0000-0000-000000000000' as ProfileId,
    ui: defaultSessionUI,
    reviews: {},
  },
  engine: {
    status: 'disconnected',
    metrics: {
      packetsPerSecond: 0,
      lastResponseId: null,
      lastWatchdogTimestamp: 0,
      latencyMs: 0,
      pingPendingSince: null,
    },
    activeMode: {},
    messages: [],
    // Populated by analysisService on each fresh WebSocket open via
    // probeEngineInfo(); cleared back to this empty shape on
    // disconnect so a stale identity from a prior session can't
    // surface in the toolbar after the WS drops.
    info: {
      version: null,
      internalName: null,
      versionPayload: null,
      modelsPayload: null,
      availableModels: [],
      capabilities: null,
    },
    // SELECTOR-mode model selection. Null means "no selection" —
    // the wire `model` field is omitted on outgoing analysis queries.
    // Set via `setSelectedModel` named mutator below; cleared back
    // to null on disconnect (analysis-service's onDisconnect path)
    // so a stale selection from a prior session doesn't carry into
    // a freshly-connected proxy that may have a different upstream
    // pool. Persisted through SyncService alongside other engine
    // settings.
    selectedModel: null,
  },
});

export const activeBoard = computed(() => store.boards[store.activeBoardIndex] ?? null);

export const activeBoardSize = computed((): number => {
  const board = activeBoard.value;
  if (!board) return 19;
  const sz = board.nodes[board.rootNodeId].properties['SZ']?.[0];
  return sz ? parseInt(sz, 10) : 19;
});

/**
 * Per-id index of `store.boards`, derived. Provides O(1) board
 * lookup by `BoardId`, replacing the O(N) `store.boards.find(...)`
 * walks that previously composed with the N consumers of
 * `useVariationPath` (one per BoardTab) into O(N²) reactivity work
 * per nav step. Computed rather than a hand-maintained dictionary
 * so the invariant "every board in `store.boards` is keyed in
 * `boardsById`" needs no maintenance discipline at the six
 * mutation sites (`mutateBoard`, `addBoard`, `closeBoard`,
 * `updateBoardState`, `resetWorkspace`, `updateFromRemote`) — the
 * computed re-derives on every change to the boards array. The
 * inner BoardState references are the same reactive proxies held
 * in `store.boards`, so deep reads on the looked-up board
 * register the usual fine-grained deps. Diagnosed in
 * `docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md` Bug A.
 */
export const boardsById = computed((): Record<BoardId, BoardState> => {
  const out = {} as Record<BoardId, BoardState>;
  for (const board of store.boards) {
    out[board.id] = board;
  }
  return out;
});

// ── Actions (Named Mutations) ─────────────────────────────────────────────────

export function mutateBoard(boardId: BoardId, fn: (draft: BoardState) => void): void {
  const index = store.boards.findIndex(b => b.id === boardId);
  if (index === -1) return;
  const board = store.boards[index];
  // `board` is the deep-reactive proxy held in `store.boards`, so the
  // in-place mutations `fn` performs (navigateTo et al. mutate
  // currentNodeId / stones / captures in place) already fire the
  // fine-grained field deps every reader needs. The prior
  // `store.boards[index] = { ...board }` additionally swapped the
  // object identity, which fired the *array* dep and invalidated
  // every coarse reader of "the board" / "the boards array" — App.vue
  // and the SidebarWidget v-for re-rendered the whole tree on every
  // navigation step even though only the cursor moved. Dropping the
  // identity swap localises navigation to the components that read the
  // mutated fields. `boardsVersion` stays as the explicit coarse
  // signal SyncService watches for debounced persistence (it keys on
  // the counter, not identity — see sync-service.ts). Diagnosed in
  // docs/notes/audit/perf-audit-game-scroll-2026-05-28.md (Arc 1).
  fn(board);
  boardsVersion.value++;
}

/**
 * Set the SELECTOR-mode model selection. `null` clears the
 * selection (the wire `model` field is omitted from subsequent
 * analysis queries — appropriate when the user picks "no model"
 * or when the SELECTOR advertisement disappears mid-session).
 * Non-null sets it to the chosen label; the analysis-service ACL
 * injects this into every outgoing analysis query.
 *
 * Validity is the caller's responsibility: passing a label that
 * doesn't appear in `store.engine.info.availableModels` will
 * surface as a `KataErrorResponse` from the proxy on the next
 * query (per ADR-0002, the proxy refuses to silently substitute
 * a different upstream). The Toolbar dropdown's option list is
 * sourced from `availableModels`, so the typical UI-driven path
 * cannot construct an invalid selection.
 */
export function setSelectedModel(label: string | null): void {
  store.engine.selectedModel = label;
}

export function mutateReviewSession(boardId: BoardId, fn: (draft: ReviewSessionData) => void): void {
  let review = store.session.reviews[boardId];
  if (!review) {
    review = {
      status: 'IDLE',
      queue: [],
      currentIndex: -1,
      startingNodeId: null,
      userMovesCount: 0,
      userMoveScores: [],
      visitsOverride: null,
    };
  }
  fn(review);
  store.session.reviews[boardId] = { ...review };
}

/**
 * Toggle a manual-expand key for the given board's card-tree
 * navigator. Keys come from `useCardTreeProjection` —
 * `String(cardId)` for stub expansion or `bucket:${parentCardId}`
 * for cold-leaf bucket expansion. Creates the per-board slot on
 * first call; entries persist through SyncService alongside the
 * rest of `session.ui`.
 *
 * Reassigns the slot object (and its `manuallyExpanded` array) so
 * SyncService's deep-watch picks up the mutation — mirrors the
 * named-mutator discipline `useForestNavigation` already follows
 * for the sibling `forestNav.expanded` field.
 */
export function toggleCardTreeManualExpand(boardId: BoardId, key: CardTreeExpandKey): void {
  const cur = store.session.ui.cardTreeNav[boardId];
  if (!cur) {
    store.session.ui.cardTreeNav[boardId] = { manuallyExpanded: [key] };
    return;
  }
  const has = cur.manuallyExpanded.includes(key);
  store.session.ui.cardTreeNav[boardId] = {
    ...cur,
    manuallyExpanded: has
      ? cur.manuallyExpanded.filter(k => k !== key)
      : [...cur.manuallyExpanded, key],
  };
}

/**
 * Replace the per-board manually-expanded array wholesale. Empty
 * input drops the slot (vacuous-slot housekeeping so an empty
 * board doesn't carry an empty entry); non-empty input reassigns
 * the slot object with a fresh copy of the array so SyncService's
 * deep-watch picks up the change.
 *
 * Used by `useCardTreeData::clearManualExpandForTree` to apply a
 * per-tree clear without affecting other trees' expansion entries
 * stored under the same board's slot. The single-key
 * `toggleCardTreeManualExpand` covers the common case; this
 * mutator covers the bulk replacement case. Per-board cleanup on
 * board close happens inline in `closeBoard` (audit tag O14,
 * card-tree-nav-slot), not through a mutator.
 */
export function setCardTreeManualExpand(boardId: BoardId, keys: readonly CardTreeExpandKey[]): void {
  if (keys.length === 0) {
    if (store.session.ui.cardTreeNav[boardId] !== undefined) {
      delete store.session.ui.cardTreeNav[boardId];
    }
    return;
  }
  store.session.ui.cardTreeNav[boardId] = { manuallyExpanded: [...keys] };
}

export function addBoard(boardState: BoardState): void {
  store.boards.push(boardState);
  store.activeBoardIndex = store.boards.length - 1;
  boardsVersion.value++;
  boardsSetVersion.value++;
}

export function createBoard(): void {
  addBoard(createInitialBoard());
}

export function setActiveBoard(index: number): void {
  if (index >= 0 && index < store.boards.length) {
    store.activeBoardIndex = index;
  }
}

/**
 * Board-scoped store-cell teardowns — the board analog of
 * IDENTITY_SCOPED_CACHES (below), for the per-board *store cells* rather than
 * module caches. Each entry deletes the closing board's cell from a
 * board-keyed GlobalStore dictionary; `closeBoard` drains this list in place
 * of the hand-wired per-cell deletes, so a newly-added per-board store cell
 * can't be silently left out of teardown.
 *
 * Scope is deliberately the store cells ONLY (board-scope audit P1b / the
 * scope-exhaustiveness consult). The board-DERIVED purges (ledger / stability
 * / thumbnails — they walk `board.nodes` and must run before the splice) and
 * the ordering-bound service stop (`stopBoardAnalysis` before
 * `ledger.purgeBoard`) stay inline in `closeBoard`: folding them in would
 * relocate load-bearing ordering from documented inline code into array
 * position — a legibility regression for no safety gain (the audit's §4 found
 * no leaks). The board-completeness *test* verifies this registry drains
 * correctly and per-board, and tripwires changes to its coverage list — but it
 * does NOT enumerate the store's per-board fields independently (TypeScript
 * can't, and no lint guards it today), so a newly-added cell is caught only if
 * its author both registers it here and extends that test. Registering a new
 * per-board cell is a discipline step, not an automatically-caught one — see
 * `frontend/docs/notes/board-scope.md`.
 *
 * (2026-06-11: the keep-Class-B-inline judgment cited above was the
 * 2026-06-05 consult's ADVISORY verdict, not a maintainer decision — prior
 * records overstated it. The Class B teardown shape is an open question,
 * tracked as work-status item closeboard-class-b-teardown-shape (parked;
 * owner-located teardown is a named candidate).)
 *
 * Cells are order-independent of each other; the drain runs after
 * `stopBoardAnalysis` (so the deletes overwrite the activeMode 'none'
 * tombstone) and before the splice.
 */
const BOARD_SCOPED_STORE_CELLS: ReadonlyArray<{ label: string; clear: (b: BoardId) => void }> = [
  { label: 'session.reviews', clear: b => { delete store.session.reviews[b]; } },
  { label: 'engine.activeMode', clear: b => { delete store.engine.activeMode[b]; } },
  { label: 'session.ui.cardTreeNav', clear: b => { delete store.session.ui.cardTreeNav[b]; } },
  { label: 'session.ui.forestNav.selection', clear: b => { delete store.session.ui.forestNav.selection[b]; } },
];

/** Labels of every board-scoped store cell. The board-completeness test pins
 *  this set as a tripwire so the registry's coverage can't change without a
 *  deliberate test update; it does not (and cannot, in TS) prove the registry
 *  is exhaustive over the store's per-board fields. The board analog of
 *  `identityScopedCacheLabels`. */
export function boardScopedStoreCellLabels(): readonly string[] {
  return BOARD_SCOPED_STORE_CELLS.map(c => c.label);
}

/**
 * Safely removes a board, shifting the active index.
 * If the last board is closed, spawns a fresh blank board.
 *
 * Releases the closing board's external resources and per-board
 * workspace dictionaries before mutating the surviving boards.
 * The cleanups, enumerated (no count is asserted here — counts in
 * prose comments rot; the firing order lives in the ordering
 * paragraph below):
 *
 *   1. analysisService.stopBoardAnalysis — severs *every* in-flight
 *      analysis subscription this board owns (the bulk-stop path in
 *      the multi-query model; iterates the board's `boardToQueries`
 *      set and routes each queryId through `stopQuery`). The
 *      keep-alive middleware can't help here; the WS is shared with
 *      surviving boards and stays healthy.
 *   2. ledger.purgeBoard — drops cached analysis packets and the
 *      per-node reactive version refs for the closed board's nodes
 *      across every palette hash. Without it, the ledger's internal
 *      Maps grow on every board close.
 *   3. stabilityTrajectoryStore.purgeBoard — drops the per-(hash,
 *      extractor, nodeId) stability trajectories accumulated from
 *      analysis-service's preview ingestion for the closed board's
 *      nodes. Bounded leak if omitted (trajectory entries are
 *      compact change-point lists), but the per-board hygiene is
 *      the same shape as #2.
 *   4. delete store.session.reviews[boardId] — drops the per-board
 *      review-session row. Without it, dead entries accumulate in
 *      `store.session.reviews` and round-trip to the backend via
 *      SyncService (which persists `store.session` deeply).
 *   5. delete store.engine.activeMode[boardId] — drops the
 *      `'none'` tombstone that `stopBoardAnalysis`'s
 *      `recomputeActiveMode` lands at when the last query is
 *      released. Same SyncService-payload concern as #4, plus
 *      keeping the dictionary honest about which boards are still
 *      tracked.
 *   6. abortBoardReview — fires AbortController.abort() on the
 *      board's pending review-analysis wait, if any. Without it,
 *      a mid-review close would let the 30s timeout fire later,
 *      surfacing a "KataGo did not respond" toast for a board
 *      that no longer exists AND resurrecting the just-deleted
 *      `store.session.reviews[boardId]` row via the catch-block's
 *      lazy `mutateReviewSession`.
 *   7. purgeBoardThumbnails — drops cached SVG renders keyed on
 *      the closing board's NodeIds. Walks `board.nodes`, so it
 *      must run while the board is still present in
 *      `store.boards` (i.e., before the splice below). NodeIds
 *      are UUID-style; cross-user collision is functionally
 *      impossible, so this is memory-hygiene rather than a
 *      correctness or privacy concern.
 *   8. removeBoardCardTree — drops the closing board's slot in
 *      the per-board card-tree state map (forest, active set,
 *      hydrated cards, forestStats). Without it, the
 *      `boardCardTrees` map accumulates dead entries over the
 *      session, and the slot's hydrated-cards map (CardId-keyed)
 *      could leak across an identity flip with collision-prone
 *      auto-increment ids. Resource-ownership audit tag O12
 *      (board-card-trees).
 *   9. analysisPersistenceService.discard — server-side bundle
 *      delete + local summary cache clear. Symmetric to O1 (the
 *      ledger purge) but for the persisted server row that
 *      belongs to this board's lifetime. Best-effort and
 *      fire-and-forget — closeBoard stays sync from the caller's
 *      perspective; a failed delete leaves an unreferenced server
 *      row that's harmless (no local board references it; idempotent
 *      delete cleans it up if the user closes the same id again,
 *      which they can't, so it's effectively orphan storage). The
 *      api-client surfaces non-2xx via the system log; no need
 *      to double-handle here. Resource-ownership audit tag O13
 *      (persisted-analysis-bundles).
 *  10. delete store.session.ui.cardTreeNav[boardId] — drops the
 *      per-board card-tree manual-expand slot. Without it, dead
 *      entries accumulate in `session.ui.cardTreeNav` and round-
 *      trip to the backend via SyncService (same SyncService-payload
 *      concern as #4 and #5). Resource-ownership audit tag O14
 *      (card-tree-nav-slot; schema-version 45 introduces the slice).
 *  11. delete store.session.ui.forestNav.selection[boardId] — drops the
 *      per-board forest-navigator selection (schema-version 59 re-scoped
 *      it per-board; board-scope audit P0). Same SyncService-payload
 *      concern as #4 / #5 / #10. `forestNav.expanded` is workspace-global
 *      and is NOT cleared here. Resource-ownership audit tag O15
 *      (forest-nav-selection).
 *
 * Order matters: stop the engine before purging the ledger so an
 * in-flight packet can't land between the two and re-populate the
 * ledger after we've cleared it. The dictionary deletes follow
 * stopBoardAnalysis (which writes to activeMode) so the deletes
 * actually overwrite the tombstone rather than leaving it; those
 * store-cell deletes (#4 / #5 / #10 / #11) are drained from the
 * BOARD_SCOPED_STORE_CELLS registry (see its docstring). The
 * abort runs after the deletes; its rejection-side cleanup runs
 * in processUserMove's catch on the next microtask. The thumbnail
 * purge runs last among the cleanups but still before the splice
 * — purgeBoardThumbnails reads `board.nodes` via store.boards.find,
 * which only resolves while the board is still present.
 *
 * Both `analysisService.stopBoardAnalysis` and `ledger.purgeBoard`
 * short-circuit cleanly when the board has no active analysis or
 * recorded packets; the dictionary deletes are safe regardless
 * (delete on a missing key is a no-op).
 *
 * Workspace-owned-resource cleanup is tracked in the archived audit
 * plan, docs/archive/notes/resource-ownership-audit-plan.md (all
 * three passes closed 2026-05-04). Pairs O1–O5 resolve against that
 * plan's inventory (O1 the ledger, O2 the review-session row, O3
 * the activeMode tombstone, O4 the thumbnail cache, O5 the
 * review-wait abort). Tags numbered past the plan's inventory —
 * O12 (board-card-trees), O13 (persisted-analysis-bundles), O14
 * (card-tree-nav-slot), O15 (forest-nav-selection) here — were
 * minted in code after the plan froze and do NOT resolve against
 * the plan's own O12–O15 rows, which name unrelated pairs; for
 * those tags the descriptive slug, not the bare number, is the
 * stable handle (the frozen plan is never edited).
 */
export function closeBoard(boardId: BoardId): void {
  // Release external resources the closing board owns. Both calls
  // are safe when the board has nothing to release; ordering is
  // load-bearing — stop the engine before purging the ledger. See
  // docstring above for the full rationale.
  analysisService.stopBoardAnalysis(boardId);
  ledger.purgeBoard(boardId);
  // Stability-trajectory store: symmetric to ledger.purgeBoard for
  // the per-(hash, extractor, nodeId) trajectories accumulated from
  // analysis-service's preview ingestion. Bounded leak if omitted
  // (trajectory entries are per-extractor compact change-point
  // lists) but the per-board hygiene is the same shape.
  stabilityTrajectoryStore.purgeBoard(boardId);

  // Release the server-side persisted bundle if one exists. Sym-
  // metric to ledger.purgeBoard but for the row stored by the
  // analysis-persistence feature. Fire-and-forget — closeBoard
  // stays sync from the caller's perspective; the api-client
  // surfaces non-2xx via the system log if it matters. Audit tag
  // O13 (persisted-analysis-bundles).
  analysisPersistenceService.discard(boardId).catch(() => { /* surfaced via api-client's system-message push */ });

  // Drop the per-board store cells via the BOARD_SCOPED_STORE_CELLS registry
  // (defined above) — reviews (O2), activeMode (O3), cardTreeNav (O14,
  // card-tree-nav-slot),
  // forestNav.selection (O15, forest-nav-selection, schema 59; the per-board axis only —
  // `forestNav.expanded` is workspace-global and untouched). All are owned by
  // this BoardId and have no meaning once the board is gone; persisting them
  // via SyncService would bloat the user's document with tombstones. The cells
  // are order-independent of each other; this drain runs after
  // stopBoardAnalysis (so the deletes overwrite the activeMode 'none'
  // tombstone) and before the splice.
  for (const cell of BOARD_SCOPED_STORE_CELLS) cell.clear(boardId);

  // Abort any in-flight review-analysis wait for this board so the
  // 30s timeout doesn't fire later and resurrect the reviews row
  // we just deleted. No-op if no review wait is pending.
  abortBoardReview(boardId);

  // Drop the closing board's thumbnail-cache entries. Must run
  // before the splice below — purgeBoardThumbnails walks
  // `board.nodes` and looks the board up in store.boards.
  purgeBoardThumbnails(boardId);

  // Drop the closing board's card-tree slot (forest, active set,
  // hydrated cards, forestStats). Must run before the splice so
  // any subsequent reactive read against `boardCardTrees.get(...)`
  // sees the empty state rather than stale content from the
  // closing board. Resource-ownership audit tag O12
  // (board-card-trees).
  removeBoardCardTree(boardId);

  if (store.boards.length <= 1) {
    store.boards = [createInitialBoard()];
    store.activeBoardIndex = 0;
    boardsVersion.value++;
    boardsSetVersion.value++;
    return;
  }

  const idx = store.boards.findIndex(b => b.id === boardId);
  if (idx === -1) return;

  store.boards.splice(idx, 1);

  // Adjust active index if we closed a board before or at the current index
  if (store.activeBoardIndex >= idx) {
    store.activeBoardIndex = Math.max(0, store.activeBoardIndex - 1);
  }

  boardsVersion.value++;
  boardsSetVersion.value++;
}

export function updateBoardState(index: number, newState: BoardState): void {
  if (store.boards[index]) {
    store.boards[index] = newState;
    boardsVersion.value++;
    // Conservative: bump the set-version even though most callers
    // preserve the board id. SGF-load paths (useDirtyBoardGuard,
    // useReviewSession) replace with freshly-parsed boards whose
    // id may differ; missing the bump would leave per-board
    // watchers stale for the old id and uninstalled for the new
    // one. A redundant bump (same id case) just fires reconcile
    // with no diff — cheap.
    boardsSetVersion.value++;
  }
}

/**
 * Registry of identity-scoped MODULE caches — module-scope state that
 * holds one identity's fetched/derived data and MUST be dropped on
 * identity flip (logout / switch-user), or it leaks across the tenancy
 * boundary. `resetWorkspace` drains this list; the tenancy test in
 * `tests/integration/store-mutators.test.ts` asserts each entry actually
 * clears. **Adding identity-scoped module state? Add a row here** — this
 * is the single place, so the clear can't be silently forgotten (the
 * structural successor to the prior hand-wired O8–O13 clears).
 *
 * Order is load-bearing: the engine stop (`stopAllBoardAnalyses`) runs
 * FIRST so an in-flight response can't re-populate the ledger after it's
 * purged (same discipline as `closeBoard`). The card-thumbnail and
 * card-tree clears are privacy-relevant (raw-CardId keys collide across
 * tenants); the rest are UUID-keyed memory hygiene.
 *
 * SCOPE: module-scope caches only. Component-instance fetched data
 * (ForestDirectory's `roots`, LibraryTab's query/preview state) is
 * unreachable from here — that leak is closed by remounting those
 * subtrees on identity flip via the control-panel identity `:key` in
 * `App.vue`.
 */
const IDENTITY_SCOPED_CACHES: ReadonlyArray<{ label: string; clear: () => void }> = [
  { label: 'analysis:active-board-analyses', clear: () => analysisService.stopAllBoardAnalyses() },
  { label: 'analysis-ledger', clear: () => ledger.purgeAll() },
  { label: 'stability-trajectories', clear: () => stabilityTrajectoryStore.purgeAll() },
  { label: 'board-thumbnails', clear: () => purgeAllThumbnails() },
  { label: 'card-thumbnails', clear: () => clearCardThumbnailCache() },
  { label: 'board-card-trees', clear: () => clearAllBoardCardTrees() },
  { label: 'analysis-bundle-summaries', clear: () => analysisPersistenceService.forgetAll() },
];

/** Labels of every registered identity-scoped cache — the tenancy
 *  completeness test asserts this set is non-empty and fully drained. */
export function identityScopedCacheLabels(): readonly string[] {
  return IDENTITY_SCOPED_CACHES.map(c => c.label);
}

/**
 * Resets user-owned reactive workspace state (boards,
 * activeBoardIndex, profile, session) to defaults.
 *
 * Releases the prior identity's per-board analysis bookkeeping
 * before the workspace state is replaced — without it, the
 * analysisService's activeQueryIds / activeSubscriptions /
 * activeQueries / restartCallbacks Maps would persist with
 * BoardIds keyed to a workspace that no longer exists, and the
 * proxy would keep pondering for those orphaned IDs. The
 * stopAllBoardAnalyses call fires a terminate frame for each
 * still-active query; the per-board maps drop their entries on
 * the way through.
 *
 * Clears the bounded module-scope caches that would otherwise
 * accumulate the prior identity's data across the session
 * boundary:
 *
 *   - ledger.purgeAll (audit pair O8) — analysis packets and
 *     per-node version refs.
 *   - purgeAllThumbnails (audit pair O9) — board-thumbnail
 *     SVG cache.
 *   - clearCardThumbnailCache (audit pair O10) — card-thumbnail
 *     SVG cache.
 *   - clearAllBoardCardTrees (audit tag O12, board-card-trees) —
 *     per-board
 *     card-tree state (forest, active set, hydrated cards keyed
 *     by raw CardId, forestStats).
 *   - analysisPersistenceService.forgetAll (audit tag O13,
 *     persisted-analysis-bundles) —
 *     per-board cached AnalysisBundleSummary entries. Pure
 *     local-cache release; the server-side rows belong to the
 *     prior identity's user_id and are unreachable to the new
 *     identity via the tenancy boundary, so no DELETE storm is
 *     needed (and would be wrong — it would 404 against a
 *     freshly-authenticated user who hasn't even tried to access
 *     the prior user's bundles).
 *
 * Both card-thumbnail and card-tree clears are privacy-relevant:
 * their keys include raw CardIds that auto-increment per tenant
 * and collide across users, so without these clears a shared-
 * computer flow would surface the prior user's card content
 * under the next user's identity. The other two caches use
 * UUID-style NodeIds where cross-user collision is functionally
 * impossible; their clears are pure memory hygiene.
 *
 * Aborts every in-flight review-analysis wait via
 * abortAllReviews (audit pair O11). Without this, a mid-review
 * identity flip would let the 30s timeout fire later (in the
 * new identity's session) and pollute `store.session.reviews`
 * with phantom IDLE rows keyed to the prior identity's BoardIds
 * — those rows would then sync to the new user's backend
 * document.
 *
 * `store.engine` itself (status, metrics, the live WebSocket)
 * is intentionally preserved across the reset: under today's
 * local-machine deployment the WebSocket URL is not user-keyed,
 * so the live KataGo connection remains honestly applicable to
 * any user. Half-resetting `store.engine` (e.g., flipping
 * `status` to `'disconnected'` while the socket is still open)
 * would create a real ADR-0001 violation. When deployment
 * shifts to user-keyed endpoints (cloud-compute, rented
 * per-user engines), full engine reset + actual
 * analysisService.disconnect() becomes the right move; tracked
 * in the work-status SSOT (`engine-connection-lifecycle-logout`).
 * The per-board cleanup
 * shipped here is a strict subset of that future work — it
 * releases workspace-keyed state without touching the WS.
 *
 * Used by the SyncService's auth-state watcher to clear prior-
 * user data on identity loss (logout, rejection). The next
 * hydration on re-login overwrites with the new user's backend
 * document; the reset is the privacy-correct in-between state
 * for shared-computer scenarios.
 *
 * Workspace-owned-resource cleanup is tracked in the archived
 * audit plan, docs/archive/notes/resource-ownership-audit-plan.md
 * (audit pairs O7
 * for analysisService's per-board maps, O8 for the analysis-
 * ledger, O9 for the board-thumbnail cache, O10 for the
 * privacy-relevant useCardThumbnail cache, and O11 for the
 * review-wait aborts — all five resolve against the plan's
 * inventory; the code-minted O12/O13 tags above do not, see
 * closeBoard's closing note).
 */
export function resetWorkspace(): void {
  // Release the prior identity's per-board analysis bookkeeping
  // before mutating the workspace. Same shape as closeBoard's
  // cleanup but applied to every active board at once. The WS
  // itself stays open per the docstring's deployment-model
  // reasoning.
  // Drain every identity-scoped module cache in dependency order (see
  // IDENTITY_SCOPED_CACHES above — engine-stop first, then the data
  // caches). Replaces the prior hand-wired O8–O13 clears with one
  // registry, so a future cache can't be silently left out of the
  // tenancy reset.
  for (const cache of IDENTITY_SCOPED_CACHES) cache.clear();

  // Abort every in-flight review-analysis wait so prior-identity
  // timeouts can't fire 30s into the new identity's session and
  // pollute `store.session.reviews` with phantom IDLE rows.
  abortAllReviews();

  store.boards = [createInitialBoard()];
  store.activeBoardIndex = 0;
  store.profile = structuredClone(defaultProfile);
  // Re-seed the non-persisted tag dictionary on identity-out: it no
  // longer rides profile's clone-reset (it's a top-level GlobalStore
  // field now), so without this the prior identity's knownTags would
  // leak into the next session until the boot getTags() fetch
  // overwrote it. Server-derived cache; see the ProfileState invariant.
  store.knownTags = structuredClone(defaultKnownTags);
  store.session = {
    id: NIL_UUID as SessionId,
    profileId: NIL_UUID as ProfileId,
    ui: structuredClone(defaultSessionUI),
    reviews: {},
  };
  boardsVersion.value++;
  boardsSetVersion.value++;
}

export function updateFromRemote(
  remoteData: Partial<GlobalStore> & { schemaVersion?: number },
): void {
  // Bring the blob up to current schema before applying. migrate
  // throws on future-version or missing-migration blobs (per
  // ADR-0002); the SyncService's hydrate() catches and surfaces.
  const migrated = migrate(remoteData);

  // Migrations may queue SystemMessages on a transient
  // `_pendingMigrationMessages` field — `engine.messages` isn't part
  // of the persistence shape, so the migration can't push directly.
  // Drain the queue here, after the schema is apply-ready, before
  // pushing through the public API.
  const pending = (migrated as { _pendingMigrationMessages?: unknown })
    ._pendingMigrationMessages;
  delete (migrated as { _pendingMigrationMessages?: unknown })._pendingMigrationMessages;

  if (migrated.boards) {
    store.boards = migrated.boards.map(normalizeBoard);
  }
  if (typeof migrated.activeBoardIndex === 'number') {
    store.activeBoardIndex = migrated.activeBoardIndex;
  }
  if (migrated.profile) store.profile = deepMerge(store.profile, migrated.profile);
  if (migrated.session) store.session = deepMerge(store.session, migrated.session);

  if (!store.session.reviews) {
    store.session.reviews = {};
  }

  if (Array.isArray(pending)) {
    for (const m of pending) {
      if (
        m && typeof m === 'object' &&
        typeof (m as { type?: unknown }).type === 'string' &&
        typeof (m as { text?: unknown }).text === 'string'
      ) {
        pushSystemMessage(
          (m as { type: SystemMessage['type'] }).type,
          (m as { text: string }).text
        );
      }
    }
  }

  boardsVersion.value++;
  boardsSetVersion.value++;
}

/**
 * Builds the persistence payload that SyncService PUTs to the
 * backend. Stamps the current schema version so the round-trip is
 * complete: future hydrations of this blob carry their version
 * marker and migrate() can dispatch the right forward-migration
 * chain. The store is the natural owner of both the schema and
 * the persistence shape; SyncService becomes a pure transport.
 */
export function buildPersistencePayload(): {
  schemaVersion: number;
  boards: GlobalStore['boards'];
  activeBoardIndex: GlobalStore['activeBoardIndex'];
  profile: GlobalStore['profile'];
  session: GlobalStore['session'];
} {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    boards: store.boards,
    activeBoardIndex: store.activeBoardIndex,
    profile: store.profile,
    session: store.session,
  };
}

// ── System Messaging Actions ──

export function pushSystemMessage(type: SystemMessage['type'], text: string) {
  const msg: SystemMessage = {
    id: Math.random().toString(36).substring(2, 9),
    type,
    text,
    timestamp: Date.now()
  };
  store.engine.messages.unshift(msg);
  if (store.engine.messages.length > 50) store.engine.messages.pop();
}

export function clearSystemMessages() {
  store.engine.messages = [];
}

export function dismissSystemMessage(id: string) {
  store.engine.messages = store.engine.messages.filter(m => m.id !== id);
}

function normalizeBoard(raw: any): BoardState {
  return {
    ...raw,
    maxVisitsTarget: raw.maxVisitsTarget ?? 1000,
    nodes:           raw.nodes           ?? {},
    games:           normalizeGames(raw.games),
  };
}

// Drop legacy `games` entries that don't conform to the current
// `EnginePlayGameSession` shape. The shape evolved from a flat
// `EnginePlayGameConfig` value (descendant-tree responder design)
// to a `{ config, currentHeadNodeId }` head-pointer shape during
// the play-vs-engine branch's design iteration; legacy entries
// from the descendant-tree design (created during in-branch
// testing) lack the `currentHeadNodeId` key and would crash the
// new responder if not dropped. Persisted blobs from main never
// have either shape (schema-52 migration backfills `{}`); this
// only matters for users who tested the play-vs-engine branch
// before the design revision.
function normalizeGames(rawGames: any): BoardState['games'] {
  if (!rawGames || typeof rawGames !== 'object') return {};
  const out: BoardState['games'] = {};
  for (const [k, v] of Object.entries(rawGames)) {
    if (
      v && typeof v === 'object' &&
      'config' in v && 'currentHeadNodeId' in v
    ) {
      out[k as keyof BoardState['games']] = v as BoardState['games'][keyof BoardState['games']];
    }
  }
  return out;
}
