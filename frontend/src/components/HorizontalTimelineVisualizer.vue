<!--
  src/components/HorizontalTimelineVisualizer.vue
  License: Public Domain (The Unlicense)
-->
<template>
  <div 
    ref="containerRef"
    class="timeline-container"
    @mousedown="onContainerMouseDown"
    @touchstart.passive="onContainerMouseDown"
  >
    <!-- Grid Lines -->
    <div class="grid-lines">
      <div 
        v-for="i in 10" 
        :key="i" 
        class="grid-line" 
        :style="{ left: `${i * 10}%` }"
      ></div>
    </div>

    <!-- Data Track (Rug Plot Style) -->
    <svg class="data-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient 
          v-for="(segment, index) in processedSegments" 
          :key="`grad-${index}`" 
          :id="`grad-${id}-${index}`"
          x1="0" y1="0" x2="1" y2="0"
        >
          <template v-if="colorMode === 'aggregate'">
            <stop offset="0%" :stop-color="getColor(segment.stats.mean)" />
            <stop offset="100%" :stop-color="getColor(segment.stats.mean)" />
          </template>
          <template v-else>
            <!-- FIX: Safely computed stops prevent NaN% division by zero -->
            <stop 
              v-for="(stop, vIdx) in segment.stops" 
              :key="vIdx"
              :offset="stop.offset"
              :stop-color="stop.color"
            />
          </template>
        </linearGradient>
      </defs>

      <rect
        v-for="(segment, index) in processedSegments"
        :key="index"
        :x="`${(segment.start / dataVector.length) * 100}%`"
        :width="`${((segment.end - segment.start + 1) / dataVector.length) * 100}%`"
        height="100%"
        :fill="`url(#grad-${id}-${index})`"
        class="segment-rect"
        @mousedown.stop="handleSegmentClick(segment)"
        @touchstart.stop.passive="handleSegmentClick(segment)"
      />
    </svg>

    <!-- Selection Slider -->
    <div
      class="selection-slider"
      :style="sliderStyle"
      @mousedown.stop="onSliderMouseDown"
      @touchstart.stop.passive="onSliderMouseDown"
    >
      <div 
        class="handle handle-left"
        @mousedown.stop="onHandleMouseDown($event, 'left')"
        @touchstart.stop.passive="onHandleMouseDown($event, 'left')"
      >
        <div class="handle-bar"></div>
      </div>

      <div 
        class="handle handle-right"
        @mousedown.stop="onHandleMouseDown($event, 'right')"
        @touchstart.stop.passive="onHandleMouseDown($event, 'right')"
      >
        <div class="handle-bar"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted, toRefs } from 'vue';
import { useTimelineLogic, type Segment } from '../composables/useTimelineLogic';
import { getIntensityColorLinear } from '../engine/suggestion-colors';

interface Props {
  dataVector: number[];
  modelValue: [number, number];
  /**
   * Color-mode controls how per-position visit counts are mapped to
   * the intensity gradient:
   *
   *   - `global`            — pass raw value through `Math.min(1, v)`.
   *     Outliers (e.g., extended ponder on one position) saturate at
   *     the top and squash everything else to near-zero. Cheap but
   *     dominated by long-tail extrema.
   *   - `segment-normalized` — min-max within each contiguous segment.
   *     Parametric: assumes [min, max] is the meaningful scale anchor.
   *     A single 100× outlier still dominates the range; non-outlier
   *     turns render near the bottom of the gradient.
   *   - `quantile`          — non-parametric rank-based mapping. Each
   *     value maps to its empirical-CDF position (midrank for ties)
   *     across the segment's values, in [0, 1]. Robust to outliers:
   *     the heaviest-pondered turn gets quantile≈1, the next gets
   *     quantile≈(n−1)/n, etc., spread across the gradient regardless
   *     of magnitude ratios. Trade-off: scale information is lost
   *     (a 100× outlier and a 10000× outlier both render as the
   *     top quantile). Right call for analysis-intensity
   *     visualisations where ponder can produce wildly skewed
   *     distributions and the operator wants rank order, not
   *     absolute magnitude.
   *   - `aggregate`         — single color per segment (mean-of-segment).
   *     For segment-level summaries; not per-position.
   */
  colorMode?: 'global' | 'segment-normalized' | 'quantile' | 'aggregate';
}

