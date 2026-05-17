/**
 * tests/unit/engine/katago/optimize-f.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/engine/katago/optimize-f.ts`.
 *
 * The optimizer interacts with the outside world only through the
 * `OptimizerEngine` interface (one method: `measure`). That makes it
 * trivially testable against synthetic engines that return
 * deterministic dt values shaped to expose specific algorithm
 * properties (cliff position, strip-flip handling, the min-savings
 * sanity check, etc).
 *
 * The tests below cover:
 *  - `median` helper
 *  - the classifier's pinned/honored/strict-vs-lenient behaviour
 *    (observed indirectly via `findBestF` outcomes)
 *  - the bisection's cliff localisation
 *  - boundary cases (F_min honored, no honored F in range, etc.)
 *  - the min-savings sanity check
 *  - retry-on-null wrapper
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  median,
  findBestF,
  findBestFWithRetry,
  type OptimizerEngine,
} from '../../../../src/engine/katago/optimize-f';

// ─── median helper ────────────────────────────────────────────────────────────

describe('median', () => {
  it('returns NaN for empty input', () => {
    expect(median([])).toBeNaN();
  });
  it('returns the single value', () => {
    expect(median([42])).toBe(42);
  });
  it('returns the middle of an odd-length list', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('returns the mean of the two middle values for even length', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('does not mutate the input array', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

// ─── Synthetic engines ────────────────────────────────────────────────────────

/**
 * Build a deterministic step-function engine. Below the cliff returns
 * `pinnedDt(F)`; at or above returns `honoredDt(F)`. Useful for
 * pinning down the bisection's convergence behaviour without noise.
 */
function makeStepEngine(opts: {
  cliffS: number;
  pinnedDt: (cadenceS: number, fS: number | null) => number;
  honoredDt: (cadenceS: number, fS: number) => number;
  controlDt: (cadenceS: number) => number;
}): OptimizerEngine {
  return {
    async measure(_model, cadenceS, firstReportS) {
      if (firstReportS === null) return opts.controlDt(cadenceS);
      if (firstReportS < opts.cliffS) return opts.pinnedDt(cadenceS, firstReportS);
      return opts.honoredDt(cadenceS, firstReportS);
    },
  };
}

/**
 * Build a strip-aware engine: above `cliffUpperS` always honored,
 * below `cliffLowerS` always pinned, inside `[cliffLowerS,
 * cliffUpperS]` flips deterministically based on a counter (so the
 * strict-any-tardy rule eventually catches it).
 */
function makeStripEngine(opts: {
  cliffLowerS: number;
  cliffUpperS: number;
  // For "strip" cells, honored rate as a fraction of samples [0, 1].
  // Behaviour is deterministic, alternating to hit this rate.
  stripHonoredRate: number;
  pinnedDt: (cadenceS: number, fS: number | null) => number;
  honoredDt: (cadenceS: number, fS: number) => number;
  controlDt: (cadenceS: number) => number;
}): OptimizerEngine {
  const stripCounters = new Map<string, number>();
  return {
    async measure(_model, cadenceS, firstReportS) {
      if (firstReportS === null) return opts.controlDt(cadenceS);
      if (firstReportS < opts.cliffLowerS) {
        return opts.pinnedDt(cadenceS, firstReportS);
      }
      if (firstReportS >= opts.cliffUpperS) {
        return opts.honoredDt(cadenceS, firstReportS);
      }
      const key = `${cadenceS}|${firstReportS}`;
      const i = (stripCounters.get(key) ?? 0) + 1;
      stripCounters.set(key, i);
      const isHonored = i * opts.stripHonoredRate >= Math.floor(i * opts.stripHonoredRate) + 1 - opts.stripHonoredRate;
      return isHonored
        ? opts.honoredDt(cadenceS, firstReportS)
        : opts.pinnedDt(cadenceS, firstReportS);
    },
  };
}

// ─── findBestF — clean step case ──────────────────────────────────────────────

