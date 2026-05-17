/**
 * src/engine/katago/optimize-f.ts
 *
 * Adaptive search for the lowest-latency `firstReportDuringSearchAfter`
 * (F) for a given (model, `reportDuringSearchEvery`) configuration. Ported
 * from the Python reference implementation at
 * `~/katago_bugreport/optimize_f.py`, with the same algorithmic shape and
 * the same defaults.
 *
 * Algorithm: bisection on a binary classifier. `dt(F)` has two regimes
 * separated by a sharp step (the cliff):
 *   - Below cliff: `dt ≈ cadence_tick + F + per-query overhead` (always
 *     tardy — F is "added to" the cadence tick rather than honoured
 *     directly).
 *   - Above cliff: `dt ≈ F + small overhead` (honoured).
 *
 * The optimum F is the smallest value above the cliff. We bisect on the
 * binary question "is F above the cliff?" rather than optimising dt
 * smoothly.
 *
 * Classification rule for one F value: take samples one at a time. Until
 * `classifyMinSamples` non-tardy samples land, keep going. Tardy events
 * are tracked against `maxTardyAllowed` — zero for bisection (any tardy
 * blacklists F), small for the geometric scan (so a single strip-flip at
 * F_max doesn't abort the whole search). The FINAL recommended F is
 * always one that passed strict classification.
 *
 * The Python reference's `CSVSimulatedEngine` for offline validation
 * lives in the tests tree (see `tests/unit/optimize-f.test.ts` when it
 * lands).
 *
 * License: Public Domain (The Unlicense)
 */

/**
 * Anything that knows how to measure a single first-response latency
 * for a given (model, cadence, F) triple. `firstReportS === null` means
 * "omit `firstReportDuringSearchAfter` from the wire query entirely"
 * — the no-F control measurement. The implementation owns the
 * cache_clear / terminate / drain choreography around each
 * measurement; the optimizer trusts the returned dt is the wall-clock
 * milliseconds from query send to first matching response.
 *
 * On timeout the engine returns a value large enough that the
 * classifier marks the sample tardy (i.e., > pinned + cadence). Throwing
 * is also acceptable; the optimizer treats throws as unrecoverable.
 */
export interface OptimizerEngine {
  measure(
    model: string,
    cadenceS: number,
    firstReportS: number | null,
  ): Promise<number>;
}

/**
 * Per-F sampling record kept for diagnostics. Surfaced via
 * `OptimizeResult.history` so callers can inspect why a particular
 * recommendation was made (or wasn't).
 */
export interface FProbe {
  readonly fS: number;
  readonly samplesMs: readonly number[];
  readonly classification: 'pinned' | 'honored' | 'unknown';
  readonly abortedOnTardy: boolean;
}

export interface OptimizeResult {
  readonly model: string;
  readonly cadenceS: number;
  readonly controlDtMs: number | null;
  /**
   * `dt - F` must exceed this for a single sample to be tardy. Derived
   * from the pinned reference at F_min (see `findBestF`). Null when
   * calibration didn't complete.
   */
  readonly tardyThresholdMs: number | null;
  readonly bestFS: number | null;
  readonly expectedDtMs: number | null;
  readonly savingsMs: number | null;
  readonly bracketS: readonly [number, number] | null;
  readonly queriesTotal: number;
  readonly history: readonly FProbe[];
  readonly note: string;
}

export interface OptimizeOptions {
  readonly fMinS?: number;
  readonly fMaxS?: number;
  readonly resolutionS?: number;
  /**
   * `extra_threshold_ms = (pinned_ref_at_F_min - F_min_ms) - tardyFactor × cadence_ms`.
   * A sample is tardy iff `dt - F_ms > extra_threshold_ms`. 0.5 sits
   * comfortably between the pinned shelf and the honoured shelf for
   * all observed models.
   */
  readonly tardyFactor?: number;
  readonly pinnedReferenceSamples?: number;
  /** Recommend `F_high + safetyMarginS` so noise doesn't flip back into the strip. */
  readonly safetyMarginS?: number;
  /** A recommendation must beat control by at least this much; otherwise return null. */
  readonly minSavingsMs?: number;
  readonly controlSamples?: number;
  readonly classifyMinSamples?: number;
  readonly classifyMaxSamples?: number;
  readonly scanMaxTardyAllowed?: number;
  /** Called per progress step; signature matches the Python verbose log lines. */
  readonly onProgress?: (msg: string) => void;
}

