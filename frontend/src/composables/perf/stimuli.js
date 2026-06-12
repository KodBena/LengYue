/**
 * src/composables/perf/stimuli.ts
 *
 * Concrete `ScenarioStimulus` factories — self-contained background
 * activities a scenario runs concurrently with its measured pass via
 * `ctx.spawn`. Each owns its loop and releases it in `stop` (the runner
 * guarantees `stop` is called at scenario end; ADR-0010 §4).
 *
 * `popoverStress` is the composable form of `useAutoPopoverPerf` — it
 * toggles a target popover open/closed on a fixed cadence via the
 * `__devForcePopoverOpen` dev hook, so the per-toggle render cost can be
 * measured while a range query streams.
 *
 * Domain band (ADR-0003): truly agnostic (B1) — toggles a dev hook on a
 * timer. Dev-only; makes no perf *claim* (ADR-0009).
 *
 * License: Public Domain (The Unlicense)
 */
import { __devForcePopoverOpen } from '../chrome/useHoverPopover';
import { POPOVER_STRESS_HALF_PERIOD_MS } from '../../lib/timing';
// magic-literal: default popover devId. `'queue'` is the EngineQueueTooltip
// (src/components/chrome/EngineQueueTooltip.vue) — the popover the manual
// `useAutoPopoverPerf` toolbar affordance stresses. `'sliders'` is the
// other registered devId (ToolbarSliderPopover).
export const DEFAULT_POPOVER_TARGET = 'queue';
/**
 * Toggle the popover with the given `devId` open/closed on a fixed
 * cadence. Emits `scenario:<name>:popover:open` / `:close` marks (via
 * `ctx.mark`) carrying the cycle index so opens can be partitioned. The
 * forced-open override is released in `stop`.
 */
export function popoverStress(targetId = DEFAULT_POPOVER_TARGET, opts = {}) {
    const half = opts.halfPeriodMs ?? POPOVER_STRESS_HALF_PERIOD_MS;
    let timer = null;
    let openPhase = false;
    let cycle = 0;
    return {
        id: `popover-stress:${targetId}`,
        start(ctx) {
            const tick = () => {
                openPhase = !openPhase;
                if (openPhase) {
                    ctx.mark('popover:open', { cycle, target: targetId });
                    __devForcePopoverOpen(targetId);
                }
                else {
                    ctx.mark('popover:close', { cycle });
                    __devForcePopoverOpen(null);
                    cycle += 1;
                }
                timer = setTimeout(tick, half);
            };
            timer = setTimeout(tick, half);
        },
        stop() {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            // Release the forced-open popover so it returns to hover control.
            __devForcePopoverOpen(null);
        },
    };
}
