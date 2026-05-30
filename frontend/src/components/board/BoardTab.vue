<!--
  src/components/board/BoardTab.vue
  Tab item in the board-list rail. Carries the board's label, close
  button, and the analysis-meter rugplot.
  The hover-thumbnail is a separate component (FloatingThumbnail.vue)
  triggered by the hover-enter / hover-leave events emitted from here.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { getIntensityColorLinear } from '../../engine/suggestion-colors';
import { store } from '../../store';
import type { BoardState } from '../../types';
import { ledger } from '../../services/analysis-ledger';
import { useVariationPath } from '../../composables/board/useVariationPath';
import { activeConfigHash } from '../../services/analysis-config';
import { useThrottledSnapshot } from '../../composables/useThrottledSnapshot';
import { BOARD_TAB_RUGPLOT_REDRAW_THROTTLE_MS } from '../../lib/timing';

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

const path = useVariationPath(() => props.state.id);

// ── Throttled rugplot source (per-node visit scan) ────────────────────
// `rugPlot` below colours a per-move depth meter from every node on the path
// — an O(path) colour-LUT walk, and the per-node ledger version refs bump on
// essentially every analysis packet, so without coalescing the whole meter
// recolours ~16/s. Split the work: `rugVisits` is the cheap,
// per-packet-reactive half (map lookups, no colour maths); a throttled
// snapshot of it — the shared subscriber-projection mechanism — drives the
// colour walk + re-render at the family ~4 Hz cadence while the meter still
// tracks ongoing analysis.
const rugVisits = computed<number[]>(() => {
  const hash = activeConfigHash.value;
  return path.value.map(id => ledger.getRaw(hash, id)?.rootInfo?.visits ?? 0);
});
const displayedVisits = useThrottledSnapshot(rugVisits, BOARD_TAB_RUGPLOT_REDRAW_THROTTLE_MS);