const props = withDefaults(defineProps<Props>(), {
  colorMode: 'global'
});

const id = Math.random().toString(36).substring(7);
const emit = defineEmits<{
  (e: 'update:modelValue', value: [number, number]): void;
  (e: 'segmentClick', segment: Segment): void;
}>();

const { dataVector } = toRefs(props);
const { segments } = useTimelineLogic(dataVector);

const containerRef = ref<HTMLElement | null>(null);
const dragMode = ref<'none' | 'move' | 'jump' | 'resize-left' | 'resize-right'>('none');
const startX = ref(0);
const hasMoved = ref(false);
const startRange = ref<[number, number]>([0, 0]);
const MIN_RANGE_SIZE = 1;
const DRAG_THRESHOLD = 3;

const sliderStyle = computed(() => {
  const total = props.dataVector.length;
  if (total === 0) return { display: 'none' };
  const left = (props.modelValue[0] / total) * 100;
  const width = ((props.modelValue[1] - props.modelValue[0]) / total) * 100;
  return { left: `${left}%`, width: `${width}%` };
});

const handleSegmentClick = (segment: Segment) => {
  emit('update:modelValue', [segment.start, segment.end]);
  emit('segmentClick', segment);
};

// Use the perceptually-uniform CIELAB visit-intensity LUT — the
// same gradient that drives the move-suggestion overlay and the
// BoardTab analysis-meter rugplot. The previous categorical
// mapping (sky-400 / amber-400 / slate-400 by threshold) was a
// long-standing visual bug in this band-1 component; replacing
// it puts the rug-plot here visually consistent with the rest of
// the app's analysis-depth signalling. Zero values render
// transparent so unanalyzed gaps show through honestly (matches
// BoardTab's `visits === 0 → transparent` discipline).
const getColor = (value: number): string => {
  if (value <= 0) return 'transparent';
  return getIntensityColorLinear.value(Math.min(1, value), 1);
};

const normalizeValue = (val: number, segment: Segment) => {
  if (props.colorMode === 'segment-normalized') {
    const range = segment.stats.max - segment.stats.min;
    return range === 0 ? 1 : (val - segment.stats.min) / range;
  }
  return val;
};

const getSampledValues = (values: number[]) => {
  const maxStops = 20;
  if (values.length <= maxStops) return values;
  const result = [];
  const step = (values.length - 1) / (maxStops - 1);
  for (let i = 0; i < maxStops; i++) {
    result.push(values[Math.round(i * step)]);
  }
  return result;
};

/**
 * Empirical-CDF midrank quantile of `val` within `sortedAsc`.
 *
 * Midrank-for-ties means a run of k equal values centred at sorted
 * indices [i, i+k) maps to position (i + (k-1)/2) / (n-1) — averaged,
 * so all tied values get the same quantile and they collectively
 * occupy the rank-position interval they would have if untied. The
 * midrank choice is standard for the empirical CDF; it's symmetric
 * (no left/right bias on ties) and produces a continuous gradient
 * when tied groups are small relative to n.
 *
 * Degenerate cases: n=0 returns 1 (no signal — render at max), n=1
 * returns 1 (single point — render at max so the lone segment is
 * visible rather than blank).
 *
 * Cost: O(n) per call; we call it once per sampled stop (≤20) per
 * segment, so total work is O(n × maxStops) ≈ 20n per segment,
 * which is well below the per-frame budget for any realistic
 * visit-vector length.
 */
