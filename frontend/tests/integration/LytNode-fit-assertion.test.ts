/**
 * tests/integration/LytNode-fit-assertion.test.ts
 *
 * Space-owner cure, dispatch L2b (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §3 step 2's "Gate"; ledger rows
 * 2447/2450/2460), plus the settle-aware assertion fix (row 2591 — see
 * `.claude/dispatch-reports/settle-aware-fit-assertion-build.md`): the
 * REAL wiring of `useLytFitAssertion.ts` into `LytNode.vue`'s own
 * leaf-cell function ref (`onLeafCellRef`) — this file proves the
 * composable (already unit-tested in isolation, including its settle
 * debounce, in `tests/unit/composables/chrome/useLytFitAssertion.test.ts`)
 * is actually reached from a mounted `LytNode` instance, gated correctly
 * on the compiled `content` field, and torn down on unmount. Same
 * synthetic two-level program shape `LytNode-dom-id-wiring.test.ts`
 * already established (a Split containing leaves), reused here rather
 * than a third fixture shape.
 *
 * `requestAnimationFrame`/`cancelAnimationFrame` are faked here the same
 * way `ResizeObserver` already was — jsdom in this vitest environment
 * DOES ship a real (timer-driven) `requestAnimationFrame`, so leaving it
 * unfaked would make the settle-debounced push land on a real timer this
 * test can't deterministically flush; the fake gives frame-by-frame
 * control, matching the unit test's own idiom.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import LytNode from '../../src/components/chrome/LytNode.vue';
import type { LytSplitNode } from '../../src/state/lyt-layout.gen';
import { registerSystemMessageSink } from '../../src/services/system-message-sink';
import type { SystemMessageSink } from '../../src/services/system-message-sink';

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
  fire(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

// See `tests/unit/composables/chrome/useLytFitAssertion.test.ts`'s own
// `FakeRaf` for the full rationale — a controllable
// `requestAnimationFrame`/`cancelAnimationFrame` queue, flushed one frame
// at a time.
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
  static flushFrame(): void {
    const due = FakeRaf.queue;
    FakeRaf.queue = [];
    for (const { id, cb } of due) {
      if (!FakeRaf.cancelled.has(id)) cb(0);
    }
  }
}

/** Flushes the settle-debounce's full quiet period (`SETTLE_QUIET_FRAMES`
 *  = 2 in the production module). */
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

afterEach(() => {
  (globalThis as any).ResizeObserver = originalResizeObserver;
  (globalThis as any).requestAnimationFrame = originalRaf;
  (globalThis as any).cancelAnimationFrame = originalCancelRaf;
});

// One Fit-class leaf (`content: 'bounded'`, `A_engine_health` — a REAL
// registered widget id already carrying this classification in the
// compiled program, per `lyt-layout.gen.ts`) and one leaf with no
// content declaration at all (`content: null`, `tree`'s own real
// classification today — `feasible-layout.ts`'s own header addendum) —
// the second must never be checked, proving the gate is real, not
// "every leaf gets checked."
const SYNTHETIC_PROGRAM: LytSplitNode = {
  kind: 'split',
  axis: 'h',
  gapPx: 0,
  children: [
    {
      path: '0',
      presenceDefaultVisible: true,
      track: { kind: 'fixed', px: 100 },
      node: { kind: 'leaf', widget: 'A_engine_health', domain: 'go', facets: [], aspect: null, scrollAxes: [], content: 'bounded' },
    },
    {
      path: '1',
      presenceDefaultVisible: true,
      track: { kind: 'fixed', px: 100 },
      node: { kind: 'leaf', widget: 'tree', domain: 'board', facets: [], aspect: null, scrollAxes: [], content: null },
    },
  ],
};

function setBox(el: Element, box: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number }) {
  for (const [k, v] of Object.entries(box)) Object.defineProperty(el, k, { value: v, configurable: true });
}

