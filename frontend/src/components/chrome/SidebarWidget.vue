<!-- 
  src/components/chrome/SidebarWidget.vue 
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref } from 'vue';
import { store, setActiveBoard, createBoard, closeBoard } from '../../store';
import BoardTab from '../board/BoardTab.vue';
import FloatingThumbnail from './FloatingThumbnail.vue';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import type { BoardId, BoardState } from '../../types';

// Load / save SGF emits relocated here from Toolbar (2026-05-15):
// SGF-file operations act on the board collection, not on engine
// telemetry, so they belong adjacent to the thumb-list's other
// board-lifecycle action (the `+` new-board button). The parent
// (`App.vue`) listens for these events and dispatches to the
// existing `openFileDialog` / `downloadActiveBoard` handlers.
defineEmits<{
  (e: 'load-sgf'): void;
  (e: 'save-sgf'): void;
}>();

const thumbRef = ref<InstanceType<typeof FloatingThumbnail> | null>(null);
const { getThumbnailSvg } = useThumbnailCache();

function handleAdd() {
  createBoard();
}

function getReviewState(boardId: string) {
  const status = store.session.reviews[boardId as BoardId]?.status;
  if (!status) return null;
  
  if (status === 'AWAITING_MOVE' || status === 'ANALYZING' || status === 'LOADING') return 'ACTIVE';
  if (status === 'FINISHED') return 'INTERMISSION';
  return null;
}

async function onHoverEnter(e: MouseEvent, board: BoardState) {
  if (!thumbRef.value) return;
  // Fetch thumbnail for the current node of that specific board
  const svg = await getThumbnailSvg(board.currentNodeId, board.id, false);
  thumbRef.value.show(svg, e.clientX + 20, e.clientY - 60);
}

function onHoverLeave() {
  thumbRef.value?.hide();
}
</script>

<template>
  <div id="sidebar-widget">
    <FloatingThumbnail ref="thumbRef" />

    <!-- File-ops header — LOAD / SAVE for SGF import/export, sitting
         above the thumb-list so the affordance is visible regardless
         of how many boards crowd the rail. Placed here (not foot-
         adjacent to `+`) deliberately: LOAD / SAVE act on EXTERNAL
         files; `+` acts on the IN-MEMORY collection. Spatial split
         reflects the conceptual difference, and the chrome-header
         placement is the convention any user (Go researcher or
         developer) recognises for file operations. Emits bubble to
         App.vue which dispatches to the existing `openFileDialog`
         / `downloadActiveBoard` handlers — same wiring the Toolbar
         used before the 2026-05-15 separation-of-concerns move. -->
    <div class="board-actions">
      <button class="board-action-btn" @click="$emit('load-sgf')">{{ $t('sidebar.loadSgf') }}</button>
      <button class="board-action-btn" @click="$emit('save-sgf')">{{ $t('sidebar.saveSgf') }}</button>
    </div>

    <div class="thumb-list">
      <BoardTab
        v-for="(board, index) in store.boards"
        :key="board.id"
        :state="board"
        :index="index"
        :isActive="store.activeBoardIndex === index"
        :reviewState="getReviewState(board.id)"
        @click="setActiveBoard(index)"
        @close="closeBoard(board.id)"
        @hover-enter="onHoverEnter($event, board)"
        @hover-leave="onHoverLeave"
      />
    </div>

    <button class="tab-add-btn" :title="$t('sidebar.newBoard')" @click="handleAdd">+</button>
  </div>
</template>

<style scoped>
#sidebar-widget {
  display: flex; flex-direction: column; align-items: center;
  padding: var(--space-medium) 0; background: var(--surface-0); height: 100%;
  border-right: 1px solid var(--surface-1); width: 108px;
}

.thumb-list {
  flex: 1; overflow-y: auto; width: 100%; display: flex;
  flex-direction: column; align-items: center;
}

.tab-add-btn {
  width: 20px; height: 20px; border-radius: 0%; border: none;
  background: var(--surface-2); color: var(--text-0); font-size: var(--text-emphasis); cursor: pointer; margin-top: var(--space-medium);
}
/* LOAD / SAVE file-ops header — horizontal pair at the top of
   the sidebar, above the scrollable thumb-list. Thin separator
   on the bottom edge sets the header off from the list without
   adding a heavy chrome element. Visual register matches
   `.tab-add-btn` (no border on the buttons themselves, surface-2
   fill) so the row reads as quiet chrome rather than a primary-
   action shelf — the user's "out of sight, out of mind during
   study" aesthetic preference, honoured under a discoverable
   placement. */
.board-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-tight);
  width: 100%;
  padding: 0 var(--space-tight) var(--space-tight);
  border-bottom: 1px solid var(--surface-1);
  margin-bottom: var(--space-tight);
}
.board-action-btn {
  flex: 1;
  height: 20px;
  border-radius: 0%;
  border: none;
  background: var(--surface-2);
  color: var(--text-0);
  font-family: monospace;
  font-size: var(--text-tiny);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
  cursor: pointer;
  padding: 0 var(--space-tight);
  min-width: 0;
}
</style>