const quantileOf = (val: number, sortedAsc: number[]): number => {
  const n = sortedAsc.length;
  if (n <= 1) return 1;
  let lt = 0, eq = 0;
  for (const x of sortedAsc) {
    if (x < val) lt++;
    else if (x === val) eq++;
  }
  if (eq === 0) {
    return lt / (n - 1);
  }
  // Midrank of the equal-run: ((lt) + (lt + eq - 1)) / 2 / (n - 1).
  return (lt + (eq - 1) / 2) / (n - 1);
};

// FIX: Safely compute gradient stops to prevent NaN% in the SVG
const processedSegments = computed(() => {
  return segments.value.map(segment => {
    const sampled = getSampledValues(segment.values);
    // For the quantile color mode, precompute the segment's sorted
    // values once; each sampled stop then resolves via quantileOf.
    const sortedAsc =
      props.colorMode === 'quantile'
        ? [...segment.values].sort((a, b) => a - b)
        : null;
    const stops = sampled.map((val, idx) => {
      // Guard against division by zero
      const offset = sampled.length <= 1
        ? '0%'
        : `${(idx / (sampled.length - 1)) * 100}%`;

      const normalised = sortedAsc !== null
        ? quantileOf(val, sortedAsc)
        : normalizeValue(val, segment);
      const color = getColor(normalised);
      return { offset, color };
    });
    return { ...segment, stops };
  });
});

const getIndexFromEvent = (e: MouseEvent | TouchEvent) => {
  if (!containerRef.value) return 0;
  const rect = containerRef.value.getBoundingClientRect();
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return percentage * props.dataVector.length;
};

const onContainerMouseDown = (e: MouseEvent | TouchEvent) => {
  dragMode.value = 'jump';
  const targetIndex = getIndexFromEvent(e);
  const width = props.modelValue[1] - props.modelValue[0];
  let newStart = targetIndex - width / 2;
  let newEnd = targetIndex + width / 2;

  if (newStart < 0) { newStart = 0; newEnd = width; }
  if (newEnd > props.dataVector.length) { newEnd = props.dataVector.length; newStart = props.dataVector.length - width; }

  emit('update:modelValue', [newStart, newEnd]);
  startX.value = 'touches' in e ? e.touches[0].clientX : e.clientX;
  startRange.value = [newStart, newEnd];
  attachListeners();
};

const onSliderMouseDown = (e: MouseEvent | TouchEvent) => {
  dragMode.value = 'move';
  hasMoved.value = false;
  startX.value = 'touches' in e ? e.touches[0].clientX : e.clientX;
  startRange.value = [...props.modelValue];
  attachListeners();
};

const onHandleMouseDown = (e: MouseEvent | TouchEvent, type: 'left' | 'right') => {
  dragMode.value = type === 'left' ? 'resize-left' : 'resize-right';
  hasMoved.value = true;
  startX.value = 'touches' in e ? e.touches[0].clientX : e.clientX;
  startRange.value = [...props.modelValue];
  attachListeners();
};

const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
  if (dragMode.value === 'none' || !containerRef.value) return;
  const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  const deltaX = currentX - startX.value;

  if (!hasMoved.value && Math.abs(deltaX) > DRAG_THRESHOLD) {
    hasMoved.value = true;
  }

  if (!hasMoved.value) return;

  const rect = containerRef.value.getBoundingClientRect();
  const deltaIndex = (deltaX / rect.width) * props.dataVector.length;
  
  let [newStart, newEnd] = [...props.modelValue];

  if (dragMode.value === 'move' || dragMode.value === 'jump') {
    const width = startRange.value[1] - startRange.value[0];
    newStart = Math.max(0, Math.min(props.dataVector.length - width, startRange.value[0] + deltaIndex));
    newEnd = newStart + width;
  } else if (dragMode.value === 'resize-left') {
    newStart = Math.max(0, Math.min(startRange.value[0] + deltaIndex, startRange.value[1] - MIN_RANGE_SIZE));
  } else if (dragMode.value === 'resize-right') {
    newEnd = Math.max(startRange.value[0] + MIN_RANGE_SIZE, Math.min(props.dataVector.length, startRange.value[1] + deltaIndex));
  }
  
  emit('update:modelValue', [newStart, newEnd]);
};

