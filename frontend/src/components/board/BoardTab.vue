<!--
  src/components/board/BoardTab.vue
  Tab item in the board-list rail. Carries the board's label, close
  button, and the analysis-meter rugplot.
  The hover-thumbnail is a separate component (FloatingThumbnail.vue)
  triggered by the hover-enter / hover-leave events emitted from here.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { getIntensityColorLinear } from '../../engine/suggestion-colors';
import { store } from '../../store';
import type { BoardId, BoardState } from '../../types';
import { ledger } from '../../state/analysis-ledger';
import { useVariationPathFor } from '../../composables/board/useVariationPath';
import { activeAnalysisKeys } from '../../state/analysis-config';
import { useThrottledSnapshot } from '../../composables/useThrottledSnapshot';
import { BOARD_TAB_RUGPLOT_REDRAW_THROTTLE_MS } from '../../lib/timing';

const props = defineProps<{
  state: BoardState;
  isActive: boolean;
  reviewState?: 'ACTIVE' | 'INTERMISSION' | 'COMPLETE' | null;
}>();
// No `index` prop: the "Board N" ordinal is rendered as a CSS counter (see the
// `.tab-label-num` rule), so a close-induced reindex renumbers the labels on
// reflow without re-rendering — which is what lets the parent drop `index` from
// the BoardTab v-memo key (fix-boardtab-vmemo-index-key; the O(N²) close
// re-render storm in the close-at-scale postmortem).

// Events carry this tab's OWN board id so the parent can bind STABLE handlers
// (one function reference, not a per-`v-for`-item closure). A per-item inline
// handler (`@click="activate(board)"`) is a fresh closure on every parent
// render, which makes Vue's `shouldUpdateComponent` re-render every tab on every
// parent re-render — the real driver of the O(N²) close-render storm (the
// close-at-scale postmortem; v-memo only masked it for the nav case). With id-
// carrying events + stable parent handlers, an unchanged tab's props are
// referentially stable, so the keyed diff skips it.
const emit = defineEmits<{
  (e: 'activate', id: BoardId): void;
  (e: 'close', id: BoardId): void;
  (e: 'hover-enter', id: BoardId): void;
  (e: 'hover-leave'): void;
}>();

// Path from the OWN board object (props.state), NOT the id wrapper: the wrapper
// resolves through `boardsById`, which invalidates on every board-set change
// (any close) and would re-walk this tab's path on every close — O(N²) over the
// rail (CPU-profiled as ≈ half the close-at-scale close phase). props.state is
// stable across a sibling's close, so this only re-walks when THIS board moves.
const path = useVariationPathFor(() => props.state);

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
  const rawKey = activeAnalysisKeys.value.rawKey;
  return path.value.map(id => ledger.getRaw(rawKey, id)?.rootInfo?.visits ?? 0);
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
const rugPlot = computed<string[]>(() => {
  const visitsList = displayedVisits.value;
  if (visitsList.length === 0) return [];
  const ponderCeiling = store.profile.settings.engine.katago.ponderMaxVisits;
  const target = Math.max(props.state.maxVisitsTarget ?? 0, ponderCeiling);
  const targetLog = Math.log1p(target);
  return visitsList.map((visits) => {
    if (visits === 0) return 'transparent';
    const t = Math.min(1, Math.log1p(visits) / targetLog);
    return getIntensityColorLinear.value(t, 1);
  });
});

