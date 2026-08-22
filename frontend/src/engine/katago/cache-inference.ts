/**
 * src/engine/katago/cache-inference.ts
 *
 * The maintainer's original cache-wiki ask #2: the engine version
 * tooltip (`ToolbarEngineMetrics.vue`'s `versionTooltip`, which
 * renders the raw `query_version` capabilities payload) gains a line
 * INFERRED from the SPA's own `engine.katago.cache` /
 * `engine.katago.lookup_cache` registry leaves — the same flags
 * `CacheReplaySettings.vue` exposes and `analysis-service.ts` reads
 * at every analyze call site.
 *
 * This is deliberately NOT folded into the negotiated-capability
 * vocabulary: the proxy's `query_version` `capabilities` dict names
 * behaviours the PROXY advertises support for
 * (`delta_analysis` / `transposition` / `adaptive_reevaluate` / …,
 * see `version-probe.ts`); `cache` / `lookup_cache` are per-query
 * request flags the SPA itself sets, not something the proxy
 * negotiates or advertises. Presenting them as an inferred SPA-side
 * line — rather than fabricating a `capabilities.cache` entry — keeps
 * that distinction visible to anyone reading the tooltip.
 *
 * Split out as a pure function (rather than inlined in the
 * component's computed) so the inferred text is unit-testable
 * without mounting `ToolbarEngineMetrics.vue`.
 *
 * License: Public Domain (The Unlicense)
 */

/** Minimal translate-function shape this module depends on — the
 * real `vue-i18n` `t` satisfies it; a plain lookup fixture in tests
 * does too. */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * Renders the SPA-inferred cache-configuration block appended to the
 * version tooltip. Always three lines: a header naming this as
 * locally-inferred (not proxy-advertised), then one line per flag.
 */
export function describeInferredCacheState(
  cache: boolean,
  lookupCache: boolean,
  t: Translate,
): string {
  const state = (on: boolean) =>
    on ? t('toolbar.engineVersionTooltip.stateOn') : t('toolbar.engineVersionTooltip.stateOff');
  return [
    t('toolbar.engineVersionTooltip.cacheHeader'),
    t('toolbar.engineVersionTooltip.cacheWriteLine', { state: state(cache) }),
    t('toolbar.engineVersionTooltip.cacheLookupLine', { state: state(lookupCache) }),
  ].join('\n');
}
