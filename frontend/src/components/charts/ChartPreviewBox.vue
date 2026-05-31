<!--
  src/components/charts/ChartPreviewBox.vue
  Isolated leaf for an analysis panel's hover / position thumbnail. Reads the
  position through an accessor (`() => BoardSnapshot | null`) rather than a
  value prop: invoking the accessor inside THIS leaf's render is what
  establishes the reactive subscription, so the per-navigation thumbnail
  update re-renders only this leaf — not the panel that owns it nor the
  AnalysisChartPanel host that composes it. See
  docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md
  (the accessor contract dissolves the read-coupling rather than relocating
  it).

  The accessor now yields a BoardSnapshot rendered by the reactive MiniBoard
  (was: an SVG string injected via v-html, which rebuilt the whole board
  subtree every nav — ContentRangeInserted + style recalc). MiniBoard diffs:
  only the changed stones patch.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import MiniBoard from '../board/MiniBoard.vue';
import type { BoardSnapshot } from '../../engine/board-geometry';

// Optional so hosts with no preview (e.g. StabilityPanel) render an empty
// box. `showMarker` is a static per-panel render option (the delta panel
// draws the last-move ring; the others don't).
const props = withDefaults(
  defineProps<{ accessor?: () => BoardSnapshot | null; showMarker?: boolean }>(),
  { showMarker: false },
);

// Invoked here, inside this leaf's render scope — the subscription to the
// preview source is established in the leaf, so a per-nav update re-renders
// only this box. The accessor contract is unchanged; only its return type
// moved from string to BoardSnapshot.
const snapshot = computed(() => props.accessor?.() ?? null);
</script>

<template>
  <div class="preview-content">
    <MiniBoard v-if="snapshot" :snapshot="snapshot" :show-marker="showMarker" />
  </div>
</template>

<style scoped>
.preview-content { width: 100%; height: 100%; }
</style>