// ── Canvas rendering ──────────────────────────────────────────────────────
// The meter was previously one <div> per path move (v-for over rugPlot) with a
// per-slice i18n :title — so a 300-move game rebuilt ~300 vnodes + ~300 t()
// calls on *every* re-render, and reading rugPlot in the template meant every
// 4 Hz colour update re-rendered the whole tab (BoardTab was the single most
// expensive component render in the combined-stress profile, ~7.6ms/render).
//
// A canvas needs none of that: the meter is a fixed ~86×4px strip with no
// per-slice layout, scaling, or interaction (the per-slice tooltip was
// sub-pixel and unusable, so it's dropped). The draw is imperative and runs at
// the existing 4 Hz throttle, entirely off Vue's render path — so the template
// no longer reads rugPlot and the tab stops re-rendering on colour updates.
// (Same reasoning HeatmapChart uses for its canvas renderer over per-cell SVG.)
const meterRef = ref<HTMLCanvasElement | null>(null);
let meterW = 0; // CSS px, cached from the ResizeObserver (avoids a layout read per draw)
let meterH = 0;
let resizeObs: ResizeObserver | null = null;

function drawMeter(): void {
  const canvas = meterRef.value;
  if (!canvas || meterW === 0 || meterH === 0) return;
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.max(1, Math.round(meterW * dpr));
  const bh = Math.max(1, Math.round(meterH * dpr));
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, bw, bh); // transparent slices → the CSS background shows through

  const colors = rugPlot.value;
  const n = colors.length;
  if (n === 0) return;
  const sliceW = bw / n;
  for (let i = 0; i < n; i++) {
    if (colors[i] === 'transparent') continue;
    const x0 = Math.floor(i * sliceW);
    const x1 = Math.floor((i + 1) * sliceW);
    ctx.fillStyle = colors[i];
    ctx.fillRect(x0, 0, Math.max(1, x1 - x0), bh);
  }
}

onMounted(() => {
  const canvas = meterRef.value;
  if (!canvas) return;
  resizeObs = new ResizeObserver(() => {
    // Reads inside the RO callback are post-layout, so no forced reflow.
    meterW = canvas.clientWidth;
    meterH = canvas.clientHeight;
    drawMeter();
  });
  resizeObs.observe(canvas);
  // Seed once (the RO callback fires async).
  meterW = canvas.clientWidth;
  meterH = canvas.clientHeight;
  drawMeter();
});

// rugPlot is consumed only here (not in the template), so 4 Hz colour updates
// drive an imperative redraw, not a Vue re-render.
watch(rugPlot, drawMeter);

onUnmounted(() => {
  resizeObs?.disconnect();
  resizeObs = null;
});
</script>

<template>
  <div
    class="thumb-container"
    @click="emit('activate', state.id)"
    @mouseenter="emit('hover-enter', state.id)"
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
      <!-- "Board N": the localized word comes from i18n (relabels on a language
           switch — the parent's v-memo carries `locale`), the number is a CSS
           counter so it renumbers on a close-induced reflow with no Vue render. -->
      <i18n-t keypath="boardTab.label" tag="span" class="tab-label" scope="global">
        <template #n><span class="tab-label-num" /></template>
      </i18n-t>
      <button class="close-board-btn" @click.stop="emit('close', state.id)" :title="$t('boardTab.close')">×</button>
    </div>

    <div class="indicator-row">
      <canvas ref="meterRef" class="analysis-meter"></canvas>
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
.thumb-container { --tab-width: 86px; display: flex; flex-direction: column; align-items: center; width: var(--tab-width); counter-increment: boardtab; }

.tab-thumb {
  width: var(--tab-width); height: 32px; border: 2px solid var(--surface-3); background: var(--surface-0);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: border-color var(--duration-default) ease, background var(--duration-default) ease;
  position: relative; border-radius: var(--radius-default);
}

.tab-label { font-size: var(--text-emphasis); color: var(--text-2); font-weight: bold; pointer-events: none; }
/* The "Board N" ordinal as a CSS counter: `.thumb-list` (SidebarWidget) resets
   `boardtab`, each `.thumb-container` increments it, so the number is the tab's
   1-based DOM position and renumbers on a close-induced reflow WITHOUT a Vue
   re-render. This is the half of fix-boardtab-vmemo-index-key that lets the
   parent drop `index` from the v-memo key (the O(N²) close storm). */
.tab-label-num::before { content: counter(boardtab); }
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
  display: block; overflow: hidden;
}
</style>
