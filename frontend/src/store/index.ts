/**
 * src/store/index.ts
 * Central Reactive Store.
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

import { defaultProfile, defaultSessionUI } from './defaults';
import { createInitialBoard } from './board-factory';

export { createInitialBoard }        from './board-factory';
export { DEFAULTS }                  from './defaults';

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
 */
export function closeBoard(boardId: BoardId): void {
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

export function updateFromRemote(remoteData: Partial<GlobalStore>): void {
  if (remoteData.boards) {
    store.boards = remoteData.boards.map(normalizeBoard);
  }
  if (typeof remoteData.activeBoardIndex === 'number') {
    store.activeBoardIndex = remoteData.activeBoardIndex;
  }
  if (remoteData.profile) store.profile = deepMerge(store.profile, remoteData.profile);
  if (remoteData.session) store.session = deepMerge(store.session, remoteData.session);
  
  if (!store.session.reviews) {
    store.session.reviews = {} as Record<BoardId, ReviewSessionData>;
  }
  
  boardsVersion.value++;
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
