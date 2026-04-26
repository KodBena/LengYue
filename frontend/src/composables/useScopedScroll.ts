import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Handles custom scroll logic for heavy components like game trees.
 * Intercepts wheel events only when hovered to prevent page scroll.
 */
export function useScopedScroll(
  elementRef: Ref<HTMLElement | null>,
  onScroll: (deltaY: number) => void
) {
  const isHovered = ref<boolean>(false)
  let rafId: number | null = null

  const handleWheel = (event: WheelEvent): void => {
    // 1. Immediate exit if not hovered
    if (!isHovered.value) return

    // 2. Suppress default page scroll immediately (must be sync)
    event.preventDefault()

    // 3. Throttle the custom logic to the browser's refresh rate
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
    }

    rafId = requestAnimationFrame(() => {
      onScroll(event.deltaY)
      rafId = null
    })
  }

  // Named handlers for clean removal
  const handleMouseEnter = () => { isHovered.value = true }
  const handleMouseLeave = () => { isHovered.value = false }

  onMounted(() => {
    const el = elementRef.value
    if (!el) return

    // passive: false is non-negotiable here to allow preventDefault()
    el.addEventListener('wheel', handleWheel, { passive: false })
    el.addEventListener('mouseenter', handleMouseEnter)
    el.addEventListener('mouseleave', handleMouseLeave)
  })

  onUnmounted(() => {
    const el = elementRef.value
    if (rafId) cancelAnimationFrame(rafId)
    
    if (el) {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('mouseenter', handleMouseEnter)
      el.removeEventListener('mouseleave', handleMouseLeave)
    }
  })

  return { isHovered }
}