interface ResolvedOptions {
  readonly fMinS: number;
  readonly fMaxS: number;
  readonly resolutionS: number;
  readonly tardyFactor: number;
  readonly pinnedReferenceSamples: number;
  readonly safetyMarginS: number;
  readonly minSavingsMs: number;
  readonly controlSamples: number;
  readonly classifyMinSamples: number;
  readonly classifyMaxSamples: number;
  readonly scanMaxTardyAllowed: number;
  readonly onProgress: (msg: string) => void;
}

const DEFAULTS = {
  fMinS: 0.001,
  resolutionS: 0.001,
  tardyFactor: 0.5,
  pinnedReferenceSamples: 6,
  safetyMarginS: 0.002,
  minSavingsMs: 20,
  controlSamples: 10,
  classifyMinSamples: 6,
  classifyMaxSamples: 15,
  scanMaxTardyAllowed: 1,
} as const;

function resolveOptions(
  cadenceS: number,
  options: OptimizeOptions,
): ResolvedOptions {
  const fMinS = options.fMinS ?? DEFAULTS.fMinS;
  const fMaxS =
    options.fMaxS ?? Math.max(cadenceS - 0.005, fMinS + 0.001);
  return {
    fMinS,
    fMaxS,
    resolutionS: options.resolutionS ?? DEFAULTS.resolutionS,
    tardyFactor: options.tardyFactor ?? DEFAULTS.tardyFactor,
    pinnedReferenceSamples:
      options.pinnedReferenceSamples ?? DEFAULTS.pinnedReferenceSamples,
    safetyMarginS: options.safetyMarginS ?? DEFAULTS.safetyMarginS,
    minSavingsMs: options.minSavingsMs ?? DEFAULTS.minSavingsMs,
    controlSamples: options.controlSamples ?? DEFAULTS.controlSamples,
    classifyMinSamples:
      options.classifyMinSamples ?? DEFAULTS.classifyMinSamples,
    classifyMaxSamples:
      options.classifyMaxSamples ?? DEFAULTS.classifyMaxSamples,
    scanMaxTardyAllowed:
      options.scanMaxTardyAllowed ?? DEFAULTS.scanMaxTardyAllowed,
    onProgress: options.onProgress ?? (() => {}),
  };
}

/**
 * Median of an array of numbers. Returns NaN for empty input. Mutates a
 * local copy; the input array is unchanged.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

interface ClassifyContext {
  readonly engine: OptimizerEngine;
  readonly model: string;
  readonly cadenceS: number;
  readonly extraThresholdMs: number;
  readonly opts: ResolvedOptions;
  // Mutable counter; bumped per measurement so the caller can total
  // queries across nested calls without threading return values.
  queriesTotal: number;
}

/**
 * Sample one F value until classified. `maxTardyAllowed=0` is strict
 * (any tardy → pinned). `>0` lets the geometric scan tolerate a single
 * strip-flip at the boundary without aborting the whole search; final
 * bisection always uses 0 so the recommendation never includes an F
 * that tardied during sampling.
 */
async function classifyF(
  ctx: ClassifyContext,
  fS: number,
  maxTardyAllowed: number,
): Promise<FProbe> {
  const samplesMs: number[] = [];
  const fMs = fS * 1000;
  let tardyCount = 0;
  let honoredCount = 0;

  for (let i = 0; i < ctx.opts.classifyMaxSamples; i++) {
    const dt = await ctx.engine.measure(ctx.model, ctx.cadenceS, fS);
    ctx.queriesTotal += 1;
    samplesMs.push(dt);
    const extra = dt - fMs;
    if (extra > ctx.extraThresholdMs) {
      tardyCount += 1;
      if (tardyCount > maxTardyAllowed) {
        ctx.opts.onProgress(
          `  F=${fMs.toFixed(1)}ms: tardy budget exhausted ` +
            `(${tardyCount}/${maxTardyAllowed} allowed) ` +
            `(last dt=${dt.toFixed(1)}, extra=${extra.toFixed(1)} > ` +
            `${ctx.extraThresholdMs.toFixed(1)}) → pinned`,
        );
        return {
          fS,
          samplesMs,
          classification: 'pinned',
          abortedOnTardy: true,
        };
      }
      ctx.opts.onProgress(
        `  F=${fMs.toFixed(1)}ms: tardy (dt=${dt.toFixed(1)}); ` +
          `budget ${tardyCount}/${maxTardyAllowed}`,
      );
    } else {
      honoredCount += 1;
      if (honoredCount >= ctx.opts.classifyMinSamples) {
        ctx.opts.onProgress(
          `  F=${fMs.toFixed(1)}ms: ${honoredCount} honored ` +
            `(${tardyCount} tardy tolerated), median ` +
            `${median(samplesMs).toFixed(1)}ms → honored`,
        );
        return {
          fS,
          samplesMs,
          classification: 'honored',
          abortedOnTardy: false,
        };
      }
    }
  }

  // Hit max_samples — call it honored iff most samples honored.
  return {
    fS,
    samplesMs,
    classification: honoredCount > tardyCount ? 'honored' : 'pinned',
    abortedOnTardy: false,
  };
}

