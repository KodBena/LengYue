/**
 * src/composables/chrome/usePopoverEdgeClamp.ts
 *
 * Viewport-edge clamp for absolutely-positioned hover popovers
 * (`ToolbarSliderPopover`, `EngineQueueTooltip`, `PboPopover`).
 * Returns a `popoverEl` template ref and an `xShift` value the
 * consumer pipes into the popover's `transform: translateX(...)`
 * so the rendered popover slides inward when an `right: 0` /
 * `left: 0` CSS anchor would otherwise push it off-screen.
 *
 * ── Behaviour ────────────────────────────────────────────────────
 *
 * Watches `open`. When it flips true, waits one `nextTick` for the
 * v-if'd popover to mount, then measures `getBoundingClientRect`
 * against `window.innerWidth`. Two symmetric checks:
 *
 *   - If `rect.left < margin`, shift right by `margin - rect.left`.
 *     (The `right: 0`-anchored popovers overflow this side.)
 *
 *   - Else if `rect.right > viewport - margin`, shift left by
 *     `(viewport - margin) - rect.right`. (The `left: 0`-anchored
 *     popovers overflow this side.)
 *
 * A popover wider than viewport - 2*margin would trigger both
 * branches in principle; the first one wins (left-edge preserved,
 * right-edge clipped). That's a deliberate ordering — labels
 * generally sit on the left, so keeping the left edge visible is
 * more useful than keeping the right edge visible.
 *
 * `xShift` resets to 0 on close so the next open starts from a
 * known position (the v-if remount + `nextTick` measurement does
 * the work fresh).
 *
 * Snapshot semantics: the measurement happens once per open. A
 * window resize while the popover is open is not tracked; the
 * popover is hidden on mouseleave anyway, and a `resize` listener
 * would conflict with the close-grace timer from
 * `useHoverPopover`.
 *
 * ── Layout contract for the consumer ─────────────────────────────
 *
 * The consumer binds `setPopoverEl` to the popover element's
 * `:ref` (the function-ref form, not the string form) and binds
 * `xShift` into a `transform: translateX(${x}px)` inline style.
 * The function-ref shape is chosen over an exposed `Ref` so the
 * consumer's `noUnusedLocals` tsc pass sees the destructured
 * binding as read — a string-form `ref="popoverEl"` would lose
 * volar's template-script tracking through destructuring.
 * `transform` shifts the visual position without disturbing
 * layout flow, so other elements don't reflow when the clamp
 * fires.
 *
 * ── ADR-0003 band ────────────────────────────────────────────────
 *
 * Band 1 (truly domain-agnostic). Pointer/viewport math; no Go,
 * engine, or SGF vocabulary.
 *
 * License: Public Domain (The Unlicense)
 */

import { nextTick, ref, watch, type ComponentPublicInstance, type Ref } from 'vue';

// magic-literal: 4px viewport margin — the breathing room kept
// between the clamped popover edge and the viewport edge. Small
// enough to be invisible at typical zoom levels (it's "the popover
// didn't kiss the screen edge" rather than a visible gap) but large
// enough that the popover's border isn't shaved by sub-pixel
// rendering. Tuneable per call site via `viewportMarginPx`; full
// rationale on the option in the file's docstring above.
const DEFAULT_VIEWPORT_MARGIN_PX = 4;

export interface PopoverEdgeClampHandle {
  /**
   * Function-ref setter for the popover element. Bind via the
   * `:ref` form: `<div :ref="setPopoverEl" ...>`. See the
   * file-header note on why this isn't an exposed `Ref`.
   */
  readonly setPopoverEl: (el: Element | ComponentPublicInstance | null) => void;
  /** Pipe into `transform: translateX(${xShift}px)`. */
  readonly xShift: Ref<number>;
}

export interface UsePopoverEdgeClampOptions {
  /**
   * Pixels of breathing room kept between the clamped popover edge
   * and the viewport edge. Default 4 px — visible margin so the
   * popover's border doesn't kiss the screen edge. Tuneable per
   * call site if a popover wants tighter or looser clamping.
   */
  viewportMarginPx?: number;
}

export function usePopoverEdgeClamp(
  open: Ref<boolean>,
  options: UsePopoverEdgeClampOptions = {},
): PopoverEdgeClampHandle {
  const viewportMargin = options.viewportMarginPx ?? DEFAULT_VIEWPORT_MARGIN_PX;
  const popoverEl = ref<HTMLElement | null>(null);
  const xShift = ref<number>(0);

  // Function-ref setter. Vue's `:ref="setPopoverEl"` calls this
  // with the host element on mount and with `null` on unmount;
  // ComponentPublicInstance is included in the parameter type only
  // because Vue's function-ref contract allows it (we only bind to
  // a plain <div>, so the cast back to HTMLElement is safe).
  const setPopoverEl = (el: Element | ComponentPublicInstance | null): void => {
    popoverEl.value = el as HTMLElement | null;
  };

  watch(open, async (isOpen) => {
    if (!isOpen) {
      xShift.value = 0;
      return;
    }
    await nextTick();
    if (!popoverEl.value) return;
    const rect = popoverEl.value.getBoundingClientRect();
    if (rect.left < viewportMargin) {
      xShift.value = viewportMargin - rect.left;
    } else if (rect.right > window.innerWidth - viewportMargin) {
      xShift.value = window.innerWidth - viewportMargin - rect.right;
    }
  });

  return { setPopoverEl, xShift };
}
