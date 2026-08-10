/**
 * tests/integration/state/layout-model-deferred.test.ts
 *
 * `useDeferredLayoutClass` (src/state/layout-model.ts, resolution-
 * roadmap Phase 1) is real Vue reactivity (`ref`/`watch`) over plain
 * width/height refs — App.vue feeds it `useResizablePanel.ts`'s own
 * `rowWidthPx`/`rowHeightPx` (the SAME ResizeObserver-cached geometry
 * the board-area-cap and restore-time clamps already read), so this
 * composable itself owns no ResizeObserver and needs none faked here
 * (contrast `useDeferredContainerBreakpoint.test.ts`, which does fake
 * one — that composable owns its own observer).
 *
 * Mirrors `useDeferredContainerBreakpoint.test.ts`'s three concerns:
 * live (non-dragging) commits, hysteresis at the hand-off boundary, and
 * deferred-to-drag-release commits — applied to the axis facet of
 * `LayoutClass` instead of a boolean narrow/wide flag.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import { useDeferredLayoutClass, AXIS_ASPECT_RATIO_THRESHOLD } from '../../../src/state/layout-model';

describe('useDeferredLayoutClass — live behavior (no isDragging ref supplied)', () => {
  it('commits the initial geometry synchronously (immediate watch)', () => {
    const widthPx = ref(1920);
    const heightPx = ref(1080);
    const layoutClass = useDeferredLayoutClass(widthPx, heightPx);
    expect(layoutClass.value).toEqual({ axis: 'row', width: 'wide' }); // WIDTH_CLASS_MAX_PX.wide === 1920, inclusive
  });

  it('flips axis to column as the ref geometry crosses well below the aspect-ratio threshold', async () => {
    const widthPx = ref(1920);
    const heightPx = ref(1080);
    const layoutClass = useDeferredLayoutClass(widthPx, heightPx);
    expect(layoutClass.value.axis).toBe('row');

    widthPx.value = 700;
    heightPx.value = 1400; // ratio 0.5, well below threshold - hysteresis/2
    await nextTick();

    expect(layoutClass.value.axis).toBe('column');
  });

  it('flips back to row as the ratio rises well above threshold + hysteresis/2', async () => {
    const widthPx = ref(700);
    const heightPx = ref(1400);
    const layoutClass = useDeferredLayoutClass(widthPx, heightPx);
    expect(layoutClass.value.axis).toBe('column');

    widthPx.value = 1920;
    heightPx.value = 1080;
    await nextTick();

    expect(layoutClass.value.axis).toBe('row');
  });

  it('does not flap within the hysteresis band once committed column', async () => {
    const widthPx = ref(700);
    const heightPx = ref(1400); // ratio 0.5 — column
    const layoutClass = useDeferredLayoutClass(widthPx, heightPx);
    expect(layoutClass.value.axis).toBe('column');

    // A ratio just inside the band above the raw threshold but below
    // the exit boundary must stay column (entered from the column
    // side).
    const bandRatio = AXIS_ASPECT_RATIO_THRESHOLD + 0.01;
    widthPx.value = Math.round(bandRatio * 1000);
    heightPx.value = 1000;
    await nextTick();

    expect(layoutClass.value.axis).toBe('column');
  });

  it('width class updates alongside axis as the width ref changes', async () => {
    const widthPx = ref(400);
    const heightPx = ref(300);
    const layoutClass = useDeferredLayoutClass(widthPx, heightPx);
    expect(layoutClass.value.width).toBe('compact');

    widthPx.value = 2400;
    heightPx.value = 1200;
    await nextTick();

    expect(layoutClass.value.width).toBe('vast');
  });
});

describe('useDeferredLayoutClass — deferred to drag release (mirrors useDeferredContainerBreakpoint)', () => {
  it('does NOT commit an axis flip while isDragging is true, even as the ratio sweeps through the threshold', async () => {
    const widthPx = ref(1920);
    const heightPx = ref(1080);
    const isDragging = ref(false);
    const layoutClass = useDeferredLayoutClass(widthPx, heightPx, isDragging);
    expect(layoutClass.value.axis).toBe('row');

    isDragging.value = true;
    await nextTick();

    widthPx.value = 1000;
    heightPx.value = 1000;
    await nextTick();
    widthPx.value = 700;
    heightPx.value = 1400;
    await nextTick();

    // Frozen at the pre-drag axis the whole time.
    expect(layoutClass.value.axis).toBe('row');
  });

  it('commits the final live axis exactly once, immediately on drag release', async () => {
    const widthPx = ref(1920);
    const heightPx = ref(1080);
    const isDragging = ref(false);
    const layoutClass = useDeferredLayoutClass(widthPx, heightPx, isDragging);

    isDragging.value = true;
    await nextTick();
    widthPx.value = 700;
    heightPx.value = 1400; // ends the drag well inside column territory
    await nextTick();
    expect(layoutClass.value.axis).toBe('row'); // still frozen

    isDragging.value = false;
    await nextTick();

    expect(layoutClass.value.axis).toBe('column');
  });

  it('a drag that starts and ends on the SAME side of the threshold commits no change', async () => {
    const widthPx = ref(1920);
    const heightPx = ref(1080);
    const isDragging = ref(false);
    const layoutClass = useDeferredLayoutClass(widthPx, heightPx, isDragging);
    expect(layoutClass.value.axis).toBe('row');

    isDragging.value = true;
    await nextTick();
    widthPx.value = 1400;
    heightPx.value = 1000;
    await nextTick();
    widthPx.value = 1600;
    heightPx.value = 1000;
    await nextTick();
    isDragging.value = false;
    await nextTick();

    expect(layoutClass.value.axis).toBe('row');
  });
});
