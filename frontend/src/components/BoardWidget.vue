<!-- 
  src/components/BoardWidget.vue 
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref, toRaw } from 'vue';
import BoardDisplay from './BoardDisplay.vue';
import BoardHeatmapOverlay from './BoardHeatmapOverlay.vue';
import BoardVariationsOverlay from './BoardVariationsOverlay.vue';
import MoveSuggestions from './MoveSuggestions.vue';
import type { BoardState, NodeId, GameNode } from '../types';
import { getBoardSize, decodeBoardArray } from '../engine/util';
import { useScopedScroll } from '../composables/useScopedScroll';
import { useNavigation } from '../composables/useNavigation';
import { store } from '../store';
import { ledger } from '../services/analysis-ledger';
import { activeConfigHash } from '../services/analysis-config';

// ── Ownership overlay glue ───────────────────────────────────────────────────
// KataGo's `ownership` field comes back length size² in row-major order.
// The project follows KataGo's default convention: positive values
// indicate the *white* player expects to own that point; negative
// indicate black. Empirically verified against the live engine.
//
// The colorMap is shared across all three ownership sub-modes
// (continuous fill, discrete dots, stone liveness). For the liveness
// case, the call site encodes the disagreement-magnitude as a signed
// value — sign carries the opposing-stone colour, magnitude carries
// the confidence of the disagreement — and this same map paints it.
function ownershipColor(v: number): { fill: string; opacity: number } {
  const mag = Math.abs(v);
  // magic-literal: 0.05 is the dead-band threshold below which ownership
  // signal is too weak to render — prevents flicker as the engine's
  // confidence wavers around 0.
  if (mag < 0.05) return { fill: 'transparent', opacity: 0 };
  return {
    fill: v > 0 ? '#fff' : '#000',
    // magic-literal: 0.85 ownership ceiling — band-3 Go-bound visualization
    // decision. Caps the territory overlay's max opacity so even fully-
    // owned points don't completely obscure the board grid beneath. Both
    // factors (ceiling AND magnitude multiplier) are 0.85 by design — the
    // signal's apparent intensity tops out at the same 0.85 it scales by.
    opacity: Math.min(0.85, mag * 0.85),
  };
}

// Stones with disagreement weaker than this threshold aren't flagged
// as dead; below it, the engine is genuinely undecided about the
// region and the highlight would just flicker as packets arrive.
const LIVENESS_THRESHOLD = 0.3;

// Liveness marker uses the conventional small-opposing-coloured-dot
// rendering inside the stone (Lizzie / KaTrain / Sabaki convention).
// The threshold filter at the call site has already gated to confident
// disagreement, so a flat near-opaque fill reads cleanly without the
// magnitude-modulated opacity that the territory overlays use.
function livenessColor(v: number): { fill: string; opacity: number } {
  // magic-literal: 0.95 liveness opacity — band-3 Go-bound visualization
  // decision. Higher than ownershipColor's 0.85 ceiling because liveness
  // markers have already passed the LIVENESS_THRESHOLD gate (line 41), so
  // the rendering can be near-opaque without the magnitude-modulated fade
  // territory overlays use.
  return { fill: v > 0 ? '#fff' : '#000', opacity: 0.95 };
}

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

// Decoded ownership cells reactive to the active-palette hash and the
// current node. Both the continuous and dots sub-modes consume this
// list; the liveness sub-mode consumes its sibling `livenessCells`.
const decodedOwnership = computed(() => {
  const hash = activeConfigHash.value;
  if (!hash) return null;
  const packet = ledger.getRaw(hash, props.state.currentNodeId);
  const raw = packet?.ownership;
  if (!raw) return null;
  return decodeBoardArray(raw, boardSize.value);
});

// Empty-intersection cells for the territory-style overlays. Stones
// occlude their own position; their ownership is conveyed through the
// liveness sub-mode instead.
const emptyCells = computed(() => {
  const cells = decodedOwnership.value;
  if (!cells) return [];
  return cells.filter(({ x, y }) => !props.state.stones[`${x},${y}`]);
});

const continuousCells = computed(
  () => store.session.ui.overlayLayers.ownership.continuous ? emptyCells.value : [],
);

const dotsCells = computed(
  () => store.session.ui.overlayLayers.ownership.dots ? emptyCells.value : [],
);

// Stone-position cells where the engine's predicted owner disagrees
// with the stone's own colour. The encoded `value` is the raw
// ownership reading — its sign already addresses the colorMap toward
// the *opposing* colour (positive ownership = white-tint over a black
// stone; negative ownership = black-tint over a white stone).
const livenessCells = computed(() => {
  if (!store.session.ui.overlayLayers.ownership.liveness) return [];
  const cells = decodedOwnership.value;
  if (!cells) return [];
  return cells.filter(({ x, y, value }) => {
    const stone = props.state.stones[`${x},${y}`];
    if (!stone) return false;
    return (stone === 'B' && value > LIVENESS_THRESHOLD)
        || (stone === 'W' && value < -LIVENESS_THRESHOLD);
  });
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
    <BoardHeatmapOverlay
      v-if="continuousCells.length > 0"
      :cells="continuousCells"
      :size="boardSize"
      :color-map="ownershipColor"
      shape="square"
      :scale="0.5"
    />
    <BoardHeatmapOverlay
      v-if="dotsCells.length > 0"
      :cells="dotsCells"
      :size="boardSize"
      :color-map="ownershipColor"
      shape="disc"
      :scale="0.3"
    />
    <BoardHeatmapOverlay
      v-if="livenessCells.length > 0"
      :cells="livenessCells"
      :size="boardSize"
      :color-map="livenessColor"
      shape="disc"
      :scale="0.13"
    />
    <!-- Bound to the new global toggle -->
    <MoveSuggestions
      v-if="store.session.ui.showMoveSuggestions"
      :board-id="state.id"
      :current-node-id="state.currentNodeId"
      :board-size="boardSize"
      :pv-config="store.session.ui.pvAnimation"
      :current-move-number="currentMoveNumber"
      @move="(x, y) => emit('move', x, y)"
    />
    <!-- Game-tree variations overlay: stroke-only colored rings (or
         A/B/C lettered rings) for sibling variations from the
         current node, plus an optional gray ring at the next move
         on the active path. Independent of `showMoveSuggestions`
         since this is the user's own exploration state, not engine
         analysis. Mounted only when at least one of the two
         settings is on, so the off/off pair has zero runtime
         cost. -->
    <BoardVariationsOverlay
      v-if="store.session.ui.boardVariations !== 'off' || store.session.ui.showActiveNextMove"
      :state="state"
      :size="boardSize"
      :variations-mode="store.session.ui.boardVariations"
      :show-active-next-move="store.session.ui.showActiveNextMove"
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
