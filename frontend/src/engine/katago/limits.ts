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
 * Upstream KataGo (verified against `1.16.4`) silently substitutes
 * `reportDuringSearchEvery` for the first-report timing when the
 * requested `firstReportDuringSearchAfter` value is below an absolute
 * threshold of approximately 25 ms. The substitution is independent of
 * cadence, non-deterministic in the 0.020 – 0.030 s strip, and produces
 * a perceived first-paint at `cadence + ~70 ms` instead of at the
 * requested value. Full diagnosis arc and reproducers staged at
 * `~/katago_bugreport`; umbrella worklog
 * `docs/worklog/2026-05-15-katago-first-report-cliff-diagnosis.md`.
 *
 * The 0.035 s floor sits comfortably above the noisy 0.020 – 0.030 s
 * strip — empirically every value at-or-above 0.035 is honoured
 * reliably across three independent client stacks. The slider's
 * `KnobInputDecl.minFloor` carries this value as decl-level metadata
 * so the substrate (`KnobSlider.vue`) clamps drag positions to the
 * floor; the wire-side defence-in-depth clamp in
 * `services/analysis-service.ts` reads from here to guarantee the
 * contract reaching the engine respects the floor regardless of
 * stored-leaf state.
 *
 * **Removal trigger.** When the upstream bug is fixed and confirmed
 * against a target KataGo version (re-run `reproducer.py` from the
 * bug-report package; check the table at §"Observed" no longer shows
 * cadence-pin for sub-0.025 values), drop this constant and remove the
 * `minFloor` field from the first-report-after KnobDecl in
 * `store/defaults.ts`. A schema migration that strips the field from
 * existing persisted decls is the clean way to retire the workaround.
 */
export const KATAGO_FIRST_REPORT_FLOOR_S = 0.035;
