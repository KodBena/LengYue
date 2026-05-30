<!--
  src/components/board/BoardDisplay.vue
  Stateless SVG Go board with gradients and textures.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import {
  BOARD_PX, BOARD_COLOR, LINE_COLOR, LABEL_COLOR,
  LABEL_BAND, LABEL_FONT_SIZE, LABEL_INSET_RATIO, TOTAL_PX,
  STONE_RADIUS_RATIO, MARKER_INNER_RATIO,
  ALL_X_LABELS,
} from '../../engine/constants';
import type { StoneColor, Move } from '../../types';
import type { HeatmapCell, HeatmapStyle } from './BoardHeatmapOverlay.vue';

const props = defineProps<{
  size?: number;
  stones: Record<string, StoneColor>;
  lastMove?: Move | null;
  showLabels?: boolean;
  // Optional: when provided, the value at `moveNumbers["x,y"]` is
  // rendered as a small numeric label centered on the stone at
  // that coordinate. Keys that aren't present in `stones` are
  // ignored. The caller (BoardWidget) is responsible for gating
  // this on `session.ui.showStoneMoveNumbers` — when off, omit
  // the prop entirely rather than passing an empty map; keeps
  // the v-if reactive without an extra props comparison.
  moveNumbers?: Record<string, number>;
  // Optional ownership-shading underlay. When provided, the cells
  // render as cell-sized translucent squares INSIDE the SVG,
  // between the hoshi and stones layers — so stones naturally
  // occlude the underlay's centers while the corners remain
  // visible at cell boundaries, giving the "spatial continuity"
  // reading of the engine's ownership map. The caller
  // (BoardWidget) feeds the same colour-map function it would
  // pass to a standalone BoardHeatmapOverlay; the two paths
  // share the `HeatmapCell` / `HeatmapStyle` types so the call-
  // site contract is one-for-one with the overlay component.
  underlayCells?: readonly HeatmapCell[];
  underlayColorMap?: HeatmapStyle;
}>();

const emit = defineEmits<{
  (e: 'click', x: number, y: number): void;
  // Shift-click is routed separately so the consumer (BoardWidget)
  // can dispatch it to navigation rather than play a move. The
  // payload is the same (board-coords x, y); the modifier
  // semantics live entirely at the emit boundary so neither this
  // widget nor downstream consumers need to introspect
  // `event.shiftKey` themselves.
  (e: 'shift-click', x: number, y: number): void;
}>();

// Unique ID suffix to prevent gradient collisions between multiple boards/thumbnails
const uid = Math.random().toString(36).substring(2, 6);

const boardSize = computed(() => props.size ?? 19);

// Inner-board geometry. `pad` is the inset within the playable area from
// the area edge to the first grid line (one cell wide, by Go-board
// convention). LABEL_BAND sits *outside* this — the playing-area group is
// translated by (LABEL_BAND, LABEL_BAND) inside the SVG, so the formulas
// below remain inner-board-relative and don't carry the offset themselves.
const pad     = computed(() => BOARD_PX / (boardSize.value + 1));
const cell    = computed(() => (BOARD_PX - 2 * pad.value) / (boardSize.value - 1));
const stoneR  = computed(() => cell.value * STONE_RADIUS_RATIO);
const STAR_R  = 2.5; // Fixed dot size — does not need to scale with the board.

// Coordinate-label offset from the SVG edge (viewBox-units). The label
// sits inside the strip between the SVG edge and the nearest edge-row
// stone; LABEL_INSET_RATIO chooses where in that strip (0 = edge, 1 =
// stone, 0.5 = centered). Size-aware via pad and stoneR — smaller boards
// have larger stones, so the strip narrows; the ratio holds across sizes.
const labelOffset = computed(() =>
  LABEL_INSET_RATIO * (LABEL_BAND + pad.value - stoneR.value),
);

const xLabels = computed(() => ALL_X_LABELS.slice(0, boardSize.value));

const hoshi = computed((): [number, number][] => {
  const s = boardSize.value;
  if (s === 19) {
    return [
      [3,3],[9,3],[15,3],
      [3,9],[9,9],[15,9],
      [3,15],[9,15],[15,15],
    ];
  }
  if (s === 13) {
    // Corners at 3 and 9, tengen at 6.
    return [[3,3],[9,3],[3,9],[9,9],[6,6]];
  }
  if (s === 9) {
    // Corners at 2 and 6, tengen at 4.
    return [[2,2],[6,2],[2,6],[6,6],[4,4]];
  }
  // Other sizes (5x5, etc.) get no hoshi rather than wrong hoshi.
  console.warn(`[BoardDisplay uid=${uid}] no hoshi definition for size=${s}`);
  return [];
});

