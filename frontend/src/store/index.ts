/**
 * src/store/index.ts
 * Central reactive store. Holds the single GlobalStore singleton and
 * exports both pure mutators and the small set of orchestrator
 * functions (createBoard, closeBoard, resetWorkspace) that
 * coordinate workspace-level state changes with their downstream
 * service-side cleanup. Closing a board (or resetting the workspace)
 * is a mutation that must release the board's external resources
 * (in-flight analysis subscription at the proxy, cached packets and
 * per-node version refs in the ledger, persisted bundle, review-wait
 * aborts, thumbnail caches, card-tree slots). Those releases are
 * INVERTED (ADR-0012 P2/P3): rather than importing the resource owners
 * to drive their cleanup — which put the store on the down-edge of an
 * import cycle (the vite-vitest teardown-deadlock substrate) — the
 * store calls the owner-registered handlers in `teardown-registry.ts`,
 * which each owner registers at its own module init. See closeBoard's
 * docstring for the per-handler enumeration and the load-bearing
 * engine-stop-before-ledger-purge ordering.
 *
 * License: Public Domain (The Unlicense)
 */

import { reactive, computed, ref } from 'vue';
import { deepMerge } from '../lib/utils';

import type {
  GlobalStore,
  BoardState,
  BoardId,
  NodeId,
  ProfileId,
  SessionId,
  ReviewSessionData,
  SystemMessage,
  CardTreeExpandKey,
} from '../types';

import { defaultProfile, defaultSessionUI, defaultKnownTags, NIL_UUID } from './defaults';
import { createInitialBoard } from './board-factory';
import { migrate, CURRENT_SCHEMA_VERSION } from './migrations';
import {
  registerSystemMessageSink,
  pushSystemMessage,
} from '../services/system-message-sink';
// Owner-cleanup is inverted (ADR-0012 P2/P3): closeBoard / resetWorkspace no
// longer import the resource owners (analysis-service, analysis-ledger,
// stability-trajectory-store, analysis-persistence-service, useReviewSession,
// thumbnail-render-resources, useCardThumbnail, board-card-trees) to drive
// their teardown. Each owner registers its own handler at module init; the
// store calls the registry's run-APIs. Removing those store → owner out-edges
// is what dissolved the store/services import cycle (the vite-vitest teardown
// deadlock substrate — cycle-check ratchet, PR #444). The handler set is loaded
// by `teardown-registrations.ts` (side-effect-imported from the app entry); the
// board-completeness test pins the registered set so a dropped registration
// fails loudly (ADR-0002 — the test is the guarantee, not the type system).
import {
  runBoardCloseHandlers,
  runWorkspaceResetHandlers,
} from './teardown-registry';

export { createInitialBoard }        from './board-factory';
export { DEFAULTS }                  from './defaults';
export { CURRENT_SCHEMA_VERSION, migrate } from './migrations';

export const boardsVersion = ref(0);

/**
 * Explicit version counter for the `store.session` subtree, the
 * session analog of `boardsVersion`. SyncService watches this
 * SHALLOWLY in place of a `{ deep: true }` traversal of
 * `store.session` (sync-service.ts `startWatcher`). The deep watch
 * it replaces re-traversed the three PER-BOARD session dictionaries
 * (`session.reviews`, `session.ui.cardTreeNav`,
 * `session.ui.forestNav.selection` — the `BOARD_SCOPED_STORE_CELLS`)
 * on every fire, which is O(open-board count) per fire and O(N²)
 * over a close-all (the dominant close-at-scale cost — see
 * `composables/perf/closeAtScale.ts` and
 * `docs/notes/audit/perf-audit-game-scroll-2026-05-28.md`'s sibling
 * close-path findings).
 *
 * Persistence-correctness contract: EVERY mutation of `store.session`
 * that should schedule a persist must bump this counter, via
 * `touchSession()` at the write site. A session write that skips the
 * bump is a SILENTLY LOST SAVE — strictly worse than the traversal
 * cost removed — so the bump set is pinned by the save-coverage test
 * (`tests/integration/sync-session-version.test.ts`), which asserts a
 * sync is scheduled for each persistence-relevant session mutation
 * category. `store.profile` keeps its own deep watch (workspace-
 * global, O(1) in board count); only `session` moved to a counter.
 *
 * Bumped (via `touchSession`) at: `mutateReviewSession`,
 * `toggleCardTreeManualExpand`, `setCardTreeManualExpand`,
 * `closeBoard` (per-board cell drain), `resetWorkspace`,
 * `updateFromRemote` (the three wholesale / per-board session
 * mutators), plus the out-of-store session writers:
 * `useForestNavigation`'s mutators, `blind-mode-prefs`' owned write,
 * `useResizablePanel`, `useQeubo`'s toolbar-view setter, the
 * `SettingsTab` session registry editor, `ForestDirectory`'s
 * cardsContextIds / activeCardSetId writes, the App.vue / StatusBar
 * chrome toggles, the keybindings session toggles, the knob seam
 * (`writeStoreKnobValue`), and the dev-only perf harnesses
 * (`autonav`, `jankExtended`).
 */
