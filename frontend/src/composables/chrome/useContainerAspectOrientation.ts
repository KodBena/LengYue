/**
 * src/composables/chrome/useContainerAspectOrientation.ts
 *
 * Allocation-family closing arc, item 1 (fd2a_cardtree_poorly_utilized_
 * space_when_selecting_card.png): the Lineage Explorer's card-tree
 * widget (`CardTreeWidget.vue`, hosted by `ForestDirectory.vue`) used
 * to default to a fixed 'vertical' orientation regardless of the
 * container it renders into — a wide-but-short container squished the
 * tree into a narrow vertical strip even though a horizontal (root-on-
 * left) layout would have used the space far better. This composable
 * derives 'horizontal' | 'vertical' from a watched element's own
 * content-box aspect ratio, so the tree orients itself to whatever
 * space it actually has.
 *
 * `widthPx >= heightPx` derives 'horizontal' (wide-or-square container
 * — root on the left, tree grows rightward, the natural fit when
 * horizontal space exceeds vertical); otherwise 'vertical' (a taller-
 * than-wide container — root on top, tree grows downward). Ties go to
 * 'horizontal' since ECharts' tree layout reads left-to-right more
 * naturally at a 1:1 ratio than top-to-bottom does in a narrow strip.
 *
 * ADR-0010 imperative-escape shape, matching `useElementWidth.ts`'s
 * precedent it's a sibling of: a synchronous best-effort measurement
 * at `observe()` time (so the first render already has a real derived
 * orientation instead of a transient default), then a `ResizeObserver`
 * for subsequent changes, released via `stop()`.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, onUnmounted, ref, type ComputedRef, type Ref } from 'vue';

export type ContainerOrientation = 'horizontal' | 'vertical';

export interface ContainerAspectOrientation {
  /** Live content-box width in px. 0 before the first measurement. */
  widthPx: Ref<number>;
  /** Live content-box height in px. 0 before the first measurement. */
  heightPx: Ref<number>;
  /** Derived orientation from the current width/height. 'horizontal'
   *  when unmeasured (widthPx/heightPx both 0) — the pre-existing
   *  default this composable supersedes, so a not-yet-measured
   *  consumer renders identically to before. */
  derivedOrientation: ComputedRef<ContainerOrientation>;
  /** Attach to the element to observe. Re-calling disconnects the prior one. */
  observe: (el: Element) => void;
  /** Detach the observer. */
  stop: () => void;
}

// Content-box width/height, excluding padding and border — matches
// `useElementWidth.ts`'s `measureContentBoxWidth` convention so a
// caller that observes the same element its layout is computed inside
// gets exactly the space available to that layout.
function measureContentBox(el: Element): { width: number; height: number } {
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const insetX =
    (parseFloat(style.paddingLeft) || 0) +
    (parseFloat(style.paddingRight) || 0) +
    (parseFloat(style.borderLeftWidth) || 0) +
    (parseFloat(style.borderRightWidth) || 0);
  const insetY =
    (parseFloat(style.paddingTop) || 0) +
    (parseFloat(style.paddingBottom) || 0) +
    (parseFloat(style.borderTopWidth) || 0) +
    (parseFloat(style.borderBottomWidth) || 0);
  return {
    width: Math.max(0, rect.width - insetX),
    height: Math.max(0, rect.height - insetY),
  };
}

export function useContainerAspectOrientation(): ContainerAspectOrientation {
  const widthPx = ref(0);
  const heightPx = ref(0);
  let observer: ResizeObserver | null = null;

  const derivedOrientation = computed<ContainerOrientation>(() =>
    heightPx.value > widthPx.value ? 'vertical' : 'horizontal',
  );

  function observe(el: Element): void {
    observer?.disconnect();
    const box = measureContentBox(el);
    widthPx.value = box.width;
    heightPx.value = box.height;
    observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      if (rect.width === 0 && rect.height === 0) return; // v-show-collapsed / unmeasured
      widthPx.value = rect.width;
      heightPx.value = rect.height;
    });
    observer.observe(el);
  }

  function stop(): void {
    observer?.disconnect();
    observer = null;
  }

  onUnmounted(stop);

  return { widthPx, heightPx, derivedOrientation, observe, stop };
}
