/**
 * src/state/analysis-config.ts
 * Pure utilities for compiling and hashing the Analysis Environment.
 *
 * Two distinct concepts coexist here, and the ledger hash bridges
 * them:
 *
 *   - `compileAnalysisConfig()` — the frontend palette compilation
 *     (delta_fn, state_fns, summary_fn, parameters, symbols). Sent
 *     to the proxy verbatim as the wire's `analysis_config` field;
 *     the proxy applies it to compute per-move enrichment. Opaque
 *     to KataGo (the proxy strips it before forwarding).
 *
 *   - `compileEngineOverrides()` — KataGo-side runtime settings the
 *     user opts into via the registry editor (winrate framing,
 *     symmetry sampling, root noise). Sent to KataGo verbatim as
 *     the wire's `overrideSettings` field; the proxy forwards it
 *     transparently. Affects what packets KataGo emits — winrate
 *     sign convention is the canonical example: a user who flips
 *     `reportAnalysisWinratesAs` from 'WHITE' to 'BLACK' would see
 *     analysis numbers invert without a fresh ledger bucket.
 *
 * `compileAnalysisDescriptor()` is the holistic `{ analysis_config,
 * overrideSettings }` envelope that determines what packets KataGo
 * (via the proxy) returns. Hashing this envelope — not just the
 * palette — is what guarantees a settings change buckets analyses
 * separately. Both flows that need a stable hash (live navigation
 * and card replay) compose the descriptor identically; the wire
 * splits it back into the two top-level fields at the call site
 * (see `analysis-service.ts`).
 *
 * The qEUBO audition (toggle Applied / A / B in the toolbar) flows
 * through the `parameters` field. When an experiment exists and
 * the toolbar is in 'A' or 'B' mode, the corresponding pair's
 * decoded values overlay `env.parameters`; the engine sees the
 * audition without the audition being persisted. `activeAnalysisKeys`
 * is reactive on this overlay so analyses re-issue automatically
 * when the user toggles the audition. See `useQeubo.ts` for the
 * computed (`effectiveParameterValues`) the overlay is derived from.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { useQeubo } from '../composables/useQeubo';
import { store } from '../store';
const qeubo = useQeubo();
/**
 * Compiles the frontend AnalysisEnvironment into the wire-format analysis_config
 */
export function compileAnalysisConfig() {
    const env = store.profile.settings.engine.katago.analysis_env;
    if (!env || !env.palettes)
        return undefined;
    const activePalette = env.palettes.find(p => p.id === env.activePaletteId) || env.palettes[0];
    if (!activePalette)
        return undefined;
    // qEUBO audition: when an experiment is active, the composable's
    // `effectiveParameterValues` is the source of truth for what the
    // engine should see. It already overlays the pair's A/B values on
    // env.parameters when toolbarView is 'A' / 'B'; falls through to
    // env.parameters unchanged when 'applied' (or when no pair is
    // loaded). When no experiment exists, we read env.parameters
    // directly to avoid the spread copy on every analysis.
    const parameters = qeubo.experimentExists.value
        ? qeubo.effectiveParameterValues.value
        : env.parameters;
    // Explicitly ordered to maximize deterministic JSON.stringify
    return {
        bindings: {
            delta_fn: activePalette.delta_fn,
            state_fns: activePalette.state_fns,
            summary_fn: activePalette.summary_fn
        },
        parameters,
        symbols: env.symbols
    };
}
/**
 * Compiles the engine-side runtime overrides (KataGo's
 * `overrideSettings`) from the user's profile. Returns `undefined`
 * when the dict is missing or empty so the descriptor below can
 * elide the field entirely from the JSON serialisation — keeping
 * the hash stable across the "user has no overrides" cohort and
 * matching the wire's conditional-spread posture.
 *
 * Returned object is a fresh shallow copy: the consumer hashes /
 * serialises it, never mutates it. Mutation upstream would only
 * occur via the registry editor's emit path, which writes through
 * `store.profile.settings` — but defensiveness here is cheap and
 * matches `compileAnalysisConfig`'s "fresh-each-call" posture.
 */
export function compileEngineOverrides() {
    const overrides = store.profile.settings.engine.katago.overrideSettings;
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides))
        return undefined;
    const keys = Object.keys(overrides);
    if (keys.length === 0)
        return undefined;
    return { ...overrides };
}
/**
 * Holistic descriptor of every input that determines an analysis
 * packet's content. Used as the hashing input for `deriveAnalysisKeys`
 * / `activeAnalysisKeys` and for the per-query keys in
 * `analysis-service.ts`. Kept
 * structural rather than wire-shaped so the proxy and KataGo each
 * see only the field that concerns them: `analysis_config`
 * (palette) goes to the proxy; `overrideSettings` goes to KataGo;
 * `model` goes to a SELECTOR-role proxy as the routing key (and
 * therefore selects the network that produces the packet).
 *
 * `compileAnalysisDescriptorFromParts` is the symmetric helper for
 * card-replay paths, where the palette and overrides come from a
 * persisted snapshot rather than from live settings; the model is
 * always read live (a card replayed under a different network is a
 * different analysis and must bucket separately).
 *
 * Returns `undefined` when all three legs of the descriptor are
 * undefined — preserves the `hashConfig(undefined) === 'default'`
 * contract for the rare case of no env / no palettes / no
 * overrides / no SELECTOR target.
 */
