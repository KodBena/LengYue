/**
 * src/engine/katago/limits.ts
 * Upstream-imposed constants for the KataGo analysis-engine protocol.
 *
 * These are values determined by the *upstream* KataGo binary's actual
 * behaviour, not by the SPA's preferences. Each is paired with an
 * upstream artefact (a documented limit, an empirically-characterised
 * cliff, a wire-shape constraint) and a removal trigger (typically:
 * "when upstream X is fixed / lifted, this constant goes away").
 *
 * Distinct from `src/store/defaults.ts`'s defaults, which encode the
 * project's *preferences* over the upstream's accepted range. A
 * preference can be re-tuned freely; an upstream-imposed constant
 * cannot — changing it without a corresponding upstream change just
 * recreates the user-visible symptom.
 *
 * License: Public Domain (The Unlicense)
 */

/**
 * Lower bound (seconds) for the `firstReportDuringSearchAfter` value
 * sent on KataGo analysis queries.
 *
 * KataGo's analysis-engine source documents `0.001` as the protocol
 * minimum for `firstReportDuringSearchAfter`. The SPA enforces it at
 * two layers: the `KnobInputDecl.minFloor` carries this value as decl-
 * level metadata so the slider widget clamps drag positions to the
 * floor; the wire-side defence-in-depth clamp in
 * `services/analysis-service.ts` reads from here to guarantee the
 * contract reaching the engine respects the floor regardless of
 * stored-leaf state (the substrate preserves user-stored leaves below
 * a floor — only the visual slider and the wire layer enforce).
 *
 * Historical note: a 0.035 s floor previously occupied this constant
 * as an SPA-side workaround for a KataGo bug
 * ([`lightvector/KataGo#1197`](https://github.com/lightvector/KataGo/issues/1197),
 * 2026-05-16) where the engine refused to ship the first during-search
 * report until a cadence-aligned eval-completion tick. The bug was
 * fixed upstream; this constant reverted to the protocol-documented
 * minimum on 2026-05-25 alongside the retirement of the F-optimizer
 * cohort. See `docs/notes/retrospective-katago-f-optimizer-2026-05.md`
 * for the arc.
 */
export const KATAGO_FIRST_REPORT_FLOOR_S = 0.001;
