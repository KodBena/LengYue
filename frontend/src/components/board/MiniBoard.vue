<!--
  src/components/board/MiniBoard.vue
  Thumbnail Go board — a thin dispatcher choosing the SVG or canvas renderer per
  the user's `appearance.miniBoardRenderer` setting (default 'svg'). MiniBoardSvg
  and MiniBoardCanvas implement the same BoardSnapshot projection; only the chosen
  one mounts (v-if), so neither code path's performance is affected by the other's
  existence. The canvas path (ADR-0010 canvas rule) is lighter on paint/jank at
  high stone counts; the SVG path is the simpler declarative form with a slightly
  more prominent last-move ring. The interactive main board (BoardDisplay) is
  unrelated and always SVG (it needs per-intersection hit-testing).
  Used by ChartPreviewBox and the multiresolution heatmap preview window.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../../store';
import MiniBoardSvg from './MiniBoardSvg.vue';
import MiniBoardCanvas from './MiniBoardCanvas.vue';
import type { BoardSnapshot } from '../../engine/board-geometry';

defineProps<{
  snapshot: BoardSnapshot;
  showMarker?: boolean;
}>();

// Low-frequency structural read: the renderer is a settings enum a user changes
// rarely and deliberately, so a reactive read driving the v-if dispatch is fine
// (ADR-0010 read-locality governs HIGH-frequency reads, which this is not).
const useCanvas = computed(() => store.profile.settings.appearance.miniBoardRenderer === 'canvas');
</script>

<template>
  <MiniBoardCanvas v-if="useCanvas" :snapshot="snapshot" :show-marker="showMarker" />
  <MiniBoardSvg v-else :snapshot="snapshot" :show-marker="showMarker" />
</template>