export function compileAnalysisDescriptor() {
    return compileAnalysisDescriptorFromParts(compileAnalysisConfig(), compileEngineOverrides(), store.engine.selectedModel ?? undefined);
}
export function compileAnalysisDescriptorFromParts(analysis_config, overrideSettings, model) {
    if (analysis_config === undefined &&
        overrideSettings === undefined &&
        model === undefined) {
        return undefined;
    }
    // Explicit field order — the JSON.stringify ordering matters for
    // the DJB2 hash to be stable. `analysis_config` and
    // `overrideSettings` come first in the order they shipped, so
    // pre-SELECTOR descriptors (model undefined, serialised as the
    // field being absent) hash identically to what they hashed before
    // this leg was added. `model` last keeps that backward-compatible
    // hash invariant: an `undefined` model is JSON-stringified as
    // omitted, producing the same JSON byte-for-byte as the two-leg
    // descriptor. When a SELECTOR target is selected, switching it
    // produces a fresh hash → a fresh ledger bucket, so the move-
    // suggestions visit-count gating doesn't compare strong-network
    // packets against the prior weak-network's accumulated visits.
    return { analysis_config, overrideSettings, model };
}
/** Fast, deterministic DJB2 hash for the config string */
export function hashConfig(config) {
    if (!config)
        return 'default';
    const str = JSON.stringify(config);
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}
/**
 * The raw-half descriptor: the subset of the analysis descriptor the raw
 * KataGo output actually depends on (network + engine `overrideSettings`),
 * with the palette (`analysis_config`) leg dropped entirely. `model` last,
 * matching `compileAnalysisDescriptorFromParts`'s omit-when-undefined
 * convention; there is no back-compat constraint here (no persisted bundle
 * ever stored a raw key). Returns `undefined` when both legs are undefined
 * so `hashConfig(undefined) === 'default'` is preserved, mirroring the
 * enriched descriptor's contract.
 */
function compileRawDescriptorFromParts(overrideSettings, model) {
    if (overrideSettings === undefined && model === undefined)
        return undefined;
    return { overrideSettings, model };
}
/**
 * Derive both provenance-stratified ledger keys from one structured
 * descriptor — the SOLE construction site for the `RawKey` / `EnrichedKey`
 * brands (no raw casts at consumers).
 *
 *   - `enrichedKey` = hash(palette + overrides + model). Built via the
 *     existing `compileAnalysisDescriptorFromParts`, so it is **byte-identical
 *     to the legacy `configHash`** — the documented model-last back-compat
 *     invariant is preserved automatically, and a legacy persisted bundle's
 *     `config_hash` equals this enriched key (load-bearing for v1 replay).
 *   - `rawKey` = hash(overrides + model). Palette-independent, so a palette
 *     swap leaves it unchanged and raw consumers keep reading their bucket.
 *
 * Both are derived from the same parts so the two keys can never drift on
 * which legs feed which.
 */
export function deriveAnalysisKeys(analysis_config, overrideSettings, model) {
    // EnrichedKey brand mint: this is the sole factory for the enriched cache
    // key (frontend/CLAUDE.md keyed-cache discipline); the hash binds the full
    // analysis-descriptor dependency set.
    const enrichedKey = hashConfig(compileAnalysisDescriptorFromParts(analysis_config, overrideSettings, model));
    // RawKey brand mint: sibling sole factory; hash binds the raw-descriptor leg.
    const rawKey = hashConfig(compileRawDescriptorFromParts(overrideSettings, model));
    return { rawKey, enrichedKey };
}
/**
 * A reactive computed of the two active ledger keys, derived from live
 * settings. Recomputes when a palette is swapped, a symbol is edited, an
 * `engine.katago.overrideSettings` key is added / removed / retyped, OR the
 * SELECTOR Toolbar dropdown selects a different network. A palette-only
 * change re-mints `enrichedKey` while leaving `rawKey` stable — the property
 * the raw-overlay consumers rely on to survive a palette swap.
 */
export const activeAnalysisKeys = computed(() => deriveAnalysisKeys(compileAnalysisConfig(), compileEngineOverrides(), store.engine.selectedModel ?? undefined));
