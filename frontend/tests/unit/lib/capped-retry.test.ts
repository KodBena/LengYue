/**
 * tests/unit/lib/capped-retry.test.ts
 *
 * Tier-1 tests for `src/lib/capped-retry.ts` — the bounded, fail-loud
 * retry helper mechanizing the ADR-0011 Rule 2 recurrence named in
 * `.claude/dispatch-reports/lyt-cardtrees-regression.md` (three
 * hand-authored uncapped `setTimeout` retry loops in
 * `useEChartsForestRender.ts`, `BaseChart.vue`, `HeatmapChart.vue`).
 * Drives the two contract halves directly against fake timers, with no
 * DOM and no ECharts involved: the cap-reached path fires the loud
 * escalation exactly once, and the success path never escalates.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cappedRetry } from '../../../src/lib/capped-retry';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cappedRetry', () => {
  it('resolves on the first attempt without scheduling a retry or escalating', () => {
    const attempt = vi.fn(() => true);
    const onExhausted = vi.fn();

    cappedRetry(attempt, { intervalMs: 50, timeoutMs: 1000, label: 'test' }, onExhausted);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onExhausted).not.toHaveBeenCalled();

    // No timer should be pending — advancing time further must not
    // trigger another attempt or an escalation.
    vi.advanceTimersByTime(5000);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('retries on the configured interval until attempt() succeeds, then stops — no escalation', () => {
    let succeedOnCall = 3;
    let calls = 0;
    const attempt = vi.fn(() => {
      calls += 1;
      return calls >= succeedOnCall;
    });
    const onExhausted = vi.fn();

    cappedRetry(attempt, { intervalMs: 50, timeoutMs: 1000, label: 'test' }, onExhausted);
    expect(attempt).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(attempt).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(50);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(onExhausted).not.toHaveBeenCalled();

    // Further advancement schedules nothing further — the loop stopped.
    vi.advanceTimersByTime(5000);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(onExhausted).not.toHaveBeenCalled();
    void succeedOnCall; // read for clarity above
  });

  it('escalates exactly once, loudly, once the wall-clock cap is exceeded — and stops retrying', () => {
    const attempt = vi.fn(() => false);
    const onExhausted = vi.fn();
    const readSize = vi.fn(() => ({ width: 349, height: 0 }));

    cappedRetry(
      attempt,
      { intervalMs: 100, timeoutMs: 250, label: 'container-x', readSize },
      onExhausted,
    );
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onExhausted).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100); // elapsed ~100ms — still under 250ms cap
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(onExhausted).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100); // elapsed ~200ms — still under cap
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(onExhausted).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100); // elapsed ~300ms — now over the 250ms cap
    expect(onExhausted).toHaveBeenCalledTimes(1);
    // Review finding 1: the diagnosis's closure statement names "the
    // container and its measured size" as the minimum loudness bar —
    // readSize() is called exactly once, at escalation, and its result
    // is threaded through to onExhausted as the fourth argument.
    expect(readSize).toHaveBeenCalledTimes(1);
    expect(onExhausted).toHaveBeenCalledWith(
      'container-x', expect.any(Number), 4, { width: 349, height: 0 },
    );

    // No further attempts are scheduled once exhausted.
    const attemptsAtExhaustion = attempt.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(attempt).toHaveBeenCalledTimes(attemptsAtExhaustion);
    expect(onExhausted).toHaveBeenCalledTimes(1);
  });

  it('escalates with size undefined when no readSize is supplied — the contract stays honest rather than fabricating a size', () => {
    const attempt = vi.fn(() => false);
    const onExhausted = vi.fn();

    cappedRetry(attempt, { intervalMs: 10, timeoutMs: 10, label: 'no-size-site' }, onExhausted);
    vi.advanceTimersByTime(10);

    expect(onExhausted).toHaveBeenCalledWith('no-size-site', expect.any(Number), 2, undefined);
  });

  it('escalates with size null when readSize reports the container is gone', () => {
    const attempt = vi.fn(() => false);
    const onExhausted = vi.fn();
    const readSize = vi.fn(() => null);

    cappedRetry(attempt, { intervalMs: 10, timeoutMs: 10, label: 'gone-site', readSize }, onExhausted);
    vi.advanceTimersByTime(10);

    expect(onExhausted).toHaveBeenCalledWith('gone-site', expect.any(Number), 2, null);
  });

  it('uses the default console.warn escalation naming the label AND the measured size when onExhausted is omitted', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const attempt = vi.fn(() => false);

    cappedRetry(attempt, {
      intervalMs: 10,
      timeoutMs: 10,
      label: 'default-escalation-site',
      readSize: () => ({ width: 0, height: 0 }),
    });
    vi.advanceTimersByTime(10);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0];
    expect(message).toContain('default-escalation-site');
    // The container's measured size (review finding 1's minimum bar).
    expect(message).toContain('0x0px');
    warnSpy.mockRestore();
  });

  it('default console.warn escalation reports size as unavailable when readSize is omitted entirely', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const attempt = vi.fn(() => false);

    cappedRetry(attempt, { intervalMs: 10, timeoutMs: 10, label: 'unmeasured-site' });
    vi.advanceTimersByTime(10);

    const message = warnSpy.mock.calls[0][0];
    expect(message).toContain('unmeasured-site');
    expect(message).toContain('n/a (no readSize supplied)');
    warnSpy.mockRestore();
  });

  it('cancel() releases a pending retry timer — no further attempts, no escalation', () => {
    const attempt = vi.fn(() => false);
    const onExhausted = vi.fn();

    const handle = cappedRetry(attempt, { intervalMs: 50, timeoutMs: 1000, label: 'test' }, onExhausted);
    expect(attempt).toHaveBeenCalledTimes(1);

    handle.cancel();
    vi.advanceTimersByTime(5000);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('cancel() after the loop already resolved is a harmless no-op', () => {
    const attempt = vi.fn(() => true);
    const handle = cappedRetry(attempt, { intervalMs: 50, timeoutMs: 1000, label: 'test' });

    expect(() => handle.cancel()).not.toThrow();
  });
});