// `e` is now optional. Two call modes:
//   - As an event handler (mouseup/touchend): `e` is provided; the
//     click-vs-drag detection branch runs to fire a segment click if
//     the user pressed-and-released without moving.
//   - As a cleanup (onUnmounted): no `e`; only the listener-removal
//     and dragMode-reset run. The component is being torn down; there
//     is no segment click to detect.
// This is the only intentional change from the pre-Commit-1b file
// shape: making `e` optional aligns the type signature with both
// call modes honestly. The previous version's `(e: MouseEvent | TouchEvent)`
// signature lied about the cleanup-call mode; strict mode (vue-tsc -b)
// flagged this as a TS2554 error.
const stopDragging = (e?: MouseEvent | TouchEvent) => {
  if (e && !hasMoved.value && dragMode.value === 'move') {
    const index = getIndexFromEvent(e);
    const segment = segments.value.find(s => index >= s.start && index <= s.end);
    if (segment) handleSegmentClick(segment);
  }

  dragMode.value = 'none';
  window.removeEventListener('mousemove', handleGlobalMove);
  window.removeEventListener('touchmove', handleGlobalMove);
  window.removeEventListener('mouseup', stopDragging);
  window.removeEventListener('touchend', stopDragging);
};

const attachListeners = () => {
  window.addEventListener('mousemove', handleGlobalMove);
  window.addEventListener('touchmove', handleGlobalMove);
  window.addEventListener('mouseup', stopDragging);
  window.addEventListener('touchend', stopDragging);
};

onUnmounted(() => stopDragging());
</script>

<style scoped>
/* theme-exception: chrome (slate-950 background, slate-700 border,
   slate-400 grid lines, sky-400 alpha-modulated selection slider,
   pink-200 handle bar) is preserved as a deliberate Tailwind-style
   palette for this band-1 visualizer. The earlier rationale (chrome
   "co-tuned" with the categorical Tailwind data colors) is retired
   — the data gradient now uses the perceptually-uniform CIELAB LUT
   that the rest of the app uses for analysis-depth signalling, see
   the script's `getColor`. The chrome's slate aesthetic stands on
   its own; whether to sweep it to the chrome substrate is a
   separate UX decision (would lose the slate tint for grayscale
   surface anchors). */
.timeline-container {
  position: relative;
  width: 100%;
  height: 16px;
  background-color: #020617;
  overflow: hidden;
  user-select: none;
  cursor: crosshair;
  border: 1px solid #1e293b;
  border-radius: var(--radius-default);
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}

.grid-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.1;
  display: flex;
}

.grid-line {
  height: 100%;
  width: 1px;
  background-color: #94a3b8;
  position: absolute;
}

.data-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.segment-rect {
  cursor: pointer;
  pointer-events: auto;
  transition: filter var(--duration-default);
}

.segment-rect:hover {
  filter: brightness(1.25);
}

.selection-slider {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid rgba(56, 189, 248, 0.5);
  border-right: 1px solid rgba(56, 189, 248, 0.5);
  background-color: rgba(56, 189, 248, 0.1);
  backdrop-filter: blur(1px);
  pointer-events: auto;
  cursor: grab;
  transition: background-color var(--duration-default);
}

.selection-slider:active {
  cursor: grabbing;
}

.timeline-container:hover .selection-slider {
  background-color: rgba(56, 189, 248, 0.2);
}

.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 16px;
  cursor: ew-resize;
  z-index: var(--z-popover);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.handle-left { left: -8px; }
.handle-right { right: -8px; }

/* magic-literal: 9999px is the canonical "max-out radius" pill-shape
   trick — any value larger than half the element's longest dimension
   produces fully-rounded ends. Substrate's --radius-circle (50%) would
   require knowing the element's aspect; the pill idiom is dimension-
   agnostic. */
.handle-bar {
  height: 12px;
  width: 4px;
  background-color: #f8bdf8;
  border-radius: 9999px;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.8);
}
</style>
