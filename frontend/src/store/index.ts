/**
 * src/store/index.ts
 * Central reactive store. Holds the single GlobalStore singleton and
 * exports both pure mutators and the small set of orchestrator
 * functions (createBoard, closeBoard, resetUserOwnedState) that
 * coordinate workspace-level state changes with their downstream
 * service-side cleanup. The latter is why this module imports
 * analysis-service — closing a board is a workspace mutation that
 * must release the board's in-flight analysis subscription as part
 * of the same operation; see closeBoard's comment.
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
  AnalysisMode,
  ReviewSessionData,
  SystemMessage,
} from '../types';

import { defaultProfile, defaultSessionUI, NIL_UUID } from './defaults';
import { createInitialBoard } from './board-factory';
import { migrate, CURRENT_SCHEMA_VERSION } from './migrations';
import { analysisService } from '../services/analysis-service';

export { createInitialBoard }        from './board-factory';
export { DEFAULTS }                  from './defaults';
export { CURRENT_SCHEMA_VERSION, migrate } from './migrations';

export const boardsVersion = ref(0);

export const store = reactive<GlobalStore>({
  activeBoardIndex: 0,
  boards: [createInitialBoard()],
  profile: defaultProfile,
  session: {
    id: '00000000-0000-0000-0000-000000000000' as SessionId,
    profileId: '00000000-0000-0000-0000-000000000000' as ProfileId,
    ui: defaultSessionUI,
    reviews: {} as Record<BoardId, ReviewSessionData>,
  },
  engine: {
    status: 'disconnected',
    metrics: {
      packetsPerSecond: 0,
      lastResponseId: null,
      lastWatchdogTimestamp: 0,
      latencyMs: 0,
    },
    activeMode: {} as Record<BoardId, AnalysisMode>,
    messages: [], 
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

export function addBoard(boardState: BoardState): void {
  store.boards.push(boardState);
  store.activeBoardIndex = store.boards.length - 1;
  boardsVersion.value++;
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
 * Releases the closing board's in-flight analysis subscription
 * before mutating the workspace. Without this call, the
 * analysis-service keeps the boardId in its activeQueryIds /
 * activeSubscriptions / restartCallbacks maps, the proxy keeps the
 * canonical alive (its keep-alive watchdog can't help — the WS is
 * still healthy because it's shared with the surviving boards), and
 * the LEAF keeps pondering for a board that no longer exists in the
 * workspace. This is the closeBoard half of the broader
 * workspace-owned-resource cleanup discipline scheduled in
 * docs/notes/resource-ownership-audit-plan.md; subsequent owner-
 * resource pairs ship in their own commits per the audit plan's
 * bisect discipline.
 */
export function closeBoard(boardId: BoardId): void {
  // Sever the analysis-subscription resource the closing board owns.
  // Safe to call when no analysis is active for the board:
  // stopBoardAnalysis short-circuits when its bookkeeping has no
  // entry for the boardId.
  analysisService.stopBoardAnalysis(boardId);

  if (store.boards.length <= 1) {
    store.boards = [createInitialBoard()];
    store.activeBoardIndex = 0;
    boardsVersion.value++;
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
}

export function updateBoardState(index: number, newState: BoardState): void {
  if (store.boards[index]) {
    store.boards[index] = newState;
    boardsVersion.value++;
  }
}

/**
 * Resets user-owned reactive workspace state (boards,
 * activeBoardIndex, profile, session) to defaults. `store.engine`
 * is intentionally preserved across the reset: under today's
 * local-machine deployment the WebSocket URL is not user-keyed,
 * so the live KataGo connection remains honestly applicable to
 * any user. Half-resetting `store.engine` (e.g., flipping
 * `status` to `'disconnected'` while the socket is still open)
 * would create a real ADR-0001 violation. When deployment
 * shifts to user-keyed endpoints (cloud-compute, rented
 * per-user engines), full engine reset + actual
 * analysisService.disconnect() becomes the right move; tracked
 * in `docs/notes/deferred-items.md`.
 *
 * Used by the SyncService's auth-state watcher to clear prior-
 * user data on identity loss (logout, rejection). The next
 * hydration on re-login overwrites with the new user's backend
 * document; the reset is the privacy-correct in-between state
 * for shared-computer scenarios.
 */
export function resetWorkspace(): void {
  store.boards = [createInitialBoard()];
  store.activeBoardIndex = 0;
  store.profile = structuredClone(defaultProfile);
  store.session = {
    id: NIL_UUID as SessionId,
    profileId: NIL_UUID as ProfileId,
    ui: structuredClone(defaultSessionUI),
    reviews: {} as Record<BoardId, ReviewSessionData>,
  };
  boardsVersion.value++;
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
    store.session.reviews = {} as Record<BoardId, ReviewSessionData>;
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
