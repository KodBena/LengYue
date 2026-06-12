import { ref, onMounted, onUnmounted } from 'vue';
/**
 * Handles custom scroll logic for heavy components like game trees.
 * Intercepts wheel events only when hovered to prevent page scroll.
 */
export function useScopedScroll(elementRef, onScroll) {
    const isHovered = ref(false);
    let rafId = null;
    const handleWheel = (event) => {
        // 1. Immediate exit if not hovered
        if (!isHovered.value)
            return;
        // 2. Suppress default page scroll immediately (must be sync)
        event.preventDefault();
        // 3. Throttle the custom logic to the browser's refresh rate
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
        }
        rafId = requestAnimationFrame(() => {
            onScroll(event.deltaY);
            rafId = null;
        });
    };
    // Named handlers for clean removal
    const handleMouseEnter = () => { isHovered.value = true; };
    const handleMouseLeave = () => { isHovered.value = false; };
    onMounted(() => {
        const el = elementRef.value;
        if (!el)
            return;
        // passive: false is non-negotiable here to allow preventDefault()
        el.addEventListener('wheel', handleWheel, { passive: false });
        el.addEventListener('mouseenter', handleMouseEnter);
        el.addEventListener('mouseleave', handleMouseLeave);
    });
    onUnmounted(() => {
        const el = elementRef.value;
        if (rafId)
            cancelAnimationFrame(rafId);
        if (el) {
            el.removeEventListener('wheel', handleWheel);
            el.removeEventListener('mouseenter', handleMouseEnter);
            el.removeEventListener('mouseleave', handleMouseLeave);
        }
    });
    return { isHovered };
}
