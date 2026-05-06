<!--
  src/components/BoardVariationsOverlay.vue

  Renders sibling variations from the current node (and, optionally,
  a hint marker for the next move on the active path) directly on
  the board as stroke-only colored rings — distinct from
  `MoveSuggestions`'s filled discs so the two overlays compose
  cleanly when both are enabled at the same intersection.

  Two settings drive the overlay, independently:

  - `boardVariations: 'off' | 'circles' | 'letters'`
      'circles' — each non-active sibling renders as a colored
                  ring, cycling through a small palette of distinct
                  hues.
      'letters' — same colored ring, plus a centered letter label
                  A, B, C... in the matching tint. A is the first
                  non-active sibling in declaration order; the
                  active child never gets a letter.
      'off'     — no variation markers.

  - `showActiveNextMove: boolean`
      true  — the active child renders as a gray ring (no letter,
              even in 'letters' mode).
      false — no active marker.

  All four combinations are valid; the component renders the
  intersection of both flags. The host `BoardWidget` mounts the
  overlay only when at least one is on, so the off/off pair has
  zero runtime cost.

  Stateless. Reads `state.nodes[currentNodeId]`'s `children` and
  `activeChildIndex`; emits no events. Pointer-events: none on the
  outer SVG so clicks pass through to BoardDisplay (clicking a
  variation marker plays the move at that intersection — extending
  the existing branch via `applyGoMove`, which is the intended
  affordance).

  Domain band (ADR-0003): Go-bound. Uses `Move`'s B/W color, the
  SVG geometry shared with BoardDisplay, and stone-radius styling.
  A chess port would replace this overlay entirely.

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
  variationsMode: 'off' | 'circles' | 'letters';
  showActiveNextMove: boolean;
}>();

// ── Geometry (mirrors BoardDisplay) ───────────────────────────────────────────
const pad    = computed(() => BOARD_PX / (props.size + 1));
const cell   = computed(() => (BOARD_PX - 2 * pad.value) / (props.size - 1));
const stoneR = computed(() => cell.value * STONE_RADIUS_RATIO);

// magic-literal: 0.85 marker-radius ratio against the stone radius.
// Chosen so the variation ring sits clearly inside MoveSuggestions's
// cluster-ring at 1.01 × stoneR (stroke 2.5) and the filled
// suggestion-disc at 1.0 × stoneR — the smaller ring + thinner
// stroke read as "secondary information" without competing with the
// engine's primary signal at the same intersection.
const MARKER_RADIUS_RATIO = 0.85;
// magic-literal: 2 stroke width — same vocabulary as
// BoardDisplay's last-move marker (stroke-width="2"). Visible but
// lighter than MoveSuggestions's cluster-ring (stroke-width="2.5"),
// keeping the variation overlay subordinate when both show.
const MARKER_STROKE_WIDTH = 2;

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
  readonly stroke: string;
  readonly opacity: number;
  readonly label: string | null;
  readonly key: string;
}

const markers = computed<Marker[]>(() => {
  const node: GameNode | undefined = props.state.nodes[props.state.currentNodeId];
  if (!node || node.children.length === 0) return [];

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
      if (!props.showActiveNextMove) continue;
      // Active next move on the active path — gray ring. No label,
      // even in 'letters' mode (A is reserved for the first
      // non-active sibling per the spec).
      // magic-literal: 0.7 opacity — visible against the wood
      // texture without competing with stones.
      out.push({
        x, y,
        stroke:  themeColor('--text-2'),
        opacity: 0.7,
        label:   null,
        key:     `active-${x}-${y}`,
      });
    } else {
      if (props.variationsMode === 'off') continue;
      const tintAnchor = VARIATION_TINT_ANCHORS[variationIdx % VARIATION_TINT_ANCHORS.length];
      const letter = String.fromCharCode(0x41 /* 'A' */ + variationIdx);
      // magic-literal: 0.85 opacity — slightly louder than the
      // active marker (0.7) since the colored tints carry the
      // variation's identity and need to read clearly through any
      // co-located MoveSuggestion disc.
      out.push({
        x, y,
        stroke:  themeColor(tintAnchor),
        opacity: 0.85,
        label:   props.variationsMode === 'letters' ? letter : null,
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
          :r="stoneR * MARKER_RADIUS_RATIO"
          fill="none"
          :stroke="m.stroke"
          :stroke-width="MARKER_STROKE_WIDTH"
          :opacity="m.opacity"
        />
        <text
          v-if="m.label !== null"
          :x="toSvg(m.x, m.y).x"
          :y="toSvg(m.x, m.y).y + 1"
          :font-size="stoneR * 1.0"
          dominant-baseline="middle"
          text-anchor="middle"
          font-family="monospace"
          font-weight="bold"
          :fill="m.stroke"
          :opacity="m.opacity"
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
