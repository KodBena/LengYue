<!--
  src/components/board/BoardDisplay.vue
  Stateless SVG Go board with gradients and textures.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  BOARD_COLOR, LINE_COLOR, LABEL_COLOR,
  LABEL_BAND, LABEL_FONT_SIZE, LABEL_INSET_RATIO, TOTAL_PX,
  MARKER_INNER_RATIO, TRIANGLE_MARK_RATIO,
  ALL_X_LABELS,
} from '../../engine/constants';
import { boardGeometry, gridLines } from '../../engine/board-geometry';
import { computeGhostStone } from '../../composables/board/ghost-stone';
import type { StoneColor, Move } from '../../types';
import type { HeatmapCell, HeatmapStyle } from './BoardHeatmapOverlay.vue';

const props = withDefaults(defineProps<{
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
  // Setup-toolkit triangle marks (SGF `TR`) for the current node.
  // Deliberately the only markup shape rendered today (ledger rows
  // 603/604's skeleton scope) — a square/circle/label renderer is the
  // seam this prop's sibling would extend, not built here. Handful-
  // sized per node (SVG, not canvas — ADR-0010's density threshold
  // doesn't apply to a mark count that scales with board size, not
  // with streamed data). Optional; BoardWidget omits it when there
  // are none, matching `moveNumbers`' v-if-friendly convention.
  triangles?: readonly { x: number; y: number }[];
  // Ghost-stone hover preview (wiki2-ghost-stone). `session.ui.showGhostStone`
  // and the board's current `turn` are threaded down as plain values — the
  // render/visibility decision itself lives in the imported pure
  // `computeGhostStone`, called below against this component's own
  // pointer-tracked hover position. Both default falsy so any other future
  // caller of BoardDisplay that doesn't pass them gets the feature fully
  // off, matching how `lastMove` and the other optional overlay props
  // behave when omitted.
  ghostStoneEnabled?: boolean;
  turn?: StoneColor;
}>(), {
  // Omission means "off" (per local/gate-prop-needs-default: Vue casts an
  // omitted boolean prop to `false` already, but the lint requires this
  // stated explicitly rather than relying on that cast silently).
  ghostStoneEnabled: false,
});

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

// Inner-board geometry from the shared SSOT (src/engine/board-geometry.ts).
// `pad` is the inset within the playable area from the area edge to the
// first grid line (one cell wide, by Go-board convention). LABEL_BAND sits
// *outside* this — the playing-area group is translated by (LABEL_BAND,
// LABEL_BAND) inside the SVG, so these inner-board-relative coords don't
// carry the offset themselves.
const geo     = computed(() => boardGeometry(boardSize.value));
const pad     = computed(() => geo.value.pad);
const cell    = computed(() => geo.value.cell);
const stoneR  = computed(() => geo.value.stoneR);
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

// Grid line set from the shared SSOT (gridLines), memoised on size.
const lines = computed(() => gridLines(boardSize.value));

const stoneList = computed(() => {
  return Object.entries(props.stones).map(([key, color]) => {
    const [bx, by] = key.split(',').map(Number);
    const { x, y } = toSVG(bx, by);
    return { key, x, y, color };
  });
});
function toSVG(bx: number, by: number): { x: number; y: number } {
  // Board y=0 is at the bottom; SVG y increases downward, so we flip
  // (handled by the shared geometry). The playing-area group is translated
  // by (LABEL_BAND, LABEL_BAND) in the template, so these are inner-board
  // coordinates.
  return geo.value.toSVG(bx, by);
}

// Triangle-mark polygon points, computed per stone-radius so the mark
// scales with board size like every other geometry primitive here.
// An upward-pointing equilateral-ish triangle centered on the vertex —
// the Lizzie/Sabaki/KaTrain convention `TRIANGLE_MARK_RATIO`'s doc
// comment names.
function trianglePoints(cx: number, cy: number): string {
  const r = stoneR.value * TRIANGLE_MARK_RATIO;
  const top: [number, number] = [cx, cy - r];
  const bottomLeft: [number, number] = [cx - r * 0.87, cy + r * 0.5];
  const bottomRight: [number, number] = [cx + r * 0.87, cy + r * 0.5];
  return [top, bottomLeft, bottomRight].map(([x, y]) => `${x},${y}`).join(' ');
}

