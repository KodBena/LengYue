/**
 * src/composables/chrome/useFixedAnchoredPopover.ts
 *
 * Commission lyt-popover-clip-class (ratified program row 1937):
 * extracts the `position: fixed` clip-ancestor-escape shape D1/D1-
 * corrective built for `ToolbarSliderPopover.vue`
 * (`.claude/dispatch-reports/lyt-sliders-popover-defects.md`,
 * reviewed at that same report's "Review response" section — no
 * standalone `lyt-sliders-popover-review.md` file exists in this tree
 * under that name; the review verdict and its four findings are
 * folded into the defects report itself, read in full for this
 * commission) into ONE shared composable, so the fix is a home other
 * toolbar-hosted popovers can route through rather than a bespoke
 * per-component script block that would drift from its siblings the
 * next time the geometry formula needs a correction (ADR-0012 P1 —
 * single source of truth for the tracked-fixed-anchor formula).
 *
 * ── The defect class this forecloses ────────────────────────────────
 * A toolbar-hosted popover that is a DOM descendant of an
 * `overflow: auto|hidden|scroll` ancestor (here, `.lyt-toolbar-strip`,
 * `App.vue`) gets its painted box truncated at that ancestor's edge
 * when `position: absolute`, regardless of `z-index` — CSS clips by
 * containing-block/scroll-container participation, not by paint
 * order. `position: fixed` escapes that clip (its containing block is
 * the viewport, absent a `transform`/`filter`/`perspective`/`contain`/
 * `will-change: transform` ancestor — verified none of this
 * composable's three consumers' ancestor chains introduce one), but
 * trades away two things a `position: absolute` box gets for free
 * from the browser's own containing-block layout: (1) percentage/
 * keyword CSS anchors (`top: 100%`, `right: 0`) no longer resolve
 * against the trigger's own box, and (2) implicit scroll-tracking —
 * when the clipping ancestor scrolls, an `absolute` popover moves
 * with it; a `fixed` one does not, so it can visually detach from a
 * trigger that has scrolled out from under a now-stale anchor. This
 * composable restores both: an anchor computed from the trigger's own
 * `getBoundingClientRect()`, recomputed on every `scroll` (capture-
 * phase, since `scroll` does not bubble) and `resize` event while the
 * popover is open, plus a horizontal + vertical viewport-edge clamp.
 *
 * ── Contract with `useHoverPopover` ──────────────────────────────────
 * This composable does not touch the DOM tree — no Teleport, no
 * element creation. It only ever writes a `{ top, left }` style object
 * the consumer binds via `:style` on the SAME popover element the
 * consumer's own template renders as a descendant of its hover root.
 * That preserves `useHoverPopover`'s own layout contract (the popover
 * panel must stay a DOM descendant of the hover root so a `mouseenter`
 * re-entry from the popover itself is caught — see that composable's
 * header). The two composables are independent: `useHoverPopover` owns
 * WHEN the popover is open; this one owns WHERE it is drawn once open.
 * A consumer wires both, passing this composable the SAME `open` ref
 * `useHoverPopover` returned.
 *
 * ── Anchor alignment ──────────────────────────────────────────────
 * `align: 'right'` reproduces a `right: 0` CSS anchor (the popover's
 * right edge lines up with the trigger's right edge) — the shape
 * `ToolbarSliderPopover`/`PboPopover` used. `align: 'left'` reproduces
 * a `left: 0` CSS anchor (popover's left edge lines up with the
 * trigger's left edge) — the shape `EngineQueueTooltip` used. Both
 * anchor the popover's `top` flush against the trigger's bottom edge
 * (`useHoverPopover`'s own "no dead zone" contract — see that
 * composable's Layout contract section), clamped against the viewport
 * bottom the same way `left`/`right` are clamped against the viewport
 * sides.
 *
 * ── Resource ownership (frontend/CLAUDE.md) ──────────────────────────
 * A `window`-level capture-phase `scroll` listener + a `window`
 * `resize` listener, both passive, registered ONLY while `open` is
 * true (attached in the `watch(open, ...)` open branch, detached in
 * its close branch) AND released on `onUnmounted` (a component can
 * unmount while `open` is still true — a route change or a parent
 * re-render tearing it down mid-hover — which fires no `watch`
 * transition, only the unmount hook). Idempotence guard prevents a
 * second open cycle from stacking a second listener pair. Failure mode
 * if unreleased: `window` outlives every component instance, so an
 * unreleased listener is a per-open-cycle leak, each one dereferencing
 * this closure's `triggerEl`/`popoverEl` refs after the owning
 * component may be long gone.
 *
 * ── ADR-0003 band ────────────────────────────────────────────────────
 * Band 1 (truly domain-agnostic). Pointer/viewport/DOM-geometry math;
 * no Go, engine, or SGF vocabulary.
 *
 * License: Public Domain (The Unlicense)
 */

