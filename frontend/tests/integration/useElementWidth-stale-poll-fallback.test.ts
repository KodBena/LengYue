/**
 * tests/integration/useElementWidth-stale-poll-fallback.test.ts
 *
 * toolbar-space-0c21 (ledger row 2597, commissioner finding: the toolbar
 * collapsed to "MORE" — `useEngineControlsRealization`'s `menu-path`
 * form — despite ample free width elsewhere in the row). `useElementWidth`'s
 * own header (read in full before authoring this file) documents two
 * existing defenses — the `window` 'resize' fallback and the rAF
 * settle-burst — and the new "Stale-poll fallback" section this build adds:
 * a low-frequency `setInterval` remeasure that self-heals a divergence
 * NEITHER of the other two mechanisms can reach — a width change landing
 * well after mount, with no `window.resize` event, after the settle
 * burst's own short window has already elapsed (the corner presence
 * menu making `boardRail` genuinely visible is the concrete worked
 * case the header names; the live-witnessed-but-jsdom-unreproducible
 * "ResizeObserver just stops delivering" class from
 * `useResizablePanel.ts`'s own report is the other).
 *
 * Mirrors `useElementWidth-resize-fallback.test.ts`'s own harness (a
 * `ResizeObserver` stand-in that never calls back — the jsdom-honest
 * equivalent of "stopped delivering" — plus a stubbed
 * `getBoundingClientRect`), but exercises the interval poll instead of
 * the `window` 'resize' listener: fake timers advance past
 * `STALE_POLL_INTERVAL_MS` with NO resize event and NO further
 * `ResizeObserver` delivery, pinning that the collapse threshold always
 * derives from a re-read of the real DOM box — never a reading frozen
 * at whatever `observe()` first saw — regardless of how the divergence
 * arose or which other delivery path failed to report it.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withSetup } from './with-setup';
import { useElementWidth } from '../../src/composables/chrome/useElementWidth';

// Never invokes its own callback — the jsdom-honest stand-in for "the
// ResizeObserver instance stopped delivering" (see
// useElementWidth-resize-fallback.test.ts's own precedent).
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
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.ResizeObserver = restoreRO;
  Element.prototype.getBoundingClientRect = restoreGBCR;
});

describe('useElementWidth — stale-poll fallback (toolbar-space-0c21)', () => {
  it('recovers a WIDER real width the ResizeObserver never delivered and no resize event ever announced — the "collapsed at ample width" symptom', () => {
    const handle = withSetup(() => useElementWidth());
    const el = document.createElement('div');

    // The collapse-boundary width: at/under this, useEngineControlsRealization
    // selects menu-path (the compiled A_engine_controls track floor).
    widthPxToReport = 185;
    handle.observe(el);
    expect(handle.widthPx.value).toBe(185);

    // The element's real box widens (e.g. boardRail's presence toggling
    // off widens the board-priority-clamp column) — no window resize,
    // and the (dead) ResizeObserver never calls back — exactly the
    // "reads the frozen track" symptom row 2597 names.
    widthPxToReport = 900;

    // Neither of the two pre-existing defenses fires here: no resize
    // event dispatched, and the rAF settle burst (jsdom-absent rAF, a
    // no-op here as in every other suite in this tree) already isn't
    // running by the time this late change lands.
    expect(handle.widthPx.value).toBe(185); // still frozen — nothing has re-read yet

    vi.advanceTimersByTime(2000); // one stale-poll tick
    expect(handle.widthPx.value).toBe(900); // the poll recovered it — never a frozen reading
  });

  it('recovers a NARROWER real width just as readily (the boundary is symmetric, not a one-way widen-only patch)', () => {
    const handle = withSetup(() => useElementWidth());
    const el = document.createElement('div');

    widthPxToReport = 900;
    handle.observe(el);
    expect(handle.widthPx.value).toBe(900);

    widthPxToReport = 185; // e.g. boardRail becoming visible mid-session
    expect(handle.widthPx.value).toBe(900); // still frozen — pre-poll

    vi.advanceTimersByTime(2000);
    expect(handle.widthPx.value).toBe(185); // the poll caught the narrowing too
  });

  it('does not fire before the first observe() call, and does not fire after stop() (resource-ownership-at-mutation-sites)', () => {
    const handle = withSetup(() => useElementWidth());
    // No observe() yet — advancing timers must not throw or fabricate a reading.
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
    expect(handle.widthPx.value).toBe(0);

    const el = document.createElement('div');
    widthPxToReport = 300;
    handle.observe(el);
    expect(handle.widthPx.value).toBe(300);

    handle.stop();
    widthPxToReport = 700;
    vi.advanceTimersByTime(10_000); // several poll intervals' worth
    expect(handle.widthPx.value).toBe(300); // unchanged — stop() tore the interval down
  });

  it('re-observing (a caller binding a new element) does not leave the prior interval double-firing alongside the new one', () => {
    const handle = withSetup(() => useElementWidth());
    const elA = document.createElement('div');
    const elB = document.createElement('div');

    widthPxToReport = 100;
    handle.observe(elA);
    expect(handle.widthPx.value).toBe(100);

    widthPxToReport = 400;
    handle.observe(elB); // disconnects/cancels elA's poll, starts elB's
    expect(handle.widthPx.value).toBe(400); // synchronous read at the new observe()

    widthPxToReport = 555;
    vi.advanceTimersByTime(2000);
    expect(handle.widthPx.value).toBe(555); // exactly one poll fired, not a stacked pair racing
  });
});
