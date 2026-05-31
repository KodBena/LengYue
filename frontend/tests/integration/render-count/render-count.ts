/**
 * tests/integration/render-count/render-count.ts
 *
 * Render-count regression harness (prevention strategy P4 from the
 * 2026-05-31 "green" perf-arc audit). Converts render-coupling — a
 * component whose entire render function re-runs on a high-frequency
 * reactive read it should not hold — from a profile-only finding into
 * a CI-catchable one.
 *
 * ── Why a render-function counter, not Vue's UserTiming marks ──────────
 * ADR-0009's profiling workflow ranks components by the `<C> render` /
 * `<C> patch` marks Vue emits under `app.config.performance`. Those
 * marks are NOT emitted under jsdom in the Vitest environment
 * (empirically verified: `performance.getEntriesByType('mark')` is
 * empty after re-renders), so they cannot be the in-test signal.
 *
 * The signal this harness uses is more direct and exactly the quantity
 * ADR-0010's corollary names: *how many times the render function
 * runs*. A `<script setup>` SFC compiles to a component object whose
 * top-level `render` option IS the render function (verified: the
 * compiled object exposes `render`). We wrap that function with a
 * counting shim before mount; each invocation increments the counter.
 * This counts the *render*, not the *patch* — which is the whole point:
 * `v-memo` and "pull the element out of the loop" suppress the patch
 * while the render still runs, and it is the render that render-coupling
 * makes expensive. `onUpdated` / DOM-diff observation would measure the
 * patch and miss the bug; this measures the render and catches it.
 *
 * ── Non-flakiness ─────────────────────────────────────────────────────
 * The counter is deterministic: it is incremented synchronously inside
 * the render function, and the test awaits `nextTick()` after each
 * driving event so Vue's microtask-batched re-render has flushed before
 * the assertion reads the count. There is no timer, no wall-clock
 * threshold, no animation frame — the assertion is on an integer count
 * of synchronous function invocations, which is reproducible run to run.
 *
 * License: Public Domain (The Unlicense)
 */

import { mount } from '@vue/test-utils';
import type { ComponentMountingOptions } from '@vue/test-utils';
import type { Component } from 'vue';

export interface RenderCountHarness<C> {
  /** The @vue/test-utils wrapper for the mounted component. */
  wrapper: ReturnType<typeof mount<C>>;
  /** Total render-function invocations since mount (mount counts as 1+). */
  renderCount(): number;
  /** Reset the counter to 0 — call after mount to measure update-only renders. */
  resetRenderCount(): void;
  /** Unmount and restore the component's original render function. */
  unmount(): void;
}

/**
 * Mount `component` with a counting shim wrapped around its compiled
 * `render` function. Returns the wrapper plus a `renderCount()` accessor.
 *
 * The component object is shared module state, so the shim is installed
 * on a shallow clone passed to `mount` — the original object's `render`
 * is never mutated, avoiding cross-test contamination.
 */
export function mountWithRenderCount<C extends Component>(
  component: C,
  options?: ComponentMountingOptions<C>,
): RenderCountHarness<C> {
  const original = (component as unknown as { render?: (...a: unknown[]) => unknown }).render;
  if (typeof original !== 'function') {
    throw new Error(
      'mountWithRenderCount: component has no compiled `render` option to count. ' +
        'This harness counts top-level render-function invocations; a component ' +
        'whose render is produced inside set() (returned closure) needs a ' +
        'different instrumentation point.',
    );
  }

  let count = 0;
  // Shallow-clone so we never mutate the shared, imported component object.
  const counted = {
    ...(component as object),
    render(this: unknown, ...args: unknown[]) {
      count++;
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    },
  } as C;

  const wrapper = mount(counted, options);

  return {
    wrapper,
    renderCount: () => count,
    resetRenderCount: () => {
      count = 0;
    },
    unmount: () => {
      wrapper.unmount();
    },
  };
}
