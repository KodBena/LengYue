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

// Marker radius matches MoveSuggestions's cluster-ring (1.01 ×
// stoneR) so the two ring families sit at the same diameter — the
// dashed stroke and z-index distinguish variations from
// transpositions, not size. magic-literal: 1.01 — cluster-ring
// radius from MoveSuggestions, mirrored verbatim. Future tuning
// would update both call sites.
const MARKER_RADIUS_RATIO = 1.01;
// Stroke width matches the cluster-ring's 2.5; the dash pattern is
// what tells variation rings apart from transposition rings.
// magic-literal: 2.5 — same value MoveSuggestions's cluster-ring
// uses; mirrored so the visual weight is identical.
const MARKER_STROKE_WIDTH = 2.5;
// Dashed stroke pattern. magic-literal: "4 3" — 4-unit dashes with
// 3-unit gaps. At the marker radius (≈ 13.9 SVG units on a 19×19
// board, circumference ≈ 87 units), this produces ~12 dashes around
// the ring — clearly dashed without fragmenting into a near-solid
// rendering. The visual contract: solid stroke = transposition
// (engine analysis), dashed stroke = variation (game-tree state).
const MARKER_DASHARRAY = '4 3';

function toSvg(x: number, y: number): { x: number; y: number } {
  return {
    x: pad.value + x * cell.value,
    y: pad.value + (props.size - 1 - y) * cell.value,
  };
}

// All variation rings share a single tint — the visual goal at this
// stage is "these are variations" as a class, not per-variation
// identity. Letters (in 'letters' mode) provide the per-variation
// disambiguation. Reads at render time so theme changes propagate
// without a remount, same shape as BoardWidget's color helpers.
const VARIATION_TINT_ANCHOR: ChromeAnchor = '--accent-secondary';
// Active-next-move ring is a lighter gray than the muted-text tone
// — kept distinct from the variation tint and from MoveSuggestions's
// cluster colours. `--text-1` reads as "secondary chrome text" —
// brighter than `--text-2` (the prior choice) but still
// recognisably gray. The user's framing was "lighter gray" against
// the variation tint; --text-1 is the substrate's nearest match.
const ACTIVE_TINT_ANCHOR: ChromeAnchor = '--text-1';

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
      // Active next move on the active path — light gray ring. No
      // label, even in 'letters' mode (A is reserved for the first
      // non-active sibling per the spec).
      // magic-literal: 0.7 opacity — visible against the wood
      // texture without competing with stones.
      out.push({
        x, y,
        stroke:  themeColor(ACTIVE_TINT_ANCHOR),
        opacity: 0.7,
        label:   null,
        key:     `active-${x}-${y}`,
      });
    } else {
      if (props.variationsMode === 'off') continue;
      const letter = String.fromCharCode(0x41 /* 'A' */ + variationIdx);
      // magic-literal: 0.85 opacity — slightly louder than the
      // active marker (0.7) since the colored tint carries the
      // "variation" identity and needs to read clearly through any
      // co-located MoveSuggestion disc / cluster-ring.
      out.push({
        x, y,
        stroke:  themeColor(VARIATION_TINT_ANCHOR),
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
          :stroke-dasharray="MARKER_DASHARRAY"
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
  /* Render above MoveSuggestions's transposition cluster-rings
     so a co-located variation marker reads cleanly on top of the
     transposition. DOM order in BoardWidget already mounts this
     overlay last (so the default paint order would do the right
     thing), but the explicit z-index documents the intent —
     reordering BoardWidget's stack later won't silently swap the
     two layers. magic-literal: z-index 1 — small bump above the
     default 0 of the other overlays; not a substrate anchor
     candidate since the relationship is local to this overlay
     pair. */
  z-index: 1;
}
</style>