// `lines` previously had a `{ cache: true }` second-argument options object.
// Vue 3.5+ removed the `cache` option from computed() — the option doesn't
// exist on DebuggerOptions and triggers a TS2769 overload error. The default
// behavior of computed (memoize the result, recompute when tracked deps
// change) is exactly what we want here. The `cache: true` was either
// cargo-culted or a relic from a Vue 2/3-early reactivity tweak; either
// way, the dep-tracked memoization in current Vue does the right thing
// without it.
const lines = computed(() => {
  const result = [];
  const p = pad.value;
  const c = cell.value;
  const s = boardSize.value;
  const end = p + (s - 1) * c;
  for (let i = 0; i < s; i++) {
    const pos = p + i * c;
    result.push({ x1: pos, y1: p, x2: pos, y2: end }); // vertical
    result.push({ x1: p, y1: pos, x2: end, y2: pos }); // horizontal
  }
  return result;
});

const stoneList = computed(() => {
  return Object.entries(props.stones).map(([key, color]) => {
    const [bx, by] = key.split(',').map(Number);
    const { x, y } = toSVG(bx, by);
    return { key, x, y, color };
  });
});
function toSVG(bx: number, by: number): { x: number; y: number } {
  // Board y=0 is at the bottom; SVG y increases downward, so we flip.
  // The playing-area group is translated by (LABEL_BAND, LABEL_BAND) in
  // the template, so these are inner-board coordinates.
  return {
    x: pad.value + bx * cell.value,
    y: pad.value + (boardSize.value - 1 - by) * cell.value,
  };
}