export const sessionVersion = ref(0);

/**
 * Bump the `sessionVersion` counter. Call at every `store.session`
 * write site that should schedule a persist (the SyncService watcher
 * keys on this counter shallowly — see `sessionVersion`'s docstring
 * for the lost-save contract). A no-arg side-effect so the write
 * site reads as `touchSession()` regardless of the write's shape
 * (direct dotted write, aliased write, generic-record write).
 */
export function touchSession(): void {
  sessionVersion.value++;
}

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
    // NIL-UUID sentinels minted as the session/profile brands: the pre-auth
    // placeholder identity, replaced on login (brand mint at sentinels).
    id: '00000000-0000-0000-0000-000000000000' as SessionId, // NIL-UUID brand mint
    profileId: '00000000-0000-0000-0000-000000000000' as ProfileId, // NIL-UUID brand mint
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

// Register the system-message sink once `store` exists (the impl writes into
// `store.engine.messages`). Producers (services / state modules / composables)
// push through `pushSystemMessage` from the sink port rather than importing the
// store directly — that decoupling is what keeps api-client (and its cycle-only
// dependents) out of the store/services import cycle. `pushSystemMessage` is
// re-exported below so the existing store-importers keep working unchanged.
registerSystemMessageSink({
  push(type: SystemMessage['type'], text: string) {
    const msg: SystemMessage = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      text,
      timestamp: Date.now(),
    };
    store.engine.messages.unshift(msg);
    if (store.engine.messages.length > 50) store.engine.messages.pop();
  },
});