describe('LytNode.vue — mount-time Fit assertion wiring (dispatch L2b)', () => {
  it('observes a Fit-class leaf cell (content: "bounded") and pushes on overflow at a geometry transition', () => {
    const wrapper = mount(LytNode, {
      props: { node: SYNTHETIC_PROGRAM },
      slots: {
        'leaf-A_engine_health': '<div class="probe-health">health</div>',
        'leaf-tree': '<div class="probe-tree">tree</div>',
      },
    });

    const cell = wrapper.element.querySelector('.lyt-leaf-cell') as HTMLElement;
    expect(cell).not.toBeNull();
    setBox(cell, { scrollWidth: 534, clientWidth: 139, scrollHeight: 20, clientHeight: 20 });
    // The settle-debounced mount-time check already ARMED (during
    // `mount()`, before this test overrode the box) against a fitting
    // (0/0) box, so it will produce no push once its own window elapses
    // — a genuine GEOMETRY TRANSITION is what this test drives, via the
    // SAME `ResizeObserver` callback path a real browser would fire on a
    // cell resize (`useLytFitAssertion.ts`'s own header: "on geometry
    // transition ... a leaf cell resizing IS a geometry transition by
    // construction"). The transition re-arms the debounce; `settleFrames()`
    // lets that re-armed window elapse before asserting.
    const observer = FakeResizeObserver.instances.at(-1)!;
    observer.fire(cell);
    settleFrames();

    expect(sinkPush).toHaveBeenCalled();
    const [type, text] = sinkPush.mock.calls.at(-1)!;
    expect(type).toBe('error');
    expect(text).toContain('A_engine_health');

    wrapper.unmount();
  });

  it('never checks a leaf with no content classification (content: null) — the gate is real, not universal', () => {
    const wrapper = mount(LytNode, {
      props: { node: SYNTHETIC_PROGRAM },
      slots: {
        'leaf-A_engine_health': '<div class="probe-health">health</div>',
        'leaf-tree': '<div class="probe-tree">tree</div>',
      },
    });

    const cells = wrapper.element.querySelectorAll('.lyt-leaf-cell');
    // Second cell is the `tree` leaf (content: null) — force it to a
    // grossly overflowing box, then drive a geometry-transition callback
    // for it directly; it must produce no push regardless, because
    // `onLeafCellRef` never registered it with `fitAssertion` in the
    // first place (the gate is on `content`, not "every leaf cell").
    const treeCell = cells[1] as HTMLElement;
    setBox(treeCell, { scrollWidth: 9000, clientWidth: 10, scrollHeight: 9000, clientHeight: 10 });
    const observer = FakeResizeObserver.instances.at(-1)!;
    observer.fire(treeCell);
    settleFrames();

    expect(sinkPush.mock.calls.some((c) => String(c[1]).includes('tree'))).toBe(false);

    wrapper.unmount();
  });

  it('stays silent for a Fit-class leaf whose content fits its own cell', () => {
    const wrapper = mount(LytNode, {
      props: { node: SYNTHETIC_PROGRAM },
      slots: {
        'leaf-A_engine_health': '<div class="probe-health">health</div>',
        'leaf-tree': '<div class="probe-tree">tree</div>',
      },
    });

    const cell = wrapper.element.querySelector('.lyt-leaf-cell') as HTMLElement;
    setBox(cell, { scrollWidth: 139, clientWidth: 139, scrollHeight: 20, clientHeight: 20 });
    const observer = FakeResizeObserver.instances.at(-1)!;
    observer.fire(cell);
    settleFrames();

    expect(sinkPush).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('disconnects its ResizeObserver on unmount (resource-ownership discipline)', () => {
    const wrapper = mount(LytNode, {
      props: { node: SYNTHETIC_PROGRAM },
      slots: {
        'leaf-A_engine_health': '<div class="probe-health">health</div>',
        'leaf-tree': '<div class="probe-tree">tree</div>',
      },
    });
    const observer = FakeResizeObserver.instances.at(-1);
    expect(observer).toBeDefined();
    expect(observer!.disconnected).toBe(false);
    wrapper.unmount();
    expect(observer!.disconnected).toBe(true);
  });
});