/**
 * Find the smallest F that is reliably honoured for (model, cadence).
 * Returns `bestFS: null` if no useful F exists, or if the best F we
 * found doesn't save at least `minSavingsMs` vs the no-F control (the
 * latter protects against "honored-but-not-helpful" cases the strict
 * classifier alone doesn't catch, e.g., very slow models at low cadence
 * where multiple cadence-tick alignments produce competing pinning
 * regimes).
 */
export async function findBestF(
  engine: OptimizerEngine,
  model: string,
  cadenceS: number,
  options: OptimizeOptions = {},
): Promise<OptimizeResult> {
  const opts = resolveOptions(cadenceS, options);
  const cadenceMs = cadenceS * 1000;
  const history: FProbe[] = [];
  const log = opts.onProgress;
  let queriesTotal = 0;

  // ─── 1. Calibrate: no-F control reference. ───────────────────────────
  const controlDts: number[] = [];
  for (let i = 0; i < opts.controlSamples; i++) {
    controlDts.push(await engine.measure(model, cadenceS, null));
    queriesTotal += 1;
  }
  const controlDtMs = median(controlDts);
  log(`control dt median = ${controlDtMs.toFixed(1)} ms`);

  // ─── 1b. Pinned reference at F = F_min. F_min=1ms is far below any
  // plausible cliff, so this gives us dt in the pinned regime. The bug
  // shape (pinned dt = N*cadence + F + offset) lets us predict pinned
  // dt at any F. ───────────────────────────────────────────────────────
  const refDts: number[] = [];
  for (let i = 0; i < opts.pinnedReferenceSamples; i++) {
    refDts.push(await engine.measure(model, cadenceS, opts.fMinS));
    queriesTotal += 1;
  }
  const dtAtFMinMs = median(refDts);
  const fMinMs = opts.fMinS * 1000;
  // Tardy threshold: at any F, predicted pinned dt is
  //   pred_pinned = dt_at_F_min - F_min_ms + F_ms
  // i.e. `(dt - F) = (dt_at_F_min - F_min_ms)` under pinned. Honored
  // subtracts at least one cadence from that. `tardyFactor × cadence`
  // is the gap below predicted-pinned that still counts as "pinned".
  const extraPinnedBaseline = dtAtFMinMs - fMinMs;
  const extraThresholdMs =
    extraPinnedBaseline - opts.tardyFactor * cadenceMs;
  log(
    `pinned ref @F=${fMinMs.toFixed(1)}ms = ${dtAtFMinMs.toFixed(1)}ms; ` +
      `tardy iff (dt-F) > ${extraThresholdMs.toFixed(1)} ms`,
  );

  if (extraThresholdMs <= 0) {
    // F_min itself is honored — no cliff above it. Sanity branch.
    const refProbe: FProbe = {
      fS: opts.fMinS,
      samplesMs: refDts,
      classification: 'honored',
      abortedOnTardy: false,
    };
    const savings = controlDtMs - dtAtFMinMs;
    if (savings < opts.minSavingsMs) {
      return {
        model,
        cadenceS,
        controlDtMs,
        tardyThresholdMs: extraThresholdMs,
        bestFS: null,
        expectedDtMs: dtAtFMinMs,
        savingsMs: savings,
        bracketS: [opts.fMinS, opts.fMinS],
        queriesTotal,
        history: [refProbe],
        note:
          `F_min already honored but saves only ${savings.toFixed(1)}ms ` +
          `(< ${opts.minSavingsMs}ms) vs control — recommend None`,
      };
    }
    return {
      model,
      cadenceS,
      controlDtMs,
      tardyThresholdMs: extraThresholdMs,
      bestFS: opts.fMinS,
      expectedDtMs: dtAtFMinMs,
      savingsMs: savings,
      bracketS: [opts.fMinS, opts.fMinS],
      queriesTotal,
      history: [refProbe],
      note: `F_min already honored (pinned ref ${dtAtFMinMs.toFixed(1)}ms is below threshold; cliff at or below F_min)`,
    };
  }

  const ctx: ClassifyContext = {
    engine,
    model,
    cadenceS,
    extraThresholdMs,
    opts,
    queriesTotal,
  };

  // ─── 2. Geometric scan to find the first honored F. Smallest-to-
  // largest gives us robustness against strip-flip at F_max — if the
  // cliff exists, we find it before reaching the noise-vulnerable upper
  // bound. ─────────────────────────────────────────────────────────────
  const searchGrid: number[] = [];
  let F = opts.fMinS;
  while (F < opts.fMaxS) {
    searchGrid.push(F);
    F *= 2;
  }
  searchGrid.push(opts.fMaxS);

  let honoredIdx: number | null = null;
  for (let i = 0; i < searchGrid.length; i++) {
    const fS = searchGrid[i]!;
    log(
      `scan probe F=${(fS * 1000).toFixed(2)} ms ` +
        `(maxTardyAllowed=${opts.scanMaxTardyAllowed})`,
    );
    const probe = await classifyF(ctx, fS, opts.scanMaxTardyAllowed);
    history.push(probe);
    if (probe.classification === 'honored') {
      honoredIdx = i;
      break;
    }
  }

  if (honoredIdx === null) {
    return {
      model,
      cadenceS,
      controlDtMs,
      tardyThresholdMs: extraThresholdMs,
      bestFS: null,
      expectedDtMs: null,
      savingsMs: null,
      bracketS: null,
      queriesTotal: ctx.queriesTotal,
      history,
      note:
        `no honored F found in geometric scan over [${(opts.fMinS * 1000).toFixed(1)}, ` +
        `${(opts.fMaxS * 1000).toFixed(1)}] ms — cliff is above F_max`,
    };
  }

  if (honoredIdx === 0) {
    // F_min already honored without need for bisection.
    const firstHonored = searchGrid[0]!;
    const firstProbe = history[history.length - 1]!;
    const expected = median(firstProbe.samplesMs);
    const savings = controlDtMs - expected;
    if (savings < opts.minSavingsMs) {
      return {
        model,
        cadenceS,
        controlDtMs,
        tardyThresholdMs: extraThresholdMs,
        bestFS: null,
        expectedDtMs: expected,
        savingsMs: savings,
        bracketS: [firstHonored, firstHonored],
        queriesTotal: ctx.queriesTotal,
        history,
        note: `F_min already honored but saves only ${savings.toFixed(1)}ms (< ${opts.minSavingsMs}ms)`,
      };
    }
    return {
      model,
      cadenceS,
      controlDtMs,
      tardyThresholdMs: extraThresholdMs,
      bestFS: firstHonored,
      expectedDtMs: expected,
      savingsMs: savings,
      bracketS: [firstHonored, firstHonored],
      queriesTotal: ctx.queriesTotal,
      history,
      note: `F_min=${(firstHonored * 1000).toFixed(1)}ms already honored`,
    };
  }

  // ─── 3. Bisect between last-pinned (predecessor) and first-honored.
  let fLow = searchGrid[honoredIdx - 1]!; // known pinned
  let fHigh = searchGrid[honoredIdx]!; // known honored
  log(
    `bisect bracket from scan: [${(fLow * 1000).toFixed(2)}, ` +
      `${(fHigh * 1000).toFixed(2)}] ms`,
  );

  while (fHigh - fLow > opts.resolutionS) {
    const fMid = (fLow + fHigh) / 2;
    log(
      `bisect: [${(fLow * 1000).toFixed(2)}, ${(fHigh * 1000).toFixed(2)}] ` +
        `→ probe F_mid=${(fMid * 1000).toFixed(2)} ms (strict)`,
    );
    const midProbe = await classifyF(ctx, fMid, 0);
    history.push(midProbe);
    if (midProbe.classification === 'pinned') {
      fLow = fMid;
    } else {
      fHigh = fMid;
    }
  }

  // F_high is the smallest known-honored F. Recommend F_high +
  // safetyMargin to cushion against strip-flip on noisy days.
  const bestFS = Math.min(fHigh + opts.safetyMarginS, opts.fMaxS);
  // Median dt at F_high (we sampled it during classification).
  const fHighProbes = history.filter(
    (p) =>
      Math.abs(p.fS - fHigh) < 1e-9 && p.classification === 'honored',
  );
  const expectedDtMs =
    fHighProbes.length > 0
      ? median(fHighProbes[fHighProbes.length - 1]!.samplesMs)
      : bestFS * 1000 + 30; // rough estimate, only used as a fallback
  const savingsMs = controlDtMs - expectedDtMs;

  // Final sanity check: must materially beat control. The "honored"
  // classification from the tardy test alone isn't enough — for slow
  // models with multiple cadence-tick alignments, the honored dt can
  // still exceed control.
  if (savingsMs < opts.minSavingsMs) {
    return {
      model,
      cadenceS,
      controlDtMs,
      tardyThresholdMs: extraThresholdMs,
      bestFS: null,
      expectedDtMs,
      savingsMs,
      bracketS: [fLow, fHigh],
      queriesTotal: ctx.queriesTotal,
      history,
      note:
        `cliff bracketed [${(fLow * 1000).toFixed(2)}, ${(fHigh * 1000).toFixed(2)}] ms ` +
        `but expected dt ${expectedDtMs.toFixed(1)}ms saves only ` +
        `${savingsMs >= 0 ? '+' : ''}${savingsMs.toFixed(1)}ms vs control ` +
        `(${controlDtMs.toFixed(1)}ms) — below minSavingsMs ` +
        `(${opts.minSavingsMs}ms). Recommend None.`,
    };
  }

  return {
    model,
    cadenceS,
    controlDtMs,
    tardyThresholdMs: extraThresholdMs,
    bestFS,
    expectedDtMs,
    savingsMs,
    bracketS: [fLow, fHigh],
    queriesTotal: ctx.queriesTotal,
    history,
    note:
      `cliff bracketed [${(fLow * 1000).toFixed(2)}, ${(fHigh * 1000).toFixed(2)}] ms; ` +
      `recommended F = F_high + ${(opts.safetyMarginS * 1000).toFixed(1)}ms margin`,
  };
}