/**
 * Shared pointer → board-coordinate resolution for click placement and
 * the ghost-stone hover preview (both need the same "nearest
 * intersection, or off-grid" math). Returns board coordinates (y=0 at
 * the bottom, matching `applyGoMove`), or `null` when the pointer is
 * outside the grid (over the label band / margins).
 */
function resolveBoardPoint(e: MouseEvent, svg: SVGSVGElement): { x: number; y: number } | null {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const cursor = pt.matrixTransform(svg.getScreenCTM()?.inverse());

  // Cursor is in viewBox coords (0..TOTAL_PX); subtract LABEL_BAND to land
  // in inner-board coords before resolving column/row.
  const col = Math.round((cursor.x - LABEL_BAND - pad.value) / cell.value);
  const row = Math.round((cursor.y - LABEL_BAND - pad.value) / cell.value);
  const s = boardSize.value;

  if (col < 0 || col >= s || row < 0 || row >= s) return null;
  return { x: col, y: s - 1 - row };
}

function onBoardClick(e: MouseEvent) {
  const svg = e.currentTarget as SVGSVGElement; // DOM: the handler is bound on the board's <svg>, so currentTarget is that element
  const p = resolveBoardPoint(e, svg);
  if (!p) return;
  if (e.shiftKey) {
    emit('shift-click', p.x, p.y);
  } else {
    emit('click', p.x, p.y);
  }
}

// ── Ghost-stone hover preview (wiki2-ghost-stone) ──────────────────────────
// `hoverPoint` only needs to be CORRECT while visible; visibility itself is
// gated in CSS below (`.board-svg:hover .ghost-stone`), not by this ref, so a
// modal opening on top of the board hides the ghost the instant it paints
// over the board — every modal backdrop under `components/modals/*.vue` is a
// `position: fixed` full-viewport element with normal (non-`none`)
// pointer-events (verified against the current tree: `grep -rn
// 'pointer-events' src/components/modals/*.vue` finds no override), so the
// browser's own hover hit-testing stops matching `:hover` against a covered
// element regardless of whether any pointer event fires. Without this, a
// modal opened via a keybinding (no mouse movement) while hovering the board
// would leave a stale ghost bleeding through the backdrop. This is the one
// mode-gate this feature needs; it's mechanical (native CSS hover
// semantics), not a bespoke "is a modal open" flag threaded through the
// store — no such global signal exists in this codebase to compose with,
// and inventing one for this alone would be a bigger footprint than the CSS
// rule.
const hoverPoint = ref<{ x: number; y: number } | null>(null);

function onBoardPointerMove(e: PointerEvent) {
  // Toggle-off short-circuit (ghost-stone review, expansion finding 4):
  // with the preview disabled the per-move SVG matrix inversion in
  // resolveBoardPoint is pure waste — skip it so disabling the toggle
  // costs zero tracking work, not just zero rendering work. hoverPoint
  // is left null while disabled, so re-enabling starts clean.
  if (!(props.ghostStoneEnabled ?? false)) {
    if (hoverPoint.value !== null) hoverPoint.value = null;
    return;
  }
  const svg = e.currentTarget as SVGSVGElement; // DOM: bound on the board's <svg>, so currentTarget is that element (same cast as onBoardClick above)
  hoverPoint.value = resolveBoardPoint(e, svg);
}

function onBoardPointerLeave() {
  hoverPoint.value = null;
}

// Occupancy view for the occupancy amendment (row 1635): a closure over
// `props.stones` — the same source `stoneList` above renders real stones
// from — answering only "is there a stone at this point?" for whatever
// point `computeGhostStone` asks about. It cannot answer a legality
// question (no capture/suicide/ko logic reads through it), so passing it
// preserves the module's no-legality-affordance guarantee while letting
// `computeGhostStone` hide the preview over an existing stone.
function isOccupied(point: { x: number; y: number }): boolean {
  return props.stones[`${point.x},${point.y}`] !== undefined;
}

const ghostStone = computed(() =>
  computeGhostStone(props.ghostStoneEnabled ?? false, props.turn ?? 'B', hoverPoint.value, isOccupied),
);
</script>

