/**
 * src/state/visits-lerp.ts
 * Session-ephemeral a/b LERP override on a card's specific visit
 * count (wiki wanted-feature 3, ledger rows 503/504).
 *
 * ─── What this is ─────────────────────────────────────────────────
 * Two user-tunable parameters — `a` (multiplier: KataGo model
 * strength drift in Elo-per-visit) and `b` (offset: user learning /
 * preference) — that transform a card's specific visit count `x`
 * into the count that actually reaches the engine query:
 * `effective = a*x + b`. Configured under the Settings "Other" tab
 * (`VisitsLerpConfig.vue`); consumed at the ONE seam where a card's
 * specific visit count feeds analysis-query construction
 * (`useReviewSession.ts::processUserMove` — see that call site's
 * comment for why this is the single home, ADR-0012).
 *
 * ─── SESSION-EPHEMERAL BY EXPLICIT MAINTAINER WORD — NOT PERSISTED ──
 * This is plain module-scope reactive state, not a `GlobalStore`
 * field: no store schema change, no migration, never written to the
 * workspace document, never surfaced in `RegistryEditor`'s persisted
 * registry. A page reload resets it to `DEFAULT_VISITS_LERP`.
 *
 * This DELIBERATELY diverges from the `qeuboToolbarView` idiom
 * (`useQeubo.ts`'s `_toolbarView`, a `WritableComputedRef` proxying
 * `store.session.ui.qeuboToolbarView`, synced by SyncService and
 * surviving reload) — that idiom is for state the maintainer wants
 * persisted per-session-document; this feature's spec is the
 * opposite (ledger rows 503/504: explicitly session-ephemeral). Do
 * not "fix" this module to route through the store the way
 * `qeuboToolbarView` does — that would be the regression, not the
 * improvement.
 *
 * ─── Rounding / clamp discipline ──────────────────────────────────
 * `lerpVisits` rounds the raw affine result to the nearest integer
 * (`Math.round` — the same "round to clean, then use" choice
 * `setVisitsOverride` in `useReviewSession.ts` already makes for the
 * sibling per-card override input) and then floors the result to a
 * minimum of 1: a KataGo visits budget must be a positive integer,
 * and a pathological (or deliberately negative) `b` must never hand
 * the engine a non-positive or fractional visits count. This is a
 * defence-in-depth floor, not the range enforcement itself — see the
 * next section for where `a`'s range is actually policed.
 *
 * ─── `a`'s range is ENFORCED, not display-only (ledger row 1625) ───
 * `a ∈ (0, ∞)` is a hard constructor-style invariant on `setVisitsLerpA`,
 * not merely the UI hint text's claim: a non-positive (or non-finite)
 * `a` would make every `lerpVisits` result hit the `Math.max(1, …)`
 * floor regardless of a card's actual visit count, silently defeating
 * the multiplier's purpose across the whole deck rather than failing
 * at the one input that caused it — exactly the drift-goes-unnoticed
 * shape ADR-0002 exists to forbid. `setVisitsLerpA` therefore refuses
 * loudly (structured error, last-known-good `a` retained) rather than
 * silently clamping or coercing; see the setter's own docstring for
 * the refusal shape, which follows `per-query-overrides.ts` /
 * `match-player-overrides.ts`'s existing "keep last-known-good value +
 * reactive `error` field" idiom for setter validation in this state
 * layer.
 *
 * ─── Composes-with-future-per-request-overrides seam ──────────────
 * The wiki notes this composes with a future per-request-overrides
 * feature. This module builds ONLY the session-wide a/b transform;
 * the composition point is the call site in `useReviewSession.ts`
 * (a comment there marks the seam) — no machinery for per-request
 * overrides is pre-built here.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';

/**
 * The two-parameter affine transform, as a typed pair with named
 * semantics (ADR-0000) rather than loose `a`/`b` refs threaded
 * separately through call sites — a caller cannot accidentally pass
 * `b` where `a` is expected, and the field docs above pin down what
 * each one means.
 */
export interface VisitsLerpParams {
  /** Multiplier — rationale: KataGo model strength drift in Elo-per-visit. */
  readonly a: number;
  /** Offset — rationale: user learning / preference. */
  readonly b: number;
}

/**
 * Identity transform. `a=1, b=0` must make `lerpVisits` byte-
 * identical to its input (after the positive-integer floor, which
 * is a no-op for any already-positive-integer `x`) — the regression
 * lock for "this feature must not change today's behaviour by
 * default."
 */
export const DEFAULT_VISITS_LERP: VisitsLerpParams = { a: 1, b: 0 };

