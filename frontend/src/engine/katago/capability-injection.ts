/**
 * src/engine/katago/capability-injection.ts
 *
 * Pure builder for the per-query `capabilities` dict the SPA injects
 * into outgoing analysis queries under the proxy v1.0.14+ contract.
 * Lifted out of the effectful `analysis-service.ts` call sites so
 * the engagement-decision matrix can be unit-tested without
 * WebSocket plumbing or store reactivity.
 *
 * Engagement matrix (per
 * `docs/dispatch/frontend-to-proxy-selector-and-capabilities.md`'s
 * *Behavioural contract* section, taken with the proxy-side status
 * sign-off's Q1 default semantics):
 *
 *   advertised === null
 *     → return undefined. The proxy doesn't speak the capability
 *       protocol; falling back to its legacy auto-engage path is
 *       the wire-compatible move (and the SPA's `delta_analysis`
 *       requirement was already validated at probe time — see
 *       `version-probe.ts::requiresDeltaAnalysisRefusal`).
 *
 *   advertised !== null
 *     → return a dict. Always includes `delta_analysis: {}` (SPA
 *       universal requirement; engagement-or-disconnect is
 *       enforced at probe time). Includes `transposition: {}` when
 *       the registry toggle is on AND the proxy advertises
 *       transposition. Includes `adaptive_reevaluate: {meta}` when
 *       the user has opted in via the analysis-tab checkbox AND
 *       the query is range-based AND `forReview` is false AND the
 *       proxy advertises the capability — `{meta}` carries the
 *       user-configured `worst_quantile` and `extra_visits`
 *       overrides (registry-stored, persisted across sessions).
 *       The `forReview` gate exists because review-session grading
 *       reads the wire-level visit count against the card's
 *       defaultVisits; adaptive's deeper pass would inflate it
 *       and corrupt the score.
 *
 * The transposition unmet-but-requested case (toggle on, proxy
 * doesn't advertise) does NOT push warnings here — that's a
 * probe-time concern surfaced once per WS open from
 * `analysis-service.ts::probeEngineInfo`. This helper stays pure
 * (no side effects, no system-message pushing) so unit tests can
 * exercise it without mocking the message queue.
 *
 * License: Public Domain (The Unlicense)
 */

export interface AdaptiveReevaluateInput {
  /**
   * User's opt-in toggle, surfaced in the analysis-tab UI when the
   * proxy advertises `adaptive_reevaluate`. Persisted across
   * sessions via the registry. Default false: adaptive's deeper-
   * analysis follow-ups change the visit count of the resulting
   * packets, which corrupts review-session grading and confuses
   * any downstream consumer that expects a specific maxVisits;
   * the user opts in deliberately for live range queries where
   * the deeper pass on worst-quantile turns is wanted.
   */
  readonly enabled: boolean;
  /**
   * Per-query `worst_quantile` metadata override sent on opt-in.
   * The proxy's middleware default is 0.25; the SPA's registry
   * default is 0.05 (top 5% of moves get re-evaluated, more
   * conservative than the proxy's default).
   */
  readonly worstQuantile: number;
  /**
   * Per-query `extra_visits` metadata override sent on opt-in.
   * The proxy's middleware default is 800; this matches.
   * Increment-not-absolute: the deeper query runs at
   * `original_maxVisits + extra_visits`, letting KataGo's NN cache
   * continue the search from where the original left off.
   */
  readonly extraVisits: number;
}

