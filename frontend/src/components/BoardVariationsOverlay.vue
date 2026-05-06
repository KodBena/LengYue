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
// Stroke width is thinner than MoveSuggestions's cluster-ring
// (2.5), so the variation ring reads as secondary information when
// both render at the same intersection. The dash pattern is what
// tells the two ring families apart, but a lighter weight also
// helps. magic-literal: 1.5 — empirically tuned against the user's
// "too thick" feedback at 2.5.
const MARKER_STROKE_WIDTH = 1.5;
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

// Variation rings share a single gray tint — the visual goal at
// this stage is "these are variations" as a class. Letters (in
// 'letters' mode) provide per-variation disambiguation but use a
// different drawing path entirely (see below): the ring is dropped
// and a black letter label appears at the intersection.
const VARIATION_TINT_ANCHOR: ChromeAnchor = '--text-2';
// Active-next-move ring is a *lighter* gray than the variation
// rings — `--text-1` reads as "primary chrome text," brighter than
// `--text-2`, so the active marker stays visually distinct from a
// non-active variation when both render at the same time.
const ACTIVE_TINT_ANCHOR: ChromeAnchor = '--text-1';
// Letters-mode label colour. Black on wood reads as a high-contrast
// SGF-style annotation, separate from the gray ring vocabulary.
// magic-literal: hex literal #000 chosen by the user's spec
// ("black letter labels"); not a substrate anchor candidate since
// the relationship is "this is the SGF letter convention" rather
// than a chrome decision.
const LETTER_LABEL_COLOR = '#000';
// Letter font size. magic-literal: 1.2 × stoneR — slightly larger
// than the in-ring letter sizing of the prior iteration since the
// letter sits alone on the wood texture without a ring backing.
const LETTER_FONT_SIZE_RATIO = 1.2;

// A marker can carry a ring, a letter, or both — the four
// (mode × active/variation) combinations differ on which fields
// are populated:
//   active in either mode      → ring only.
//   variation in 'circles'     → ring only.
//   variation in 'letters'     → letter only.
//   variation in 'off'         → no marker emitted.
// The template branches on `ring !== null` and `label !== null`
// independently; both being null means the iteration was filtered
// out earlier.
interface Marker {
  readonly x: number;
  readonly y: number;
  readonly key: string;
  readonly ring: { readonly stroke: string; readonly opacity: number } | null;
  readonly label: { readonly text: string; readonly color: string; readonly opacity: number } | null;
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
      // Active next move on the active path — light-gray dashed
      // ring. No label, even in 'letters' mode (A is reserved for
      // the first non-active sibling per the spec).
      // magic-literal: 0.7 opacity — visible against the wood
      // texture without competing with stones.
      out.push({
        x, y,
        key: `active-${x}-${y}`,
        ring: {
          stroke:  themeColor(ACTIVE_TINT_ANCHOR),
          opacity: 0.7,
        },
        label: null,
      });
    } else {
      if (props.variationsMode === 'off') continue;
      const letter = String.fromCharCode(0x41 /* 'A' */ + variationIdx);
      if (props.variationsMode === 'circles') {
        // 'circles' mode: gray dashed ring, no letter.
        // magic-literal: 0.7 opacity — same as the active marker
        // since both are gray rings; the lighter / darker tint
        // distinguishes them, not opacity.
        out.push({
          x, y,
          key: `variation-${x}-${y}`,
          ring: {
            stroke:  themeColor(VARIATION_TINT_ANCHOR),
            opacity: 0.7,
          },
          label: null,
        });
      } else {
        // 'letters' mode: black letter label only, no ring. Reads
        // as the SGF-style A/B/C convention — high contrast on the
        // wood texture without competing with the active ring or
        // any MoveSuggestion at the same intersection.
        // magic-literal: 0.9 opacity — slightly louder than the
        // gray rings since the letter is the sole carrier of the
        // variation identity in this mode.
        out.push({
          x, y,
          key: `variation-${x}-${y}`,
          ring: null,
          label: {
            text:    letter,
            color:   LETTER_LABEL_COLOR,
            opacity: 0.9,
          },
        });
      }
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
          v-if="m.ring !== null"
          :cx="toSvg(m.x, m.y).x"
          :cy="toSvg(m.x, m.y).y"
          :r="stoneR * MARKER_RADIUS_RATIO"
          fill="none"
          :stroke="m.ring.stroke"
          :stroke-width="MARKER_STROKE_WIDTH"
          :stroke-dasharray="MARKER_DASHARRAY"
          :opacity="m.ring.opacity"
        />
        <text
          v-if="m.label !== null"
          :x="toSvg(m.x, m.y).x"
          :y="toSvg(m.x, m.y).y + 1"
          :font-size="stoneR * LETTER_FONT_SIZE_RATIO"
          dominant-baseline="middle"
          text-anchor="middle"
          font-family="monospace"
          font-weight="bold"
          :fill="m.label.color"
          :opacity="m.label.opacity"
        >{{ m.label.text }}</text>
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