// Re-export the sink's push so the ~13 Component/composable importers that do
// `import { pushSystemMessage } from '.../store'` keep working — they cannot
// import from `src/services/**` (the component→services eslint boundary).
export { pushSystemMessage };

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
  // Empty-object accumulator typed as the keyed record it builds up below;
  // populated in the loop (the established empty-record-seed idiom).
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
  touchSession();
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
    touchSession();
    return;
  }
  const has = cur.manuallyExpanded.includes(key);
  store.session.ui.cardTreeNav[boardId] = {
    ...cur,
    manuallyExpanded: has
      ? cur.manuallyExpanded.filter(k => k !== key)
      : [...cur.manuallyExpanded, key],
  };
  touchSession();
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
      touchSession();
    }
    return;
  }
  store.session.ui.cardTreeNav[boardId] = { manuallyExpanded: [...keys] };
  touchSession();
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
 * Board-scoped store-cell teardowns — for the per-board *store cells*
 * (board-keyed GlobalStore dictionaries) rather than module caches. Each entry
 * deletes the closing board's cell; `closeBoard` drains this list in place of
 * hand-wired per-cell deletes, so a newly-added per-board store cell can't be
 * silently left out of teardown.
 *
 * Scope is deliberately the store cells ONLY (board-scope audit P1b / the
 * scope-exhaustiveness consult). The board-DERIVED purges and the
 * ordering-bound service stop are NO LONGER inline: Tranche D's
 * dependency inversion (ADR-0012 P2/P3) moved them to owner-registered
 * handlers run via `runBoardCloseHandlers` — exactly the "owner-located
 * teardown" candidate that the parked work-status item
 * `closeboard-class-b-teardown-shape` named (the prior keep-Class-B-inline
 * judgment was the 2026-06-05 consult's ADVISORY verdict, not a maintainer
 * decision; the load-bearing engine-stop-before-ledger-purge ordering now
 * travels as an explicit `TeardownOrder` band rather than inline call
 * position). This store-cell registry stays inline because it imports nothing
 * — it is not a cycle edge. The board-completeness *test* verifies this
 * registry drains correctly and per-board, and tripwires changes to its
 * coverage list — but it does NOT enumerate the store's per-board fields
 * independently (TypeScript can't, and no lint guards it today), so a
 * newly-added cell is caught only if its author both registers it here and
 * extends that test. Registering a new per-board cell is a discipline step,
 * not an automatically-caught one — see `frontend/docs/notes/board-scope.md`.
 *
 * Cells are order-independent of each other. closeBoard drains them BEFORE the
 * owner handlers (so the `review:abort` handler sees the reviews row already
 * gone) and before the splice. No surviving cell is written by the engine
 * stop, so the cells are order-independent of it too. (Until 2026-06-11 the
 * drain had to follow `stopBoardAnalysis` so its deletes would overwrite the
 * `engine.activeMode` 'none' tombstone that the now-removed activeMode
 * projection landed there — see work-status item `drop-engine-activemode`. No
 * surviving cell is written by it, so that constraint is gone.)
 */
const BOARD_SCOPED_STORE_CELLS: ReadonlyArray<{ label: string; clear: (b: BoardId) => void }> = [
  { label: 'session.reviews', clear: b => { delete store.session.reviews[b]; } },
  { label: 'session.ui.cardTreeNav', clear: b => { delete store.session.ui.cardTreeNav[b]; } },
  { label: 'session.ui.forestNav.selection', clear: b => { delete store.session.ui.forestNav.selection[b]; } },
];

/** Labels of every board-scoped store cell. The board-completeness test pins
 *  this set as a tripwire so the registry's coverage can't change without a
 *  deliberate test update; it does not (and cannot, in TS) prove the registry
 *  is exhaustive over the store's per-board fields. The store-internal-cell
 *  analog of the teardown registry's `registeredWorkspaceResetLabels` /
 *  `registeredBoardCloseLabels` (those cover the OWNER teardowns; this covers
 *  the store's own per-board cells). */
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
 *   2. ledger.purgeNodes — drops cached analysis packets and the
 *      per-node reactive version refs for the closed board's nodes
 *      across every palette hash (the caller snapshots the node ids
 *      before the splice and hands them in; the ledger no longer
 *      reaches up into the store). Without it, the ledger's internal
 *      Maps grow on every board close.
 *   3. stabilityTrajectoryStore.purgeNodes — drops the per-(hash,
 *      extractor, nodeId) stability trajectories accumulated from
 *      analysis-service's preview ingestion for the closed board's
 *      nodes. Bounded leak if omitted (trajectory entries are
 *      compact change-point lists), but the per-board hygiene is
 *      the same shape as #2.
 *   4. delete store.session.reviews[boardId] — drops the per-board
 *      review-session row. Without it, dead entries accumulate in
 *      `store.session.reviews` and round-trip to the backend via
 *      SyncService (which persists `store.session` deeply).
 *   5. abortBoardReview — fires AbortController.abort() on the
 *      board's pending review-analysis wait, if any. Without it,
 *      a mid-review close would let the 30s timeout fire later,
 *      surfacing a "KataGo did not respond" toast for a board
 *      that no longer exists AND resurrecting the just-deleted
 *      `store.session.reviews[boardId]` row via the catch-block's
 *      lazy `mutateReviewSession`.
 *   6. purgeBoardThumbnails — drops cached board snapshots keyed
 *      on the closing board's NodeIds. Walks `board.nodes`, so it
 *      must run while the board is still present in
 *      `store.boards` (i.e., before the splice below). NodeIds
 *      are UUID-style; cross-user collision is functionally
 *      impossible, so this is memory-hygiene rather than a
 *      correctness or privacy concern.
 *   7. removeBoardCardTree — drops the closing board's slot in
 *      the per-board card-tree state map (forest, active set,
 *      hydrated cards, forestStats). Without it, the
 *      `boardCardTrees` map accumulates dead entries over the
 *      session, and the slot's hydrated-cards map (CardId-keyed)
 *      could leak across an identity flip with collision-prone
 *      auto-increment ids. Resource-ownership audit tag O12
 *      (board-card-trees).
 *   8. analysisPersistenceService.discard — server-side bundle
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
 *   9. delete store.session.ui.cardTreeNav[boardId] — drops the
 *      per-board card-tree manual-expand slot. Without it, dead
 *      entries accumulate in `session.ui.cardTreeNav` and round-
 *      trip to the backend via SyncService (same SyncService-payload
 *      concern as #4). Resource-ownership audit tag O14
 *      (card-tree-nav-slot; schema-version 45 introduces the slice).
 *  10. delete store.session.ui.forestNav.selection[boardId] — drops the
 *      per-board forest-navigator selection (schema-version 59 re-scoped
 *      it per-board; board-scope audit P0). Same SyncService-payload
 *      concern as #4 / #9. `forestNav.expanded` is workspace-global
 *      and is NOT cleared here. Resource-ownership audit tag O15
 *      (forest-nav-selection).
 *
 * The owner cleanups (#1, #2, #3, #5, #6, #7, #8 above) are no longer
 * inline: each owner registers its handler at module init and this
 * function drains them via `runBoardCloseHandlers` (ADR-0012
 * dependency inversion — removing the store → owner imports is what
 * broke the import cycle). The store-cell deletes (#4 / #9 / #10) stay
 * INLINE via the BOARD_SCOPED_STORE_CELLS registry (they import
 * nothing — not a cycle edge).
 *
 * Order matters, and is carried by `TeardownOrder` bands on the
 * handlers rather than by call position: stop the engine
 * (`analysis-service:stop`, ENGINE_STOP) before purging the ledger
 * (`analysis-ledger:purge` / `stability-trajectory:purge`,
 * LEDGER_PURGE) so an in-flight packet can't land between the two and
 * re-populate the ledger after we've cleared it. The inline store-cell
 * drain runs FIRST, before the handlers: none of the surviving cells
 * is written by `stopBoardAnalysis` (order-independent of it), and the
 * `review:abort` handler relies on this board's reviews row already
 * being gone (blind-mode-prefs' exit watcher). The abort's
 * rejection-side cleanup runs in processUserMove's catch on the next
 * microtask. Every board-derived handler (the purges, the thumbnail
 * walk, the card-tree slot read) runs before the splice —
 * purgeBoardThumbnails reads `board.nodes` via store.boards.find,
 * which only resolves while the board is still present.
 *
 * Both `analysis-service:stop` and the ledger purge short-circuit
 * cleanly when the board has no active analysis or recorded packets
 * (an empty node list is a no-op purge); the inline dictionary deletes
 * are safe regardless (delete on a missing key is a no-op).
 *
 * Workspace-owned-resource cleanup is tracked in the archived audit
 * plan, docs/archive/notes/resource-ownership-audit-plan.md (all
 * three passes closed 2026-05-04). Pairs O1 / O2 / O4 / O5 resolve
 * against that plan's inventory (O1 the ledger, O2 the review-session
 * row, O4 the thumbnail cache, O5 the review-wait abort). O3 named
 * the `engine.activeMode` tombstone; the activeMode projection was a
 * write-only field with no readers and has been removed wholesale
 * (work-status item `drop-engine-activemode`), so closeBoard no
 * longer carries an O3 cleanup. The frozen plan's O3 row is left as
 * written — the plan is never edited. Tags numbered past the plan's
 * inventory — O12 (board-card-trees), O13 (persisted-analysis-bundles),
 * O14 (card-tree-nav-slot), O15 (forest-nav-selection) here — were
 * minted in code after the plan froze and do NOT resolve against
 * the plan's own O12–O15 rows, which name unrelated pairs; for
 * those tags the descriptive slug, not the bare number, is the
 * stable handle (the frozen plan is never edited).
 */
export function closeBoard(boardId: BoardId): void {
  // Snapshot the closing board's node ids BEFORE any cleanup (and
  // necessarily before the splice below): the ledger and the
  // stability-trajectory store no longer reach up into the store to
  // derive this list (the up-edges `analysis-ledger → store` and
  // `stability-trajectory-store → store` were import cycles), so the
  // caller hands them the nodes directly. The board must still be
  // present in `store.boards` for the lookup to resolve — Class-B
  // before-splice invariant; a closed/missing board yields an empty
  // array, a no-op purge.
  const board = store.boards.find(b => b.id === boardId);
  // `board.nodes` is a Record<NodeId, …>, so its keys are NodeIds —
  // re-brand the Object.keys string[] widening (matches the cast the
  // old purgeBoard carried internally).
  const nodeIds = (board ? Object.keys(board.nodes) : []) as NodeId[];

  // Drop the per-board store cells via the BOARD_SCOPED_STORE_CELLS registry
  // (defined above) — reviews (O2), cardTreeNav (O14, card-tree-nav-slot),
  // forestNav.selection (O15, forest-nav-selection, schema 59; the per-board axis only —
  // `forestNav.expanded` is workspace-global and untouched). All are owned by
  // this BoardId and have no meaning once the board is gone; persisting them
  // via SyncService would bloat the user's document with tombstones. This
  // store-internal drain stays INLINE (it imports nothing — not a cycle edge,
  // ADR-0012 P2/P3 leaves it here) and must run BEFORE the owner handlers: the
  // `review:abort` handler relies on this board's `store.session.reviews` row
  // already being gone so blind-mode-prefs' exit watcher has released the
  // snapshot (see abortBoardReview's body). The cells are otherwise
  // order-independent of each other and of the engine stop (no surviving cell
  // is written by stopBoardAnalysis); the drain runs before the splice.
  for (const cell of BOARD_SCOPED_STORE_CELLS) cell.clear(boardId);
  // The cell drain mutated the three per-board session dictionaries
  // (dropping this board's tombstones from the persisted blob), so the
  // session counter must bump — the SyncService watcher keys on it
  // shallowly now (no deep `session` traversal). `boardsVersion` also
  // fires on this close path, but the session tombstone-drop is a
  // genuine session mutation in its own right; bump explicitly rather
  // than rely on the boards-side coincidence (see `sessionVersion`).
  touchSession();

  // Release the external resources the closing board owns, via the
  // owner-registered teardown handlers (ADR-0012 dependency inversion — the
  // store no longer imports the owners; each registered its handler at module
  // init, loaded by teardown-registrations.ts). Runs AFTER the inline cell
  // drain above and BEFORE the splice below — every board-derived cleanup
  // (the ledger / stability purges over `nodeIds`, purgeBoardThumbnails'
  // `board.nodes` walk, removeBoardCardTree's slot read) needs the board still
  // present in `store.boards`. Ordering among handlers is carried by
  // `TeardownOrder` bands, not call position: the load-bearing constraint is
  // engine-stop-before-ledger-purge — `analysis-service:stop` (ENGINE_STOP)
  // runs before `analysis-ledger:purge` / `stability-trajectory:purge`
  // (LEDGER_PURGE) so an in-flight packet can't land between the two and
  // re-populate the ledger after it's cleared (see this function's docstring).
  // The handlers preserve, exactly:
  //   - analysis-service:stop (O1) — sever in-flight subscriptions;
  //   - analysis-ledger:purge (O1) — drop cached packets + version refs;
  //   - stability-trajectory:purge — drop per-(hash,extractor,node) trajectories;
  //   - analysis-persistence:discard (O13) — fire-and-forget server delete +
  //     local per-board cache release, `discard().catch()` swallowing failures;
  //   - review:abort (O5) — abort the in-flight review-analysis wait;
  //   - thumbnails:purge-board (O4) — drop the board's thumbnail snapshots;
  //   - board-card-trees:remove (O12) — drop the board's card-tree slot.
  // Both purges short-circuit cleanly on an empty node list; the dictionary
  // deletes (the inline drain) are no-ops on a missing key.
  runBoardCloseHandlers(boardId, nodeIds);

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

// Identity-scoped MODULE-cache teardown (the prior `IDENTITY_SCOPED_CACHES`
// registry) is now OWNER-LOCATED (ADR-0012 P2/P3): each owner registers its
// workspace-reset handler at module init, and `resetWorkspace` drains them via
// `runWorkspaceResetHandlers()`. The single-place "add a row here" discipline
// moved to the owner modules + the registry leaf (`teardown-registry.ts`); the
// completeness guarantee is the board-completeness test pinning
// `registeredWorkspaceResetLabels()`. The load-bearing engine-stop-before-
// ledger-purge ordering travels as an explicit `TeardownOrder` band on the
// handlers (analysis-service's stop at ENGINE_STOP < the ledger purge), not as
// array position. SCOPE is unchanged — module-scope caches only; component-
// instance fetched data (ForestDirectory's `roots`, LibraryTab's query/preview)
// is unreachable from here and is closed by remounting those subtrees on the
// control-panel identity `:key` in `App.vue`.

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
 *     snapshot cache (owner module: thumbnail-render-resources).
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
  // Release the prior identity's per-board analysis bookkeeping and the
  // identity-scoped module caches before mutating the workspace — same shape
  // as closeBoard's cleanup but applied to every active board at once. The WS
  // itself stays open per the docstring's deployment-model reasoning.
  //
  // Drain every owner-registered workspace-reset handler (ADR-0012 dependency
  // inversion — the store no longer imports the owners). Ordering is carried
  // by `TeardownOrder`: `analysis:active-board-analyses` (ENGINE_STOP) fires
  // the engine stop FIRST so an in-flight response can't re-populate the
  // ledger after `analysis-ledger`'s purgeAll; the remaining data-cache clears
  // and `review:abort-all` are order-independent (DEFAULT). The handlers
  // preserve, exactly: the engine stop (O7), the ledger / stability purgeAll
  // (O8), purgeAllThumbnails (O9), clearCardThumbnailCache (O10),
  // clearAllBoardCardTrees (O12), analysisPersistenceService.forgetAll (O13),
  // and abortAllReviews (O11, which also releases the blind-mode pref snapshot).
  //
  // The whole drain runs BEFORE the `store.session` replacement below — a
  // load-bearing ordering for `review:abort-all` (abortAllReviews): its
  // blind-mode `releaseAll()` must restore into the OUTGOING session record
  // (which the replacement then discards wholesale), not the new one. See
  // abortAllReviews' body for that ordering hazard.
  runWorkspaceResetHandlers();

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
    id: NIL_UUID as SessionId, // NIL-UUID brand mint (logged-out sentinel)
    profileId: NIL_UUID as ProfileId, // NIL-UUID brand mint (logged-out sentinel)
    ui: structuredClone(defaultSessionUI),
    reviews: {},
  };
  boardsVersion.value++;
  boardsSetVersion.value++;
  // `store.session` was replaced wholesale — bump the session counter
  // (the SyncService watcher keys on it shallowly; see `sessionVersion`).
  touchSession();
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
  // `_pendingMigrationMessages` is a transient field migrations attach
  // outside the persistence shape; read it as `unknown` and drain.
  const pending = (migrated as { _pendingMigrationMessages?: unknown })
    ._pendingMigrationMessages;
  // Same off-shape transient field; delete after draining.
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
        // Probe the queued message's shape: read type/text off the checked
        // non-null object as `unknown`, validated `string` before use.
        typeof (m as { type?: unknown }).type === 'string' &&
        typeof (m as { text?: unknown }).text === 'string' // same checked-object probe
      ) {
        pushSystemMessage(
          // Validated above: type/text are present strings — narrow to the
          // SystemMessage field types for the push.
          (m as { type: SystemMessage['type'] }).type,
          (m as { text: string }).text // validated string above
        );
      }
    }
  }

  boardsVersion.value++;
  boardsSetVersion.value++;
  // `store.session` was replaced (or seeded) by the hydration above —
  // bump the session counter so the SyncService watcher (which keys on
  // it shallowly now) observes the change. See `sessionVersion`.
  touchSession();
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
//
// `pushSystemMessage` now lives behind the registered sink port
// (`src/services/system-message-sink.ts`); the write implementation is
// registered at module init above (just after `store` is defined) and the
// symbol is re-exported there, so store-importers are unaffected.
// `clearSystemMessages` / `dismissSystemMessage` stay store-local (not part of
// the sink port).

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
      // Validated the head-pointer shape above ({config, currentHeadNodeId}):
      // narrow the key to the games-map key type and the value to the
      // EnginePlayGameSession the new responder expects (migration filter).
      out[k as keyof BoardState['games']] = v as BoardState['games'][keyof BoardState['games']];
    }
  }
  return out;
}