<template>
  <svg
    :viewBox="`0 0 ${TOTAL_PX} ${TOTAL_PX}`"
    class="board-svg"
    @click="onBoardClick"
    @pointermove="onBoardPointerMove"
    @pointerleave="onBoardPointerLeave"
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

      <!-- 3d-bis. Ghost-stone hover preview (wiki2-ghost-stone, optional
           via session.ui.showGhostStone, registry-only). Deliberately
           the simplest possible preview per the commission: a flat
           translucent disc in the side-to-move's color at the hovered
           intersection — no gradient/stroke (contrast with the real
           stones' polish in 3c), no legality gating (renders over a
           genuinely illegal EMPTY point exactly like a legal empty
           one — `computeGhostStone` takes no BoardState to gate legality
           on), and no capture preview (nothing else on the board
           changes). Occupancy amendment (row 1635): it does NOT render
           over an already-occupied point — `isOccupied` above is a
           visibility-only view (no legality reasoning reads through
           it), not a relaxation of the no-legality-gating guarantee.
           `pointer-events="none"` so it never becomes the click target —
           placement is resolved by the outer `<svg>`'s own `@click`,
           whose hit target doesn't matter since `onBoardClick` reads
           `e.clientX`/`clientY` via `getScreenCTM()`, not the DOM event
           target. Visibility is CSS-gated (`.ghost-stone` below); see
           `hoverPoint`'s declaration in the script for why that's not a
           plain `v-if` on a JS "is hovering" flag. -->
      <circle
        v-if="ghostStone"
        class="ghost-stone"
        :cx="toSVG(ghostStone.x, ghostStone.y).x"
        :cy="toSVG(ghostStone.x, ghostStone.y).y"
        :r="stoneR"
        :fill="ghostStone.color === 'B' ? '#000' : '#fff'"
        pointer-events="none"
      />

      <!-- 3e. Move-number annotations (rendered above stones AND
           the last-move marker so the number is always legible).
           Font size shrinks with digit count so 3-digit numbers
           still fit inside the stone — 1-2 digits use a more
           comfortable base size, 3+ digits compress.
           magic-literal: 0.7 / 0.6 / 0.5 ratios are an inline
           sketch of the same kind of by-eye typography
           calibration the pv-overlay-typography-calibration
           work-status item catalogues;
           if that calibration graduates to a substrate, fold these in. -->
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

      <!-- 3f. Setup-toolkit triangle marks (SGF `TR`, current node
           only). Stroke-only outline so it reads over both an empty
           point and an occupied one; pointer-events disabled so the
           mark never steals the board's own click handling. -->
      <g v-if="triangles && triangles.length > 0">
        <polygon
          v-for="tri in triangles"
          :key="`tri-${tri.x},${tri.y}`"
          :points="trianglePoints(toSVG(tri.x, tri.y).x, toSVG(tri.x, tri.y).y)"
          fill="none"
          :stroke="stones[`${tri.x},${tri.y}`] === 'B' ? '#fff' : 'var(--state-attention)'"
          stroke-width="1.5"
          stroke-linejoin="round"
          pointer-events="none"
        />
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
  /* wiki2-ghost-stone, commission verbatim: "The pointer over the board
     should be a normal pointer, except that there should be a 'ghost
     stone' ... that shows the color and placement if the stone were to
     be put at that intersection." The ghost stone (below) is now the
     placement affordance; a crosshair cursor duplicated that signal and
     is dropped in favor of the plain system arrow. Applies regardless
     of whether the toggle is on — `showGhostStone: false` removes the
     preview, not the cursor; the commission ties the normal-pointer
     requirement to the feature's presence on the board, not to the
     per-user toggle state, and reverting to a crosshair only while the
     preview is off would make the cursor flicker between styles as the
     user flips a Settings-pane checkbox mid-session. */
  cursor: default;
}

/* Ghost-stone visibility gate (wiki2-ghost-stone). Default hidden;
   raised only while the pointer is genuinely over `.board-svg` per the
   browser's own hover hit-testing — see `hoverPoint`'s declaration in
   the script for why this (not a JS boolean) is the defensive layer
   against a modal's backdrop covering the board without a pointerleave
   ever firing. No `transition` (standing design law bans it here); the
   preview snaps with the hover boundary instead of fading. A flat-fill
   translucent disc, not a diffuse overlay — the standing ban is on
   box-shadow/blur/backdrop-style washes, not a sprite's own alpha.
   magic-literal: 0.4 opacity — translucent enough to read as "preview,
   not placed" against the wood texture, opaque enough to identify the
   color at a glance; not a substrate anchor candidate since the
   relationship is local to this one preview glyph. */
.ghost-stone { opacity: 0; }
.board-svg:hover .ghost-stone { opacity: 0.4; }
</style>
