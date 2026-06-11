<!--
  src/components/board/MiniBoardCanvas.vue
  Reactive thumbnail Go board — CANVAS projection of a BoardSnapshot. Visual
  parity with the SVG projection (MiniBoardSvg.vue: wood ground, grid, gradient
  stones, optional last-move ring, optional A/B/C variation labels) and the
  string projection (renderBoardToSvg): no coordinate labels or hoshi (those are
  BoardDisplay's main-board chrome).

  One of two interchangeable renderers behind MiniBoard.vue (the dispatcher);
  MiniBoardSvg.vue is the SVG sibling and the default. This canvas variant is
  opt-in via the RegistryEditor (`appearance.miniBoardRenderer`).

  ADR-0010 (canvas rule): a fixed-size, NON-interactive visual whose element
  count scales with the data (one node per stone / line / label) is a <canvas>
  job, not a v-for of SVG nodes. The SVG version carried ~150 DOM nodes per
  thumbnail (×N visible panels) to mount and paint, and — though per-stone
  v-memo kept the *patch* to the one or two changed stones — its render function
  still re-ran in full on every navigation (recomputing stoneList, the v-for,
  and the per-stone v-memo checks). render ≫ patch is the ADR-0010 tell. This
  draws imperatively off a watch: no DOM per element, and no render function on
  the navigation hot path. The interactive main board (BoardDisplay) stays SVG —
  it needs per-intersection hit-testing, the condition that keeps a visual in
  the DOM. Used by ChartPreviewBox and the multiresolution heatmap preview.

  Shared render resources (wood texture, stone sprites) live in the owner
  module `composables/cards/thumbnail-render-resources.ts` — NOT here. They
  once sat in a plain <script> block of this file (and before that,
  per-instance in <script setup>: the texture-flash class the
  2026-06-09 investigation records); a real .ts module makes the sharing
  structural — no SFC scope footgun is expressible there, and every consumer
  lifecycle (persistent or remount-per-hover) reads the same state.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { BOARD_PX, BOARD_COLOR, LINE_COLOR, MARKER_INNER_RATIO } from '../../engine/constants';
import { boardGeometry, gridLines, type BoardSnapshot } from '../../engine/board-geometry';
import {
  addWoodWaiter,
  ensureWood,
  getWoodIfReady,
  removeWoodWaiter,
  stoneSprite,
} from '../../composables/cards/thumbnail-render-resources';

const props = withDefaults(
  defineProps<{
    snapshot: BoardSnapshot;
    // Draw the last-move ring. A render option, not snapshot data — the delta
    // panel wants it, the others don't (mirrors the SVG projection's flag).
    showMarker?: boolean;
  }>(),
  { showMarker: false },
);

// magic-literal: grid stroke mirrors the SVG projection (0.8 px in BOARD_PX
// units, opacity 0.3) so the two renderers stay visually identical.
const GRID_WIDTH = 0.8;
const GRID_ALPHA = 0.3;

const canvasEl = ref<HTMLCanvasElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
// Cached CSS dimensions, written ONLY from the ResizeObserver's contentRect (a
// layout-clean callback). draw() never reads clientWidth/Height — doing so on
// the per-nav redraw path forces a synchronous reflow (ADR-0010 imperative-
// escape step 3; a first cut of this component did exactly that and doubled the
// forced-style-and-layout count in the trace).
let cssW = 0, cssH = 0;

function draw(): void {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (cssW === 0 || cssH === 0) return; // not yet measured / collapsed — redrawn on resize
  const dpr = window.devicePixelRatio || 1;
  const backW = Math.round(cssW * dpr), backH = Math.round(cssH * dpr);
  if (canvas.width !== backW) canvas.width = backW;
  if (canvas.height !== backH) canvas.height = backH;

  const snap = props.snapshot;
  const geo = boardGeometry(snap.size);
  const side = Math.min(cssW, cssH);   // square board, fit the smaller dimension
  const sc = side / BOARD_PX;          // BOARD_PX coords → CSS px
  const offX = (cssW - side) / 2, offY = (cssH - side) / 2;

  // Map BOARD_PX coords → backing-store px (centred square, dpr-crisp).
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, backW, backH);
  ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * offX, dpr * offY);

  // Board ground + wood (cover-cropped to the square, matching the SVG slice).
  // The texture is the module-shared one — decoded once per session, so a
  // freshly-remounted thumbnail first-paints textured (no flash).
  ctx.fillStyle = BOARD_COLOR;
  ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);
  const wood = getWoodIfReady();
  if (wood) {
    const iw = wood.naturalWidth, ih = wood.naturalHeight, s = Math.min(iw, ih);
    ctx.drawImage(wood, (iw - s) / 2, (ih - s) / 2, s, s, 0, 0, BOARD_PX, BOARD_PX);
  }

  // Grid.
  ctx.save();
  ctx.globalAlpha = GRID_ALPHA;
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = GRID_WIDTH;
  ctx.beginPath();
  for (const l of gridLines(snap.size)) { ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); }
  ctx.stroke();
  ctx.restore();

  // Stones (shared sprite blit; sprite resolution = device-pixel stone radius).
  const rpx = Math.max(2, Math.round(geo.stoneR * sc * dpr));
  for (const [key, color] of Object.entries(snap.stones)) {
    const [bx, by] = key.split(',').map(Number);
    const { x, y } = geo.toSVG(bx, by);
    ctx.drawImage(stoneSprite(color, rpx), x - geo.stoneR, y - geo.stoneR, geo.stoneR * 2, geo.stoneR * 2);
  }

  // Last-move ring (white ring on a black stone, vice versa).
  const lm = snap.lastMove;
  if (props.showMarker && lm && lm.type === 'place') {
    const { x, y } = geo.toSVG(lm.x, lm.y);
    const onBlack = snap.stones[`${lm.x},${lm.y}`] === 'B';
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = onBlack ? 'white' : 'black';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, geo.stoneR * MARKER_INNER_RATIO, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Variation A/B/C labels.
  const labels = snap.markerLabels;
  if (labels) {
    ctx.fillStyle = '#000';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [key, label] of Object.entries(labels)) {
      const [bx, by] = key.split(',').map(Number);
      const { x, y } = geo.toSVG(bx, by);
      ctx.fillText(label, x, y);
    }
  }
}

onMounted(() => {
  ensureWood();
  addWoodWaiter(draw); // repaint when the shared texture decodes (released below)
  // ResizeObserver-cached dims (ADR-0010 imperative-escape): contentRect is the
  // layout-clean size, cached here and consumed by draw() — so the per-nav
  // redraw never forces a reflow. The observer fires once on observe (initial
  // size), which is what performs the first paint.
  resizeObserver = new ResizeObserver((entries) => {
    const r = entries[0]?.contentRect;
    if (r) { cssW = r.width; cssH = r.height; }
    draw();
  });
  if (canvasEl.value) resizeObserver.observe(canvasEl.value);
});

// Redraw imperatively on snapshot / marker change — no Vue render on the nav
// hot path. Snapshots are immutable value objects, so a reference change is the
// signal (shallow watch).
watch([() => props.snapshot, () => props.showMarker], () => draw());

onUnmounted(() => {
  // Resource ownership at mutation sites: release the ResizeObserver and the
  // shared-wood waiter — both live outside Vue's reactivity graph and nothing
  // else frees them.
  resizeObserver?.disconnect();
  resizeObserver = null;
  removeWoodWaiter(draw);
});
</script>

<template>
  <canvas ref="canvasEl" class="mini-board"></canvas>
</template>

<style scoped>
.mini-board {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
