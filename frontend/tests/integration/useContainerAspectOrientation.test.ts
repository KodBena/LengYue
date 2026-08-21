/**
 * tests/integration/useContainerAspectOrientation.test.ts
 *
 * Allocation-family closing arc, item 1: pins
 * `useContainerAspectOrientation`'s derivation rule (wide-or-square ->
 * 'horizontal', tall -> 'vertical') and its `observe`/`stop` resource
 * lifecycle. Mirrors `useDeferredContainerBreakpoint.test.ts`'s
 * `FakeResizeObserver` pattern — jsdom's own permanent-no-op
 * `ResizeObserver` stub never invokes its callback, so a controllable
 * fake is required to drive this composable's width/height tracking.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useContainerAspectOrientation } from '../../src/composables/chrome/useContainerAspectOrientation';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observed: Element[] = [];
  disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  fire(widthPx: number, heightPx: number) {
    this.callback(
      [{ contentRect: { width: widthPx, height: heightPx } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

const originalResizeObserver = globalThis.ResizeObserver;
const originalGetComputedStyle = globalThis.getComputedStyle;

beforeEach(() => {
  FakeResizeObserver.instances = [];
  (globalThis as any).ResizeObserver = FakeResizeObserver;
  // `measureContentBox`'s padding/border reads — a plain zeroed style
  // keeps `getBoundingClientRect()`'s own jsdom-stubbed 0×0 (overridden
  // per-test below via a real element stub) the only geometry that
  // matters.
  (globalThis as any).getComputedStyle = () =>
    ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0',
       borderLeftWidth: '0', borderRightWidth: '0', borderTopWidth: '0', borderBottomWidth: '0' }) as CSSStyleDeclaration;
});

afterEach(() => {
  (globalThis as any).ResizeObserver = originalResizeObserver;
  (globalThis as any).getComputedStyle = originalGetComputedStyle;
});

function elWithRect(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) });
  return el;
}

function lastObserver(): FakeResizeObserver {
  const inst = FakeResizeObserver.instances.at(-1);
  if (!inst) throw new Error('no ResizeObserver constructed');
  return inst;
}

describe('useContainerAspectOrientation', () => {
  it('derives "horizontal" for a wide container, synchronously at observe() time', () => {
    const { derivedOrientation, widthPx, heightPx, observe } = useContainerAspectOrientation();
    observe(elWithRect(600, 300));
    expect(widthPx.value).toBe(600);
    expect(heightPx.value).toBe(300);
    expect(derivedOrientation.value).toBe('horizontal');
  });

  it('derives "vertical" for a tall container', () => {
    const { derivedOrientation, observe } = useContainerAspectOrientation();
    observe(elWithRect(200, 500));
    expect(derivedOrientation.value).toBe('vertical');
  });

  it('ties (square) resolve to "horizontal"', () => {
    const { derivedOrientation, observe } = useContainerAspectOrientation();
    observe(elWithRect(400, 400));
    expect(derivedOrientation.value).toBe('horizontal');
  });

  it('re-derives on a live ResizeObserver callback (wide -> tall)', () => {
    const { derivedOrientation, observe } = useContainerAspectOrientation();
    observe(elWithRect(600, 300));
    expect(derivedOrientation.value).toBe('horizontal');

    lastObserver().fire(300, 700);
    expect(derivedOrientation.value).toBe('vertical');
  });

  it('ignores a 0x0 unmeasured/collapsed callback rather than treating it as evidence', () => {
    const { derivedOrientation, widthPx, heightPx, observe } = useContainerAspectOrientation();
    observe(elWithRect(600, 300));
    lastObserver().fire(0, 0);
    expect(widthPx.value).toBe(600);
    expect(heightPx.value).toBe(300);
    expect(derivedOrientation.value).toBe('horizontal');
  });

  it('stop() disconnects the observer; re-observing disconnects the prior one', () => {
    const { observe, stop } = useContainerAspectOrientation();
    observe(elWithRect(600, 300));
    const first = lastObserver();
    observe(elWithRect(200, 500));
    expect(first.disconnected).toBe(true);
    const second = lastObserver();
    stop();
    expect(second.disconnected).toBe(true);
  });
});
