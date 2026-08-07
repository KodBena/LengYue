/**
 * src/state/per-query-overrides.ts
 * Session-ephemeral JSON blob of "active overrides for-the-time-being"
 * (wiki wanted-feature 2, ledger rows 510/511) — merged into every
 * outgoing analysis query's `overrideSettings` before it reaches the
 * wire. PDA (`playoutDoublingAdvantage`) is the motivating example;
 * `KataGoAnalysisQuery.overrideSettings` (`engine/katago/types.ts`)
 * is documented as an opaque, engine-version-dependent bag the proxy
 * forwards verbatim — exactly the shape a freeform per-request tuning
 * surface should target.
 *
 * ─── SESSION-EPHEMERAL BY DESIGN — same posture as `visits-lerp.ts` ──
 * Plain module-scope reactive state; no `GlobalStore` field, no
 * migration, never written to the workspace document, never in
 * `RegistryEditor`'s persisted registry. "For-the-time-being" (the
 * maintainer's own phrase) means "resets on reload" — see
 * `visits-lerp.ts`'s module docstring for the fuller rationale
 * (including why this deliberately does NOT follow the
 * `qeuboToolbarView` persisted-session-field idiom).
 *
 * ─── Application seam ───────────────────────────────────────────────
 * `mergeQueryOverrides` is called from
 * `engine/katago/query-routing.ts::finalizeAnalysisRouting` — the
 * SELECTOR-routing seam already enforced (by brand + lint) as the
 * SOLE place every analysis-query builder must pass through before
 * the query may reach `KataGoClient.subscribe`. Folding the merge in
 * there (rather than asking each of the four builders — analyzeRange,
 * analyzeActiveNode, usePlayFromPosition's engine-play queries,
 * useKomiCalibration's mint-time eval — to remember a second call) is
 * the SAME structural fix query-routing.ts's own header describes for
 * the `model` leg: a per-builder memory test becomes a compile-time-
 * enforced single seam. See `finalizeAnalysisRouting`'s updated
 * docstring.
 *
 * ─── Merge semantics (decision + rejected alternative) ─────────────
 * Chosen: shallow-merge the parsed JSON object into
 * `query.overrideSettings` ONLY; keys the JSON names win over
 * whatever `overrideSettings` value the builder had already computed
 * (registry-configured winrate framing, symmetry sampling, etc.) —
 * the blanket override exists precisely to let the user override, so
 * it must be able to. Keys the JSON does NOT name are left at the
 * builder's computed value (the app's per-query values win by
 * omission).
 *
 * Rejected: merging into the query ROOT (moves, boardXSize, maxVisits,
 * analyzeTurns, id, …). `overrideSettings` is the one field the wire
 * type documents as deliberately opaque and engine-forwarded; the
 * root fields are structural — a JSON override that slipped in a
 * `moves` or `id` key would corrupt query identity/routing in ways
 * that have nothing to do with "engine-side runtime overrides," and
 * the feature request (PDA, an `overrideSettings` field) never needed
 * root access. Confining the merge to `overrideSettings` keeps the
 * blanket-override surface scoped to what it was actually asked to
 * do.
 *
 * ─── Validation (ADR-0002: never silently half-apply) ──────────────
 * Invalid JSON, or JSON that doesn't parse to a plain object (array,
 * primitive, `null`), is refused: the `applied` overrides stay at
 * their last-known-good value (empty `{}` if none was ever valid) and
 * `error` carries a user-facing message. The raw `text` is always
 * retained verbatim (even mid-invalid-edit) so the textarea never
 * clobbers the user's in-progress typing.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, reactive, type ComputedRef } from 'vue';

/** A validated, parsed per-query overrides object — closed shape, not a raw string splice (ADR-0000). */
export type PerQueryOverridesObject = Readonly<Record<string, unknown>>;

/** Empty overrides — the identity value: merging this into a query changes nothing. */
export const EMPTY_PER_QUERY_OVERRIDES: PerQueryOverridesObject = Object.freeze({});

