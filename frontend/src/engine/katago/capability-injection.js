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
export function buildPerQueryCapabilities(input) {
    if (input.advertised === null)
        return undefined;
    const engageTransposition = input.useTransposition && 'transposition' in input.advertised;
    const engageAdaptive = input.adaptiveReevaluate.enabled
        && input.isRangeBased
        && !input.forReview
        && 'adaptive_reevaluate' in input.advertised;
    let adaptiveCap;
    if (engageAdaptive) {
        // v1.0.26 — Phase 3.5 learned value-function opt-in. When the
        // user selects a `learned_*` binding from the dropdown AND the
        // proxy advertises it under `available_value_bindings`, send
        // the value_binding + matching allocation_algorithm. Bypasses
        // analysis_config per docs/dispatch/proxy-to-frontend-learned-vf.md.
        // The advertisement read is cast-free: `available_value_bindings`
        // is typed on the mirror (`AdaptiveReevaluateAdvertisedMetadata`)
        // and validated once at probe time — a mismatched advertisement
        // degrades the capability in `parseVersionResponse` before it
        // can reach this consumer.
        const vb = input.adaptiveReevaluate.valueBinding;
        const available = input.advertised.adaptive_reevaluate?.available_value_bindings ?? [];
        const engageLearned = vb.startsWith('learned_') && available.includes(vb);
        // Wire shape uses snake_case to match the proxy's metadata
        // schema (per the dispatch's Q4 sign-off). Registry uses
        // camelCase per the SPA's convention; the translation happens
        // here at the wire boundary.
        adaptiveCap = {
            worst_quantile: input.adaptiveReevaluate.worstQuantile,
            extra_visits: input.adaptiveReevaluate.extraVisits,
            ...(engageLearned
                ? { value_binding: vb, allocation_algorithm: 'learned_piecewise' }
                : {}),
        };
    }
    // `delta_analysis` always engaged. Probe-time disconnection
    // already enforced its presence in the advertised dict; this is
    // the symmetric per-query opt-in.
    return {
        delta_analysis: {},
        ...(engageTransposition ? { transposition: {} } : {}),
        ...(adaptiveCap !== undefined ? { adaptive_reevaluate: adaptiveCap } : {}),
    };
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
export function shouldWarnTranspositionUnmet(advertised, useTransposition) {
    if (advertised === null)
        return false;
    if (!useTransposition)
        return false;
    return !('transposition' in advertised);
}
