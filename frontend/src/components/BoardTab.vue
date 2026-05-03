<!--
  src/components/BoardTab.vue
  Tab item in the board-list rail. Carries the board's label, close
  button, the analysis-meter rugplot, and the activity (geiger) dot.
  The hover-thumbnail is a separate component (FloatingThumbnail.vue)
  triggered by the hover-enter / hover-leave events emitted from here.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useActivityDecay } from '../composables/useActivityDecay';
import { getIntensityColorLinear } from '../engine/suggestion-colors';
import type { BoardState } from '../types';
import { ledger } from '../services/analysis-ledger';
import { useVariationPath } from '../composables/useVariationPath';
import { activeConfigHash } from '../services/analysis-config';

const props = defineProps<{
  state: BoardState;
  index: number;
  isActive: boolean;
  reviewState?: 'ACTIVE' | 'INTERMISSION' | 'COMPLETE' | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'hover-enter', evt: MouseEvent): void;
  (e: 'hover-leave'): void;
}>();

const energy = useActivityDecay(() => props.state.lastActivity);
const path = useVariationPath(() => props.state.id);

// Per-node analysis depth, surfaced as a colour stripe per move along
// the active variation.
//
// Three visual decisions distinct from how the intensity gradient is
// consumed elsewhere (move suggestions, ColorDebugStrip):
//
//   • Target floor is the ponder ceiling (`maxVisits: 100000` in
//     analysis-service); a deeper user-specified `analyzeRange` target
//     wins. Without the floor, the meter saturates instantly on ponder
//     when the user hasn't run a range analysis, because the default
//     `state.maxVisitsTarget` is 1000.
//
//   • Logarithmic compression on visits → t. Linear `visits / target`
//     would put the entire 1k–10k–100k progression into the bottom
//     decile; log mapping spreads each ~10× of visits across roughly
//     equal slices of t, so the colour gradates smoothly as ponder
//     accumulates. `log1p` keeps `visits === 0 → t = 0` clean.
//
//   • The linear (non-ECDF) variant of the gradient is the right fit
//     here. The ECDF variant remaps `t` through the visit-ratio
//     population's CDF — calibrated for "this move's share of visits
//     at a node," not for "fraction of an absolute target." Feeding
//     log-compressed `visits / target` through the ECDF would just
//     collapse our practical range onto a narrow band of the LUT, so
//     the colour wouldn't change as ponder progressed. `getIntensity-
//     ColorLinear` walks the LUT uniformly with `alpha = 1`, giving
//     hue-only depth signalling at full visibility.
//
//   • Unanalyzed nodes (`visits === 0`) render as transparent so the
//     meter's dark background shows through. Encoding "no data" as a
//     specific gradient endpoint would lie about the absence.
const rugPlot = computed(() => {
  const nodeIds = path.value;
  if (nodeIds.length === 0) return [];
  const target = Math.max(props.state.maxVisitsTarget ?? 0, 100000);
  const targetLog = Math.log1p(target);
  return nodeIds.map((id, idx) => {
    const packet = ledger.getRaw(activeConfigHash.value, id);
    const visits = packet?.rootInfo?.visits ?? 0;
    if (visits === 0) {
      return { idx, visits, color: 'transparent' };
    }
    const t = Math.min(1, Math.log1p(visits) / targetLog);
    return {
      idx,
      visits,
      color: getIntensityColorLinear.value(t, 1),
    };
  });
});
</script>

<template>
  <div 
    class="thumb-container" 
    @mouseenter="emit('hover-enter', $event)" 
    @mouseleave="emit('hover-leave')"
  >
    <div 
      class="tab-thumb" 
      :class="{ 
        active: isActive,
        'review-active': reviewState === 'ACTIVE',
        'review-intermission': reviewState === 'INTERMISSION',
        'review-complete': reviewState === 'COMPLETE'
      }"
    >
      <span class="tab-label">Board {{ index + 1 }}</span>
      <button class="close-board-btn" @click.stop="emit('close')" title="Close Board">×</button>
    </div>
    
    <div class="indicator-row">
      <div class="analysis-meter">
        <div
          v-for="slice in rugPlot"
          :key="slice.idx"
          class="meter-slice"
          :style="{ backgroundColor: slice.color, flex: 1 }"
          :title="`${slice.idx === 0 ? 'Root' : `Move ${slice.idx}`}: ${slice.visits.toLocaleString()} visits`"
        ></div>
      </div>
      <div class="geiger-dot-wrap">
        <div class="geiger-dot" :style="{ opacity: energy, transform: `scale(${0.6 + energy * 0.4})` }"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thumb-container { display: flex; flex-direction: column; align-items: center; margin-bottom: 8px; width: 88px; }

.tab-thumb {
  width: 88px; height: 32px; border: 2px solid var(--surface-3); background: var(--surface-1);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: border-color 0.2s ease, background 0.2s ease;
  position: relative; border-radius: 3px;
}

.tab-label { font-size: 11px; color: var(--text-2); font-weight: bold; pointer-events: none; }
.tab-thumb:hover .tab-label { color: var(--text-0); }

.tab-thumb.active { background: var(--surface-2); }
.tab-thumb.active .tab-label { color: var(--accent-primary); }

.tab-thumb.review-active { border-color: var(--review-active); box-shadow: 0 0 8px color-mix(in srgb, var(--review-active) 40%, transparent); }
.tab-thumb.review-intermission { border-color: var(--review-intermission); box-shadow: 0 0 8px color-mix(in srgb, var(--review-intermission) 40%, transparent); }
.tab-thumb.review-complete { border-color: var(--review-complete); }

.tab-thumb.active.review-active { border-width: 3px; }
.tab-thumb.active.review-intermission { border-width: 3px; }
.tab-thumb.active.review-complete { border-width: 3px; }

.close-board-btn {
  position: absolute; top: -6px; right: -6px;
  background: var(--surface-3); color: var(--text-1); border: 1px solid var(--border-3); border-radius: 50%;
  width: 16px; height: 16px; font-size: 12px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; opacity: 0; transition: opacity 0.2s, background 0.2s, color 0.2s;
}

.tab-thumb:hover .close-board-btn { opacity: 1; }
.close-board-btn:hover { background: var(--state-attention); color: var(--text-0); border-color: var(--state-attention); }

.indicator-row {
  width: 100%; height: 12px; display: flex; align-items: center;
  justify-content: space-between; margin-top: 2px; padding: 0 4px;
}

.analysis-meter {
  flex: 1; height: 4px; background: var(--surface-0); border-radius: 1px;
  margin-right: 8px; display: flex; overflow: hidden; border: 1px solid var(--surface-1);
}

.meter-slice { height: 100%; }
.geiger-dot-wrap { width: 10px; height: 10px; display: flex; align-items: center; justify-content: center; }
/* theme-exception: #00ff88 is an intentionally vivid activity indicator
   color, outside the muted semantic-state spectrum and not part of the
   chrome substrate's vocabulary. */
.geiger-dot { width: 6px; height: 6px; background: #00ff88; border-radius: 50%; box-shadow: 0 0 8px #00ff88; }
</style>
