/**
 * src/composables/board/use-pv-animation.ts
 * Composable for animating a Principal Variation (PV) stone sequence.
 *
 * ── Rendering invariant ────────────────────────────────────────────────────
 * Every move in `pvMoves.value` is rendered as a circle in the DOM with
 * opacity driven by the `visible` reactive set. CSS sets a uniform
 * `opacity ${fadeDurationMs}ms ease` transition (in the rendering layer)
 * — so this composable's only job is to schedule setVisible calls at the
 * right moments for the chosen mode. The previous implementation
 * mixed slice-based reveal (sequential) with opacity-based reveal
 * (window) and gated the CSS transition on mode === 'window', which left
 * sequential and instant modes snapping stones in/out without animation.
 *
 * ── Modes ──────────────────────────────────────────────────────────────────
 *   'instant'    — all PV stones fade in together when startPv is called.
 *                  On real-time PV updates during pondering, stones whose
 *                  moveNumber survives into the new packet stay visible
 *                  without re-fading; new moveNumbers fade in.
 *
 *   'sequential' — stones fade in one by one, each at `stepDelayMs` after
 *                  the previous. No real-time update mid-hover (the
 *                  reveal would re-stagger every packet).
 *
 *   'window'     — sliding-window reveal: each stone fades in, holds for
 *                  `windowDurationMs`, fades out. With `cycle: true` the
 *                  pattern repeats. Note that with stepDelayMs <
 *                  fadeDurationMs * 2 + windowDurationMs, multiple stones
 *                  are visible simultaneously by design (the "window" is
 *                  windowDurationMs wide, sliding across the line).
 *
 * ── Graceful exit ──────────────────────────────────────────────────────────
 * `stopPv` empties `visible` (CSS fades all stones to 0), then clears
 * `pvMoves` after `fadeDurationMs` so Vue can release the DOM elements
 * only once the fade has completed. Re-entry via `startPv` cancels the
 * pending clear.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, onUnmounted, reactive, ref, watchEffect } from 'vue';
import { NEXT_TICK_DEFER_MS } from '../../lib/timing';
// ─── Defaults ─────────────────────────────────────────────────────────────────
//
// Shared with `defaults.ts::defaultSessionUI.pvAnimation` and the
// migration 9→10 backfill. Three sources of truth that must agree;
// updates must land in lockstep.
export const PV_DEFAULTS = {
    mode: 'instant',
    stepDelayMs: 350,
    windowDurationMs: 600,
    fadeDurationMs: 0,
    cycle: false,
    pvOpacity: 1,
    annotation: 'from1',
};
// ─── Composable ───────────────────────────────────────────────────────────────
/**
 * `getConfig` is a getter (not a static value) so changes to the
 * underlying source — typically `props.pvConfig` reading from
 * `UISession.pvAnimation` — propagate live without remounting the
 * component. The returned `cfg` is a reactive object: consumers read
 * `cfg.mode`, `cfg.fadeDurationMs`, etc. directly, and Vue tracks
 * dependencies through the proxy. Previously the composable accepted
 * a static `PvConfig` and snapshotted it once at call time, which
 * meant a registry change required closing/re-opening the board for
 * the new mode to take effect.
 */
