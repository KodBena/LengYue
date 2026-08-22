/**
 * tests/unit/composables/chrome/useLytFitAssertion.test.ts
 *
 * Space-owner cure, dispatch L2b (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §3 step 2's "Gate", "the review's own
 * 'mount-time Fit assertion'"; ledger rows 2447/2450/2460), plus the
 * settle-aware assertion fix (row 2591 — see
 * `.claude/dispatch-reports/settle-aware-fit-assertion-build.md` and
 * `useLytFitAssertion.ts`'s own header, "Settle-aware assertion"). Tier
 * 1: no Vue reactivity, no component instance — `useLytFitAssertion.ts`
 * is a plain closure over `ResizeObserver` + `requestAnimationFrame` + a
 * `Map`, exactly the shape `useDeferredContainerBreakpoint`'s own
 * `observe`/`stop` pair uses (though that one lives in
 * `tests/integration/` because it ALSO depends on the real
 * `isAnyPanelResizing` store-linked ref — this composable has no such
 * dependency, so a Tier-1 unit test is the correct tier per
 * `tests/CLAUDE.md`).
 *
 * `pushSystemMessage` is exercised for real (not mocked) via
 * `registerSystemMessageSink` with a spy sink — the same pattern
 * `tests/unit/services/system-message-sink.test.ts` uses — so these
 * tests assert on the ACTUAL message-push contract, not a mocked stand-in.
 *
 * `requestAnimationFrame`/`cancelAnimationFrame` are faked the same way
 * `ResizeObserver` already was here: a controllable queue the test
 * flushes frame-by-frame, so the settle-debounce's quiet-period logic is
 * driven deterministically rather than depending on real timer/paint
 * timing.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLytFitAssertion } from '../../../../src/composables/chrome/useLytFitAssertion';
import { pushSystemMessage, registerSystemMessageSink } from '../../../../src/services/system-message-sink';
import type { SystemMessageSink } from '../../../../src/services/system-message-sink';

function elWithBox(opts: {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollWidth', { value: opts.scrollWidth, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: opts.clientWidth, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: opts.scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: opts.clientHeight, configurable: true });
  return el;
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observed: Element[] = [];
  unobserved: Element[] = [];
  disconnected = false;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve(el: Element) {
    this.unobserved.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  fire(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

// A controllable `requestAnimationFrame`/`cancelAnimationFrame` fake:
// callbacks scheduled via `request()` sit in a queue until `flushFrame()`
// runs them (one frame at a time — mirroring the real primitive's
// per-frame batching, so a callback that re-schedules itself doesn't run
// again within the SAME `flushFrame()` call).
class FakeRaf {
  static queue: Array<{ id: number; cb: FrameRequestCallback }> = [];
  static cancelled = new Set<number>();
  static nextId = 1;

  static reset(): void {
    FakeRaf.queue = [];
    FakeRaf.cancelled = new Set();
    FakeRaf.nextId = 1;
  }

  static request(cb: FrameRequestCallback): number {
    const id = FakeRaf.nextId++;
    FakeRaf.queue.push({ id, cb });
    return id;
  }

  static cancel(id: number): void {
    FakeRaf.cancelled.add(id);
  }

  /** Runs exactly the callbacks queued BEFORE this call — a callback that
   *  re-arms itself (as the settle-debounce chain does) is queued for the
   *  NEXT `flushFrame()`, not this one. */
  static flushFrame(): void {
    const due = FakeRaf.queue;
    FakeRaf.queue = [];
    for (const { id, cb } of due) {
      if (!FakeRaf.cancelled.has(id)) cb(0);
    }
  }
}

/** Flushes the settle-debounce's full quiet period (`SETTLE_QUIET_FRAMES`
 *  = 2 in the production module) so a pending check actually fires. */
function settleFrames(): void {
  FakeRaf.flushFrame();
  FakeRaf.flushFrame();
}

const originalResizeObserver = globalThis.ResizeObserver;
const originalRaf = globalThis.requestAnimationFrame;
const originalCancelRaf = globalThis.cancelAnimationFrame;
let sinkPush: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeResizeObserver.instances = [];
  (globalThis as any).ResizeObserver = FakeResizeObserver;
  FakeRaf.reset();
  (globalThis as any).requestAnimationFrame = FakeRaf.request;
  (globalThis as any).cancelAnimationFrame = FakeRaf.cancel;
  sinkPush = vi.fn();
  const fakeSink: SystemMessageSink = { push: sinkPush };
  registerSystemMessageSink(fakeSink);
});

function lastObserver(): FakeResizeObserver {
  const inst = FakeResizeObserver.instances.at(-1);
  if (!inst) throw new Error('no ResizeObserver constructed');
  return inst;
}

