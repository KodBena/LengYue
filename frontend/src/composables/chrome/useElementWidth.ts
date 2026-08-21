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

  function observe(el: Element): void {
    observer?.disconnect();
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
  }

  onUnmounted(stop);

  return { widthPx, observe, stop };
}