/**
 * Parse and validate a candidate overrides string. Pure — no module-
 * scope state touched — so this is directly Tier-1-testable over
 * string fixtures.
 *
 * Accepts: empty / whitespace-only text (→ `EMPTY_PER_QUERY_OVERRIDES`,
 * the identity case) and any JSON text that parses to a plain object
 * (`{}`-shaped; arrays, strings, numbers, booleans, and `null` are
 * refused as "not an object" even though they're valid JSON).
 */
export function parsePerQueryOverrides(
  text: string,
): { kind: 'ok'; value: PerQueryOverridesObject } | { kind: 'error'; message: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { kind: 'ok', value: EMPTY_PER_QUERY_OVERRIDES };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { kind: 'error', message: detail };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'error', message: 'overrides must be a JSON object, e.g. {"playoutDoublingAdvantage": 1.5}' };
  }
  // Narrowed to a non-null, non-array object by the guard above — the
  // opaque `unknown` from JSON.parse is exactly a plain JSON object at
  // this point; no unsound coercion.
  return { kind: 'ok', value: parsed as PerQueryOverridesObject };
}

/**
 * Merge validated overrides into an assembled query's
 * `overrideSettings`, per the module docstring's "Merge semantics"
 * section: shallow-merge, overrides win on key collision, every
 * other query field untouched. An empty overrides object is a true
 * no-op — returns `query` BY REFERENCE, unchanged — so the identity
 * case (`a=1,b=0`-style regression lock) is byte-identical, not just
 * value-equal.
 *
 * Generic over any query shape carrying an optional
 * `overrideSettings` bag so both the analysis-query and engine-play
 * query families (which share that wire field — see
 * `engine/katago/types.ts`) can route through the same merge.
 */
export function mergeQueryOverrides<Q extends { overrideSettings?: Record<string, unknown> }>(
  query: Q,
  overrides: PerQueryOverridesObject,
): Q {
  if (Object.keys(overrides).length === 0) return query;
  return {
    ...query,
    overrideSettings: { ...(query.overrideSettings ?? {}), ...overrides },
  };
}

// ─── Session-ephemeral reactive state ──────────────────────────────

interface PerQueryOverridesState {
  /** Raw textarea contents, retained verbatim across valid AND invalid edits. */
  text: string;
  /** Last-known-good parsed object. `EMPTY_PER_QUERY_OVERRIDES` until the user enters a first valid, non-empty override. */
  applied: PerQueryOverridesObject;
  /** Parse/validation error for the CURRENT `text`, or null when `text` is valid. */
  error: string | null;
}

const _state = reactive<PerQueryOverridesState>({
  text: '',
  applied: EMPTY_PER_QUERY_OVERRIDES,
  error: null,
});

/**
 * The overrides object every outgoing analysis query merges against
 * — read by `finalizeAnalysisRouting`. Always the last successfully
 * parsed value; never the half-typed invalid one (ADR-0002).
 */
export const activePerQueryOverrides: ComputedRef<PerQueryOverridesObject> =
  computed(() => _state.applied);

/** The raw textarea text, for the UI to bind `v-model`-style. */
export const perQueryOverridesText: ComputedRef<string> = computed(() => _state.text);

/** The current validation error, or null. For the UI's inline-error display. */
export const perQueryOverridesError: ComputedRef<string | null> = computed(() => _state.error);

/**
 * Set the textarea's contents and re-validate. On success, updates
 * both `text` and `applied` and clears `error`. On failure, updates
 * `text` (so the user's keystrokes aren't lost) but leaves `applied`
 * at its last-known-good value and sets `error` — the override set is
 * NOT applied while invalid (ADR-0002: never silently half-apply).
 */
export function setPerQueryOverridesText(text: string): void {
  _state.text = text;
  const result = parsePerQueryOverrides(text);
  if (result.kind === 'ok') {
    _state.applied = result.value;
    _state.error = null;
  } else {
    _state.error = result.message;
  }
}

/** Reset affordance — clears text, applied overrides, and any error back to the identity state. */
export function resetPerQueryOverrides(): void {
  _state.text = '';
  _state.applied = EMPTY_PER_QUERY_OVERRIDES;
  _state.error = null;
}

/** Test-only reset — same shape as `_resetVisitsLerpForTesting` in `visits-lerp.ts`. */
export function _resetPerQueryOverridesForTesting(): void {
  resetPerQueryOverrides();
}