describe('useLytFitAssertion — fit stays silent', () => {
  it('pushes nothing on observe() when the element fits its own cell exactly', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 100, clientWidth: 100, scrollHeight: 40, clientHeight: 40 });
    fit.observe('A_engine_health', el);
    settleFrames();
    expect(sinkPush).not.toHaveBeenCalled();
    fit.stop();
  });

  it('pushes nothing when content is SMALLER than the cell (slack, not overflow)', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 80, clientWidth: 100, scrollHeight: 30, clientHeight: 40 });
    fit.observe('A_setup', el);
    settleFrames();
    expect(sinkPush).not.toHaveBeenCalled();
    fit.stop();
  });

  it('stays silent across a geometry transition that keeps the cell fitting', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 100, clientWidth: 100, scrollHeight: 40, clientHeight: 40 });
    fit.observe('A_engine_health', el);
    settleFrames();
    Object.defineProperty(el, 'clientWidth', { value: 120, configurable: true }); // cell grew — still fits
    lastObserver().fire(el);
    settleFrames();
    expect(sinkPush).not.toHaveBeenCalled();
    fit.stop();
  });
});

describe('useLytFitAssertion — violation fires the message, once settled', () => {
  it('does NOT push synchronously on observe() — the check is settle-debounced', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 534, clientWidth: 139, scrollHeight: 20, clientHeight: 20 });
    fit.observe('A_engine_eval', el);
    expect(sinkPush).not.toHaveBeenCalled(); // not yet — the settle window hasn't elapsed
    fit.stop();
  });

  it('pushes a structured error naming the region and the width overflow, once the settle window elapses', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 534, clientWidth: 139, scrollHeight: 20, clientHeight: 20 });
    fit.observe('A_engine_eval', el);
    settleFrames();
    expect(sinkPush).toHaveBeenCalledTimes(1);
    const [type, text] = sinkPush.mock.calls[0];
    expect(type).toBe('error');
    expect(text).toContain('A_engine_eval');
    expect(text).toContain('395px'); // 534 - 139
    fit.stop();
  });

  it('pushes a structured error naming the region and the height overflow', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 50, clientWidth: 50, scrollHeight: 200, clientHeight: 120 });
    fit.observe('otherColorDebug', el);
    settleFrames();
    expect(sinkPush).toHaveBeenCalledTimes(1);
    const [, text] = sinkPush.mock.calls[0];
    expect(text).toContain('otherColorDebug');
    expect(text).toContain('80px'); // 200 - 120
    fit.stop();
  });

  it('re-checks and pushes again on a geometry transition that newly overflows, once settled', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 100, clientWidth: 100, scrollHeight: 40, clientHeight: 40 });
    fit.observe('A_engine_health', el); // fits — no push
    settleFrames();
    expect(sinkPush).not.toHaveBeenCalled();

    Object.defineProperty(el, 'clientWidth', { value: 60, configurable: true }); // cell shrank below content
    lastObserver().fire(el);
    settleFrames();
    expect(sinkPush).toHaveBeenCalledTimes(1);
    expect(sinkPush.mock.calls[0][1]).toContain('A_engine_health');
    fit.stop();
  });

  it('uses "error" severity, matching every other loud-refusal-grade push in analysis-service.ts', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 200, clientWidth: 100, scrollHeight: 20, clientHeight: 20 });
    fit.observe('A_app', el);
    settleFrames();
    expect(sinkPush.mock.calls[0][0]).toBe('error');
    fit.stop();
  });
});

