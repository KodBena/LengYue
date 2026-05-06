<!--
  src/components/BoardVariationsOverlay.vue

  Renders the next move on the active path and sibling variations
  from the current node directly on the board, in one of two
  postures controlled by `session.ui.boardVariations`:

    'circles' — common GUI posture (Lizzie / Sabaki / KaTrain
                idiom). Active next move = gray semi-transparent
                disc; each sibling variation = filled disc cycling
                through a small palette of distinct colours.
    'letters' — active next move = gray semi-transparent disc;
                each sibling variation = colored disc with letter
                label A, B, C... (A is the first non-active sibling
                in declaration order).

  When the parent `BoardWidget` reads `boardVariations === 'off'`,
  the overlay is not mounted at all — this component never has to
  render an empty state.

  Stateless. Reads `state.nodes[currentNodeId]`'s `children` and
  `activeChildIndex`; emits no events. Pointer-events: none on the
  outer SVG so clicks pass through to BoardDisplay (which means
  clicking on a variation marker plays the move at that
  intersection — which is the correct affordance, since the
  position would extend the existing branch via `applyGoMove`).

  Domain band (ADR-0003): Go-bound. Uses `Move` (with B/W color),
  the SVG geometry shared with BoardDisplay, and stone-radius
  styling. A chess port would replace this overlay entirely with
  its own variant-display surface.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import {
  BOARD_PX,
  LABEL_BAND,
  TOTAL_PX,
  STONE_RADIUS_RATIO,
} from '../engine/constants';
import { themeColor, type ChromeAnchor } from '../utils/theme-color';
import type { BoardState, GameNode } from '../types';

const props = defineProps<{
  state: BoardState;
  size: number;
  mode: 'circles' | 'letters';
}>();

// ── Geometry (mirrors BoardDisplay) ───────────────────────────────────────────
const pad    = computed(() => BOARD_PX / (props.size + 1));
const cell   = computed(() => (BOARD_PX - 2 * pad.value) / (props.size - 1));
const stoneR = computed(() => cell.value * STONE_RADIUS_RATIO);

function toSvg(x: number, y: number): { x: number; y: number } {
  return {
    x: pad.value + x * cell.value,
    y: pad.value + (props.size - 1 - y) * cell.value,
  };
}

// Variation tint cycle. Four distinct hues — the most common case
// is 1–3 variations, so cycling rarely matters; when a position has
// >4 variations the user will see repeats but the lettering (in
// 'letters' mode) disambiguates and the visual goal is "this is a
// variation point" rather than per-variation identity. Reads at
// render time so theme changes propagate without a remount, same
// shape as BoardWidget's color helpers.
const VARIATION_TINT_ANCHORS: readonly ChromeAnchor[] = [
  '--accent-secondary',
  '--state-error',
  '--state-success',
  '--accent-primary',
];

interface Marker {
  readonly x: number;
  readonly y: number;
  readonly tint: string;
  readonly opacity: number;
  readonly radius: number;
  readonly label: string | null;
  readonly key: string;
}

const markers = computed<Marker[]>(() => {
  const node: GameNode | undefined = props.state.nodes[props.state.currentNodeId];
  if (!node || node.children.length === 0) return [];

  const r = stoneR.value;
  const out: Marker[] = [];
  let variationIdx = 0;

  for (let i = 0; i < node.children.length; i++) {
    const child = props.state.nodes[node.children[i]];
    // Defensive: a child reference without a node, or a child whose
    // move is null (root only) / a pass, has no board position.
    if (!child || !child.move || child.move.type !== 'place') continue;

    const isActive = i === node.activeChildIndex;
    const x = child.move.x;
    const y = child.move.y;

    if (isActive) {
      // Active next move on the active path — gray ghost. Half-
      // opacity at full stone radius reads as "hint" without
      // competing with the actual stones. magic-literal: 0.45
      // chosen by inspection — at lower values the marker
      // disappears against the wood texture, at higher it reads
      // as a real stone.
      out.push({
        x, y,
        tint:    themeColor('--text-2'),
        opacity: 0.45,
        radius:  r,
        label:   null,
        key:     `active-${x}-${y}`,
      });
    } else {
      const tintAnchor = VARIATION_TINT_ANCHORS[variationIdx % VARIATION_TINT_ANCHORS.length];
      const letter = String.fromCharCode(0x41 /* 'A' */ + variationIdx);
      // 'letters' mode uses a smaller backdrop disc so the letter
      // sits clear of the surrounding stones / grid; 'circles'
      // mode uses a near-full-radius disc for a filled-glyph read.
      // magic-literals: 0.55 and 0.95 chosen so 'letters' reads as
      // "small badge with text" and 'circles' reads as "filled
      // marker"; identical opacities so the two modes feel
      // tonally consistent.
      const radius = props.mode === 'letters' ? r * 0.55 : r * 0.95;
      out.push({
        x, y,
        tint:    themeColor(tintAnchor),
        opacity: 0.65,
        radius,
        label:   props.mode === 'letters' ? letter : null,
        key:     `variation-${x}-${y}`,
      });
      variationIdx++;
    }
  }

  return out;
});
</script>

<template>
  <svg
    :viewBox="`0 0 ${TOTAL_PX} ${TOTAL_PX}`"
    class="variations-overlay"
    aria-hidden="true"
  >
    <!-- Translate into the inner playing area so the toSvg / stoneR
         formulas above stay BoardDisplay-aligned without carrying
         the LABEL_BAND offset. -->
    <g :transform="`translate(${LABEL_BAND}, ${LABEL_BAND})`">
      <g v-for="m in markers" :key="m.key">
        <circle
          :cx="toSvg(m.x, m.y).x"
          :cy="toSvg(m.x, m.y).y"
          :r="m.radius"
          :fill="m.tint"
          :opacity="m.opacity"
        />
        <text
          v-if="m.label !== null"
          :x="toSvg(m.x, m.y).x"
          :y="toSvg(m.x, m.y).y + 1"
          :font-size="m.radius * 1.3"
          dominant-baseline="middle"
          text-anchor="middle"
          font-family="monospace"
          font-weight="bold"
          fill="#fff"
        >{{ m.label }}</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.variations-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* Click-through to BoardDisplay: clicking a variation marker
     plays the move at that intersection (the position would
     extend the existing branch via applyGoMove, which is the
     intended affordance). */
  pointer-events: none;
  overflow: visible;
}
</style>
