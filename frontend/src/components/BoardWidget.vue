<!-- 
  src/components/BoardWidget.vue 
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref, toRaw } from 'vue';
import BoardDisplay from './BoardDisplay.vue';
import MoveSuggestions from './MoveSuggestions.vue';
import type { BoardState, NodeId, GameNode } from '../types';
import { getBoardSize } from '../engine/util';
import { useScopedScroll } from '../composables/useScopedScroll';
import { useNavigation } from '../composables/useNavigation';
import { store } from '../store';

const props = defineProps<{
  state: BoardState;
}>();

const emit = defineEmits<{
  (e: 'move', x: number, y: number): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const nav = useNavigation();

useScopedScroll(containerRef, (deltaY) => {
  if (deltaY > 0) nav.next();
  else nav.prev();
});

const boardSize = computed(() => getBoardSize(props.state));

const lastMovePoint = computed(() => {
  const currentNode = props.state.nodes[props.state.currentNodeId];
  return currentNode?.move ?? null;
});

const currentMoveNumber = computed(() => {
  let count = 0;
  // Tightened from `string | null` to `NodeId | null`. The walk starts
  // at `props.state.currentNodeId` (which is NodeId) and proceeds via
  // `node.parent` (which is `NodeId | null`); the loose `string` was a
  // signature lie covering for the loose type. With the branded type,
  // the Record indexing on rawNodes[currId] is type-safe with no cast.
  let currId: NodeId | null = props.state.currentNodeId;
  const rawNodes = toRaw(props.state.nodes);
  while (currId) {
    // Explicit annotation breaks TS7022 circular inference. After
    // ADR-0001's readonly removal, TS can no longer use the readonly
    // hint to break the cycle between `node`'s inferred type and
    // `currId`'s reassignment from `node.parent`. Annotating `node`
    // breaks the cycle by removing one side of the inference.
    const node: GameNode | undefined = rawNodes[currId];
    if (!node) break;
    if (node.move?.type === 'place') count++;
    currId = node.parent;
  }
  return count;
});
</script>

<template>
  <div ref="containerRef" class="board-widget-container">
    <BoardDisplay
      :size="boardSize"
      :stones="state.stones"
      :last-move="lastMovePoint"
      :show-labels="true"
      @click="(x, y) => emit('move', x, y)"
    />
    <!-- Bound to the new global toggle -->
    <MoveSuggestions
      v-if="store.session.ui.showMoveSuggestions"
      :board-id="state.id"
      :current-node-id="state.currentNodeId"
      :board-size="boardSize"
      :current-move-number="currentMoveNumber"
      @move="(x, y) => emit('move', x, y)"
    />
  </div>
</template>

<style scoped>
.board-widget-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