function onBoardClick(e: MouseEvent) {
  const svg = e.currentTarget as SVGSVGElement;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const cursor = pt.matrixTransform(svg.getScreenCTM()?.inverse());

  // Cursor is in viewBox coords (0..TOTAL_PX); subtract LABEL_BAND to land
  // in inner-board coords before resolving column/row.
  const col = Math.round((cursor.x - LABEL_BAND - pad.value) / cell.value);
  const row = Math.round((cursor.y - LABEL_BAND - pad.value) / cell.value);
  const s = boardSize.value;

  if (col >= 0 && col < s && row >= 0 && row < s) {
    const boardY = s - 1 - row;
    if (e.shiftKey) {
      emit('shift-click', col, boardY);
    } else {
      emit('click', col, boardY);
    }
  }
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${TOTAL_PX} ${TOTAL_PX}`"
    class="board-svg"
    @click="onBoardClick"
  >
    <!-- Assets Definition -->
    <defs>
      <!-- Wood Texture (covers the full canvas including the label band) -->
      <pattern :id="'wood-' + uid" patternUnits="userSpaceOnUse" :width="TOTAL_PX" :height="TOTAL_PX">
        <image href="/textures/wood.jpg" :width="TOTAL_PX" :height="TOTAL_PX" preserveAspectRatio="xMidYMid slice" />
      </pattern>

      <!-- Black Stone Gradient -->
      <radialGradient :id="'grad-b-' + uid" cx="35%" cy="30%" r="50%">
        <stop offset="0%" stop-color="#666" />
        <stop offset="100%" stop-color="#111" />
      </radialGradient>

      <!-- White Stone Gradient -->
      <radialGradient :id="'grad-w-' + uid" cx="35%" cy="30%" r="50%">
        <stop offset="0%" stop-color="#fff" />
        <stop offset="100%" stop-color="#d0d0d0" />
      </radialGradient>
    </defs>

    <!-- 1. Background -->
    <rect width="100%" height="100%" :fill="BOARD_COLOR" />
    <rect width="100%" height="100%" :fill="`url(#wood-${uid})`" />

    <!-- 2. Coordinate labels (viewBox-absolute coords; placed inside the
         strip between the SVG edge and the nearest edge-row stone via
         labelOffset / LABEL_INSET_RATIO). Rendered on all four sides
         per the Lizzie/Sabaki/KaTrain/KGS/OGS convention. -->
    <!-- Per-nav render discipline: this SVG re-renders every nav step (stones /
         last-move / move-numbers change), but the geometry layers — labels,
         grid, hoshi — depend only on `boardSize` (nav-invariant), so they are
         v-memo'd on it and skip. The stones and move-numbers are per-item
         v-memo'd (the :key carries position, so only the 1-2 changed stones
         re-render). Pre-memo this re-created ~500 vnodes/nav for a ~2-stone
         delta. (`boardSize` is genuinely stable during nav — unlike
         TreeWidget's churning layout, so these memos actually skip.) -->
    <g v-if="showLabels" v-memo="[boardSize]" :fill="LABEL_COLOR" :font-size="LABEL_FONT_SIZE" font-weight="bold" font-family="monospace" text-anchor="middle" dominant-baseline="middle">
      <text v-for="(label, i) in xLabels" :key="'lxt'+i" :x="LABEL_BAND + pad + i * cell" :y="labelOffset">{{ label }}</text>
      <text v-for="(label, i) in xLabels" :key="'lxb'+i" :x="LABEL_BAND + pad + i * cell" :y="TOTAL_PX - labelOffset">{{ label }}</text>
      <text v-for="i in boardSize"         :key="'lyl'+i" :x="labelOffset"                  :y="LABEL_BAND + pad + (boardSize - i) * cell">{{ i }}</text>
      <text v-for="i in boardSize"         :key="'lyr'+i" :x="TOTAL_PX - labelOffset"      :y="LABEL_BAND + pad + (boardSize - i) * cell">{{ i }}</text>
    </g>

    <!-- 3. Playing area: grid, hoshi, stones, last-move marker. Translated
         into the inner box so the geometry below stays inner-board-relative. -->
    <g :transform="`translate(${LABEL_BAND}, ${LABEL_BAND})`">
      <!-- 3a. Grid -->
      <g :stroke="LINE_COLOR" stroke-width="0.8" opacity="0.8" v-memo="[boardSize]">
        <line v-for="(l, i) in lines" :key="i" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" />
      </g>

      <!-- 3b. Hoshi -->
      <circle
        v-for="(h, i) in hoshi"
        :key="'h'+i"
        v-memo="[boardSize]"
        :cx="toSVG(h[0], h[1]).x"
        :cy="toSVG(h[0], h[1]).y"
        :r="STAR_R"
        fill="#222"
      />

      <!-- 3b-bis. Ownership-shading underlay. Cell-sized squares
           (half-extent = cell/2, so each square exactly tiles its
           intersection's box) drawn BEFORE the stones so the stones
           paint over the underlay's centers. The four corners of
           each underlay square remain visible at the cell boundaries
           — the result is a continuous ownership-tint shading
           interrupted only by the stone discs themselves. -->
      <g v-if="underlayCells && underlayColorMap && underlayCells.length > 0">
        <rect
          v-for="ucell in underlayCells"
          :key="`under-${ucell.x},${ucell.y}`"
          :x="toSVG(ucell.x, ucell.y).x - cell / 2"
          :y="toSVG(ucell.x, ucell.y).y - cell / 2"
          :width="cell"
          :height="cell"
          :fill="underlayColorMap(ucell.value).fill"
          :opacity="underlayColorMap(ucell.value).opacity"
        />
      </g>

      <!-- 3c. Stones -->
      <g v-for="stone in stoneList" :key="stone.key" v-memo="[stone.color, stone.x, stone.y]">
        <circle
          :cx="stone.x"
          :cy="stone.y"
          :r="stoneR"
          :fill="stone.color === 'B' ? `url(#grad-b-${uid})` : `url(#grad-w-${uid})`"
          :stroke="stone.color === 'B' ? '#000' : '#aaa'"
          stroke-width="0.5"
        />
      </g>

      <!-- 3d. Last Move Marker (skipped on pass; suppressed when
           move-number annotations are showing — the highest
           number IS the last move, so the inner ring is
           redundant and only adds visual noise overlapping the
           numeric label). -->
      <g v-if="lastMove && lastMove.type === 'place' && !moveNumbers">
        <circle
          :cx="toSVG(lastMove.x, lastMove.y).x"
          :cy="toSVG(lastMove.x, lastMove.y).y"
          :r="stoneR * MARKER_INNER_RATIO"
          fill="none"
          :stroke="stones[`${lastMove.x},${lastMove.y}`] === 'B' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)'"
          stroke-width="2"
        />
      </g>

      <!-- 3e. Move-number annotations (rendered above stones AND
           the last-move marker so the number is always legible).
           Font size shrinks with digit count so 3-digit numbers
           still fit inside the stone — 1-2 digits use a more
           comfortable base size, 3+ digits compress.
           magic-literal: 0.7 / 0.6 / 0.5 ratios are an inline
           sketch of the same kind of by-eye typography
           calibration the deferred-items.md
           "PV-overlay-typography-proportions" entry catalogues;
           if that audit graduates to a substrate, fold these in. -->
      <g v-if="moveNumbers">
        <template v-for="stone in stoneList" :key="`mn-${stone.key}`">
          <text
            v-if="moveNumbers[stone.key] !== undefined"
            v-memo="[moveNumbers[stone.key], stone.x, stone.y, stone.color]"
            :x="stone.x"
            :y="stone.y + 1"
            :font-size="stoneR * (moveNumbers[stone.key] >= 100 ? 0.5 : moveNumbers[stone.key] >= 10 ? 0.6 : 0.7)"
            :fill="stone.color === 'B' ? '#e8e8e8' : '#1a1a1a'"
            text-anchor="middle"
            dominant-baseline="middle"
            font-family="monospace"
            font-weight="bold"
            pointer-events="none"
          >{{ moveNumbers[stone.key] }}</text>
        </template>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.board-svg {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
  cursor: crosshair;
}
</style>
