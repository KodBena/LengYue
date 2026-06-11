/**
 * tests/integration/FloatingThumbnail.seam.test.ts
 *
 * Pins the FloatingThumbnail SEAM contract — the invariants PR #365
 * established at runtime (Playwright) and the render-lifecycle
 * consolidation extended with the derived-snapshot content contract.
 * This mounts a component, but it is the narrow-exception genre
 * (tests/CLAUDE.md): the assertions are on the seam's arbitration
 * behaviour (visibility gating, stranding backstops, async-resurrection
 * immunity), not on template output — FloatingThumbnail is not a thin
 * renderer; it owns visibility arbitration for every host.
 *
 * Invariants pinned:
 *   - show() is SYNCHRONOUS: the visible gate is set before any async
 *     work can interleave; content derives from a host accessor invoked
 *     in this leaf's own render scope.
 *   - a cache-miss accessor paints an empty frame that FILLS reactively
 *     when the source warms — without a second show();
 *   - a warm landing after hide() cannot RESURRECT the thumbnail (the
 *     #365 invariant, uniform across both hover surfaces);
 *   - the 80px anchor-radius backstop hides on pointer movement beyond
 *     the radius and holds within it (the lost-mouseleave net);
 *   - the scroll / blur stranding watchers hide a visible thumbnail;
 *   - show()-time viewport clamping keeps the box on screen;
 *   - unmount releases the document/window watchers (resource ownership).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, onTestFinished } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import FloatingThumbnail from '../../src/components/chrome/FloatingThumbnail.vue';
import type { BoardSnapshot } from '../../src/engine/board-geometry';

interface ThumbHandle {
  show: (source: () => BoardSnapshot | null, x: number, y: number) => void;
  hide: () => void;
}

function snap(): BoardSnapshot {
  return { size: 9, stones: { '2,2': 'B', '3,3': 'W' }, lastMove: null };
}

function mountThumb() {
  const wrapper = mount(FloatingThumbnail);
  // Failure-safe teardown (tests/CLAUDE.md): unmount runs on pass AND fail,
  // so the document-level watchers a failing test leaves bound are released.
  onTestFinished(() => wrapper.unmount());
  // defineExpose surface; vm is loosely typed by test-utils, the handle
  // interface above is the actual exposed contract.
  const thumb = wrapper.vm as unknown as ThumbHandle;
  return { wrapper, thumb };
}

function pointerMove(clientX: number, clientY: number): void {
  // The seam listens for 'pointermove'; jsdom lacks PointerEvent, and a
  // MouseEvent dispatched under that type exercises the same handler
  // (it reads only clientX/clientY).
  document.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY }));
}

describe('FloatingThumbnail seam', () => {
  it('show() is synchronous and renders the accessor-supplied snapshot', async () => {
    const { wrapper, thumb } = mountThumb();
    const s = snap();
    thumb.show(() => s, 100, 100);
    await nextTick();

    expect(wrapper.find('.floating-thumb').exists()).toBe(true);
    expect(wrapper.find('.mini-board').exists()).toBe(true);
  });

  it('a cache-miss frame fills reactively when the source warms — no second show()', async () => {
    const { wrapper, thumb } = mountThumb();
    const cell = ref<BoardSnapshot | null>(null);
    thumb.show(() => cell.value, 100, 100);
    await nextTick();

    // Visible empty frame (the synchronous gate), no board yet.
    expect(wrapper.find('.floating-thumb').exists()).toBe(true);
    expect(wrapper.find('.mini-board').exists()).toBe(false);

    // The fire-and-forget warm lands: only the SOURCE changes.
    cell.value = snap();
    await nextTick();
    expect(wrapper.find('.mini-board').exists()).toBe(true);
  });

  it('a warm landing after hide() does not resurrect the thumbnail', async () => {
    const { wrapper, thumb } = mountThumb();
    const cell = ref<BoardSnapshot | null>(null);
    thumb.show(() => cell.value, 100, 100);
    await nextTick();
    thumb.hide();
    await nextTick();
    expect(wrapper.find('.floating-thumb').exists()).toBe(false);

    // The late resolve writes only the (host-side) source — the visible
    // gate is untouchable from an async continuation.
    cell.value = snap();
    await nextTick();
    expect(wrapper.find('.floating-thumb').exists()).toBe(false);
  });

  it('holds within the 80px anchor radius and hides beyond it (lost-mouseleave backstop)', async () => {
    const { wrapper, thumb } = mountThumb();
    thumb.show(() => snap(), 100, 100);
    await nextTick();

    pointerMove(150, 100); // 50px from anchor — inside the radius
    await nextTick();
    expect(wrapper.find('.floating-thumb').exists()).toBe(true);

    pointerMove(300, 300); // far beyond the radius
    await nextTick();
    expect(wrapper.find('.floating-thumb').exists()).toBe(false);
  });

  it('hides on scroll under a stationary pointer', async () => {
    const { wrapper, thumb } = mountThumb();
    thumb.show(() => snap(), 100, 100);
    await nextTick();

    document.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(wrapper.find('.floating-thumb').exists()).toBe(false);
  });

  it('hides on window blur', async () => {
    const { wrapper, thumb } = mountThumb();
    thumb.show(() => snap(), 100, 100);
    await nextTick();

    window.dispatchEvent(new Event('blur'));
    await nextTick();
    expect(wrapper.find('.floating-thumb').exists()).toBe(false);
  });

  it('clamps the box inside the viewport at show()-time', async () => {
    const { wrapper, thumb } = mountThumb();
    // jsdom viewport defaults: 1024×768. THUMB_BOX = 154.
    thumb.show(() => snap(), 2000, 700);
    await nextTick();

    const style = wrapper.find('.floating-thumb').attributes('style') ?? '';
    expect(style).toContain(`left: ${1024 - 154}px`);
    expect(style).toContain(`top: ${768 - 154}px`);
  });

  it('releases the stranding watchers on unmount while visible (resource ownership)', async () => {
    const wrapper = mount(FloatingThumbnail);
    const thumb = wrapper.vm as unknown as ThumbHandle;
    thumb.show(() => snap(), 100, 100);
    await nextTick();

    const docRemove = vi.spyOn(document, 'removeEventListener');
    const winRemove = vi.spyOn(window, 'removeEventListener');
    onTestFinished(() => {
      docRemove.mockRestore();
      winRemove.mockRestore();
    });
    wrapper.unmount();

    const docTypes = docRemove.mock.calls.map(c => c[0]);
    expect(docTypes).toContain('pointermove');
    expect(docTypes).toContain('scroll');
    expect(winRemove.mock.calls.map(c => c[0])).toContain('blur');
  });
});
