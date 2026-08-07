/**
 * src/composables/chrome/useDeferredContainerBreakpoint.ts
 *
 * Charter amendment item 2 (ledger row 391): the maintainer identified
 * the felt "weirdness" during a resizer drag not as the geometric
 * width function (that's continuous — see `useResizablePanel.ts`) but
 * as a control-panel-hosted component's OWN discrete responsiveness
 * reorganization firing mid-gesture — a `@container` breakpoint (or
 * equivalent JS-driven width threshold) flipping a component's
 * internal layout (row → column, hide a sub-element) exactly as the
 * drag sweeps its container through that width, which reads as a
 * sudden snap superimposed on an otherwise-smooth drag.
 *
 * This is a SEPARATE continuity obligation from the pane-width
 * function's own C0 requirement: the width itself never has to stop
 * being continuous, but a component's DISCRETE reaction to that width
 * must not commit while a drag is in flight. Two ways to satisfy that
 * per the amendment: make the reorganization continuous (not always
 * possible — `flex-direction: row → column` has no continuous analog),
 * or defer the discrete commit to drag release, with hysteresis so a
 * width sitting at the boundary post-release doesn't flap. This
 * composable implements the second option, generically, for any
 * consumer with a single narrow/wide (or below/above-threshold)
 * boolean breakpoint.
 *
 * ── Mechanism ─────────────────────────────────────────────────────
 * A `ResizeObserver` on the caller-supplied element continuously
 * tracks the LIVE raw crossing state (with its own hysteresis band,
 * so the live reading itself doesn't flap right at the threshold).
 * While `isAnyPanelResizing` (`useResizablePanel.ts`) is true, the
 * EXPOSED `committed` ref is frozen at whatever it was when the drag
 * started — the live reading keeps updating internally, but nothing
 * downstream (the CSS class a template binds) sees it move. The
 * moment `isAnyPanelResizing` flips back to false (drag released), the
 * live reading is committed once, immediately, with the SAME
 * hysteresis rule applied relative to the pre-drag committed state —
 * so a release that lands exactly on the boundary doesn't oscillate
 * on the very next `mousemove`-free measurement either.
 *
 * ADR-0010 imperative-escape shape: a `ResizeObserver` reads geometry
 * only at its own layout-clean callback (never synchronously on a hot
 * path), and is released in the returned `stop()` — callers wire it to
 * `onUnmounted` themselves (this composable doesn't call
 * `onUnmounted` internally so it stays usable from a plain `<script
 * setup>` without assuming a component-instance lifecycle is always
 * the right release point; see `useDeferredContainerBreakpoint`'s own
 * call sites for the wiring).
 *
 * License: Public Domain (The Unlicense)
 */
import { ref, watch, type Ref } from 'vue';
import { isAnyPanelResizing } from './useResizablePanel';

export interface DeferredContainerBreakpoint {
  /** True when the element is at/below the (hysteresis-adjusted)
   *  threshold — frozen mid-drag, committed on release. Bind this to
   *  the component's reorganization class/branch. */
  committed: Ref<boolean>;
  /** Attach to the element to observe. Call once, e.g. from a
   *  template ref's watcher or directly after mount. */
  observe: (el: Element) => void;
  /** Detach the observer. Callers wire this to `onUnmounted`. */
  stop: () => void;
}

/**
 * `thresholdPx`: the width below which the caller's layout should be
 * in its "narrow" (reorganized) mode.
 * `hysteresisPx`: total band width around `thresholdPx` — the live
 * reading only flips FROM wide TO narrow below
 * `thresholdPx - hysteresisPx / 2`, and only flips back above
 * `thresholdPx + hysteresisPx / 2`. Default 24px — small enough to
 * stay visually near the documented threshold, large enough that a
 * width sitting within a couple of drag-pixels of the boundary
 * doesn't flap on sub-pixel layout jitter.
 */
export function useDeferredContainerBreakpoint(
  thresholdPx: number,
  hysteresisPx = 24,
): DeferredContainerBreakpoint {
  const committed = ref(false);
  let liveNarrow = false;
  let observer: ResizeObserver | null = null;

  function evaluate(widthPx: number) {
    const enterBelow = thresholdPx - hysteresisPx / 2;
    const exitAbove = thresholdPx + hysteresisPx / 2;
    liveNarrow = liveNarrow ? widthPx < exitAbove : widthPx < enterBelow;
  }

  function commitIfIdle() {
    if (!isAnyPanelResizing.value) {
      committed.value = liveNarrow;
    }
    // else: mid-drag — defer. The watcher below commits the final
    // live reading the instant isAnyPanelResizing flips back to
    // false, so the deferred value is never lost, only delayed.
  }

  // Commits exactly once, immediately, on drag release — this is the
  // "defer the discrete commit to drag release" half of the
  // amendment's chosen strategy. Uses the SAME evaluate()/liveNarrow
  // hysteresis state a live (non-dragging) resize would have produced
  // by now (evaluate() keeps running during the drag, off the exposed
  // ref), so release-time commit isn't a fresh, un-hysteresis'd read.
  const stopWatch = watch(isAnyPanelResizing, (resizing) => {
    if (!resizing) commitIfIdle();
  });

  function observe(el: Element) {
    observer?.disconnect();
    observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w === 0) return; // v-show-collapsed or unmeasured; ignore
      evaluate(w);
      commitIfIdle();
    });
    observer.observe(el);
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    stopWatch();
  }

  return { committed, observe, stop };
}
