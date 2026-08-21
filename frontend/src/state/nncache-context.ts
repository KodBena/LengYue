/**
 * src/state/nncache-context.ts
 *
 * Session-ephemeral reactive slot for the currently ATTACHED NN-cache
 * context (KataGo's persisted-cache `cacheContext` query field). This
 * is the ONE thing `query-routing.ts::finalizeAnalysisRouting` reads
 * to auto-stamp `cacheContext` on every outgoing analysis query —
 * mirroring `state/per-query-overrides.ts`'s auto-injection idiom
 * (same choke point already enforced by brand + lint; no call-site
 * changes needed at any of the four analysis-query builders).
 *
 * ── Why a `state/` module and not `services/nncache-session.ts` itself ──
 * `query-routing.ts` (engine band) is imported BY
 * `services/analysis-service.ts`. The lifecycle driver
 * (`services/nncache-session.ts`) needs to send wire actions through
 * `analysisService`, so it imports `services/analysis-service.ts` —
 * if `query-routing.ts` read the attached context by importing the
 * driver directly, the three files would form an import cycle
 * (query-routing → nncache-session → analysis-service → query-routing).
 * Splitting the reactive VALUE into this dependency-free `state/`
 * leaf (same relocation rationale as `analysis-config.ts` /
 * `per-query-overrides.ts` — frontend/CLAUDE.md's
 * reactive-state-modules-relocation split) breaks the cycle:
 * `query-routing.ts` reads this leaf directly, and
 * `services/nncache-session.ts` is this leaf's ONLY writer.
 *
 * Session-ephemeral by design — same posture as `per-query-overrides.ts`
 * / `visits-lerp.ts`: plain module-scope reactive state, no
 * `GlobalStore` field, never persisted, resets on reload.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, computed, type ComputedRef } from 'vue';
import type { EngineCacheContext } from '../engine/katago/cache-context';

const _attached = ref<EngineCacheContext | null>(null);

/**
 * The context every outgoing analysis query stamps `cacheContext`
 * with, or `null` (no attachment — the field is omitted entirely,
 * per `KataGoAnalysisQuery.cacheContext`'s optionality).
 */
export const activeAttachedContext: ComputedRef<EngineCacheContext | null> =
  computed(() => _attached.value);

/**
 * Owner-only write. `services/nncache-session.ts` is the sole caller,
 * and only after a `cache_attach` action has actually SUCCEEDED —
 * never optimistically before the wire round-trip resolves.
 */
export function setAttachedContext(ctx: EngineCacheContext): void {
  _attached.value = ctx;
}

/**
 * Owner-only write. `services/nncache-session.ts` calls this after a
 * SUCCESSFUL `cache_detach`, after a refused `cache_attach` (nothing
 * to route queries against), and when its own bookkeeping already
 * finds nothing attached (`disable()` / `endSession()` / the
 * disconnect hook's `ctx === null` branches).
 *
 * It is deliberately NEVER called on a refused `cache_detach` (or a
 * refused `cache_dump` ahead of one). Per Analysis_Engine.md's
 * sole-context implicit-attribution rule, the engine is still
 * attached in that case — clearing here would leave this SPA
 * believing it had detached while the engine kept silently
 * attributing every subsequent untagged query to the context the
 * user just tried to leave. See `nncache-session.ts`'s `disable()`
 * and `dumpAndDetach()` for the full rationale; both revert to the
 * settled attached state on a refusal instead of clearing here.
 */
export function clearAttachedContext(): void {
  _attached.value = null;
}

/** Test-only reset — same shape as `_resetPerQueryOverridesForTesting`. */
export function _resetAttachedContextForTesting(): void {
  _attached.value = null;
}
