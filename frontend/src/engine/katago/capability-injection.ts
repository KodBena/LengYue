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
 *       transposition. Includes `adaptive_reevaluate: {}` when the
 *       query is range-based AND not a snapshot replay (the
 *       middleware's mid-stream follow-ups break turn-locked
 *       review-session timing in ways that aren't fixable
 *       client-side, and would diverge from a card's recorded
 *       analysis on snapshot replay).
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
   * Whether this query is a snapshot replay (a card's recorded
   * analysis_config being replayed for review-session grading) or
   * a live query authored against the user's current registry. The
   * snapshot/live distinction matches `analysis-service.ts`'s
   * existing `isSnapshotMode = configOverride !== undefined` check
   * — preserved here as the structural signal for whether
   * `adaptive_reevaluate` is appropriate.
   */
  readonly isSnapshotMode: boolean;
  /**
   * Whether this query covers a range of turns (`analyzeRange`)
   * versus a single turn (`analyzeActiveNode`). Adaptive
   * re-evaluation only makes sense on range-based queries — its
   * worst-quantile selection operates over a window.
   */
  readonly isRangeBased: boolean;
  /**
   * The user's wire-request gate for `transposition` — sourced
   * from `engine.katago.useTransposition` in the registry. When
   * true AND the proxy advertises the capability, the SPA opts in;
   * when true but the proxy doesn't advertise, the wire request
   * is silently omitted (the probe-time message has already told
   * the user the toggle isn't being honoured).
   */
  readonly useTransposition: boolean;
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
 * metadata `{}` per capability means "opt in with proxy
 * defaults" (the `adaptive_reevaluate` schema with
 * `worst_quantile` / `extra_visits` exists but the SPA accepts
 * proxy defaults today; the dict shape leaves the door open for
 * future schema authoring without wire-compatibility consequences).
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

  if (input.isRangeBased
      && !input.isSnapshotMode
      && 'adaptive_reevaluate' in input.advertised) {
    out.adaptive_reevaluate = {};
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