/**
 * Pure transform: `x` is a card's specific visit count; the result
 * is what should reach the engine query. Exported standalone (not
 * bundled with the reactive state below) so unit tests can drive it
 * over explicit `VisitsLerpParams` fixtures without touching module-
 * scope reactive state at all — Tier 1, no Vue reactivity needed to
 * exercise the arithmetic.
 *
 * Rounding: `Math.round` to the nearest integer (ties round away
 * from zero, per `Math.round`'s own spec — the affine transform's
 * domain here is always positive so this never surfaces the
 * negative-tie asymmetry). Clamp: floored to a minimum of 1 — see
 * the module docstring's "Rounding / clamp discipline" section for
 * why a KataGo visits budget can never be non-positive or
 * fractional.
 */
export function lerpVisits(x: number, params: VisitsLerpParams): number {
  const raw = params.a * x + params.b;
  return Math.max(1, Math.round(raw));
}

// ─── Session-ephemeral reactive state ──────────────────────────────

const _params: Ref<VisitsLerpParams> = ref({ ...DEFAULT_VISITS_LERP });

/**
 * `a`'s validation error for the CURRENT `visitsLerpParams.value.a`,
 * or null when the last `setVisitsLerpA` call was accepted. Same
 * "reactive error slot beside the applied value" shape as
 * `per-query-overrides.ts`'s `_state.error` / `perQueryOverridesError`
 * — see this module's "`a`'s range is ENFORCED" docstring section.
 */
const _aError: Ref<string | null> = ref(null);

/**
 * Read-facing accessor for the current session's params. The UI
 * (`VisitsLerpConfig.vue`) and the query-construction call site both
 * read through this so there is exactly one live copy — same
 * "single source of truth" shape as `useReviewSession.ts`'s
 * `effectiveVisits`.
 */
export const visitsLerpParams: Ref<VisitsLerpParams> = _params;

/**
 * The current validation error for `a`, or null. For the UI's
 * inline-error display (`VisitsLerpConfig.vue`) — same role as
 * `perQueryOverridesError` / `matchPlayerOverridesError`.
 */
export const visitsLerpAError: Ref<string | null> = _aError;

/**
 * Set the multiplier. `a ∈ (0, ∞)` is ENFORCED (ledger row 1625, not
 * display-only): a non-finite OR non-positive `value` is refused —
 * `visitsLerpParams.value.a` stays at its last-known-good value and
 * `visitsLerpAError` carries a user-facing message, mirroring
 * `per-query-overrides.ts`'s / `match-player-overrides.ts`'s
 * "keep last-known-good + reactive `error`" idiom for setter
 * validation in this state layer (never a silent clamp or coercion —
 * ADR-0002). The UI's own `type="number"` input still handles the
 * common case at the point of entry; this is the loud backstop for
 * whatever slips past it (a caller other than the UI, a browser that
 * doesn't enforce `step`/`min` on `<input type=number>`, etc.).
 */
export function setVisitsLerpA(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    _aError.value = `a must be a positive, finite number (got ${value})`;
    return;
  }
  _aError.value = null;
  _params.value = { ..._params.value, a: value };
}

/**
 * Set the offset. `b ∈ (−∞, ∞)` is deliberately unrestricted (see the
 * module docstring's "Rounding / clamp discipline" section for why an
 * extreme `b` is still safe at the query boundary); invalid input
 * (non-finite) is silently refused, matching `setVisitsOverride`'s
 * validation posture in `useReviewSession.ts` — one of ADR-0002's
 * documented "UI input validation fallback" exceptions, since a
 * non-finite `b` can only originate from the numeric input itself
 * (never a domain invariant `b` can violate the way non-positive `a`
 * does), and the UI's own `type="number"` input handles the common
 * case.
 */
export function setVisitsLerpB(value: number): void {
  if (!Number.isFinite(value)) return;
  _params.value = { ..._params.value, b: value };
}

/**
 * Reset affordance for the "Other" tab config surface — restores the
 * identity transform and clears any pending `a` validation error.
 * Session-ephemeral state has no persisted baseline to "revert to";
 * `DEFAULT_VISITS_LERP` IS the reset target.
 */
export function resetVisitsLerp(): void {
  _params.value = { ...DEFAULT_VISITS_LERP };
  _aError.value = null;
}

/**
 * Test-only reset — same shape as other module-scope test resets in
 * this codebase (e.g. `resetFakeBackendService`). Distinct from
 * `resetVisitsLerp` only in naming intent (test isolation vs. a
 * user-facing UI action); both currently do the same thing, kept
 * separate so a future divergence (e.g. the user-facing reset
 * gaining a confirm step) doesn't have to un-conflate a dual-purpose
 * export.
 */
export function _resetVisitsLerpForTesting(): void {
  _params.value = { ...DEFAULT_VISITS_LERP };
  _aError.value = null;
}
