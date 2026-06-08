/**
 * src/lib/stability-trajectory.ts
 *
 * TypeScript port of the research arc's `StabilityTrajectory[Q]`
 * (Python original on branch
 * `bork/research/visit-scaling-memo-2026-05-21`, file
 * `research/stability_trajectory.py`). Generic data structure
 * over an equality-typed quantity Q: stores the change-point
 * compression of a per-V observation sequence, supports
 * any-V lookup in O(log K) and log-V-weighted stable-fraction
 * tail queries.
 *
 * Domain-agnostic per ADR-0003 — knows nothing about KataGo;
 * the extractors that turn a packet into a Q live in
 * `src/engine/analysis/stability-extractors.ts`. Mutation-
 * friendly: `appendObservation` grows the trajectory in place
 * as new preview packets arrive at higher V; this composes
 * with the ledger-style per-key version-ref reactivity the
 * trajectory store applies on top.
 *
 * Q is constrained to a primitive-comparable shape
 * (`string | number | boolean`) so structural equality reduces
 * to `===`. Composite quantities like the research arc's
 * `top3_set` (Python `frozenset[str]`) serialise to a canonical
 * sorted-joined string inside the extractor, preserving Q's
 * primitive-equality contract end-to-end.
 *
 * The `_UNKNOWN` sentinel handles "extractor returned null
 * for this packet" — the observation is recorded as a known
 * gap but does NOT vote against stability in derived metrics
 * (the gap's V-interval is dropped from both numerator and
 * denominator). The Python original used `_UNKNOWN = object()`;
 * the TS analog is a unique Symbol.
 *
 * License: Public Domain (The Unlicense)
 */

import type { MetricId } from '../types';

/** Sentinel for "extractor returned null at this packet". */
export const UNKNOWN: unique symbol = Symbol('stability-trajectory-unknown');
export type Unknown = typeof UNKNOWN;

/** Q values must be primitive-comparable. Composite quantities
 *  serialise to canonical strings inside the extractor. */
export type StabilityValue = string | number | boolean;

export interface ChangePoint<Q extends StabilityValue> {
  /** Visit count at which the value changed. */
  readonly V: number;
  /** New value (or UNKNOWN if the extractor returned null here). */
  readonly value: Q | Unknown;
}

export interface StabilityTrajectory<Q extends StabilityValue> {
  /** Sorted by V ascending. Strictly-increasing V; consecutive entries
   *  carry distinct values (the change-point compression invariant). */
  changepoints: ChangePoint<Q>[];
  /** Highest V observed so far — the right edge of all interval-window
   *  computations. */
  V_max: number;
  /** Informational; number of packets fed in (not number of changepoints). */
  n_packets: number;
}

/** Construct an empty trajectory. */
export function emptyTrajectory<Q extends StabilityValue>(): StabilityTrajectory<Q> {
  return { changepoints: [], V_max: 0, n_packets: 0 };
}

/**
 * Append a single (V, value | null) observation. Mutates `t` in place
 * if (a) the new V is strictly greater than V_max AND (b) the value
 * differs from the most recent changepoint's value. Otherwise the
 * trajectory's change-point list is unchanged (but `n_packets` and
 * `V_max` always advance).
 *
 * Returns the same `t` reference for caller convenience. Callers that
 * need reactivity should observe via the trajectory store's per-key
 * version ref, not via the trajectory reference itself.
 */
export function appendObservation<Q extends StabilityValue>(
  t: StabilityTrajectory<Q>,
  V: number,
  value: Q | null,
): StabilityTrajectory<Q> {
  // Out-of-order or duplicate V: silently drop. The use case is
  // monotonically-growing search trajectories; the proxy's normal
  // emission cadence is monotone-V, but a cache replay or a
  // re-analyze could re-emit older packets. Dropping is consistent
  // with the design note's "change-point list" framing — we record
  // forward progression only.
  if (V <= t.V_max && t.changepoints.length > 0) {
    t.n_packets++;
    return t;
  }
  const tagged: Q | Unknown = value === null ? UNKNOWN : value;
  const last = t.changepoints[t.changepoints.length - 1];
  if (last === undefined || last.value !== tagged) {
    t.changepoints.push({ V, value: tagged });
  }
  t.V_max = V;
  t.n_packets++;
  return t;
}

