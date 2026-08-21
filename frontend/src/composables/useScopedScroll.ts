import { onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Handles custom scroll logic for heavy components like game trees.
 * Intercepts wheel events only when the cursor is over the bound
 * element, so a wheel elsewhere on the page keeps its native scroll.
 *
 * Hover-gate purity fix (ledger row 1050; investigation row 1049):
 * this composable used to track hover with a `isHovered` ref flipped
 * by `mouseenter`/`mouseleave`, and gated `handleWheel` on that
 * stored flag. That stateful gate desyncs whenever the DOM changes
 * under a STATIONARY cursor — e.g. an overlay appears over the bound
 * element (the element hit-tests as covered, but no `mouseleave`
 * fires, because no mouse motion occurred) and later disappears (the
 * element is hit-testable again, but no `mouseenter` fires either,
 * for the same reason: the browser only fires enter/leave on actual
 * pointer motion, not on the DOM changing under a still pointer).
 * The maintainer hit exactly this via space-ponder-space: an overlay
 * came and went while the cursor never moved, and `isHovered` was
 * left stuck `false` — wheel navigation stayed dead until the
 * pointer physically re-entered the element.
 *
 * The repair (ADR-0000: encode the policy explicitly, not via
 * incidental topology) makes the gate a PURE FUNCTION OF THE WHEEL
 * EVENT itself: at wheel time, `event.composedPath()` is asked
 * whether it contains `el`. `composedPath()` is preferred over
 * `el.contains(event.target)` because it is shadow-DOM-correct —
 * `event.target` is retargeted to the shadow host when the real
 * target lives inside a shadow tree, which would make
 * `el.contains(event.target)` wrongly say "not contained" for a
 * target that IS visually and semantically inside `el`;
 * `composedPath()` walks the real (composed) ancestor chain instead,
 * so this stays correct even if a future consumer's markup grows a
 * shadow root. This app does not currently use shadow DOM, so the
 * two checks agree today, but only one of them stays correct if that
 * changes.
 *
 * Finding — was `isHovered` ever adding real filtering power? No.
 * `handleWheel` is bound directly on `el`
 * (`el.addEventListener('wheel', handleWheel, ...)`), and a
 * non-capturing listener on an element can only ever be invoked for
 * an event whose (composed) path already includes that element — a
 * wheel event that lands on a target outside `el`'s subtree never
 * reaches `handleWheel` at all, regardless of `isHovered`. So the
 * flag could never correctly SUPPRESS a wheel that shouldn't
 * navigate (native dispatch already suppressed those, by simply
 * never invoking the handler) — its only observable effect was the
 * opposite: sometimes incorrectly suppressing a wheel that SHOULD
 * navigate, whenever its cached state fell behind reality (the
 * desync bug above). The intent it was meant to encode — "navigate
 * when the wheel lands on the element, not otherwise" — falls
 * straight out of where the wheel event actually lands: if an
 * overlay sits on top of `el` but is NOT a DOM descendant of it
 * (e.g. teleported elsewhere), a wheel over that overlay never
 * targets `el`'s subtree and never reaches this handler, exactly the
 * "hovering something else" case the old flag tried to model — no
 * separate hover bookkeeping required. The explicit `composedPath`
 * check below is therefore redundant with the binding today; it is
 * kept anyway so the invariant is legible at the call site and
 * stays correct even if the listener is ever rebound higher up the
 * tree (e.g. delegated to `window`), where containment would no
 * longer be implied by dispatch alone.
 */
export function useScopedScroll(
  elementRef: Ref<HTMLElement | null>,
  onScroll: (deltaY: number) => void
) {
  let rafId: number | null = null

  const handleWheel = (event: WheelEvent): void => {
    const el = elementRef.value
    // Pure containment check, computed fresh from the event every
    // time — no stored hover state to fall out of sync.
    if (!el || !event.composedPath().includes(el)) return

    // Suppress default page scroll immediately (must be sync)
    event.preventDefault()

    // Throttle the custom logic to the browser's refresh rate
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
    }

    rafId = requestAnimationFrame(() => {
      onScroll(event.deltaY)
      rafId = null
    })
  }

  onMounted(() => {
    const el = elementRef.value
    if (!el) return

    // passive: false is non-negotiable here to allow preventDefault()
    el.addEventListener('wheel', handleWheel, { passive: false })
  })

  onUnmounted(() => {
    const el = elementRef.value
    if (rafId) cancelAnimationFrame(rafId)

    if (el) {
      el.removeEventListener('wheel', handleWheel)
    }
  })
}