export function usePvAnimation(getConfig = () => undefined) {
    // Reactive cfg; mirrored from `getConfig()` over `PV_DEFAULTS`
    // every time the getter's reactive dependencies change. We use
    // `reactive` (not `computed`) so consumers can read fields directly
    // without `.value` — the existing template and script call sites
    // (`pvCfg.fadeDurationMs`, `pvCfg.mode`, ...) keep working.
    const cfg = reactive({ ...PV_DEFAULTS });
    watchEffect(() => {
        Object.assign(cfg, PV_DEFAULTS, getConfig() ?? {});
    });
    // ── State ──────────────────────────────────────────────────────────────────
    const pvMoves = ref([]);
    // moveNumber → "should render at opacity 1"; CSS transitions handle
    // the visual fade between 0 and 1.
    const visible = ref(new Set());
    const timers = [];
    // ── Helpers ────────────────────────────────────────────────────────────────
    function clearTimers() {
        timers.forEach(clearTimeout);
        timers.length = 0;
    }
    function setVisible(moveNumber, value) {
        const next = new Set(visible.value);
        if (value)
            next.add(moveNumber);
        else
            next.delete(moveNumber);
        visible.value = next;
    }
    function scheduleWindow(moves) {
        moves.forEach((m, i) => {
            // +1ms epsilon: ensures the initial opacity-0 render commits
            // before the flip to opacity-1 on first stone of the cycle, so
            // CSS has a starting point to interpolate from.
            const fadeInAt = cfg.stepDelayMs * i + 1;
            timers.push(setTimeout(() => setVisible(m.moveNumber, true), fadeInAt));
            const fadeOutAt = fadeInAt + cfg.fadeDurationMs + cfg.windowDurationMs;
            timers.push(setTimeout(() => setVisible(m.moveNumber, false), fadeOutAt));
        });
        if (cfg.cycle) {
            const cycleDuration = (moves.length - 1) * cfg.stepDelayMs +
                cfg.fadeDurationMs +
                cfg.windowDurationMs;
            if (cycleDuration > 0) {
                // Replace the timer list at the cycle boundary so it doesn't
                // grow unboundedly with each iteration. Per-stone fade timers
                // from this cycle have already fired by then; their references
                // are no longer needed and the next cycle's scheduling supplies
                // its own. (The previous implementation appended to `timers`
                // every cycle without ever clearing fired entries — a leak that
                // grew with hover duration.)
                timers.push(setTimeout(() => {
                    timers.length = 0;
                    scheduleWindow(moves);
                }, cycleDuration));
            }
        }
    }
    // ── Public API ─────────────────────────────────────────────────────────────
    function startPv(moves) {
        clearTimers();
        if (moves.length === 0) {
            stopPv();
            return;
        }
        pvMoves.value = moves;
        // Prune visibility to moveNumbers still present in the new line. In
        // 'instant' mode, retained stones stay visible (no fade-flash on
        // ponder-update mid-hover); 'sequential' / 'window' resets to empty
        // because the staged reveal is the whole point.
        const present = new Set(moves.map(m => m.moveNumber));
        const retained = new Set([...visible.value].filter(n => present.has(n)));
        visible.value = cfg.mode === 'instant' ? retained : new Set();
        switch (cfg.mode) {
            case 'instant':
                moves.forEach(m => {
                    if (!retained.has(m.moveNumber)) {
                        // Next-tick scheduler — defers visibility flip out of the
                        // current synchronous batch so Vue's reactive tracking sees
                        // the state change as a separate update cycle. The next-tick
                        // defer constant from the timing catalog (`lib/timing`).
                        timers.push(setTimeout(() => setVisible(m.moveNumber, true), NEXT_TICK_DEFER_MS));
                    }
                });
                break;
            case 'sequential':
                moves.forEach((m, i) => {
                    timers.push(setTimeout(() => setVisible(m.moveNumber, true), cfg.stepDelayMs * i + NEXT_TICK_DEFER_MS));
                });
                break;
            case 'window':
                scheduleWindow(moves);
                break;
        }
    }
    function stopPv() {
        clearTimers();
        if (visible.value.size === 0) {
            pvMoves.value = [];
            return;
        }
        // Empty visible set; CSS transitions interpolate stones to opacity 0.
        // After fadeDurationMs, clear pvMoves so Vue unmounts the DOM only
        // once the fade has finished.
        visible.value = new Set();
        timers.push(setTimeout(() => { pvMoves.value = []; }, cfg.fadeDurationMs));
    }
    // ── Derived state ──────────────────────────────────────────────────────────
    const displayStones = computed(() => pvMoves.value.map(m => ({
        ...m,
        opacity: (visible.value.has(m.moveNumber) ? 1 : 0) * cfg.pvOpacity,
    })));
    onUnmounted(clearTimers);
    return { startPv, stopPv, displayStones, cfg };
}
