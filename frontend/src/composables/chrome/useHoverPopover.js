/**
 * src/composables/chrome/useHoverPopover.ts
 *
 * Hover-intent open/close primitive for toolbar-shaped popovers
 * (`EngineQueueTooltip`, `ToolbarSliderPopover`, `PboPopover` — and
 * any future sibling). Returns a reactive `open` boolean plus
 * `onMouseEnter` / `onMouseLeave` handlers the consumer wires into
 * its hover root.
 *
 * ── Behaviour ────────────────────────────────────────────────────
 *
 * `onMouseEnter` cancels any pending close timer and flips `open`
 * to `true`. Because `mouseenter` on the hover root fires when the
 * pointer enters any descendant (including the v-if'd popover
 * panel itself), this cancellation works whether the pointer
 * re-enters the badge or arrives at the popover after a brief
 * out-of-bounds excursion.
 *
 * `onMouseLeave` schedules a 150 ms (default) `setTimeout` that
 * flips `open` to `false`. The grace window covers pointer
 * overshoot — the user moves past the badge, intends to land on
 * the popover, and the popover stays open long enough to receive
 * the pointer. Without it, the v-if reconciliation can unmount
 * the popover faster than a deliberate hand movement.
 *
 * `onUnmounted` clears any pending timer per the resource-
 * ownership-at-mutation-sites discipline in `frontend/CLAUDE.md`.
 *
 * ── Layout contract for the consumer ─────────────────────────────
 *
 * The popover panel must be a DOM descendant of the hover root
 * (so `mouseenter` on the root catches re-entries from the
 * popover) and should sit *flush* against the trigger element
 * (no `margin-top` or `top: calc(100% + ...)` offset that
 * creates a dead zone outside the root's painted bounding box).
 * The grace window forgives overshoot; it does not forgive a
 * structural gap. See
 * `docs/worklog/2026-05-14-popover-hover-finickiness.md` for
 * the diagnosis and the "Recurring pattern" audit note that
 * triggered this composable's extraction.
 *
 * ── ADR-0003 band ────────────────────────────────────────────────
 *
 * Band 1 (truly domain-agnostic). The composable knows about
 * pointer events and timers; no Go vocabulary, no engine
 * vocabulary, no SGF awareness. A chess or shogi port reuses it
 * unchanged.
 *
 * License: Public Domain (The Unlicense)
 */
import { onUnmounted, ref, watch } from 'vue';
import { INTERACTION_DISMISS_DELAY_MS } from '../../lib/timing';
// DEV-only: lets the popover perf harness (useAutoPopoverPerf) force a
// specific popover open by id, programmatically, in place of physical hover.
// Module-scoped so one harness drives whichever popover it targets. The
// consuming watch (below) and this ref's writes are DEV-gated, so a
// production build carries only an unread ref.
const devForcedOpenId = ref(null);
/** DEV-only: force the popover whose `devId` matches `id` open (or pass null
 *  to release). No-op in production. Used by the perf-capture harness. */
export function __devForcePopoverOpen(id) {
    if (import.meta.env.DEV)
        devForcedOpenId.value = id;
}
export function useHoverPopover(options = {}) {
    const closeDelayMs = options.closeDelayMs ?? INTERACTION_DISMISS_DELAY_MS;
    const open = ref(false);
    // Non-reactive `let` — it's a resource handle, not state to
    // render. Cleared on mouseenter (cancelling a pending close)
    // and on unmount (per the resource-ownership discipline).
    let closeTimer = null;
    function onMouseEnter() {
        if (closeTimer !== null) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }
        open.value = true;
    }
    function onMouseLeave() {
        if (closeTimer !== null)
            clearTimeout(closeTimer);
        closeTimer = setTimeout(() => {
            open.value = false;
            closeTimer = null;
        }, closeDelayMs);
    }
    // DEV-only harness hook: when the perf harness targets this popover's
    // devId, drive `open` directly (the same boolean the hover handlers write),
    // so a programmatic open/close exercises the real render / edge-clamp path
    // without synthetic pointer events. The whole block DCEs in production.
    if (import.meta.env.DEV && options.devId !== undefined) {
        watch(devForcedOpenId, (forced) => {
            open.value = forced === options.devId;
        });
    }
    onUnmounted(() => {
        if (closeTimer !== null)
            clearTimeout(closeTimer);
    });
    return { open, onMouseEnter, onMouseLeave };
}
