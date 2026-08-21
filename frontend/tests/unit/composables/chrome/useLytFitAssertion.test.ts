/**
 * tests/unit/composables/chrome/useLytFitAssertion.test.ts
 *
 * Space-owner cure, dispatch L2b (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §3 step 2's "Gate", "the review's own
 * 'mount-time Fit assertion'"; ledger rows 2447/2450/2460). Tier 1: no
 * Vue reactivity, no component instance — `useLytFitAssertion.ts` is a
 * plain closure over `ResizeObserver` + a `Map`, exactly the shape
 * `useDeferredContainerBreakpoint`'s own `observe`/`stop` pair uses
 * (though that one lives in `tests/integration/` because it ALSO
 * depends on the real `isAnyPanelResizing` store-linked ref — this
 * composable has no such dependency, so a Tier-1 unit test is the
 * correct tier per `tests/CLAUDE.md`).
 *
 * `pushSystemMessage` is exercised for real (not mocked) via
 * `registerSystemMessageSink` with a spy sink — the same pattern
 * `tests/unit/services/system-message-sink.test.ts` uses — so these
 * tests assert on the ACTUAL message-push contract, not a mocked stand-in.
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

const originalResizeObserver = globalThis.ResizeObserver;
let sinkPush: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeResizeObserver.instances = [];
  (globalThis as any).ResizeObserver = FakeResizeObserver;
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
    expect(sinkPush).not.toHaveBeenCalled();
    fit.stop();
  });

  it('pushes nothing when content is SMALLER than the cell (slack, not overflow)', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 80, clientWidth: 100, scrollHeight: 30, clientHeight: 40 });
    fit.observe('A_setup', el);
    expect(sinkPush).not.toHaveBeenCalled();
    fit.stop();
  });

  it('stays silent across a geometry transition that keeps the cell fitting', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 100, clientWidth: 100, scrollHeight: 40, clientHeight: 40 });
    fit.observe('A_engine_health', el);
    Object.defineProperty(el, 'clientWidth', { value: 120, configurable: true }); // cell grew — still fits
    lastObserver().fire(el);
    expect(sinkPush).not.toHaveBeenCalled();
    fit.stop();
  });
});

describe('useLytFitAssertion — violation fires the message', () => {
  it('pushes a structured error naming the region and the width overflow, on the synchronous mount-time check', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 534, clientWidth: 139, scrollHeight: 20, clientHeight: 20 });
    fit.observe('A_engine_eval', el);
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
    expect(sinkPush).toHaveBeenCalledTimes(1);
    const [, text] = sinkPush.mock.calls[0];
    expect(text).toContain('otherColorDebug');
    expect(text).toContain('80px'); // 200 - 120
    fit.stop();
  });

  it('re-checks and pushes again on a geometry transition that newly overflows', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 100, clientWidth: 100, scrollHeight: 40, clientHeight: 40 });
    fit.observe('A_engine_health', el); // fits — no push
    expect(sinkPush).not.toHaveBeenCalled();

    Object.defineProperty(el, 'clientWidth', { value: 60, configurable: true }); // cell shrank below content
    lastObserver().fire(el);
    expect(sinkPush).toHaveBeenCalledTimes(1);
    expect(sinkPush.mock.calls[0][1]).toContain('A_engine_health');
    fit.stop();
  });

  it('uses "error" severity, matching every other loud-refusal-grade push in analysis-service.ts', () => {
    const fit = useLytFitAssertion();
    const el = elWithBox({ scrollWidth: 200, clientWidth: 100, scrollHeight: 20, clientHeight: 20 });
    fit.observe('A_app', el);
    expect(sinkPush.mock.calls[0][0]).toBe('error');
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
});
