<!--
  src/components/board/BoardDeltaAnnotation.vue
  Wiki Wanted #7 / #7.1: annotates the just-played move's point with its
  delta (vs its parent) and the child's visit count, when both exist in
  the analysis ledger. Renders nothing (absence, not zero) otherwise.

  Self-sources via `useMoveDeltaAnnotation` — a single small SVG label, so
  no canvas is warranted (ADR-0010's canvas rule is about element COUNT
  scaling with data; this overlay ever draws at most one element). The
  read-locality half of ADR-0010 is why this is its own leaf rather than
  inline in `BoardWidget`: the delta/visits VALUES are per-packet
  high-frequency state, so only this leaf's render may depend on them
  (see the composable's header for the full argument).

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { BOARD_PX, LABEL_BAND, TOTAL_PX, STONE_RADIUS_RATIO } from '../../engine/constants';
import { useMoveDeltaAnnotation } from '../../composables/board/useMoveDeltaAnnotation';
import { formatVisitsCompact } from '../../composables/board/use-move-suggestions';
import type { BoardState, NodeId } from '../../types';

const props = defineProps<{
  state: BoardState;
  currentNodeId: NodeId;
  boardSize: number;
  /**
   * 'deltaVisits' — generic "Δ ±x.xx · Nv" label.
   * 'perPlayer'   — same delta value, framed as the mover's own score
   *                 delta ("Black Δ" / "White Δ", per-player tinted) —
   *                 the #7.1 framing. Both modes read the identical
   *                 palette-derived value; see the composable's header.
   */
  mode: 'deltaVisits' | 'perPlayer';
}>();

const annotation = useMoveDeltaAnnotation(
  () => props.state,
  () => props.currentNodeId,
);

const pad  = computed(() => BOARD_PX / (props.boardSize + 1));
const cell = computed(() => (BOARD_PX - 2 * pad.value) / (props.boardSize - 1));
const stoneR = computed(() => cell.value * STONE_RADIUS_RATIO);

function toSvg(x: number, y: number): { x: number; y: number } {
  return {
    x: pad.value + x * cell.value,
    y: pad.value + (props.boardSize - 1 - y) * cell.value,
  };
}

// Signed 2-decimal formatting matches the chart convention
// (BaseChart.vue's tooltip formatter / MergedDeltaPanel's series).
function formatDelta(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}

const labelText = computed(() => {
  const a = annotation.value;
  if (!a) return null;
  const deltaStr = formatDelta(a.delta);
  const visitsStr = formatVisitsCompact(a.visits);
  return props.mode === 'perPlayer'
    ? `${a.color === 'B' ? 'Black' : 'White'} Δ ${deltaStr}`
    : `Δ ${deltaStr} · ${visitsStr}v`;
});

// Badge tint: neutral for the generic mode, per-player tinted for
// 'perPlayer' — mirrors MergedDeltaPanel's Black Delta / White Delta
// colour convention (themeColor('--player-black'/'--player-white')),
// but kept as fixed literals here (not `themeColor()`) since this is an
// SVG-attribute fill read once per annotation change, not a CSS custom
// property a template binding tracks; matches MoveSuggestions' own
// literal '#003040' best-move label colour precedent.
const badgeFill = computed(() => {
  if (props.mode !== 'perPlayer' || !annotation.value) return 'rgba(20,20,20,0.82)';
  return annotation.value.color === 'B' ? 'rgba(10,10,10,0.88)' : 'rgba(235,235,235,0.92)';
});
const textFill = computed(() => {
  if (props.mode !== 'perPlayer' || !annotation.value) return '#fff';
  return annotation.value.color === 'B' ? '#fff' : '#111';
});

// Anchor point: offset below-right of the stone so the badge doesn't
// occlude BoardDisplay's own last-move ring at the same intersection.
const badgePos = computed(() => {
  const a = annotation.value;
  if (!a) return null;
  const c = toSvg(a.point.x, a.point.y);
  return { x: c.x + stoneR.value * 1.15, y: c.y + stoneR.value * 1.4 };
});

// Width is a rough per-character estimate (monospace, fixed font-size) —
// good enough for a small background pill; no measureText round-trip
// warranted for a single short label.
const badgeWidth = computed(() => (labelText.value?.length ?? 0) * 5.6 + 6);
</script>

<template>
  <svg
    v-if="labelText && badgePos"
    :viewBox="`0 0 ${TOTAL_PX} ${TOTAL_PX}`"
    class="delta-annotation-overlay"
    aria-hidden="true"
  >
    <g :transform="`translate(${LABEL_BAND}, ${LABEL_BAND})`">
      <rect
        :x="badgePos.x - 3"
        :y="badgePos.y - 7"
        :width="badgeWidth"
        height="12"
        rx="2"
        :fill="badgeFill"
      />
      <text
        :x="badgePos.x"
        :y="badgePos.y + 2"
        class="delta-label"
        font-size="9"
        :fill="textFill"
      >{{ labelText }}</text>
    </g>
  </svg>
</template>

<style scoped>
.delta-annotation-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.delta-label {
  font-family: monospace;
  font-weight: bold;
  user-select: none;
}
</style>
