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
} from '../types';

import { defaultProfile, defaultSessionUI, NIL_UUID } from './defaults';
import { createInitialBoard } from './board-factory';
import { migrate, CURRENT_SCHEMA_VERSION } from './migrations';
import { analysisService } from '../services/analysis-service';
import { ledger } from '../services/analysis-ledger';
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

// ── Actions (Named Mutations) ─────────────────────────────────────────────────

export function mutateBoard(boardId: BoardId, fn: (draft: BoardState) => void): void {
  const index = store.boards.findIndex(b => b.id === boardId);
  if (index === -1) return;
  const board = store.boards[index];
  fn(board);
  store.boards[index] = { ...board };
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
export function toggleCardTreeManualExpand(boardId: BoardId, key: string): void {
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
 * board close happens inline in `closeBoard` (audit pair O14),
 * not through a mutator.
 */
export function setCardTreeManualExpand(boardId: BoardId, keys: readonly string[]): void {
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
 * Safely removes a board, shifting the active index.
 * If the last board is closed, spawns a fresh blank board.
 *
 * Releases the closing board's external resources and per-board
 * workspace dictionaries before mutating the surviving boards.
 * Four cleanups currently fire:
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
 *   3. delete store.session.reviews[boardId] — drops the per-board
 *      review-session row. Without it, dead entries accumulate in
 *      `store.session.reviews` and round-trip to the backend via
 *      SyncService (which persists `store.session` deeply).
 *   4. delete store.engine.activeMode[boardId] — drops the
 *      `'none'` tombstone that `stopBoardAnalysis`'s
 *      `recomputeActiveMode` lands at when the last query is
 *      released. Same SyncService-payload concern as #3, plus
 *      keeping the dictionary honest about which boards are still
 *      tracked.
 *   5. abortBoardReview — fires AbortController.abort() on the
 *      board's pending review-analysis wait, if any. Without it,
 *      a mid-review close would let the 30s timeout fire later,
 *      surfacing a "KataGo did not respond" toast for a board
 *      that no longer exists AND resurrecting the just-deleted
 *      `store.session.reviews[boardId]` row via the catch-block's
 *      lazy `mutateReviewSession`.
 *   6. purgeBoardThumbnails — drops cached SVG renders keyed on
 *      the closing board's NodeIds. Walks `board.nodes`, so it
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
 *      auto-increment ids. Resource-ownership audit O12.
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
 *      to double-handle here. Resource-ownership audit O13.
 *   9. delete store.session.ui.cardTreeNav[boardId] — drops the
 *      per-board card-tree manual-expand slot. Without it, dead
 *      entries accumulate in `session.ui.cardTreeNav` and round-
 *      trip to the backend via SyncService (same SyncService-payload
 *      concern as #3 and #4). Resource-ownership audit O14
 *      (schema-version 45 introduces the slice).
 *
 * Order matters: stop the engine before purging the ledger so an
 * in-flight packet can't land between the two and re-populate the
 * ledger after we've cleared it. The dictionary deletes follow
 * stopBoardAnalysis (which writes to activeMode) so the deletes
 * actually overwrite the tombstone rather than leaving it. The
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
 * Workspace-owned-resource cleanup is tracked in
 * docs/notes/resource-ownership-audit-plan.md (audit pairs O1 for
 * the ledger, O2 for the review-session row, O3 for the
 * activeMode tombstone, O4 for the thumbnail cache, and O5 for
 * the review-wait abort; subsequent pairs ship in their own
 * commits per the audit's bisect discipline).
 */
export function closeBoard(boardId: BoardId): void {
  // Release external resources the closing board owns. Both calls
  // are safe when the board has nothing to release; ordering is
  // load-bearing — stop the engine before purging the ledger. See
  // docstring above for the full rationale.
  analysisService.stopBoardAnalysis(boardId);
  ledger.purgeBoard(boardId);

  // Release the server-side persisted bundle if one exists. Sym-
  // metric to ledger.purgeBoard but for the row stored by the
  // analysis-persistence feature. Fire-and-forget — closeBoard
  // stays sync from the caller's perspective; the api-client
  // surfaces non-2xx via the system log if it matters. Audit O13.
  analysisPersistenceService.discard(boardId).catch(() => { /* surfaced via api-client's system-message push */ });

  // Drop the per-board workspace dictionary entries. All three keys
  // are owned by this BoardId and have no meaning once the board is
  // gone; persisting them via SyncService would just bloat the
  // user's document with tombstones over time. Audit pairs O2 / O3
  // / O14.
  delete store.session.reviews[boardId];
  delete store.engine.activeMode[boardId];
  delete store.session.ui.cardTreeNav[boardId];

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
  // closing board. Resource-ownership audit O12.
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
 *   - clearAllBoardCardTrees (audit pair O12) — per-board
 *     card-tree state (forest, active set, hydrated cards keyed
 *     by raw CardId, forestStats).
 *   - analysisPersistenceService.forgetAll (audit pair O13) —
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
 * in `docs/notes/deferred-items.md`. The per-board cleanup
 * shipped here is a strict subset of that future work — it
 * releases workspace-keyed state without touching the WS.
 *
 * Used by the SyncService's auth-state watcher to clear prior-
 * user data on identity loss (logout, rejection). The next
 * hydration on re-login overwrites with the new user's backend
 * document; the reset is the privacy-correct in-between state
 * for shared-computer scenarios.
 *
 * Workspace-owned-resource cleanup is tracked in
 * docs/notes/resource-ownership-audit-plan.md (audit pairs O7
 * for analysisService's per-board maps, O8 for the analysis-
 * ledger, O9 for the board-thumbnail cache, O10 for the
 * privacy-relevant useCardThumbnail cache, and O11 for the
 * review-wait aborts).
 */
export function resetWorkspace(): void {
  // Release the prior identity's per-board analysis bookkeeping
  // before mutating the workspace. Same shape as closeBoard's
  // cleanup but applied to every active board at once. The WS
  // itself stays open per the docstring's deployment-model
  // reasoning.
  analysisService.stopAllBoardAnalyses();

  // Drop bounded module-scope caches that would otherwise
  // accumulate the prior identity's data across the session
  // boundary. Both card-thumbnail and card-tree clears are
  // privacy-relevant (raw-CardId collisions across users); the
  // other two are memory hygiene over UUID-keyed entries.
  ledger.purgeAll();
  purgeAllThumbnails();
  clearCardThumbnailCache();
  clearAllBoardCardTrees();

  // Drop cached AnalysisBundleSummary entries — pure local-cache
  // release per the docstring's tenancy reasoning above. The
  // server-side rows belong to the prior identity and stay there
  // (the WHERE-clause fusion in the backend's adapter ensures
  // they're 404-not-403 to the new identity). Audit pair O13.
  analysisPersistenceService.forgetAll();

  // Abort every in-flight review-analysis wait so prior-identity
  // timeouts can't fire 30s into the new identity's session and
  // pollute `store.session.reviews` with phantom IDLE rows.
  abortAllReviews();

  store.boards = [createInitialBoard()];
  store.activeBoardIndex = 0;
  store.profile = structuredClone(defaultProfile);
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
    lastActivity:    raw.lastActivity    ?? 0,
    maxVisitsTarget: raw.maxVisitsTarget ?? 1000,
    nodes:           raw.nodes           ?? {},
  };
}