describe('findBestF — clean step (no strip, no noise)', () => {
  it('localises the cliff to within resolution and returns F = F_high + safety_margin', async () => {
    // Mirror the b18c384nbt-at-C=0.25 shape: cadence + F + 30 pinned;
    // F + 30 honored. Cliff at F = 0.090 s.
    const engine = makeStepEngine({
      cliffS: 0.090,
      pinnedDt: (c, f) => c * 1000 + (f ?? 0) * 1000 + 30,
      honoredDt: (_c, f) => f * 1000 + 30,
      controlDt: (c) => c * 1000 + 30,
    });

    const result = await findBestF(engine, 'test-model', 0.25, {
      classifyMinSamples: 3,
      classifyMaxSamples: 5,
      resolutionS: 0.001,
      safetyMarginS: 0.002,
    });

    expect(result.bestFS).not.toBeNull();
    // Bisection should bracket the cliff to within `resolutionS`.
    // F_high should be ≥ cliff, ≤ cliff + resolution.
    expect(result.bracketS).not.toBeNull();
    const [_low, high] = result.bracketS!;
    expect(high).toBeGreaterThanOrEqual(0.090);
    expect(high).toBeLessThanOrEqual(0.090 + 0.001 + 1e-9);
    // Recommended F = F_high + safety_margin.
    expect(result.bestFS!).toBeCloseTo(high + 0.002, 5);
    // Expected dt at recommended F: F + 30 (honored shape).
    expect(result.expectedDtMs!).toBeCloseTo(high * 1000 + 30, 1);
    // Savings: control (280) − honored (~120) ≈ 160 ms.
    expect(result.savingsMs!).toBeGreaterThan(150);
  });

  it('returns null when no F is honored in [F_min, F_max]', async () => {
    // Cliff above F_max (which defaults to cadence - 5ms = 0.245 s
    // for cadence 0.25).
    const engine = makeStepEngine({
      cliffS: 0.500, // far above any plausible F_max
      pinnedDt: (c, f) => c * 1000 + (f ?? 0) * 1000 + 30,
      honoredDt: (_c, f) => f * 1000 + 30,
      controlDt: (c) => c * 1000 + 30,
    });

    const result = await findBestF(engine, 'test-model', 0.25, {
      classifyMinSamples: 3,
      classifyMaxSamples: 5,
    });

    expect(result.bestFS).toBeNull();
    expect(result.note).toContain('no honored F');
  });

  it('returns null when expected savings below min_savings_ms', async () => {
    // Honored regime is only ~5 ms faster than control — below
    // default minSavingsMs of 20.
    const engine = makeStepEngine({
      cliffS: 0.020,
      pinnedDt: (_c, _f) => 100,
      // Honored dt very close to control — the strict tardy classifier
      // accepts the F as honored, but savings are tiny.
      honoredDt: (_c, _f) => 96,
      controlDt: (_c) => 100,
    });

    const result = await findBestF(engine, 'test-model', 0.25, {
      classifyMinSamples: 3,
      classifyMaxSamples: 5,
      minSavingsMs: 20,
    });

    expect(result.bestFS).toBeNull();
    expect(result.note).toContain('saves only');
  });
});

// ─── findBestF — strip-flip behaviour ─────────────────────────────────────────

describe('findBestF — strip flip', () => {
  it('strict bisection rejects strip cells (any tardy → pinned)', async () => {
    // Strip from F=0.080 to F=0.100 with 50% honored rate. Clean
    // cliff at 0.100; below 0.080 always pinned; above 0.100 always
    // honored. Strict bisection should land above 0.100.
    const engine = makeStripEngine({
      cliffLowerS: 0.080,
      cliffUpperS: 0.100,
      stripHonoredRate: 0.5,
      pinnedDt: (c, f) => c * 1000 + (f ?? 0) * 1000 + 30,
      honoredDt: (_c, f) => f * 1000 + 30,
      controlDt: (c) => c * 1000 + 30,
    });

    const result = await findBestF(engine, 'test-model', 0.25, {
      classifyMinSamples: 4,
      classifyMaxSamples: 10,
      resolutionS: 0.001,
      scanMaxTardyAllowed: 1,
    });

    expect(result.bestFS).not.toBeNull();
    // F_high must be above the strip-upper bound, NOT inside the strip.
    expect(result.bracketS![1]).toBeGreaterThanOrEqual(0.100);
  });
});

