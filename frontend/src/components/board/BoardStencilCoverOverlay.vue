<!--
  src/components/board/BoardStencilCoverOverlay.vue
  Proxy-computed signed stencil tiling, drawn as one boundary path per colour.
  The component self-sources its current-node annotation through the raw
  analysis ledger; BoardWidget passes structural navigation props only.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { LABEL_BAND, TOTAL_PX } from '../../engine/constants';
import { boardGeometry } from '../../engine/board-geometry';
import { projectStencilCoverOutline } from '../../engine/stencil-cover-geometry';
import { useStencilCoverAnnotation } from '../../composables/board/useStencilCoverAnnotation';
import type { NodeId } from '../../types';

const props = withDefaults(defineProps<{
  currentNodeId: NodeId;
  size: number;
  /** Suppress actual-position geometry while a hypothetical PV is previewed. */
  suppressed?: boolean;
}>(), {
  suppressed: false,
});

const annotation = useStencilCoverAnnotation(() => props.currentNodeId);

const outline = computed(() => {
  // Short-circuit before reading packet-rate ledger state while a PV is
  // hovered. The board's hypothetical position should not wear the current
  // node's ownership tiling, and the hidden leaf need not process packets.
  if (props.suppressed) return null;
  return projectStencilCoverOutline(annotation.value, props.size);
});

const widths = computed(() => {
  const cell = boardGeometry(props.size).cell;
  return {
    halo: Math.max(2, cell * 0.105),
    core: Math.max(1, cell * 0.045),
    dash: format(cell * 0.42) + ' ' + format(cell * 0.22),
  };
});

function format(value: number): string {
  return Number(value.toFixed(2)).toString();
}
</script>

<template>
  <svg
    v-if="outline && (outline.positive.path || outline.negative.path)"
    :viewBox="'0 0 ' + TOTAL_PX + ' ' + TOTAL_PX"
    class="stencil-cover-overlay"
    aria-hidden="true"
  >
    <g :transform="'translate(' + LABEL_BAND + ', ' + LABEL_BAND + ')'">
      <!-- Positive ownership is White: white core with a dark halo. -->
      <g v-if="outline.positive.path" class="positive-cover">
        <path
          :d="outline.positive.path"
          class="boundary-halo"
          :stroke-width="widths.halo"
          :stroke-dasharray="outline.positive.optimal ? undefined : widths.dash"
        />
        <path
          :d="outline.positive.path"
          class="boundary-core"
          :stroke-width="widths.core"
          :stroke-dasharray="outline.positive.optimal ? undefined : widths.dash"
        />
      </g>

      <!-- Negative ownership is Black: dark core with a light halo. -->
      <g v-if="outline.negative.path" class="negative-cover">
        <path
          :d="outline.negative.path"
          class="boundary-halo"
          :stroke-width="widths.halo"
          :stroke-dasharray="outline.negative.optimal ? undefined : widths.dash"
        />
        <path
          :d="outline.negative.path"
          class="boundary-core"
          :stroke-width="widths.core"
          :stroke-dasharray="outline.negative.optimal ? undefined : widths.dash"
        />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.stencil-cover-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.boundary-halo,
.boundary-core {
  fill: none;
  stroke-linecap: square;
  stroke-linejoin: round;
}
.boundary-halo {
  opacity: 0.9;
}
.boundary-core {
  opacity: 0.96;
}
.positive-cover .boundary-halo { stroke: #17130b; }
.positive-cover .boundary-core { stroke: #fff; }
.negative-cover .boundary-halo { stroke: #fff; }
.negative-cover .boundary-core { stroke: #17130b; }
</style>
