/**
 * tests/unit/useFixedAnchoredPopover.test.ts
 *
 * Commission lyt-popover-clip-class: the composable's own unit tests,
 * per the commission's item 4 ("port the shape of the existing 7
 * tests" — `ToolbarSliderPopover-scroll-anchor.test.ts`, the D1
 * regression witness for the implementation this composable was
 * extracted from). This file exercises the composable directly
 * (`withSetup`, since it registers `onUnmounted` and needs a real
 * component instance — see `tests/CLAUDE.md`'s "Composable lifecycle
 * in integration tests" gotcha) rather than through a consuming SFC,
 * so it covers the geometry/clamp math and the listener lifecycle
 * once, for all three (eventual) consumers, instead of duplicating
 * the same assertions per consumer.
 *
 * Filed under `tests/unit/` rather than `tests/integration/` even
 * though it uses `withSetup` (a DOM/lifecycle harness): the subject
 * is pure geometry arithmetic over stubbed `getBoundingClientRect`
 * values plus a listener-lifecycle state machine, with no store, no
 * navigator, no i18n, no service fakes — the "Tier 1 vs Tier 2"
 * boundary in `tests/CLAUDE.md` is about what the subject touches,
 * and this subject touches only the DOM/window primitives Vitest's
 * jsdom environment already provides.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick, ref, type App } from 'vue';
import { onTestFinished } from 'vitest';
import {
  useFixedAnchoredPopover,
  type UseFixedAnchoredPopoverOptions,
} from '../../src/composables/chrome/useFixedAnchoredPopover';

// Local variant of tests/integration/with-setup.ts's `withSetup` that
// also hands back the `App` handle, so the "unmount while still open"
// test (below) can call `app.unmount()` explicitly mid-test rather
// than only at test-finish (the shared helper's `onTestFinished`-only
// unmount can't be triggered early). Still registers the SAME
// failure-safe `onTestFinished` unmount as a backstop, so a test that
// throws before its own explicit unmount doesn't leak the instance.
function withSetupAndApp<T>(composable: () => T): { result: T; app: App } {
  let result!: T;
  const app: App = createApp({
    setup() {
      result = composable();
      return () => null;
    },
  });
  app.mount(document.createElement('div'));
  onTestFinished(() => {
    try {
      app.unmount();
    } catch {
      // Already unmounted by the test itself — the backstop is a
      // no-op in that (expected) case.
    }
  });
  return { result, app };
}

function stubbedElement(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = vi.fn(() => ({
    top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect));
  return el;
}

function setViewport(width: number, height: number): void {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mountComposable(options: UseFixedAnchoredPopoverOptions) {
  const open = ref(false);
  const trigger = stubbedElement({ top: 100, left: 500, right: 600, bottom: 120, width: 100, height: 20 });
  const popover = stubbedElement({ top: 0, left: 0, right: 0, bottom: 0, width: 200, height: 150 });
  const triggerEl = ref<HTMLElement | null>(trigger);
  const popoverEl = ref<HTMLElement | null>(popover);
  const { result, app } = withSetupAndApp(() =>
    useFixedAnchoredPopover(open, triggerEl, popoverEl, options),
  );
  return { open, trigger, popover, triggerEl, popoverEl, handle: result, app };
}

describe('useFixedAnchoredPopover — geometry', () => {
  it('align "right": left edge = trigger.right - popover.width, top = trigger.bottom', async () => {
    setViewport(1400, 900);
    const { open, handle } = mountComposable({ align: 'right' });
    open.value = true;
    await nextTick(); // composable's internal watch awaits nextTick before the first recompute
    await nextTick();
    // trigger.right=600, popover.width=200 -> left=400; trigger.bottom=120 -> top=120
    expect(handle.style.value).toEqual({ top: '120px', left: '400px' });
  });

  it('align "left": left edge = trigger.left', async () => {
    setViewport(1400, 900);
    const { open, handle } = mountComposable({ align: 'left' });
    open.value = true;
    await nextTick();
    await nextTick();
    // trigger.left=500 -> left=500; top unchanged (120)
    expect(handle.style.value).toEqual({ top: '120px', left: '500px' });
  });

  it('clamps left against the viewport left edge (4px default margin)', async () => {
    setViewport(1400, 900);
    const open = ref(false);
    // Trigger near the left edge so a right-aligned wide popover would push left of 0.
    const trigger = stubbedElement({ top: 100, left: 10, right: 60, bottom: 120, width: 50, height: 20 });
    const popover = stubbedElement({ width: 300, height: 100 });
    const triggerEl = ref<HTMLElement | null>(trigger);
    const popoverEl = ref<HTMLElement | null>(popover);
    const { result: handle } = withSetupAndApp(() =>
      useFixedAnchoredPopover(open, triggerEl, popoverEl, { align: 'right' }),
    );
    open.value = true;
    await nextTick();
    await nextTick();
    // Unclamped left would be 60 - 300 = -240; clamp floors it at the 4px margin.
    expect(handle.style.value.left).toBe('4px');
  });

  it('clamps left against the viewport right edge', async () => {
    setViewport(400, 900);
    const open = ref(false);
    const trigger = stubbedElement({ top: 100, left: 350, right: 390, bottom: 120, width: 40, height: 20 });
    const popover = stubbedElement({ width: 300, height: 100 });
    const triggerEl = ref<HTMLElement | null>(trigger);
    const popoverEl = ref<HTMLElement | null>(popover);
    const { result: handle } = withSetupAndApp(() =>
      useFixedAnchoredPopover(open, triggerEl, popoverEl, { align: 'left' }),
    );
    open.value = true;
    await nextTick();
    await nextTick();
    // Unclamped left (align: left) = 350; 350 + 300 = 650 > 400 - 4, so it clamps to 400-4-300 = 96.
    expect(handle.style.value.left).toBe('96px');
  });

  it('clamps top against the viewport bottom edge', async () => {
    setViewport(1400, 200);
    const open = ref(false);
    const trigger = stubbedElement({ top: 150, left: 500, right: 600, bottom: 180, width: 100, height: 30 });
    const popover = stubbedElement({ width: 200, height: 150 });
    const triggerEl = ref<HTMLElement | null>(trigger);
    const popoverEl = ref<HTMLElement | null>(popover);
    const { result: handle } = withSetupAndApp(() =>
      useFixedAnchoredPopover(open, triggerEl, popoverEl, { align: 'right' }),
    );
    open.value = true;
    await nextTick();
    await nextTick();
    // Unclamped top = 180; 180 + 150 = 330 > 200 - 4, so it clamps to max(4, 200-4-150) = 46.
    expect(handle.style.value.top).toBe('46px');
  });

  it('respects a custom viewportMarginPx', async () => {
    setViewport(400, 900);
    const open = ref(false);
    const trigger = stubbedElement({ top: 100, left: 350, right: 390, bottom: 120, width: 40, height: 20 });
    const popover = stubbedElement({ width: 300, height: 100 });
    const triggerEl = ref<HTMLElement | null>(trigger);
    const popoverEl = ref<HTMLElement | null>(popover);
    const { result: handle } = withSetupAndApp(() =>
      useFixedAnchoredPopover(open, triggerEl, popoverEl, { align: 'left', viewportMarginPx: 20 }),
    );
    open.value = true;
    await nextTick();
    await nextTick();
    // 400 - 20 - 300 = 80, vs the 4px-margin case's 96.
    expect(handle.style.value.left).toBe('80px');
  });
});

describe('useFixedAnchoredPopover — listener lifecycle (resource-ownership-at-mutation-sites)', () => {
  it('registers a capture-phase window scroll listener and a passive window resize listener on open', async () => {
    setViewport(1400, 900);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { open } = mountComposable({ align: 'right' });
    open.value = true;
    await nextTick();
    await nextTick();

    const scrollCall = addSpy.mock.calls.find(([type]) => type === 'scroll');
    expect(scrollCall).toBeDefined();
    expect(scrollCall![2]).toMatchObject({ capture: true, passive: true });

    const resizeCall = addSpy.mock.calls.find(([type]) => type === 'resize');
    expect(resizeCall).toBeDefined();
    expect(resizeCall![2]).toMatchObject({ passive: true });
  });

  it('releases both listeners when open flips false', async () => {
    setViewport(1400, 900);
    const { open } = mountComposable({ align: 'right' });
    open.value = true;
    await nextTick();
    await nextTick();

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    open.value = false;
    await nextTick();

    expect(removeSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    expect(removeSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);
  });

  it('releases both listeners on unmount while still open', async () => {
    setViewport(1400, 900);
    const open = ref(false);
    const trigger = stubbedElement({ top: 100, left: 500, right: 600, bottom: 120, width: 100, height: 20 });
    const popover = stubbedElement({ width: 200, height: 150 });
    const triggerEl = ref<HTMLElement | null>(trigger);
    const popoverEl = ref<HTMLElement | null>(popover);
    const { app } = withSetupAndApp(() =>
      useFixedAnchoredPopover(open, triggerEl, popoverEl, { align: 'right' }),
    );
    open.value = true;
    await nextTick();
    await nextTick();

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    app.unmount(); // no watch(open,...) transition fires — only onUnmounted

    expect(removeSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    expect(removeSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);
  });

  it('does not stack a second listener pair across repeated open/close cycles (idempotence)', async () => {
    setViewport(1400, 900);
    const { open } = mountComposable({ align: 'right' });
    const addSpy = vi.spyOn(window, 'addEventListener');

    open.value = true;
    await nextTick();
    await nextTick();
    open.value = false;
    await nextTick();
    open.value = true;
    await nextTick();
    await nextTick();

    const scrollRegistrations = addSpy.mock.calls.filter(([type]) => type === 'scroll');
    expect(scrollRegistrations.length).toBe(2); // one per open cycle, not accumulating within a cycle
  });

  it('recomputes style (via getBoundingClientRect) when the registered scroll handler fires', async () => {
    setViewport(1400, 900);
    const { open, trigger, popover } = mountComposable({ align: 'right' });
    open.value = true;
    await nextTick();
    await nextTick();

    const triggerRectSpy = trigger.getBoundingClientRect as ReturnType<typeof vi.fn>;
    const popoverRectSpy = popover.getBoundingClientRect as ReturnType<typeof vi.fn>;
    const callsBefore = triggerRectSpy.mock.calls.length + popoverRectSpy.mock.calls.length;

    window.dispatchEvent(new Event('scroll'));
    await nextTick();

    const callsAfter = triggerRectSpy.mock.calls.length + popoverRectSpy.mock.calls.length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });
});
