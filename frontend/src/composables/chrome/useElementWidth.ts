/**
 * src/composables/chrome/useElementWidth.ts
 *
 * Resolution roadmap Phase 2 (ledger row 928). Generic single-element
 * width measurement via `ResizeObserver`, generalized from the pattern
 * `LibraryTable.vue` already used inline for its own height tracking
 * (`containerHeight`) — a second consumer (the Analysis dashboard's
 * interval-summary table) needing the same "observe an element, expose
 * its live content-box width as a ref" shape is what promotes it to a
 * shared composable rather than a second copy-pasted `ResizeObserver`
 * (ADR-0012: one home per fact).
 *
 * `contentRect.width` (not `clientWidth`) is what's read, matching
 * `useDeferredContainerBreakpoint.ts`'s convention: it is the
 * content-box width — the element's own padding is already excluded,
 * so a caller that observes the same element its columns are laid out
 * inside gets exactly the space available to those columns, with no
 * separate padding subtraction.
 *
 * ADR-0010 imperative-escape shape: the `ResizeObserver` reads
 * geometry only at its own layout-clean callback, and is released via
 * `stop()` — callers wire it to `onUnmounted` themselves (this
 * composable also does so internally when a component instance is
 * active, matching `useDeferredContainerBreakpoint`'s own
 * "caller decides" stance being unnecessary here since every consumer
 * so far calls this from `<script setup>`).
 *
 * ── Window-resize fallback (aff8 defect 3 repair) ──────────────────
 * `useResizablePanel.ts`'s own header ("Row 2502/2503 review repair,
 * finding 2" / the "A2b" dispatch finding) documents a live-witnessed,
 * real-browser-only failure mode: a `ResizeObserver` instance can
 * simply STOP delivering callbacks for a live, still-attached,
 * still-correctly-identified element after its initial settle —
 * reproduced three ways on a live rig (a `MutationObserver` proof of
 * zero style mutations for 3+ seconds post-resize despite the
 * element's real width changing; a raw-callback trace showing the
 * production observer's callback firing twice during initial settle
 * and never again; a FRESH `ResizeObserver` on the SAME element
 * firing correctly moments later). Nothing downstream can recover,
 * because the recovery path depends on the very delivery that
 * stopped — and jsdom cannot reproduce this at all (it never runs
 * real `ResizeObserver` box-size delivery). `useResizablePanel.ts`
 * closed this gap for `#tree-control-wrapper`/`#split-workspace` with
 * a plain `window` 'resize' listener, decoupled from `ResizeObserver`
 * entirely, that force-remeasures on every real viewport change. This
 * composable is the ONE home for "observe an element, expose its live
 * width" (ADR-0012 P1) — generalizing the same fallback here, once,
 * closes the identical gap for every current and future consumer
 * (`useEngineControlsRealization.ts` is the one this repair is for —
 * its own toolbar cluster wrongly collapsing to the overflow menu at
 * an ample viewport width was traced to exactly this class of stale
 * reading) rather than each one hand-rolling its own copy the way
 * `useResizablePanel.ts` necessarily did before this composable
 * existed in its current shape. Purely additive: `remeasure()` only
 * force-reads the CURRENTLY observed element (a no-op before the
 * first `observe()` call), so every existing consumer's behavior is
 * unchanged except for gaining this same resilience.
 *
 * License: Public Domain (The Unlicense)
 */
import { onUnmounted, ref, type Ref } from 'vue';

export interface MeasuredElementWidth {
  /** Live content-box width in px. 0 before the first measurement. */
  widthPx: Ref<number>;
  /** Attach to the element to observe. Re-calling disconnects the prior one. */
  observe: (el: Element) => void;
  /** Detach the observer. */
  stop: () => void;
}

// Synchronous best-effort content-box width, read once at `observe()`
// time so the FIRST render already has a real measurement instead of
// waiting a frame for the ResizeObserver's own async first callback
// (which would otherwise transiently read as 0 — "unmeasured" — and
// make a fit-decision consumer flash a too-narrow layout on mount).
// Mirrors `LibraryTable.vue`'s pre-existing `containerHeight.value =
// el.clientHeight` synchronous read in `onMounted`, generalized to
// content-box (padding-excluded) width so it matches what the
// ResizeObserver itself reports on every SUBSEQUENT callback.
function measureContentBoxWidth(el: Element): number {
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const inset =
    (parseFloat(style.paddingLeft) || 0) +
    (parseFloat(style.paddingRight) || 0) +
    (parseFloat(style.borderLeftWidth) || 0) +
    (parseFloat(style.borderRightWidth) || 0);
  return Math.max(0, rect.width - inset);
}

export function useElementWidth(): MeasuredElementWidth {
  const widthPx = ref(0);
  let observer: ResizeObserver | null = null;
  let observedEl: Element | null = null;

  // Window-resize fallback (see this file's own header) — force-reads
  // the currently observed element directly, decoupled from whether
  // `ResizeObserver` itself is still delivering. A no-op before the
  // first `observe()` call (`observedEl` still null).
  function remeasure(): void {
    if (observedEl === null) return;
    const w = measureContentBoxWidth(observedEl);
    if (w === 0) return; // v-show-collapsed / unmeasured; not evidence of anything
    widthPx.value = w;
  }

  function observe(el: Element): void {
    observer?.disconnect();
    observedEl = el;
    widthPx.value = measureContentBoxWidth(el);
    observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w === 0) return; // v-show-collapsed / unmeasured; not evidence of anything
      widthPx.value = w;
    });
    observer.observe(el);
  }

  function stop(): void {
    observer?.disconnect();
    observer = null;
    observedEl = null;
    window.removeEventListener('resize', remeasure);
  }

  window.addEventListener('resize', remeasure);
  onUnmounted(stop);

  return { widthPx, observe, stop };
}
