/**
 * tests/integration/useElementWidth-resize-fallback.test.ts
 *
 * aff8 defect 3 repair ("wrongful collapse at 4k despite enormous free
 * width" — `.claude/dispatch-reports/library-cards-repair-build.md`).
 * `useElementWidth.ts`'s own header (read in full before authoring this
 * file) documents a live-witnessed, real-browser-only failure mode
 * `useResizablePanel.ts` first root-caused: a `ResizeObserver` instance
 * can simply stop delivering callbacks for a live, still-attached,
 * still-correctly-identified element after its initial settle — jsdom
 * cannot reproduce the stopped-delivery mechanism itself (it never runs
 * real `ResizeObserver` box-size delivery at all), so this suite instead
 * proves the STRUCTURAL guarantee that makes the fix correct: a plain
 * `window` 'resize' listener, wired independently of whatever the
 * `ResizeObserver` instance does, still recovers a fresh measurement.
 * Simulated here by installing a `ResizeObserver` stand-in whose
 * `observe()` never calls back (the honest jsdom equivalent of "stopped
 * delivering") and confirming `widthPx` still updates on a `window`
 * 'resize' event.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withSetup } from './with-setup';
import { useElementWidth } from '../../src/composables/chrome/useElementWidth';

// Never invokes its own callback — the jsdom-honest stand-in for "the
// ResizeObserver instance stopped delivering" (see this file's header).
class DeadResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let restoreRO: typeof globalThis.ResizeObserver;
let restoreGBCR: typeof Element.prototype.getBoundingClientRect;
let widthPxToReport = 0;

beforeEach(() => {
  restoreRO = globalThis.ResizeObserver;
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = DeadResizeObserver;
  restoreGBCR = Element.prototype.getBoundingClientRect;
  widthPxToReport = 0;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return {
      width: widthPxToReport, height: 0, top: 0, left: 0,
      right: widthPxToReport, bottom: 0, x: 0, y: 0, toJSON() {},
    } as DOMRect;
  };
});

afterEach(() => {
  globalThis.ResizeObserver = restoreRO;
  Element.prototype.getBoundingClientRect = restoreGBCR;
});

describe('useElementWidth — window-resize fallback (aff8 defect 3)', () => {
  it('recovers a fresh measurement on a window resize event even when the ResizeObserver instance never calls back', () => {
    const handle = withSetup(() => useElementWidth());
    const el = document.createElement('div');

    widthPxToReport = 185; // the compiled A_engine_controls track floor
    handle.observe(el);
    expect(handle.widthPx.value).toBe(185); // synchronous first read at observe()-time

    // The element's real rendered width changes (e.g. the side column
    // resolved to its true, much wider 4k value) but the (dead) observer
    // never fires — exactly the frozen-reading symptom the live rig
    // witnessed.
    widthPxToReport = 900;
    expect(handle.widthPx.value).toBe(185); // still stale — the observer alone cannot recover this

    window.dispatchEvent(new Event('resize'));
    expect(handle.widthPx.value).toBe(900); // the fallback listener recovered it
  });

  it('is a no-op before the first observe() call (does not throw, does not fabricate a measurement)', () => {
    withSetup(() => useElementWidth());
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
  });

  it('stop() releases the resize listener — a subsequent resize no longer touches widthPx', () => {
    const handle = withSetup(() => useElementWidth());
    const el = document.createElement('div');
    widthPxToReport = 300;
    handle.observe(el);
    expect(handle.widthPx.value).toBe(300);

    handle.stop();
    widthPxToReport = 700;
    window.dispatchEvent(new Event('resize'));
    expect(handle.widthPx.value).toBe(300); // unchanged — stop() tore the listener down
  });
});
