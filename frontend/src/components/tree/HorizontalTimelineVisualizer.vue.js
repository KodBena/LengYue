/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, watch, onMounted, onUnmounted, toRefs } from 'vue';
import { useTimelineLogic } from '../../composables/analysis/useTimelineLogic';
import { getIntensityColorLinear } from '../../engine/suggestion-colors';
const props = withDefaults(defineProps(), {
    colorMode: 'global'
});
const emit = defineEmits();
const { dataVector } = toRefs(props);
const { segments } = useTimelineLogic(dataVector);
const containerRef = ref(null);
const dragMode = ref('none');
const startX = ref(0);
const hasMoved = ref(false);
const startRange = ref([0, 0]);
const MIN_RANGE_SIZE = 1;
const DRAG_THRESHOLD = 3;
const sliderStyle = computed(() => {
    const total = props.dataVector.length;
    if (total === 0)
        return { display: 'none' };
    const left = (props.modelValue[0] / total) * 100;
    const width = ((props.modelValue[1] - props.modelValue[0]) / total) * 100;
    return { left: `${left}%`, width: `${width}%` };
});
const handleSegmentClick = (segment) => {
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
const getColor = (value) => {
    if (value <= 0)
        return 'transparent';
    return getIntensityColorLinear.value(Math.min(1, value), 1);
};
const normalizeValue = (val, segment) => {
    if (props.colorMode === 'segment-normalized') {
        const range = segment.stats.max - segment.stats.min;
        return range === 0 ? 1 : (val - segment.stats.min) / range;
    }
    return val;
};
// Render every position in the segment as a gradient stop. The
// pre-v1.0.20 shape capped this at maxStops=20, which under-sampled
// any segment longer than 20 turns — adjacent stops were linearly
// interpolated in RGB by the SVG renderer, so a heavily-pondered
// outlier turn between two low-visit neighbours could be rendered
// as merely the interpolated midpoint of the two, making the
// outlier visually invisible. The same rationale that produced
// the v1.0.20 quantile color-mode (no parametric squashing of the
// distribution onto a min-max axis) applies to spatial sampling:
// the SVG renderer handles many gradient stops fine — browsers
// rasterise the gradient once and the per-stop cost is negligible
// — so the right move is to remove the cap and let every turn
// contribute its own stop. Caller's responsibility to keep
// segment lengths reasonable; in practice they're bounded by
// Go game lengths (well under 10^3 turns for any realistic game
// and well within the renderer's headroom).
const getSampledValues = (values) => values;
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
const quantileOf = (val, sortedAsc) => {
    const n = sortedAsc.length;
    if (n <= 1)
        return 1;
    let lt = 0, eq = 0;
    for (const x of sortedAsc) {
        if (x < val)
            lt++;
        else if (x === val)
            eq++;
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
        const sortedAsc = props.colorMode === 'quantile'
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
// ── Canvas data-track rendering ───────────────────────────────────────────
// processedSegments is consumed only here (imperatively), not in the
// template, so analysis-driven data updates redraw the canvas without
// re-rendering the component. Backing store sized to clientWidth×dpr, cached
// from a ResizeObserver (no forced reflow on the draw path). Each segment is
// one fillRect — either a flat colour (aggregate mode) or a horizontal
// linear-gradient whose stops reproduce the prior per-turn SVG stops.
const dataCanvas = ref(null);
let trackW = 0;
let trackH = 0;
let trackResizeObs = null;
function drawTrack() {
    const canvas = dataCanvas.value;
    if (!canvas || trackW === 0 || trackH === 0)
        return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(trackW * dpr));
    const bh = Math.max(1, Math.round(trackH * dpr));
    if (canvas.width !== bw)
        canvas.width = bw;
    if (canvas.height !== bh)
        canvas.height = bh;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    ctx.clearRect(0, 0, bw, bh); // transparent turns → CSS background shows through
    const total = props.dataVector.length;
    if (total === 0)
        return;
    for (const segment of processedSegments.value) {
        const x0 = (segment.start / total) * bw;
        const x1 = ((segment.end + 1) / total) * bw;
        if (x1 <= x0)
            continue;
        if (props.colorMode === 'aggregate') {
            const color = getColor(segment.stats.mean);
            if (color === 'transparent')
                continue;
            ctx.fillStyle = color;
        }
        else {
            const grad = ctx.createLinearGradient(x0, 0, x1, 0);
            const stops = segment.stops;
            const n = stops.length;
            for (let i = 0; i < n; i++) {
                const off = n <= 1 ? 0 : i / (n - 1);
                grad.addColorStop(off, stops[i].color);
            }
            ctx.fillStyle = grad;
        }
        ctx.fillRect(x0, 0, x1 - x0, bh);
    }
}
// Click a data segment → select its range (reproduces the per-rect mousedown).
const onDataMouseDown = (e) => {
    const idx = getIndexFromEvent(e);
    const segment = segments.value.find(s => idx >= s.start && idx <= s.end);
    if (segment)
        handleSegmentClick(segment);
};
onMounted(() => {
    const canvas = dataCanvas.value;
    if (!canvas)
        return;
    trackResizeObs = new ResizeObserver(() => {
        trackW = canvas.clientWidth;
        trackH = canvas.clientHeight;
        drawTrack();
    });
    trackResizeObs.observe(canvas);
    trackW = canvas.clientWidth;
    trackH = canvas.clientHeight;
    drawTrack();
});
watch(processedSegments, drawTrack);
const getIndexFromEvent = (e) => {
    if (!containerRef.value)
        return 0;
    const rect = containerRef.value.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percentage * props.dataVector.length;
};
const onContainerMouseDown = (e) => {
    dragMode.value = 'jump';
    const targetIndex = getIndexFromEvent(e);
    const width = props.modelValue[1] - props.modelValue[0];
    let newStart = targetIndex - width / 2;
    let newEnd = targetIndex + width / 2;
    if (newStart < 0) {
        newStart = 0;
        newEnd = width;
    }
    if (newEnd > props.dataVector.length) {
        newEnd = props.dataVector.length;
        newStart = props.dataVector.length - width;
    }
    emit('update:modelValue', [newStart, newEnd]);
    startX.value = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startRange.value = [newStart, newEnd];
    attachListeners();
};
const onSliderMouseDown = (e) => {
    dragMode.value = 'move';
    hasMoved.value = false;
    startX.value = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startRange.value = [...props.modelValue];
    attachListeners();
};
const onHandleMouseDown = (e, type) => {
    dragMode.value = type === 'left' ? 'resize-left' : 'resize-right';
    hasMoved.value = true;
    startX.value = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startRange.value = [...props.modelValue];
    attachListeners();
};
const handleGlobalMove = (e) => {
    if (dragMode.value === 'none' || !containerRef.value)
        return;
    const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const deltaX = currentX - startX.value;
    if (!hasMoved.value && Math.abs(deltaX) > DRAG_THRESHOLD) {
        hasMoved.value = true;
    }
    if (!hasMoved.value)
        return;
    const rect = containerRef.value.getBoundingClientRect();
    const deltaIndex = (deltaX / rect.width) * props.dataVector.length;
    let [newStart, newEnd] = [...props.modelValue];
    if (dragMode.value === 'move' || dragMode.value === 'jump') {
        const width = startRange.value[1] - startRange.value[0];
        newStart = Math.max(0, Math.min(props.dataVector.length - width, startRange.value[0] + deltaIndex));
        newEnd = newStart + width;
    }
    else if (dragMode.value === 'resize-left') {
        newStart = Math.max(0, Math.min(startRange.value[0] + deltaIndex, startRange.value[1] - MIN_RANGE_SIZE));
    }
    else if (dragMode.value === 'resize-right') {
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
const stopDragging = (e) => {
    if (e && !hasMoved.value && dragMode.value === 'move') {
        const index = getIndexFromEvent(e);
        const segment = segments.value.find(s => index >= s.start && index <= s.end);
        if (segment)
            handleSegmentClick(segment);
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
onUnmounted(() => {
    stopDragging();
    trackResizeObs?.disconnect();
    trackResizeObs = null;
});
const __VLS_defaults = {
    colorMode: 'global'
};
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['selection-slider']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-container']} */ ;
/** @type {__VLS_StyleScopedClasses['selection-slider']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onMousedown: (__VLS_ctx.onContainerMouseDown) },
    ...{ onTouchstart: (__VLS_ctx.onContainerMouseDown) },
    ref: "containerRef",
    ...{ class: "timeline-container" },
});
/** @type {__VLS_StyleScopedClasses['timeline-container']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "grid-lines" },
});
/** @type {__VLS_StyleScopedClasses['grid-lines']} */ ;
for (const [i] of __VLS_vFor((10))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (i),
        ...{ class: "grid-line" },
        ...{ style: ({ left: `${i * 10}%` }) },
    });
    /** @type {__VLS_StyleScopedClasses['grid-line']} */ ;
    // @ts-ignore
    [onContainerMouseDown, onContainerMouseDown,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.canvas, __VLS_intrinsics.canvas)({
    ...{ onMousedown: (__VLS_ctx.onDataMouseDown) },
    ...{ onTouchstart: (__VLS_ctx.onDataMouseDown) },
    ref: "dataCanvas",
    ...{ class: "data-svg" },
});
/** @type {__VLS_StyleScopedClasses['data-svg']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onMousedown: (__VLS_ctx.onSliderMouseDown) },
    ...{ onTouchstart: (__VLS_ctx.onSliderMouseDown) },
    ...{ class: "selection-slider" },
    ...{ style: (__VLS_ctx.sliderStyle) },
});
/** @type {__VLS_StyleScopedClasses['selection-slider']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onMousedown: (...[$event]) => {
            __VLS_ctx.onHandleMouseDown($event, 'left');
            // @ts-ignore
            [onDataMouseDown, onDataMouseDown, onSliderMouseDown, onSliderMouseDown, sliderStyle, onHandleMouseDown,];
        } },
    ...{ onTouchstart: (...[$event]) => {
            __VLS_ctx.onHandleMouseDown($event, 'left');
            // @ts-ignore
            [onHandleMouseDown,];
        } },
    ...{ class: "handle handle-left" },
});
/** @type {__VLS_StyleScopedClasses['handle']} */ ;
/** @type {__VLS_StyleScopedClasses['handle-left']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "handle-bar" },
});
/** @type {__VLS_StyleScopedClasses['handle-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onMousedown: (...[$event]) => {
            __VLS_ctx.onHandleMouseDown($event, 'right');
            // @ts-ignore
            [onHandleMouseDown,];
        } },
    ...{ onTouchstart: (...[$event]) => {
            __VLS_ctx.onHandleMouseDown($event, 'right');
            // @ts-ignore
            [onHandleMouseDown,];
        } },
    ...{ class: "handle handle-right" },
});
/** @type {__VLS_StyleScopedClasses['handle']} */ ;
/** @type {__VLS_StyleScopedClasses['handle-right']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "handle-bar" },
});
/** @type {__VLS_StyleScopedClasses['handle-bar']} */ ;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
