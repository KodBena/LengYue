<!-- 
  src/components/SidebarWidget.vue 
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref } from 'vue';
import { store, setActiveBoard, createBoard, closeBoard } from '../store';
import BoardTab from './BoardTab.vue';
import FloatingThumbnail from './FloatingThumbnail.vue';
import { useThumbnailCache } from '../composables/useThumbnailCache';
import type { BoardId, BoardState } from '../types';

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
</style>
