/**
 * tests/integration/useDeferredContainerBreakpoint.test.ts
 *
 * Charter amendment item 2 (ledger row 391): a control-panel-hosted
 * component's discrete responsiveness reorganization (a `@container`-
 * style breakpoint) must not commit mid-drag. This composable defers
 * the commit to drag release with hysteresis — see
 * `useDeferredContainerBreakpoint.ts`'s header for the full mechanism.
 *
 * Tier: composable integration (Vue reactivity — `ref`/`watch` against
 * the real `isAnyPanelResizing` flag from `useResizablePanel.ts` — but
 * no DOM drag; `ResizeObserver` is faked here since jsdom's own stub
 * (`tests/integration/render-count/jsdom-stubs.ts`) is a permanent
 * no-op that never invokes its callback, useless for driving this
 * composable's width-tracking logic).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import {
  useDeferredContainerBreakpoint,
} from '../../src/composables/chrome/useDeferredContainerBreakpoint';
import { isAnyPanelResizing } from '../../src/composables/chrome/useResizablePanel';

// A controllable ResizeObserver fake: captures the callback so the
// test can fire synthetic width entries on demand, and records
// observe/disconnect calls for the resource-ownership assertions.
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
  fire(widthPx: number) {
    this.callback(
      [{ contentRect: { width: widthPx } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  FakeResizeObserver.instances = [];
  (globalThis as any).ResizeObserver = FakeResizeObserver;
  isAnyPanelResizing.value = false;
});

afterEach(() => {
  (globalThis as any).ResizeObserver = originalResizeObserver;
  isAnyPanelResizing.value = false;
});

function lastObserver(): FakeResizeObserver {
  const inst = FakeResizeObserver.instances.at(-1);
  if (!inst) throw new Error('no ResizeObserver constructed');
  return inst;
}

describe('useDeferredContainerBreakpoint — live behavior (not dragging)', () => {
  it('commits narrow=true immediately when width drops below threshold - hysteresis/2', () => {
    const { committed, observe, stop } = useDeferredContainerBreakpoint(479, 24);
    observe(document.createElement('div'));
    expect(committed.value).toBe(false);

    lastObserver().fire(400); // well below 479 - 12 = 467
    expect(committed.value).toBe(true);
    stop();
  });

  it('commits narrow=false immediately when width rises above threshold + hysteresis/2', () => {
    const { committed, observe, stop } = useDeferredContainerBreakpoint(479, 24);
    observe(document.createElement('div'));
    lastObserver().fire(400);
    expect(committed.value).toBe(true);

    lastObserver().fire(600); // well above 479 + 12 = 491
    expect(committed.value).toBe(false);
    stop();
  });

  it('does not flap within the hysteresis band once committed narrow', () => {
    const { committed, observe, stop } = useDeferredContainerBreakpoint(479, 24);
    observe(document.createElement('div'));
    lastObserver().fire(400);
    expect(committed.value).toBe(true);

    // Sits inside the band (467..491) — must stay narrow (the entry
    // condition was "< 467"; a width of 480 is above 467 and below
    // 491, so it must NOT flip back to wide from the narrow side).
    lastObserver().fire(480);
    expect(committed.value).toBe(true);
    stop();
  });

  it('does not flap within the hysteresis band once committed wide', () => {
    const { committed, observe, stop } = useDeferredContainerBreakpoint(479, 24);
    observe(document.createElement('div'));
    expect(committed.value).toBe(false);

    lastObserver().fire(480); // inside the band, starting from wide
    expect(committed.value).toBe(false);
    stop();
  });

  it('ignores a zero-width measurement (v-show-collapsed / unmeasured)', () => {
    const { committed, observe, stop } = useDeferredContainerBreakpoint(479, 24);
    observe(document.createElement('div'));
    lastObserver().fire(400);
    expect(committed.value).toBe(true);

    lastObserver().fire(0);
    // Unchanged — a 0-width read is not evidence of anything.
    expect(committed.value).toBe(true);
    stop();
  });
});

describe('useDeferredContainerBreakpoint — deferred to drag release (the amendment\'s core requirement)', () => {
  it('does NOT commit a reorg while isAnyPanelResizing is true, even as width sweeps through the threshold', async () => {
    const { committed, observe, stop } = useDeferredContainerBreakpoint(479, 24);
    observe(document.createElement('div'));
    expect(committed.value).toBe(false);

    isAnyPanelResizing.value = true;
    await nextTick();

    // Sweep straight through the threshold mid-drag.
    lastObserver().fire(600);
    lastObserver().fire(500);
    lastObserver().fire(479);
    lastObserver().fire(400);
    lastObserver().fire(300);

    // Frozen at the pre-drag value the whole time — this is the
    // literal assertion the amendment asks for: no mid-gesture commit.
    expect(committed.value).toBe(false);
    stop();
  });

  it('commits the final live reading exactly once, immediately on drag release', async () => {
    const { committed, observe, stop } = useDeferredContainerBreakpoint(479, 24);
    observe(document.createElement('div'));

    isAnyPanelResizing.value = true;
    await nextTick();
    lastObserver().fire(300); // ends the drag well inside "narrow" territory
    expect(committed.value).toBe(false); // still frozen

    isAnyPanelResizing.value = false;
    await nextTick();

    expect(committed.value).toBe(true);
    stop();
  });

  it('a drag that starts and ends on the SAME side of the threshold commits no change', async () => {
    const { committed, observe, stop } = useDeferredContainerBreakpoint(479, 24);
    observe(document.createElement('div'));
    expect(committed.value).toBe(false);

    isAnyPanelResizing.value = true;
    await nextTick();
    lastObserver().fire(700);
    lastObserver().fire(650);
    isAnyPanelResizing.value = false;
    await nextTick();

    expect(committed.value).toBe(false);
    stop();
  });

  it('a released drag landing back in the hysteresis band does not flap on the very next measurement', async () => {
    const { committed, observe, stop } = useDeferredContainerBreakpoint(479, 24);
    observe(document.createElement('div'));

    isAnyPanelResizing.value = true;
    await nextTick();
    lastObserver().fire(400); // drag ends narrow
    isAnyPanelResizing.value = false;
    await nextTick();
    expect(committed.value).toBe(true);

    // A subsequent idle measurement landing inside the band (not
    // dragging) must not flip it back — same hysteresis rule as the
    // live (non-dragging) tests above.
    lastObserver().fire(480);
    expect(committed.value).toBe(true);
    stop();
  });
});

describe('useDeferredContainerBreakpoint — resource ownership', () => {
  it('stop() disconnects the ResizeObserver (ADR-0010 imperative-escape step 4)', () => {
    const { observe, stop } = useDeferredContainerBreakpoint(479, 24);
    const el = document.createElement('div');
    observe(el);
    const obs = lastObserver();
    expect(obs.disconnected).toBe(false);
    stop();
    expect(obs.disconnected).toBe(true);
  });

  it('re-calling observe() on a new element disconnects the prior observer', () => {
    const { observe, stop } = useDeferredContainerBreakpoint(479, 24);
    observe(document.createElement('div'));
    const first = lastObserver();
    observe(document.createElement('div'));
    expect(first.disconnected).toBe(true);
    stop();
  });
});
