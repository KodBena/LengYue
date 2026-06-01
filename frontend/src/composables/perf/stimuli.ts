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
import type { ScenarioContext, ScenarioStimulus } from './types';

// magic-literal: half-period of the open/close cycle, matching
// `useAutoPopoverPerf`'s HALF_PERIOD_MS. 250 ms open + 250 ms closed
// (~2 toggles/sec) is fast enough to stress, slow enough that each phase
// completes a render + paint so the per-toggle cost is cleanly attributable.
const DEFAULT_HALF_PERIOD_MS = 250;

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
export function popoverStress(
  targetId: string = DEFAULT_POPOVER_TARGET,
  opts: { halfPeriodMs?: number } = {},
): ScenarioStimulus {
  const half = opts.halfPeriodMs ?? DEFAULT_HALF_PERIOD_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let openPhase = false;
  let cycle = 0;

  return {
    id: `popover-stress:${targetId}`,
    start(ctx: ScenarioContext): void {
      const tick = (): void => {
        openPhase = !openPhase;
        if (openPhase) {
          ctx.mark('popover:open', { cycle, target: targetId });
          __devForcePopoverOpen(targetId);
        } else {
          ctx.mark('popover:close', { cycle });
          __devForcePopoverOpen(null);
          cycle += 1;
        }
        timer = setTimeout(tick, half);
      };
      timer = setTimeout(tick, half);
    },
    stop(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      // Release the forced-open popover so it returns to hover control.
      __devForcePopoverOpen(null);
    },
  };
}
