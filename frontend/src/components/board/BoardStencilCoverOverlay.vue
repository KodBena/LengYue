<!--
  src/components/board/BoardStencilCoverOverlay.vue
  Raw thresholded ownership components plus proxy-computed signed stencil tiling.
  The component self-sources its current-node annotation through the raw
  analysis ledger; BoardWidget passes structural navigation props only.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { LABEL_BAND, TOTAL_PX } from '../../engine/constants';
import { boardGeometry } from '../../engine/board-geometry';
import {
  projectStencilCoverComponents,
  projectStencilCoverOutline,
} from '../../engine/stencil-cover-geometry';
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

const components = computed(() => {
  // Short-circuit before reading packet-rate ledger state while a PV is
  // hovered. The hypothetical board must not display the current node's mask.
  if (props.suppressed) return null;
  return projectStencilCoverComponents(annotation.value, props.size);
});

const outline = computed(() => {
  if (props.suppressed) return null;
  return projectStencilCoverOutline(annotation.value, props.size);
});

const hasAnnotation = computed(() => {
  if (props.suppressed) return false;
  return annotation.value !== null;
});

const summary = computed(() => {
  if (props.suppressed) return '';
  const current = annotation.value;
  if (!current) return '';
  if (current.version === 1) {
    return 'Stencil-cover annotation v1: raw thresholded components are not available.';
  }
  const projected = components.value;
  if (projected === null) {
    return 'Raw thresholded component annotation is invalid and was not drawn.';
  }
  if (projected.length === 0) {
    return 'No ownership cells passed the threshold after legal-point policy masking.';
  }
  const counts = { optimal: 0, feasible: 0, fallback: 0 };
  const details: string[] = [];
  for (const component of projected) {
    counts[component.status] = counts[component.status] + 1;
    details.push(component.id + ': ' + component.status
      + ', ' + component.cells.length + ' cells, '
      + component.tileCount + ' tiles');
  }
  return 'Raw thresholded components: ' + projected.length
    + ' (' + counts.optimal + ' optimal, '
    + counts.feasible + ' feasible, '
    + counts.fallback + ' fallback). '
    + details.join('; ');
});

const widths = computed(() => {
  const cell = boardGeometry(props.size).cell;
  return {
    halo: Math.max(2, cell * 0.105),
    core: Math.max(1, cell * 0.045),
    component: Math.max(1, cell * 0.035),
    dash: format(cell * 0.42) + ' ' + format(cell * 0.22),
    fallbackDash: format(cell * 0.08) + ' ' + format(cell * 0.18),
  };
});

function format(value: number): string {
  return Number(value.toFixed(2)).toString();
}
</script>

<template>
  <svg
    v-if="hasAnnotation"
    :viewBox="'0 0 ' + TOTAL_PX + ' ' + TOTAL_PX"
    class="stencil-cover-overlay"
    role="img"
    :aria-label="summary"
  >
    <title>{{ summary }}</title>
    <desc>
      Translucent cluster-palette fills show raw connected ownership components.
      Solid component borders are optimal; dashed borders are feasible but
      unproven; dotted borders are singleton fallbacks. Stencil-cover outlines
      are rendered independently for direct extent comparison.
    </desc>
    <g :transform="'translate(' + LABEL_BAND + ', ' + LABEL_BAND + ')'">
      <!-- Raw thresholded cells are painted first so the solver's placements
           remain legible above them. Each 4-connected component gets a
           conflict-free --cluster-8-N palette entry. -->
      <g v-for="component in (components ?? [])" :key="component.id">
        <rect
          v-for="cell in component.cells"
          :key="cell.key"
          :x="cell.x"
          :y="cell.y"
          :width="cell.size"
          :height="cell.size"
          :fill="'var(--cluster-8-' + component.colorIndex + ')'"
          fill-opacity="0.22"
        />
        <path
          :d="component.path"
          fill="none"
          :stroke="'var(--cluster-8-' + component.colorIndex + ')'"
          :stroke-width="widths.component"
          :stroke-dasharray="component.status === 'optimal'
            ? undefined
            : component.status === 'feasible' ? widths.dash : widths.fallbackDash"
        />
      </g>

      <!-- Positive ownership is White: white core with a dark halo. -->
      <g v-if="outline?.positive.path" class="positive-cover">
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
      <g v-if="outline?.negative.path" class="negative-cover">
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
