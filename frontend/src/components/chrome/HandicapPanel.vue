<!--
  src/components/chrome/HandicapPanel.vue

  The N-stone handicap sub-panel revealed inside `SetupToolPalette.vue`
  (wiki Mechanics #4, "No handicap setup support"). Click-based, same
  as its parent palette (ADR-0019 genre convention, click not hover):
  the parent's own trigger row toggles this panel's visibility; the
  buttons here are a plain click-to-apply grid, no drag, no hover
  preview. Dismissal (ESC / outside-click) is inherited for free — this
  panel only ever renders while `SetupToolPalette`'s own popover is
  open, so that popover's existing outside-click/ESC listener already
  covers it.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { useHandicap } from '../../composables/board/useHandicap';

const { availableCounts, selectHandicap } = useHandicap();
</script>

<template>
  <div class="handicap-panel" role="group" :aria-label="$t('toolbar.setupToolkit.handicapButton')">
    <div v-if="availableCounts.length === 0" class="handicap-empty">
      {{ $t('toolbar.setupToolkit.handicapUnavailable') }}
    </div>
    <div v-else class="handicap-grid">
      <button
        v-for="n in availableCounts"
        :key="n"
        type="button"
        class="handicap-btn"
        @click="selectHandicap(n)"
      >{{ n }}</button>
    </div>
  </div>
</template>

<style scoped>
.handicap-panel {
  margin-top: var(--space-tight);
  padding-top: var(--space-tight);
  border-top: 1px solid var(--border-2);
}

.handicap-empty {
  font-size: var(--text-emphasis);
  color: var(--text-0);
}

.handicap-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-tight);
}

.handicap-btn {
  min-width: 28px;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  color: var(--text-0);
  padding: var(--space-tight) var(--space-default);
  cursor: pointer;
  border-radius: var(--radius-default);
  font-size: var(--text-emphasis);
  font-family: 'Courier New', monospace;
}
.handicap-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
</style>
