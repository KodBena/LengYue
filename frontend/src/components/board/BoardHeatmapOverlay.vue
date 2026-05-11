<script setup lang="ts">
/**
 * src/components/board/BoardHeatmapOverlay.vue
 * Stateless per-intersection heatmap overlay.
 *
 * Renders one tinted shape (disc or square) at each cell described by
 * `cells`, using `colorMap` to convert each cell's scalar value into a
 * fill colour and opacity. Geometry mirrors BoardDisplay so the overlay
 * lays exactly on top of the underlying board grid.
 *
 * Domain-agnostic. The component knows nothing about ownership, policy,
 * or any other metric — it accepts decoded cells and a parameter-shaped
 * styling contract. The call site (BoardWidget) composes the source
 * packet, the decoder, and the colour map. When extension-driven
 * overlays land, the call site becomes a registry walk; this component
 * is unchanged.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { BOARD_PX, LABEL_BAND, TOTAL_PX } from '../../engine/constants';

export interface HeatmapCell {
  readonly x: number;
  readonly y: number;
  readonly value: number;
}

export type HeatmapStyle = (value: number) => { fill: string; opacity: number };

const props = withDefaults(defineProps<{
  cells: readonly HeatmapCell[];
  size: number;
  colorMap: HeatmapStyle;
  shape?: 'disc' | 'square';
  scale?: number;
}>(), {
  shape: 'disc',
  scale: 0.4,
});

// ── Geometry (mirrors BoardDisplay) ───────────────────────────────────────────
const pad  = computed(() => BOARD_PX / (props.size + 1));
const cell = computed(() => (BOARD_PX - 2 * pad.value) / (props.size - 1));
const half = computed(() => cell.value * props.scale);

function cx(x: number): number { return pad.value + x * cell.value; }
function cy(y: number): number { return pad.value + (props.size - 1 - y) * cell.value; }

const renderedCells = computed(() => props.cells.map(c => {
  const style = props.colorMap(c.value);
  return {
    key: `${c.x},${c.y}`,
    cx: cx(c.x),
    cy: cy(c.y),
    fill: style.fill,
    opacity: style.opacity,
  };
}));
</script>

<template>
  <svg
    :viewBox="`0 0 ${TOTAL_PX} ${TOTAL_PX}`"
    class="heatmap-overlay"
    aria-hidden="true"
  >
    <!-- Translate into the inner playing area so the cx/cy formulas above
         stay BoardDisplay-aligned without carrying the LABEL_BAND offset. -->
    <g :transform="`translate(${LABEL_BAND}, ${LABEL_BAND})`">
      <template v-for="cell in renderedCells" :key="cell.key">
        <rect
          v-if="shape === 'square'"
          :x="cell.cx - half"
          :y="cell.cy - half"
          :width="half * 2"
          :height="half * 2"
          :fill="cell.fill"
          :opacity="cell.opacity"
        />
        <circle
          v-else
          :cx="cell.cx"
          :cy="cell.cy"
          :r="half"
          :fill="cell.fill"
          :opacity="cell.opacity"
        />
      </template>
    </g>
  </svg>
</template>

<style scoped>
.heatmap-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
</style>
