<!--
  src/components/charts/ChartPreviewBox.vue
  Isolated leaf for an analysis panel's hover / position thumbnail (an SVG
  string). Reads the thumbnail through an accessor (`() => string`) rather
  than a value prop: invoking the accessor inside THIS leaf's render is what
  establishes the reactive subscription, so the per-navigation thumbnail
  update re-renders only this leaf — not the panel that owns it nor the
  AnalysisChartPanel host that composes it. See
  docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md
  (the accessor contract dissolves the read-coupling rather than relocating
  it).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
// Optional so hosts with no preview (e.g. StabilityPanel) render an empty
// box. The accessor is invoked in the template below, inside this leaf's
// render scope — that is the whole point of passing a thunk rather than the
// value.
defineProps<{ accessor?: () => string }>();
</script>

<template>
  <div class="preview-content" v-html="accessor ? accessor() : ''"></div>
</template>

<style scoped>
.preview-content { width: 100%; height: 100%; }
</style>