export interface CapabilityInjectionInput {
  /**
   * The proxy's capability advertisement from the most recent
   * `query_version` probe, as stored on `store.engine.info.capabilities`.
   * `null` means the proxy didn't advertise (legacy auto-engage path);
   * non-null means the proxy speaks the protocol — the SPA builds an
   * explicit per-query opt-in dict from that point on.
   */
  readonly advertised: Record<string, Record<string, unknown>> | null;
  /**
   * Whether this query covers a range of turns (`analyzeRange`)
   * versus a single turn (`analyzeActiveNode`). Adaptive
   * re-evaluation only makes sense on range-based queries — its
   * worst-quantile selection operates over a window.
   */
  readonly isRangeBased: boolean;
  /**
   * Whether the caller needs the wire-level maxVisits to be exactly
   * what was requested — i.e., adaptive_reevaluate's deeper pass
   * must NOT add visits to the resulting packets. Set true by the
   * review-session grading path (`useReviewSession.processUserMove`
   * → analyzeRange) where visit counts are load-bearing for the
   * card's recorded defaultVisits comparison; set false by all
   * other range-query callers (live analysis-tab range selection,
   * full-game analyze button).
   *
   * Distinct from `isRealtime` (analysis-service's caller-supplied
   * parameter that gates `reportDuringSearchEvery`): a review
   * session sets both `forReview=true` and `isRealtime=false`, but
   * a hypothetical batch caller might want `isRealtime=false` (no
   * during-search packets) without `forReview=true` (adaptive's
   * deeper pass would be welcome). The two flags are independent
   * dimensions of caller intent.
   */
  readonly forReview: boolean;
  /**
   * The user's wire-request gate for `transposition` — sourced
   * from `engine.katago.useTransposition` in the registry. When
   * true AND the proxy advertises the capability, the SPA opts in;
   * when true but the proxy doesn't advertise, the wire request
   * is silently omitted (the probe-time message has already told
   * the user the toggle isn't being honoured).
   */
  readonly useTransposition: boolean;
  /**
   * The user's adaptive-reevaluate opt-in + metadata, sourced from
   * `engine.katago.adaptiveReevaluate` in the registry. When
   * `enabled` is true AND this is a live range-based query AND the
   * proxy advertises the capability, the SPA opts in and sends
   * the metadata as the per-query `adaptive_reevaluate.{worst_quantile,
   * extra_visits}` overrides. The metadata is sent unconditionally
   * on opt-in (no comparison to proxy defaults) so registry edits
   * take effect on the next query.
   */
  readonly adaptiveReevaluate: AdaptiveReevaluateInput;
}

/**
 * Build the per-query `capabilities` opt-in dict. Returns
 * `undefined` when the proxy is on the legacy auto-engage path
 * (the `capabilities` field on the wire query is then omitted
 * altogether — the proxy reads absence as "engage all wired
 * extensions" per its Q1 sign-off).
 *
 * The returned dict is fresh per call (callers may freely include
 * it in the wire payload without aliasing concerns); empty
 * metadata `{}` per capability means "opt in with proxy defaults"
 * — adaptive_reevaluate is the only capability today that ships
 * with non-empty metadata (the user's worst_quantile / extra_visits
 * overrides), keyed snake_case to match the wire vocabulary.
 */
export function buildPerQueryCapabilities(
  input: CapabilityInjectionInput,
): Record<string, Record<string, unknown>> | undefined {
  if (input.advertised === null) return undefined;

  const out: Record<string, Record<string, unknown>> = {};
  // `delta_analysis` always engaged. Probe-time disconnection
  // already enforced its presence in the advertised dict; this
  // line is the symmetric per-query opt-in.
  out.delta_analysis = {};

  if (input.useTransposition && 'transposition' in input.advertised) {
    out.transposition = {};
  }

  if (input.adaptiveReevaluate.enabled
      && input.isRangeBased
      && !input.forReview
      && 'adaptive_reevaluate' in input.advertised) {
    // Wire shape uses snake_case to match the proxy's metadata
    // schema (per the dispatch's Q4 sign-off). Registry uses
    // camelCase per the SPA's convention; the translation happens
    // here at the wire boundary.
    out.adaptive_reevaluate = {
      worst_quantile: input.adaptiveReevaluate.worstQuantile,
      extra_visits: input.adaptiveReevaluate.extraVisits,
    };
  }

  return out;
}

/**
 * Probe-time predicate for the "transposition toggle is on but
 * the proxy doesn't honour it" warning. Distinct from the
 * per-query capability decision (which silently skips opt-in when
 * the capability is unavailable) — this fires once per WS open at
 * probe time so the user knows their toggle state has no effect.
 *
 * Returns false when:
 *   - the proxy doesn't advertise at all (legacy auto-engage; the
 *     toggle is honoured by the proxy's wired-extensions default);
 *   - the toggle is off (no expectation to violate);
 *   - the toggle is on AND `transposition` is advertised (honoured).
 *
 * Returns true only in the asymmetric case the dispatch's
 * *Behavioural contract* §4 names: toggle on, advertised dict
 * present but missing the capability.
 */
export function shouldWarnTranspositionUnmet(
  advertised: Record<string, Record<string, unknown>> | null,
  useTransposition: boolean,
): boolean {
  if (advertised === null) return false;
  if (!useTransposition) return false;
  return !('transposition' in advertised);
}
