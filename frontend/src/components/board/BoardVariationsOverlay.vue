<!--
  src/components/board/BoardVariationsOverlay.vue

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

  Overlap with `MoveSuggestions`. In 'letters' mode, a letter
  rendered on top of a move-suggestion disc collides with the
  disc's inline winrate/score labels — both compete for the same
  centered text region and the result reads as visual clutter.
  When `showMoveSuggestions` is on and a sibling's intersection
  hits a suggestion, the overlay falls back to the 'circles'
  marker (gray dashed ring) at that intersection only. The
  letter-advancement counter still advances so the remaining
  letters stay in declaration order — the dropped letter shows
  up as a gap in the visible sequence, which is the honest
  signal "this variation exists here but its identity is
  carried by the suggestion disc, not by a letter overlay."

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
} from '../../engine/constants';
import { themeColor, type ChromeAnchor } from '../../utils/theme-color';
import { useMoveSuggestions } from '../../composables/board/use-move-suggestions';
import { deriveVariationMarkers } from '../../composables/board/board-variations-markers';
import type { BoardState } from '../../types';

const props = defineProps<{
  state: BoardState;
  size: number;
  variationsMode: 'off' | 'circles' | 'letters';
  showActiveNextMove: boolean;
  // True iff `MoveSuggestions` is mounted on the same intersection
  // set. Drives the letters-mode → circles fallback at suggestion
  // intersections (see file header "Overlap with MoveSuggestions").
  showMoveSuggestions: boolean;
  // True while a PV (principal-variation) hover preview is active
  // (`BoardWidget`'s `pvHoverActive`, bound from `MoveSuggestions`'s
  // `pv-preview-active` emit). The dashed visited-move / next-move
  // rings describe the *real* game tree's visited state, which
  // competes with the hypothetical PV overlay the user is reading
  // during a hover preview — the same reasoning `BoardWidget`
  // already applies to suppress its move-number labels during a PV
  // hover. Consumed at the top of `markers` (below) rather than at
  // the mount site so the overlay stays mounted and re-evaluates
  // cheaply instead of unmounting/remounting on every hover
  // transition.
  suppressed: boolean;
}>();

// Intersection set of currently-rendered move-suggestion discs,
// consulted only when the letter-mode → circle fallback could fire.
// `useMoveSuggestions` runs the same packet → filter → cluster
// chain that `MoveSuggestions.vue` runs; the double-eval cost is
// modest (sub-millisecond per analysis update) and is the
// minimal-touch alternative to lifting the suggestion list into a
// shared prop. The set short-circuits to empty whenever the
// fallback can't fire, so the steady-state cost is zero outside
// the (letters-mode AND suggestions-on) case.
const { suggestions } = useMoveSuggestions(() => props.state.currentNodeId);
const suggestionPoints = computed<ReadonlySet<string>>(() => {
  if (!props.showMoveSuggestions) return new Set();
  if (props.variationsMode !== 'letters') return new Set();
  const out = new Set<string>();
  for (const s of suggestions.value) out.add(`${s.x},${s.y}`);
  return out;
});

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

// Marker derivation itself (the mode × active/variation branching,
// the letters→circles suggestion-overlap fallback, and the
// PV-hover-preview suppression gate) lives in the pure
// `deriveVariationMarkers` function so it's unit-testable without
// mounting this component. `suppressed` (see prop doc above) is
// consulted first, inside that function — checked here at the top
// of this computed, not at the SFC's mount site, so the overlay
// stays mounted across a hover transition instead of
// unmounting/remounting.
const markers = computed(() => deriveVariationMarkers(props.state, {
  variationsMode: props.variationsMode,
  showActiveNextMove: props.showActiveNextMove,
  suggestionPoints: suggestionPoints.value,
  suppressed: props.suppressed,
  ringStroke: themeColor(VARIATION_TINT_ANCHOR),
  activeRingStroke: themeColor(ACTIVE_TINT_ANCHOR),
  labelColor: LETTER_LABEL_COLOR,
}));
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