export interface RetryOptions extends OptimizeOptions {
  readonly maxAttempts?: number;
}

/**
 * Wrap `findBestF` with retry-on-null. A null result usually means a
 * strip-flip at the upper bound blocked the scan. Retrying gives the
 * algorithm a fresh roll of the dice — the strict per-F blacklisting
 * still applies within each attempt; we don't keep an F that tardied.
 */
export async function findBestFWithRetry(
  engine: OptimizerEngine,
  model: string,
  cadenceS: number,
  options: RetryOptions = {},
): Promise<OptimizeResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  let last: OptimizeResult | null = null;
  let cumulativeQueries = 0;
  let attemptsUsed = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptsUsed = attempt;
    const r = await findBestF(engine, model, cadenceS, options);
    cumulativeQueries += r.queriesTotal;
    if (r.bestFS !== null) {
      const noteSuffix =
        attempt > 1 ? ` (succeeded on attempt ${attempt}/${maxAttempts})` : '';
      return {
        ...r,
        queriesTotal: cumulativeQueries,
        note: r.note + noteSuffix,
      };
    }
    last = r;
    options.onProgress?.(
      attempt < maxAttempts
        ? `attempt ${attempt}/${maxAttempts} returned None — retrying`
        : `attempt ${attempt}/${maxAttempts} returned None — giving up`,
    );
  }

  // All attempts returned null.
  if (last === null) {
    // Unreachable: every iteration assigns last (we go through the
    // loop body at least once because maxAttempts ≥ 1 by construction).
    // Documented here for the reader; the early return inside the loop
    // covers the success case.
    throw new Error('findBestFWithRetry: no attempts ran');
  }
  return {
    ...last,
    queriesTotal: cumulativeQueries,
    note: last.note + ` (after ${attemptsUsed} attempts)`,
  };
}
