/**
 * src/lib/capped-retry.ts
 *
 * Bounded, fail-loud retry helper for "poll until a condition holds,
 * else give up loudly" loops — the shared mechanism for the ADR-0011
 * Rule 2 recurrence named in
 * `.claude/dispatch-reports/lyt-cardtrees-regression.md` and closed by
 * `.claude/dispatch-reports/cardtrees-fix-next.md` (ledger row 1937):
 * three independent hand-authored sites
 * (`composables/analysis/useEChartsForestRender.ts`'s `render()`,
 * `components/charts/BaseChart.vue`'s `initChart()`, and
 * `components/charts/HeatmapChart.vue`'s `initChart()`) each retried an
 * ECharts-container size gate via an uncapped `window.setTimeout`, with
 * no ceiling and no escalation if the container never resolved — ADR-0002's
 * named anti-pattern, "the system retries automatically and the retry is
 * invisible to the caller."
 *
 * This is band-1 (no game/chart/domain vocabulary — the helper polls an
 * arbitrary boolean-returning predicate; the three call sites supply the
 * chart-specific "is my container big enough yet" check as `attempt`).
 *
 * License: Public Domain (The Unlicense)
 */

/**
 * A container's measured size at escalation time, in CSS pixels
 * (`clientWidth`/`clientHeight`). Optional per `CappedRetryOptions.readSize`
 * — a caller not gating on a DOM container's size (unusual for this
 * helper's actual call sites, but not precluded by the contract) may omit
 * it, in which case escalation reports the size as unavailable.
 */
export interface MeasuredSize {
  width: number;
  height: number;
}

export interface CappedRetryOptions {
  /** Poll interval in ms between attempts (the caller's own tuned constant). */
  intervalMs: number;
  /**
   * Wall-clock ceiling in ms, measured from the first attempt. Once
   * exceeded, the retry stops rescheduling and calls `onExhausted`
   * instead. Denominated in wall-clock time (not attempt count) because
   * wall-clock is the resource actually being spent — a caller that
   * changes `intervalMs` doesn't need to also re-derive an attempt-count
   * ceiling to keep the same effective timeout.
   */
  timeoutMs: number;
  /** Identifies the caller/container in the escalation message. */
  label: string;
  /**
   * Reads the gated container's current measured size. Called once, only
   * if the cap is reached, so the escalation can name "the container and
   * its measured size" — the diagnosis's own closure-statement minimum
   * loudness bar for this class
   * (`.claude/dispatch-reports/lyt-cardtrees-regression.md` §4, invariant
   * 1: *"at minimum a `console.warn` naming the container and its
   * measured size"*). Returns `null` when the container isn't available
   * to measure (e.g. the ref went away between the last failed attempt
   * and escalation). Omit entirely when `attempt`'s gate isn't a DOM
   * container's size — the default escalation then reports "not
   * applicable" rather than fabricating a size.
   */
  readSize?: () => MeasuredSize | null;
}

export interface CappedRetryHandle {
  /** Cancels a pending retry timer, if one is scheduled. Idempotent. */
  cancel: () => void;
}

function formatSize(size: MeasuredSize | null | undefined): string {
  if (size === undefined) return 'n/a (no readSize supplied)';
  if (size === null) return 'unavailable (container not present at escalation time)';
  return `${size.width}x${size.height}px`;
}

/**
 * Default escalation: a `console.warn` naming the label, the elapsed
 * time, the attempt count, AND the container's measured size (when
 * `readSize` was supplied) — ADR-0002's developer-visible-console-
 * warning rung ("this shouldn't happen, but if it does, the rest of the
 * system can continue"), sized to the diagnosis's own closure-statement
 * bar rather than the weaker "just a label" message this helper shipped
 * with initially (cardtrees-fix-next review finding 1).
 */
function defaultOnExhausted(
  label: string,
  elapsedMs: number,
  attempts: number,
  size: MeasuredSize | null | undefined,
): void {
  console.warn(
    `[capped-retry] ${label}: gave up after ${attempts} attempt(s) over ` +
    `${Math.round(elapsedMs)}ms — condition never became true. Measured size ` +
    `at escalation: ${formatSize(size)}. The container likely has a structural ` +
    'layout defect (see lyt-cardtrees-regression for the worked case), not a ' +
    'transient timing race.',
  );
}

/**
 * Calls `attempt()` immediately. If it returns `false` (not ready yet),
 * schedules a retry after `intervalMs`, repeating until either `attempt()`
 * returns `true` or `timeoutMs` of wall-clock time has elapsed since the
 * first call — at which point `onExhausted` fires once instead of
 * scheduling another retry.
 *
 * `attempt` is expected to be idempotent-on-failure: it may perform the
 * real work (chart init, `setOption`, ...) as its side effect once the
 * condition it's gating on becomes true, returning `true` to signal
 * "done, stop retrying."
 *
 * Returns a handle whose `cancel()` releases any pending timer — the
 * caller's `onUnmounted` (or equivalent teardown) must call it, exactly
 * like the raw `setTimeout` handle it replaces (ADR-0010's imperative-
 * escape step 4 / the resource-ownership-at-mutation-sites discipline).
 */
export function cappedRetry(
  attempt: () => boolean,
  options: CappedRetryOptions,
  onExhausted: (
    label: string,
    elapsedMs: number,
    attempts: number,
    size: MeasuredSize | null | undefined,
  ) => void = defaultOnExhausted,
): CappedRetryHandle {
  const { intervalMs, timeoutMs, label, readSize } = options;
  const startedAt = performance.now();
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tryOnce = (): void => {
    attempts += 1;
    timer = null;
    if (attempt()) return;
    const elapsedMs = performance.now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      const size = readSize ? readSize() : undefined;
      onExhausted(label, elapsedMs, attempts, size);
      return;
    }
    timer = setTimeout(tryOnce, intervalMs);
  };

  tryOnce();

  return {
    cancel: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
