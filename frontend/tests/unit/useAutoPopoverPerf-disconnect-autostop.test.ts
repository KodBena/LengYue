/**
 * tests/unit/useAutoPopoverPerf-disconnect-autostop.test.ts
 *
 * Review remedy (ledger row 1335): the load-bearing mechanism behind
 * M8(a)'s fix — useAutoPopoverPerf.ts's `watch(() => store.engine.status
 * === 'connected', …)` — had no direct observer. This exercises it
 * directly: start a run while connected, flip the engine to
 * disconnected, and assert the run actually stops (isRunning flips
 * false, no further popover:open/close marks, exactly one
 * popover:stress-end mark for that stop).
 *
 * `useAutoPopoverPerf` calls `onUnmounted` internally, so it must run
 * inside a component's `setup()` (Vue's composition-API lifecycle
 * hooks are no-ops — and warn — outside one) — a minimal host
 * component, same shape `chart-panel-preview.seam.test.ts` and
 * sibling composable tests use when the composable under test isn't
 * itself lifecycle-free.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { useAutoPopoverPerf } from '../../src/composables/useAutoPopoverPerf';
import { store, resetWorkspace } from '../../src/store';
import { POPOVER_STRESS_HALF_PERIOD_MS } from '../../src/lib/timing';

function mountHarness() {
  let handle!: ReturnType<typeof useAutoPopoverPerf>;
  const wrapper = mount(
    defineComponent({
      setup() {
        handle = useAutoPopoverPerf();
        return () => null;
      },
    }),
  );
  return { wrapper, handle };
}

describe('useAutoPopoverPerf — auto-stops when the engine disconnects mid-run (M8(a) review remedy)', () => {
  beforeEach(() => {
    resetWorkspace();
    store.engine.status = 'connected';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    store.engine.status = 'disconnected';
  });

  it('isRunning flips to false when the engine disconnects', async () => {
    const { handle, wrapper } = mountHarness();

    handle.start('queue');
    expect(handle.isRunning.value).toBe(true);

    store.engine.status = 'disconnected';
    await nextTick();

    expect(handle.isRunning.value).toBe(false);
    wrapper.unmount();
  });

  it('no further popover:open/close marks fire after the disconnect-triggered stop', async () => {
    const { handle, wrapper } = mountHarness();
    const markSpy = vi.spyOn(performance, 'mark');

    handle.start('queue');
    store.engine.status = 'disconnected';
    await nextTick();
    expect(handle.isRunning.value).toBe(false);

    markSpy.mockClear();
    // If the timer loop were still ticking, advancing several half-
    // periods would emit popover:open/close marks — it must not.
    vi.advanceTimersByTime(POPOVER_STRESS_HALF_PERIOD_MS * 6);

    const tickMarks = markSpy.mock.calls.filter(
      ([name]) => name === 'popover:open' || name === 'popover:close',
    );
    expect(tickMarks).toHaveLength(0);
    wrapper.unmount();
  });

  it('emits exactly one popover:stress-end mark for the disconnect-triggered stop', async () => {
    const { handle, wrapper } = mountHarness();
    const markSpy = vi.spyOn(performance, 'mark');

    handle.start('queue');
    store.engine.status = 'disconnected';
    await nextTick();

    const endMarks = markSpy.mock.calls.filter(([name]) => name === 'popover:stress-end');
    expect(endMarks).toHaveLength(1);
    wrapper.unmount();
  });

  it('does NOT stop a run while the engine stays connected (negative control)', async () => {
    const { handle, wrapper } = mountHarness();

    handle.start('queue');
    await nextTick();
    // No status change — the watch's guard condition never fires.
    expect(handle.isRunning.value).toBe(true);

    handle.stop();
    wrapper.unmount();
  });
});