describe('useLytFitAssertion — settle debounce (row 2591, ADR-0000 closure)', () => {
  it('does not report a transient overflow that resolves before the settle window elapses', () => {
    // Mirrors the settingsSubstrip live measurement: two deterministic
    // transient widths (content 135px against a 77px-equivalent cell,
    // then 101px against the same cell) followed by a settled width
    // where the SAME content comfortably fits (33px against 77px) — see
    // `.claude/dispatch-reports/settingssubstrip-overflow-build.md`'s
    // measured table.
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 0, clientWidth: 0, scrollHeight: 135, clientHeight: 77 }); // 230px transient pass
    fit.observe('settingsSubstrip', el);

    Object.defineProperty(el, 'scrollHeight', { value: 101, configurable: true }); // 280px transient pass
    lastObserver().fire(el);

    Object.defineProperty(el, 'scrollHeight', { value: 33, configurable: true }); // settled — fits comfortably
    lastObserver().fire(el);

    settleFrames();
    expect(sinkPush).not.toHaveBeenCalled();
    fit.stop();
  });

  it('reports a settled overflow that persists once the debounce settles, with the real measured deficit', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 0, clientWidth: 0, scrollHeight: 135, clientHeight: 77 }); // 230px transient pass
    fit.observe('settingsSubstrip', el);

    Object.defineProperty(el, 'scrollHeight', { value: 101, configurable: true }); // 280px transient pass
    lastObserver().fire(el);

    // One more delivery at the SAME (now-settled) geometry — a genuine
    // 24px shortfall that persists, matching the live toast's own
    // wording before the reservation was raised.
    lastObserver().fire(el);

    settleFrames();
    expect(sinkPush).toHaveBeenCalledTimes(1);
    const [type, text] = sinkPush.mock.calls[0];
    expect(type).toBe('error');
    expect(text).toContain('settingsSubstrip');
    expect(text).toContain('24px too short');
    fit.stop();
  });

  it('a later delivery cancels and re-arms the pending debounce rather than stacking two reports', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 100, clientWidth: 100, scrollHeight: 200, clientHeight: 100 });
    fit.observe('A_region', el);

    FakeRaf.flushFrame(); // one quiet frame elapses (not yet the full 2-frame window)
    lastObserver().fire(el); // a further delivery — must cancel/re-arm, not let the first chain fire

    settleFrames(); // now let the re-armed chain's own full window elapse
    expect(sinkPush).toHaveBeenCalledTimes(1); // exactly one report, not two
    fit.stop();
  });

  it('unregistering a region while its settle check is pending reports nothing', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 200, clientWidth: 100, scrollHeight: 20, clientHeight: 20 });
    fit.observe('A_region', el);
    fit.observe('A_region', null); // unregistered before the settle window elapses

    settleFrames();
    expect(sinkPush).not.toHaveBeenCalled();
    fit.stop();
  });

  it('re-registering the same region with a new element checks only the new one', () => {
    const fit = useLytFitAssertion();
    const stale = elWithBox({ scrollWidth: 200, clientWidth: 100, scrollHeight: 20, clientHeight: 20 }); // overflows
    fit.observe('A_region', stale);

    const fresh = elWithBox({ scrollWidth: 50, clientWidth: 50, scrollHeight: 20, clientHeight: 20 }); // fits
    fit.observe('A_region', fresh); // supersedes the stale registration's pending check

    settleFrames();
    expect(sinkPush).not.toHaveBeenCalled();
    fit.stop();
  });

  it('does not accumulate reports for a violation observed across many rapid transient deliveries', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 100, clientWidth: 100, scrollHeight: 200, clientHeight: 100 });
    fit.observe('A_region', el);
    // A burst of re-arming deliveries, each within the quiet window of
    // the last, and each still genuinely overflowing.
    for (let i = 0; i < 5; i += 1) {
      FakeRaf.flushFrame();
      lastObserver().fire(el);
    }
    settleFrames();
    expect(sinkPush).toHaveBeenCalledTimes(1);
    fit.stop();
  });
});

describe('useLytFitAssertion — registration lifecycle', () => {
  it('unregistering a region (el=null) stops future checks for it', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 100, clientWidth: 100, scrollHeight: 40, clientHeight: 40 });
    fit.observe('A_engine_health', el);
    fit.observe('A_engine_health', null);
    const observer = lastObserver();
    expect(observer.unobserved).toContain(el);

    Object.defineProperty(el, 'clientWidth', { value: 10, configurable: true }); // would now overflow
    observer.fire(el); // stale entry — but no tracked region maps to `el` anymore
    settleFrames();
    expect(sinkPush).not.toHaveBeenCalled();
    fit.stop();
  });

  it('re-registering the SAME region with a different element unobserves the old one', () => {
    const fit = useLytFitAssertion();
    const first = elWithBox({ scrollWidth: 50, clientWidth: 50, scrollHeight: 20, clientHeight: 20 });
    const second = elWithBox({ scrollWidth: 50, clientWidth: 50, scrollHeight: 20, clientHeight: 20 });
    fit.observe('tree', first);
    fit.observe('tree', second);
    const observer = lastObserver();
    expect(observer.unobserved).toContain(first);
    expect(observer.observed).toContain(second);
    fit.stop();
  });

  it('uses a single shared ResizeObserver across multiple observed regions (resource-conservative)', () => {
    const fit = useLytFitAssertion();
    const a = elWithBox({ scrollWidth: 10, clientWidth: 10, scrollHeight: 10, clientHeight: 10 });
    const b = elWithBox({ scrollWidth: 10, clientWidth: 10, scrollHeight: 10, clientHeight: 10 });
    fit.observe('A_engine_health', a);
    fit.observe('A_engine_eval', b);
    expect(FakeResizeObserver.instances).toHaveLength(1);
    fit.stop();
  });

  it('stop() disconnects the observer and clears tracked state', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 10, clientWidth: 10, scrollHeight: 10, clientHeight: 10 });
    fit.observe('A_engine_health', el);
    const observer = lastObserver();
    expect(observer.disconnected).toBe(false);
    fit.stop();
    expect(observer.disconnected).toBe(true);
  });

  it('stop() cancels a pending settle check so it never fires after teardown', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 200, clientWidth: 100, scrollHeight: 20, clientHeight: 20 });
    fit.observe('A_region', el);
    fit.stop();
    settleFrames();
    expect(sinkPush).not.toHaveBeenCalled();
  });
});