import { nextTick, onUnmounted, ref, watch, type Ref } from 'vue';

// magic-literal: 4px viewport margin — same constant
// usePopoverEdgeClamp defaults to (see that file's docstring) and
// ToolbarSliderPopover's pre-extraction local carried; kept as the
// shared default here so every fixed-anchored popover gets the same
// breathing room unless a consumer opts into a different value.
const DEFAULT_VIEWPORT_MARGIN_PX = 4;

export interface UseFixedAnchoredPopoverOptions {
  /**
   * Horizontal alignment of the popover relative to the trigger's own
   * box. `'right'` lines the popover's right edge up with the
   * trigger's right edge (mirrors a `right: 0` CSS anchor); `'left'`
   * lines the popover's left edge up with the trigger's left edge
   * (mirrors a `left: 0` CSS anchor).
   */
  align: 'left' | 'right';
  /**
   * Pixels of breathing room kept between the clamped popover edge
   * and the viewport edge, on all four clamped edges (left/right/
   * bottom). Default 4px.
   */
  viewportMarginPx?: number;
}

export interface FixedAnchoredPopoverHandle {
  /** Bind via `:style="style"` on the popover element. */
  readonly style: Ref<{ top: string; left: string }>;
}

/**
 * @param open       The SAME `open` ref `useHoverPopover` (or an
 *                    equivalent open/close boolean source) returned —
 *                    this composable reads it, never writes it.
 * @param triggerEl   Template ref bound to the trigger element
 *                    (`ref="triggerEl"` in the consumer's template).
 * @param popoverEl   Template ref bound to the popover panel element
 *                    (`ref="popoverEl"` on the same `v-if="open"` node
 *                    the consumer binds `style` to).
 */
export function useFixedAnchoredPopover(
  open: Ref<boolean>,
  triggerEl: Ref<HTMLElement | null>,
  popoverEl: Ref<HTMLElement | null>,
  options: UseFixedAnchoredPopoverOptions,
): FixedAnchoredPopoverHandle {
  const viewportMargin = options.viewportMarginPx ?? DEFAULT_VIEWPORT_MARGIN_PX;
  const style = ref<{ top: string; left: string }>({ top: '0px', left: '0px' });

  // Shared by the initial open-time computation AND the scroll/resize
  // re-anchor below — one formula, not two copies risking drift
  // (ADR-0002 Rule 7 / ADR-0012 P1).
  function recomputeStyle(): void {
    if (!triggerEl.value || !popoverEl.value) return;
    const triggerRect = triggerEl.value.getBoundingClientRect();
    const popoverRect = popoverEl.value.getBoundingClientRect();

    let top = triggerRect.bottom; // flush against the trigger — useHoverPopover's own "no dead zone" contract
    if (top + popoverRect.height > window.innerHeight - viewportMargin) {
      top = Math.max(viewportMargin, window.innerHeight - viewportMargin - popoverRect.height);
    }

    let left = options.align === 'right'
      ? triggerRect.right - popoverRect.width
      : triggerRect.left;
    if (left < viewportMargin) {
      left = viewportMargin;
    } else if (left + popoverRect.width > window.innerWidth - viewportMargin) {
      left = window.innerWidth - viewportMargin - popoverRect.width;
    }

    style.value = { top: `${top}px`, left: `${left}px` };
  }

  // Resource: window-level capture-phase scroll listener + window resize
  // listener, both passive, registered only while `open` is true. See
  // the file-header "Resource ownership" section for the full rationale
  // and failure mode.
  let listenersAttached = false;
  function attachListeners(): void {
    if (listenersAttached) return; // idempotent: a second open-cycle's attach must not stack a second pair
    window.addEventListener('scroll', recomputeStyle, { capture: true, passive: true });
    window.addEventListener('resize', recomputeStyle, { passive: true });
    listenersAttached = true;
  }
  function detachListeners(): void {
    if (!listenersAttached) return;
    window.removeEventListener('scroll', recomputeStyle, { capture: true });
    window.removeEventListener('resize', recomputeStyle);
    listenersAttached = false;
  }

  watch(open, async (isOpen) => {
    if (!isOpen) {
      detachListeners();
      return;
    }
    await nextTick(); // let the v-if'd popover mount so its width/height are measurable
    if (!triggerEl.value || !popoverEl.value) return;
    recomputeStyle();
    attachListeners();
  });

  onUnmounted(detachListeners); // watch's close branch alone does not cover an unmount-while-open

  return { style };
}