// Per-node analysis depth, surfaced as a colour stripe per move along
// the active variation. Derived from the throttled `displayedVisits`
// snapshot above (not the live ledger), so the colour-LUT walk runs at the
// snapshot's ~4 Hz rather than per packet.
//
// Three visual decisions distinct from how the intensity gradient is
// consumed elsewhere (move suggestions, ColorDebugStrip):
//
//   • Target floor is the user-configured ponder ceiling
//     (`engine.katago.ponderMaxVisits`, default 2,000,000; tunable
//     via the registry editor and applied as `maxVisits` in
//     analysis-service's ponder mode). A deeper user-specified
//     `analyzeRange` target wins. Without the floor, the meter
//     saturates instantly on ponder when the user hasn't run a
//     range analysis, because the default `state.maxVisitsTarget`
//     is 1000. The pre-v1.0.20 shape pinned this to a hardcoded
//     100,000 constant; after the v1.0.20 surfacing the analysis
//     service goes deeper than that on ponder, so the meter
//     saturated 20× too quickly. SSOT: same setting both ends
//     consume.
//
//   • Logarithmic compression on visits → t. Linear `visits / target`
//     would put the entire 1k–10k–100k progression into the bottom
//     decile; log mapping spreads each ~10× of visits across roughly
//     equal slices of t, so the colour gradates smoothly as ponder
//     accumulates. `log1p` keeps `visits === 0 → t = 0` clean.
//
//     Distinct from the timeline-panel rug-plot's quantile mapping:
//     the rail meter answers "how deep has analysis gone on this
//     board, on an absolute scale anchored to the configured
//     ceiling?" — magnitude information is the point. The timeline-
//     panel rug-plot answers "which turns in this game got
//     relatively more attention than others?" — rank-position
//     information is the point. Different questions, different
//     mappings; the shared SSOT is the gradient LUT
//     (`getIntensityColorLinear`), the transparent-for-zero rule,
//     and the ponder-ceiling reference.
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
  const visitsList = displayedVisits.value;
  if (visitsList.length === 0) return [];
  const ponderCeiling = store.profile.settings.engine.katago.ponderMaxVisits;
  const target = Math.max(props.state.maxVisitsTarget ?? 0, ponderCeiling);
  const targetLog = Math.log1p(target);
  return visitsList.map((visits, idx) => {
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
      <span class="tab-label">{{ $t('boardTab.label', { n: index + 1 }) }}</span>
      <button class="close-board-btn" @click.stop="emit('close')" :title="$t('boardTab.close')">×</button>
    </div>

    <div class="indicator-row">
      <div class="analysis-meter">
        <div
          v-for="slice in rugPlot"
          :key="slice.idx"
          class="meter-slice"
          :style="{ backgroundColor: slice.color, flex: 1 }"
          :title="slice.idx === 0
            ? $t('boardTab.meterRoot', { visits: slice.visits.toLocaleString() })
            : $t('boardTab.meterMove', { idx: slice.idx, visits: slice.visits.toLocaleString() })"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* magic-literal: 86px sidebar-tab outer width (iter-21). Was 88
   across both `.thumb-container` and `.tab-thumb`; hoisted into a
   single scoped CSS custom property `--tab-width` so the two
   consumers can't drift. 86 trims 2px back to the gutter inside
   `#sidebar-widget` (currently 90px wide → 4px total gutter at this
   value), giving the chrome a tighter wrap without crowding the
   tab-label. `.thumb-container` sets the var; `.tab-thumb` (a
   descendant) inherits it through the cascade. If you retune, the
   sidebar width in `SidebarWidget.vue` (`#sidebar-widget`) needs to
   keep at least 2-4px of headroom over this value for the gutter
   to read as breathing room. The 32px height on `.tab-thumb` is
   separate — the thumb's portrait/landscape aspect (88×32 → now
   86×32) reads as a short label band rather than a card. */
.thumb-container { --tab-width: 86px; display: flex; flex-direction: column; align-items: center; width: var(--tab-width); }

.tab-thumb {
  width: var(--tab-width); height: 32px; border: 2px solid var(--surface-3); background: var(--surface-0);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: border-color var(--duration-default) ease, background var(--duration-default) ease;
  position: relative; border-radius: var(--radius-default);
}

.tab-label { font-size: var(--text-emphasis); color: var(--text-2); font-weight: bold; pointer-events: none; }
.tab-thumb:hover .tab-label { color: var(--text-0); }

.tab-thumb.active { background: var(--surface-2); }
.tab-thumb.active .tab-label { color: var(--accent-primary); }

.tab-thumb.review-active { border-color: var(--review-active); box-shadow: 0 0 8px color-mix(in srgb, var(--review-active) 40%, transparent); }
.tab-thumb.review-intermission { border-color: var(--review-intermission); box-shadow: 0 0 8px color-mix(in srgb, var(--review-intermission) 40%, transparent); }
.tab-thumb.review-complete { border-color: var(--review-complete); }

.tab-thumb.active.review-active { border-width: 3px; }
.tab-thumb.active.review-intermission { border-width: 3px; }
.tab-thumb.active.review-complete { border-width: 3px; }

/* magic-literal: .close-board-btn's `top: -6px; right: -6px` lifts the
   16x16 close button off the tab-thumb's corner so half the button
   overlaps the corner radius and half hangs outside, reading as a
   detached affordance. The -6px offset is hand-tuned to that specific
   visual; not a substrate candidate. */
.close-board-btn {
  position: absolute; top: -6px; right: -6px;
  background: var(--surface-3); color: var(--text-1); border: 1px solid var(--border-3); border-radius: var(--radius-circle);
  width: 16px; height: 16px; font-size: var(--text-emphasis); line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; opacity: 0; transition: opacity var(--duration-default), background var(--duration-default), color var(--duration-default);
}

.tab-thumb:hover .close-board-btn { opacity: 1; }

.indicator-row {
  width: 100%; height: 12px; display: flex; align-items: center;
  justify-content: space-between; margin-top: 2px; padding: 0 var(--space-tight);
}

/* magic-literal: .analysis-meter's `border-radius: 1px` is a hairline
   rounding that softens the meter's corners without making them visibly
   rounded — below the substrate's smallest tier (3px). Intentional fine
   detail on a 4px-tall element. */
.analysis-meter {
  flex: 1; height: 4px; background: var(--surface-0); border-radius: 1px;
  display: flex; overflow: hidden;
}

.meter-slice { height: 100%; }
</style>