/**
 * Build a trajectory from a complete (V, value | null) sequence.
 * Used by tests and by one-shot bootstrap paths; the steady-state
 * ingestion path uses `appendObservation` per arriving packet.
 */
export function fromObservations<Q extends StabilityValue>(
  observations: ReadonlyArray<readonly [number, Q | null]>,
): StabilityTrajectory<Q> {
  const t = emptyTrajectory<Q>();
  for (const [V, val] of observations) {
    appendObservation(t, V, val);
  }
  return t;
}

/**
 * Binary search for the rightmost changepoint with V ≤ target. Returns
 * the changepoint index or -1 if `target` precedes the first change-point.
 */
function bisectRight<Q extends StabilityValue>(
  t: StabilityTrajectory<Q>,
  target: number,
): number {
  const cps = t.changepoints;
  let lo = 0;
  let hi = cps.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cps[mid].V <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** Value at visit count V (last changepoint with V_cp ≤ V), or UNKNOWN
 *  if V precedes every changepoint or the trajectory is empty. */
export function valueAt<Q extends StabilityValue>(
  t: StabilityTrajectory<Q>,
  V: number,
): Q | Unknown {
  const idx = bisectRight(t, V);
  if (idx < 0) return UNKNOWN;
  return t.changepoints[idx].value;
}

export interface StabilityMetricResult {
  /** Stability score in [0, 1] where 1 = most stable. Semantics
   *  varies per metric — see each metric function's docs:
   *
   *  - `anchoredAtVTerm`: fraction of [anchorV, V_max] log-V
   *    matching the value at the V_term-or-lenient anchor.
   *  - `anchoredAtVMax`: fraction of [V_term, V_max] log-V
   *    matching the value at V_max ("did the final value
   *    dominate the earlier window too?").
   *  - `longestRunFraction`: log-V fraction of the window
   *    occupied by the longest-held value (mode-fraction,
   *    anchor-independent).
   *  - `changeRateInverse`: `1 / (1 + nChanges/log(V_max/V_term))` —
   *    volatility-flavoured (anchor-independent).
   *
   *  NaN when the metric is undefined for this trajectory (window
   *  empty, no known values, etc.). */
  value: number;
  /** True iff value ≥ threshold and value is finite. */
  isStable: boolean;
  /** Anchor V for anchor-based metrics (V_term or the lenient
   *  forward-fallback; V_max for the V_max-anchored variant). NaN
   *  for anchor-independent metrics or when no anchor exists. */
  anchorV: number;
  /** Diagnostic: number of distinct-value transitions counted
   *  inside the [V_term, V_upper] window (skipping UNKNOWN-bridging
   *  pairs). Same definition across all metrics; computed once and
   *  surfaced as an honest volatility companion to whatever
   *  stability value the chosen metric reports. */
  nChanges: number;
}

/**
 * Internal: walk the changepoint stream inside [V_term, V_upper],
 * yielding (V_prev, V_next, value_at_prev) tuples that span every
 * sub-interval. Used by all four metric functions to share the same
 * window-walking convention.
 */
function* walkWindow<Q extends StabilityValue>(
  t: StabilityTrajectory<Q>,
  V_term: number,
  V_upper: number,
): Generator<{ prev_V: number; next_V: number; value: Q | Unknown }> {
  const cps = t.changepoints;
  let prev_V = V_term;
  let prev_val: Q | Unknown = valueAt(t, V_term);

  let i = bisectRight(t, V_term) + 1;
  while (i < cps.length && cps[i].V <= V_upper) {
    yield { prev_V, next_V: cps[i].V, value: prev_val };
    prev_V = cps[i].V;
    prev_val = cps[i].value;
    i++;
  }
  if (V_upper > prev_V) {
    yield { prev_V, next_V: V_upper, value: prev_val };
  }
}

/**
 * Count distinct-value transitions inside (V_term, V_upper]. Skips
 * UNKNOWN-bridging pairs (a value going to UNKNOWN and back doesn't
 * count as a change). Used as the `nChanges` diagnostic for every
 * metric result.
 */
function countChanges<Q extends StabilityValue>(
  t: StabilityTrajectory<Q>,
  V_term: number,
  V_upper: number,
): number {
  let n = 0;
  let prev_val: Q | Unknown = valueAt(t, V_term);
  const cps = t.changepoints;
  let i = bisectRight(t, V_term) + 1;
  while (i < cps.length && cps[i].V <= V_upper) {
    const cur = cps[i].value;
    if (prev_val !== UNKNOWN && cur !== UNKNOWN && prev_val !== cur) n++;
    prev_val = cur;
    i++;
  }
  return n;
}

/**
 * Log-V-weighted stability fraction over [anchorV, V_max], anchored
 * at value_at(V_term) — or, with the lenient-anchor fallback, at the
 * first known value past V_term. The design note's canonical metric;
 * predicts "does the value the engine showed at V_term survive?".
 *
 * Log-V weighting is rescale-invariant: the same label semantics
 * apply whether the budget is V_max=15000 (training) or V_max=200
 * (deployment). Linear-V weighting would make the late-V tail
 * dominate.
 *
 * Unknown intervals drop from both numerator and denominator —
 * absence is not a vote against stability.
 */
export function anchoredAtVTerm<Q extends StabilityValue>(
  t: StabilityTrajectory<Q>,
  V_term: number,
  options: { V_max?: number; threshold?: number } = {},
): StabilityMetricResult {
  const V_upper = options.V_max ?? t.V_max;
  const threshold = options.threshold ?? 0.97;
  const nChanges = countChanges(t, V_term, V_upper);

  if (V_term <= 0 || V_upper <= V_term) {
    return { value: NaN, isStable: false, anchorV: NaN, nChanges };
  }

  // Anchor selection: prefer the value at V_term, but if that's
  // UNKNOWN (commonly because KataGo's earliest packet at V=1 has
  // no moveInfos and the extractor returned null there), walk
  // forward to the first known observation in (V_term, V_upper]
  // and use that as the anchor. The substrate's V_term is a
  // target lower bound for the stability window, not a strict
  // requirement — relaxing the anchor in this case preserves
  // useful signal that strict-anchor would discard.
  let target = valueAt(t, V_term);
  let anchorV = V_term;
  if (target === UNKNOWN) {
    const cps = t.changepoints;
    let i = bisectRight(t, V_term) + 1;
    while (i < cps.length && cps[i].V <= V_upper) {
      if (cps[i].value !== UNKNOWN) {
        target = cps[i].value;
        anchorV = cps[i].V;
        break;
      }
      i++;
    }
  }
  if (target === UNKNOWN) {
    return { value: NaN, isStable: false, anchorV: NaN, nChanges };
  }

  let totalKnown = 0;
  let totalMatch = 0;
  for (const seg of walkWindow(t, anchorV, V_upper)) {
    const weight = Math.log(seg.next_V / seg.prev_V);
    if (weight > 0 && seg.value !== UNKNOWN) {
      totalKnown += weight;
      if (seg.value === target) totalMatch += weight;
    }
  }

  if (totalKnown <= 0) {
    return { value: NaN, isStable: false, anchorV, nChanges };
  }
  const value = totalMatch / totalKnown;
  return { value, isStable: value >= threshold, anchorV, nChanges };
}

/**
 * Mirror of `anchoredAtVTerm` but anchored at the *final* value —
 * value_at(V_upper). Asks: "what fraction of the [V_term, V_upper]
 * window already showed the value that ended up being final?" Reads
 * as "did the engine settle early?" — high when the final answer
 * was visible from V_term onward, low when it emerged only near the
 * end of the search.
 */
export function anchoredAtVMax<Q extends StabilityValue>(
  t: StabilityTrajectory<Q>,
  V_term: number,
  options: { V_max?: number; threshold?: number } = {},
): StabilityMetricResult {
  const V_upper = options.V_max ?? t.V_max;
  const threshold = options.threshold ?? 0.97;
  const nChanges = countChanges(t, V_term, V_upper);

  if (V_term <= 0 || V_upper <= V_term) {
    return { value: NaN, isStable: false, anchorV: NaN, nChanges };
  }

  const target = valueAt(t, V_upper);
  if (target === UNKNOWN) {
    return { value: NaN, isStable: false, anchorV: NaN, nChanges };
  }

  let totalKnown = 0;
  let totalMatch = 0;
  for (const seg of walkWindow(t, V_term, V_upper)) {
    const weight = Math.log(seg.next_V / seg.prev_V);
    if (weight > 0 && seg.value !== UNKNOWN) {
      totalKnown += weight;
      if (seg.value === target) totalMatch += weight;
    }
  }

  if (totalKnown <= 0) {
    return { value: NaN, isStable: false, anchorV: V_upper, nChanges };
  }
  const value = totalMatch / totalKnown;
  return { value, isStable: value >= threshold, anchorV: V_upper, nChanges };
}

/**
 * Anchor-independent: of all values observed inside [V_term, V_upper],
 * what log-V fraction did the longest-held value occupy? Catches
 * "the engine settled on something" regardless of when it settled or
 * whether it matches the V_term or V_max value. UNKNOWN intervals
 * drop from both numerator and denominator.
 */
export function longestRunFraction<Q extends StabilityValue>(
  t: StabilityTrajectory<Q>,
  V_term: number,
  options: { V_max?: number; threshold?: number } = {},
): StabilityMetricResult {
  const V_upper = options.V_max ?? t.V_max;
  const threshold = options.threshold ?? 0.97;
  const nChanges = countChanges(t, V_term, V_upper);

  if (V_term <= 0 || V_upper <= V_term) {
    return { value: NaN, isStable: false, anchorV: NaN, nChanges };
  }

  const durations = new Map<Q, number>();
  let totalKnown = 0;
  for (const seg of walkWindow(t, V_term, V_upper)) {
    const weight = Math.log(seg.next_V / seg.prev_V);
    if (weight > 0 && seg.value !== UNKNOWN) {
      totalKnown += weight;
      const key = seg.value as Q;
      durations.set(key, (durations.get(key) ?? 0) + weight);
    }
  }

  if (totalKnown <= 0) {
    return { value: NaN, isStable: false, anchorV: NaN, nChanges };
  }
  let maxDuration = 0;
  for (const d of durations.values()) {
    if (d > maxDuration) maxDuration = d;
  }
  const value = maxDuration / totalKnown;
  return { value, isStable: value >= threshold, anchorV: NaN, nChanges };
}

/**
 * Anchor-independent volatility-flavoured score: `1 / (1 + nChanges /
 * log(V_upper / V_term))`. Rate-normalised so longer windows aren't
 * penalised more by the same count. Value 1.0 means no value
 * transitions inside the window; value 0.5 means roughly one change
 * per log-doubling of V; asymptotes toward 0 as the trajectory
 * thrashes. Independent of which value is held — captures "how
 * chaotic", not "how anchored".
 */
export function changeRateInverse<Q extends StabilityValue>(
  t: StabilityTrajectory<Q>,
  V_term: number,
  options: { V_max?: number; threshold?: number } = {},
): StabilityMetricResult {
  const V_upper = options.V_max ?? t.V_max;
  const threshold = options.threshold ?? 0.97;
  const nChanges = countChanges(t, V_term, V_upper);

  if (V_term <= 0 || V_upper <= V_term) {
    return { value: NaN, isStable: false, anchorV: NaN, nChanges };
  }

  const logWindow = Math.log(V_upper / V_term);
  if (logWindow <= 0) {
    return { value: NaN, isStable: false, anchorV: NaN, nChanges };
  }
  const rate = nChanges / logWindow;
  const value = 1 / (1 + rate);
  return { value, isStable: value >= threshold, anchorV: NaN, nChanges };
}

/**
 * Backwards-compat alias for the renamed `anchoredAtVTerm`. The
 * original name carried the Python-port's wording; the new name
 * disambiguates against the registry's three siblings. No callers
 * outside this module use the old name today; the alias is a
 * shim against future external imports.
 */
export const stableFractionLogV = anchoredAtVTerm;

/**
 * Registry of stability metrics — UI dropdowns iterate this. Adding a
 * metric is one entry here + one entry in `STABILITY_METRIC_LABELS`
 * below; the consumer (panel + composable) reads the registry
 * generically.
 */
// This map is the authoritative `MetricId` vocabulary; the array cast below
// is the brand's construction site (keys minted here, not at consumers).
export const STABILITY_METRICS: ReadonlyMap<
  MetricId,
  <Q extends StabilityValue>(
    t: StabilityTrajectory<Q>,
    V_term: number,
    options?: { V_max?: number; threshold?: number },
  ) => StabilityMetricResult
> = new Map(([
  ['anchored_at_v_term', anchoredAtVTerm],
  ['anchored_at_v_max', anchoredAtVMax],
  ['longest_run_fraction', longestRunFraction],
  ['change_rate_inverse', changeRateInverse],
] as [MetricId, any][]));

export const STABILITY_METRIC_LABELS: ReadonlyMap<MetricId, string> = new Map(([
  ['anchored_at_v_term', 'Anchored at V_term (does V_term\'s value persist?)'],
  ['anchored_at_v_max', 'Anchored at V_max (did the final value emerge early?)'],
  ['longest_run_fraction', 'Longest run (how dominant is the single most-held value?)'],
  ['change_rate_inverse', 'Inverse change-rate (how few transitions per log-doubling?)'],
] as [MetricId, string][]));

/** Default selected metric for the stability panels (a vocabulary member). */
export const DEFAULT_METRIC_ID = 'anchored_at_v_term' as MetricId;

export const STABILITY_METRIC_EXPLANATIONS: Record<string, string> = {
  anchored_at_v_term:
    "What fraction of the log-V window [V_term, V_max] carries the same extractor value as observed at V_term? The design note's canonical metric — captures \"does the engine's opinion at V_term survive further search?\" Sensitive to early flux when the engine hasn't yet committed.",
  anchored_at_v_max:
    "Same machinery but anchored at the value observed at V_max. Captures \"did the final answer emerge early?\" — high when the engine settled into the final value quickly; low when the final value only appeared near the end of the search.",
  longest_run_fraction:
    'Of all values observed in [V_term, V_max], the log-V duration of the longest-held one as a fraction of the window. Anchor-independent: catches "the engine settled on something" regardless of which value or when. Robust to chaotic early flux that eventually concentrates.',
  change_rate_inverse:
    'Volatility flavour: 1 / (1 + nChanges / log(V_max/V_term)). Anchor-independent. Value 1.0 = no transitions in the window; ~0.5 = about one transition per log-doubling of visits. Asymptotes toward 0 as the trajectory thrashes. Captures "how chaotic", not "how anchored".',
};

/** Number of changepoints strictly within (V_lower, V_upper]. Coarser
 *  diagnostic than stableFractionLogV — useful as a "how chaotic is
 *  the search here" read independent of the target value. */
export function changeCount<Q extends StabilityValue>(
  t: StabilityTrajectory<Q>,
  V_lower: number = 0,
  V_upper: number = Infinity,
): number {
  let count = 0;
  for (const cp of t.changepoints) {
    if (cp.V > V_lower && cp.V <= V_upper) count++;
  }
  return count;
}

/** V of the most recent changepoint, or null if empty. */
export function lastChangeV<Q extends StabilityValue>(
  t: StabilityTrajectory<Q>,
): number | null {
  const cps = t.changepoints;
  return cps.length > 0 ? cps[cps.length - 1].V : null;
}
