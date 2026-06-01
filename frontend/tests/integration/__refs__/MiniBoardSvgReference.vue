<!--
  src/components/board/MiniBoard.vue
  Reactive thumbnail Go board — the component projection of a BoardSnapshot.
  Visual parity with the string projection (renderBoardToSvg): wood ground,
  grid, stones, optional last-move ring, optional A/B/C variation labels — no
  coordinate labels or hoshi (those are BoardDisplay's main-board chrome).

  Where the string projection rebuilds the whole SVG subtree on every update
  (v-html → ContentRangeInserted → style recalc), this diffs: the grid is
  v-memo'd on board size, each stone is per-item v-memo'd, so a navigation
  step patches only the one or two stones that changed. Used by ChartPreviewBox
  and the multiresolution heatmap preview window.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
// NOTE: this file is a FROZEN, exact `git show main:` copy of the pre-split
// MiniBoard.vue, used only by MiniBoardSvg.parity.test.ts as the carry-over
// reference. The ONLY edit from the original is these two import paths,
// relocated for this directory (`../../engine` → `../../../src/engine`); they
// resolve to the same modules, so the render is identical. Do not "improve" it.
import { BOARD_PX, BOARD_COLOR, LINE_COLOR, MARKER_INNER_RATIO } from '../../../src/engine/constants';
import { boardGeometry, gridLines, type BoardSnapshot } from '../../../src/engine/board-geometry';

const props = withDefaults(
  defineProps<{
    snapshot: BoardSnapshot;
    // Draw the last-move ring. A render option, not snapshot data — the
    // delta panel wants it, the others don't (mirrors the string
    // projection's showMarker flag).
    showMarker?: boolean;
  }>(),
  { showMarker: false },
);

// Per-instance gradient-id suffix so multiple MiniBoards on screen don't
// collide on the wood pattern / stone gradient ids.
const uid = Math.random().toString(36).substring(2, 6);

const size = computed(() => props.snapshot.size);
const geo  = computed(() => boardGeometry(size.value));
const lines = computed(() => gridLines(size.value));

const stoneList = computed(() =>
  Object.entries(props.snapshot.stones).map(([key, color]) => {
    const [bx, by] = key.split(',').map(Number);
    const { x, y } = geo.value.toSVG(bx, by);
    return { key, x, y, color };
  }),
);

const labelList = computed(() =>
  Object.entries(props.snapshot.markerLabels ?? {}).map(([key, label]) => {
    const [bx, by] = key.split(',').map(Number);
    const { x, y } = geo.value.toSVG(bx, by);
    return { key, x, y, label };
  }),
);

// Last-move ring position + colour (white ring on a black stone, vice versa),
// matching the string projection.
const markerRing = computed(() => {
  const lm = props.snapshot.lastMove;
  if (!props.showMarker || !lm || lm.type !== 'place') return null;
  const { x, y } = geo.value.toSVG(lm.x, lm.y);
  const onBlack = props.snapshot.stones[`${lm.x},${lm.y}`] === 'B';
  return { x, y, r: geo.value.stoneR * MARKER_INNER_RATIO, stroke: onBlack ? 'white' : 'black' };
});
</script>

<template>
  <svg :viewBox="`0 0 ${BOARD_PX} ${BOARD_PX}`" class="mini-board" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern :id="`wd-${uid}`" patternUnits="userSpaceOnUse" :width="BOARD_PX" :height="BOARD_PX">
        <image href="/textures/wood.jpg" :width="BOARD_PX" :height="BOARD_PX" preserveAspectRatio="xMidYMid slice" />
      </pattern>
      <radialGradient :id="`gb-${uid}`" cx="35%" cy="30%" r="50%">
        <stop offset="0%" stop-color="#666" /><stop offset="100%" stop-color="#111" />
      </radialGradient>
      <radialGradient :id="`gw-${uid}`" cx="35%" cy="30%" r="50%">
        <stop offset="0%" stop-color="#fff" /><stop offset="100%" stop-color="#d0d0d0" />
      </radialGradient>
    </defs>

    <rect width="100%" height="100%" :fill="BOARD_COLOR" />
    <rect width="100%" height="100%" :fill="`url(#wd-${uid})`" />

    <!-- Grid: static per board size, so memoised on it (skips on every nav). -->
    <g :stroke="LINE_COLOR" stroke-width="0.8" opacity="0.3" v-memo="[size]">
      <line v-for="(l, i) in lines" :key="i" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" />
    </g>

    <!-- Stones: per-item v-memo so a nav step patches only the changed ones. -->
    <circle
      v-for="stone in stoneList"
      :key="stone.key"
      v-memo="[stone.color, stone.x, stone.y]"
      :cx="stone.x"
      :cy="stone.y"
      :r="geo.stoneR"
      :fill="stone.color === 'B' ? `url(#gb-${uid})` : `url(#gw-${uid})`"
      :stroke="stone.color === 'B' ? '#000' : '#aaa'"
      stroke-width="0.5"
    />

    <!-- Last-move ring (optional). -->
    <circle
      v-if="markerRing"
      :cx="markerRing.x"
      :cy="markerRing.y"
      :r="markerRing.r"
      fill="none"
      :stroke="markerRing.stroke"
      stroke-width="2"
      opacity="0.8"
    />

    <!-- Variation A/B/C labels (optional). -->
    <template v-for="lbl in labelList" :key="lbl.key">
      <rect :x="lbl.x - 7" :y="lbl.y - 7" width="14" height="14" fill="rgba(255,255,255,0)" rx="2" />
      <text
        :x="lbl.x"
        :y="lbl.y + 1"
        fill="#000"
        font-size="28"
        font-weight="bold"
        font-family="monospace"
        text-anchor="middle"
        dominant-baseline="middle"
      >{{ lbl.label }}</text>
    </template>
  </svg>
</template>

<style scoped>
.mini-board {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