// ─── findBestFWithRetry ───────────────────────────────────────────────────────

describe('findBestFWithRetry', () => {
  it('returns first-attempt result when it succeeds', async () => {
    const engine = makeStepEngine({
      cliffS: 0.030,
      pinnedDt: (c, f) => c * 1000 + (f ?? 0) * 1000 + 30,
      honoredDt: (_c, f) => f * 1000 + 30,
      controlDt: (c) => c * 1000 + 30,
    });
    const result = await findBestFWithRetry(engine, 'test', 0.25, {
      maxAttempts: 3,
      classifyMinSamples: 3,
      classifyMaxSamples: 5,
    });
    expect(result.bestFS).not.toBeNull();
    // No retry suffix on the first-attempt success.
    expect(result.note).not.toContain('succeeded on attempt');
  });

  it('retries when first attempt returns null and succeeds later', async () => {
    // Emulate a "bad day" on attempt 1: the engine returns pinned
    // (tardy) for ALL non-null F probes until call number 90 (roughly
    // the query budget of one full attempt: control + pinned-ref +
    // geometric scan + boundary failure). After that, normal step
    // behaviour with cliff at 0.030 s.
    let callCount = 0;
    const engine: OptimizerEngine = {
      async measure(_model, cadenceS, firstReportS) {
        callCount++;
        if (firstReportS === null) return cadenceS * 1000 + 30;
        const fMs = firstReportS * 1000;
        if (callCount < 90) {
          // Pinned shape — engine returns "tardy" for every F probe.
          return cadenceS * 1000 + fMs + 30;
        }
        if (firstReportS < 0.030) return cadenceS * 1000 + fMs + 30;
        return fMs + 30;
      },
    };
    const result = await findBestFWithRetry(engine, 'test', 0.25, {
      maxAttempts: 3,
      classifyMinSamples: 3,
      classifyMaxSamples: 5,
    });
    expect(result.bestFS).not.toBeNull();
    expect(result.note).toContain('succeeded on attempt');
  });

  it('reports cumulative queries across attempts', async () => {
    const engine: OptimizerEngine = {
      async measure(_m, c, _f) {
        // Always pinned — every attempt will fail.
        return c * 1000 * 5;
      },
    };
    const result = await findBestFWithRetry(engine, 'test', 0.25, {
      maxAttempts: 3,
      classifyMinSamples: 3,
      classifyMaxSamples: 5,
    });
    expect(result.bestFS).toBeNull();
    expect(result.note).toContain('after 3 attempts');
    // Should have made enough queries for ~3 attempts of calibration
    // + scan. Lower bound: 3 × (10 control + 6 pinned-ref) = 48.
    expect(result.queriesTotal).toBeGreaterThan(48);
  });
});

// ─── findBestF — F_min already honored ────────────────────────────────────────

describe('findBestF — F_min honored edge case', () => {
  it('returns F_min directly when even F_min beats control significantly', async () => {
    // Construct: control dt is huge, F=1ms already gives small dt.
    // The pinned reference at F_min in the algorithm computes
    // extra_pinned_baseline = dt_at_F_min - F_min_ms. If that's
    // small (or negative), the extra_threshold goes negative,
    // triggering the "F_min already honored" early-return.
    const engine: OptimizerEngine = {
      async measure(_m, c, f) {
        if (f === null) return c * 1000 + 30; // control — pinned
        // Every non-null F is "honored" (returns ~F + small).
        return f * 1000 + 30;
      },
    };
    const result = await findBestF(engine, 'test', 0.25, {
      classifyMinSamples: 3,
      classifyMaxSamples: 5,
    });
    expect(result.bestFS).not.toBeNull();
    // Should land at F_min (or very close) since there's no cliff.
    expect(result.bestFS!).toBeLessThan(0.005);
  });
});
