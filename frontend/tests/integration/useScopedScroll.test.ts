/**
 * tests/integration/useScopedScroll.test.ts
 *
 * Hover-gate purity (ledger row 1050; investigation row 1049; coverage
 * gap named in row 1049). `useScopedScroll` used to gate its wheel
 * handler on a hand-tracked `isHovered` ref flipped by
 * `mouseenter`/`mouseleave` — a stateful gate that desyncs when the
 * DOM changes under a STATIONARY cursor (e.g. an overlay appears over
 * the bound element and later disappears without the pointer ever
 * moving, so no enter/leave pair fires either way). The fix replaces
 * that stored flag with a pure per-event containment check
 * (`event.composedPath().includes(el)`), computed fresh on every
 * wheel dispatch. These tests exercise the composable against a real
 * (jsdom) DOM tree — the shape of coverage row 1049 found missing —
 * rather than against a component that merely happens to call it.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useScopedScroll } from '../../src/composables/useScopedScroll';
import { withSetup } from './with-setup';

function dispatchWheel(target: EventTarget, deltaY = 10) {
  const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('useScopedScroll — pure per-event containment gate (row 1050)', () => {
  let host: HTMLElement;
  let rafSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The composable's own scroll callback is deferred a
    // requestAnimationFrame tick (throttling per-frame). Stub rAF to
    // invoke synchronously so assertions don't need a wall-clock wait
    // (no sleeps in tests) — this only fakes the frame *scheduler*,
    // not the containment gate under test, which runs synchronously
    // inside the wheel handler itself, before any rAF is scheduled.
    rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback): number => {
        cb(0);
        return 0;
      });
  });

  afterEach(() => {
    rafSpy.mockRestore();
    host?.remove();
  });

  function mountHost() {
    host = document.createElement('div');
    document.body.appendChild(host);
    const el = document.createElement('div');
    host.appendChild(el);
    const child = document.createElement('span');
    el.appendChild(child);
    return { el, child };
  }

  it('wheel dispatched on the bound element navigates', () => {
    const { el } = mountHost();
    const elRef = ref<HTMLElement | null>(el);
    const onScroll = vi.fn();
    withSetup(() => useScopedScroll(elRef, onScroll));

    dispatchWheel(el);

    expect(onScroll).toHaveBeenCalledWith(10);
  });

  it('wheel dispatched on a descendant of the bound element navigates (containment, not exact-target)', () => {
    const { el, child } = mountHost();
    const elRef = ref<HTMLElement | null>(el);
    const onScroll = vi.fn();
    withSetup(() => useScopedScroll(elRef, onScroll));

    dispatchWheel(child);

    expect(onScroll).toHaveBeenCalledWith(10);
  });

  it('wheel dispatched elsewhere on the page does not navigate', () => {
    const { el } = mountHost();
    const elRef = ref<HTMLElement | null>(el);
    const onScroll = vi.fn();
    withSetup(() => useScopedScroll(elRef, onScroll));

    const elsewhere = document.createElement('div');
    document.body.appendChild(elsewhere);
    dispatchWheel(elsewhere);
    elsewhere.remove();

    expect(onScroll).not.toHaveBeenCalled();
  });

  it('the desync case: an overlay covers and uncovers the element with the cursor stationary (no mouseenter/mouseleave fired at all) — wheel on the element still navigates', () => {
    const { el } = mountHost();
    const elRef = ref<HTMLElement | null>(el);
    const onScroll = vi.fn();
    withSetup(() => useScopedScroll(elRef, onScroll));

    // Simulate a DOM change under a stationary cursor: an overlay is
    // inserted elsewhere in the document (as a real "covers the
    // element" overlay would be — teleported/positioned outside the
    // element's own subtree) and removed again. Deliberately no
    // mouseenter/mouseleave is dispatched on `el` at any point, which
    // is exactly the stale-flag failure this fix removes: the old
    // `isHovered` ref would never have flipped back to `true` here
    // because no real pointer motion occurred.
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    overlay.remove();

    dispatchWheel(el);

    expect(onScroll).toHaveBeenCalledWith(10);
  });

  it('the stale-flag transition: a genuinely-hovered element loses hover to an overlay (real mouseleave) and the overlay is removed without the pointer moving (no re-fired mouseenter) — wheel on the element still navigates', () => {
    // This isolates the actual mechanism the old `isHovered` ref got
    // wrong, as opposed to the "no mouseenter ever fired" shortcut in
    // the desync case above (which is red against the old code for a
    // different, uninteresting reason). Sequence, matching what the
    // browser actually does when an overlay steals the pointer mid-hover:
    //   1. mouseenter fires on `el` (old: isHovered -> true)
    //   2. an overlay takes the hit-test target -> mouseleave fires on
    //      `el` (old: isHovered -> false) — this part IS a real browser
    //      event, because the overlay's appearance changes what the
    //      cursor is over even with no cursor motion (hit-testing is
    //      re-evaluated whenever the DOM/paint changes under it).
    //   3. the overlay is removed with the cursor still stationary — no
    //      mousemove occurred, so no mouseenter re-fires for `el` even
    //      though it is hit-testable again (old: isHovered stays stuck
    //      `false`).
    //   4. wheel is dispatched targeting `el`.
    // Old implementation: isHovered is false at step 4 -> handleWheel's
    // early-return swallows the wheel -> onScroll never called. This is
    // exactly the witnessed maintainer bug (space-ponder-space). New
    // implementation has no isHovered to go stale — the wheel's own
    // composedPath contains `el` -> it navigates.
    const { el } = mountHost();
    const elRef = ref<HTMLElement | null>(el);
    const onScroll = vi.fn();
    withSetup(() => useScopedScroll(elRef, onScroll));

    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));

    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));

    overlay.remove();
    // No mouseenter dispatched here — the pointer never moved, so the
    // browser would not fire one either.

    dispatchWheel(el);

    expect(onScroll).toHaveBeenCalledWith(10);
  });

  it('preventDefault is only called for a wheel that lands on the bound element', () => {
    const { el } = mountHost();
    const elRef = ref<HTMLElement | null>(el);
    withSetup(() => useScopedScroll(elRef, vi.fn()));

    const onEl = dispatchWheel(el);
    expect(onEl.defaultPrevented).toBe(true);

    const elsewhere = document.createElement('div');
    document.body.appendChild(elsewhere);
    const onElsewhere = dispatchWheel(elsewhere);
    elsewhere.remove();
    expect(onElsewhere.defaultPrevented).toBe(false);
  });
});
