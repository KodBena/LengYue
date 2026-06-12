/**
 * src/engine/katago/version-probe.ts
 *
 * Pure parsers for the two engine-identity probe responses
 * (`query_version` and `query_models`). Lifted out of the
 * effectful `analysis-service.ts::probeEngineInfo` so the parsing
 * shape — including the SELECTOR-vs-LEAF `query_models`
 * normalisation and the capability-advertisement extraction — can
 * be unit-tested without WebSocket plumbing.
 *
 * Wire-shape contract:
 *
 *   query_version response:
 *     { id, version: string, capabilities?: { name: {metadata}, ... } }
 *
 *   query_models response (LEAF):
 *     { id, models: [{ internalName: string, name: string, ... }] }
 *
 *   query_models response (SELECTOR, proxy v1.0.15+):
 *     { id, models: [{ label: string }, { label: string }, ...] }
 *
 *   query_models response (SELECTOR, proxy v1.0.18+):
 *     { id, models: [{ label: string, healthy: boolean }, ...] }
 *     The `healthy` field surfaces per-LEAF availability so the
 *     SPA's model-selector dropdown can grey out advertised-but-
 *     disconnected labels. Wire-compatible with v1.0.15 (the field
 *     is additive); pre-v1.0.18 SELECTOR responses and LEAF-mode
 *     responses don't carry it, and the parser defaults it to
 *     `true`.
 *
 * The SELECTOR shape is authoritatively documented in the proxy's
 * `tests/test_selector_router.py::test_query_models_synthesised_no_upstream_traffic`
 * (asserts the v1.0.18 entries `[{label, healthy}, ...]`); the LEAF
 * shape is KataGo's native protocol. The frontend handles both with
 * one normalised `EngineModelEntry[]` projection so the dropdown UI
 * doesn't need to know which kind of proxy is in front of it.
 *
 * License: Public Domain (The Unlicense)
 */
/**
 * Universally-required behavioural capability name. The SPA's
 * review-session grading and analysis-tab rendering both depend on
 * the per-move enrichment fields produced by the proxy's
 * `analysis_enricher` Transformer; if a proxy advertises
 * capabilities at all but doesn't list `delta_analysis`, no
 * per-query opt-in can rescue the situation. The connection-refusal
 * path in `analysis-service.ts::probeEngineInfo` consumes this
 * constant.
 *
 * Wire-key naming asymmetry note: the three other initial
 * capabilities (`transposition`, `adaptive_reevaluate`, `selector`)
 * align with their proxy-side artifact names; `delta_analysis` does
 * not (the proxy's Transformer is `analysis_enricher`). This is a
 * deferred rename per the project memory; the wire stays at
 * `delta_analysis` until a coordinated proxy + frontend arc opens.
 */
export const REQUIRED_BEHAVIOURAL_CAPABILITY = 'delta_analysis';
/**
 * Type-guard for plain objects (not arrays, not null). The wire
 * payloads are typed as `unknown` at the boundary; this keeps the
 * subsequent property reads in pure-TS territory without any `as`
 * coercion.
 */
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Element-checked string-array guard for advertised binding lists. */
function isStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
/**
 * Typed-mirror validation for `adaptive_reevaluate`'s advertised
 * metadata (see `AdaptiveReevaluateAdvertisedMetadata` in
 * `./types.ts`). Each declared field is optional on the wire but,
 * when present, must carry the declared shape — a present-but-
 * mismatched field fails validation, and the caller degrades the
 * capability. Undeclared fields pass through untouched
 * (forward-compatible per the mirror's open index signature).
 *
 * Currently the only known capability with declared metadata fields;
 * a future capability that grows a schema gets its own validator and
 * a named branch in `parseVersionResponse`'s loop.
 */
function validateAdaptiveReevaluateAdvertisement(meta) {
    const bindings = meta.available_value_bindings;
    if (bindings !== undefined && !isStringArray(bindings)) {
        return { ok: false, field: 'available_value_bindings', expected: 'string[]' };
    }
    const extraVisits = meta.extra_visits;
    if (extraVisits !== undefined && typeof extraVisits !== 'number') {
        return { ok: false, field: 'extra_visits', expected: 'number' };
    }
    const worstQuantile = meta.worst_quantile;
    if (worstQuantile !== undefined && typeof worstQuantile !== 'number') {
        return { ok: false, field: 'worst_quantile', expected: 'number' };
    }
    // Cast-free reconstruction: the spread keeps undeclared metadata
    // fields (forward-compatible pass-through); the three declared
    // fields are re-assigned from the control-flow-narrowed locals so
    // the object satisfies the mirror interface without a type
    // assertion. Absent fields are re-assigned as explicit `undefined`
    // own-properties — a TS-narrowing artefact invisible to every
    // consumer (property reads, `?.`/`??` chains, and `toEqual` all
    // treat them as absent).
    return {
        ok: true,
        value: {
            ...meta,
            available_value_bindings: bindings,
            extra_visits: extraVisits,
            worst_quantile: worstQuantile,
        },
    };
}
/**
 * Parse a `query_version` response. `null` for `version` /
 * `capabilities` means "field absent or wrong shape" — the caller
 * decides what to do (legacy auto-engage if `capabilities` is null;
 * connection refusal if `capabilities` is non-null but missing
 * `delta_analysis`; etc.).
 *
 * The `capabilities` field, when present, is shape-validated to the
 * typed advertisement mirror (`CapabilityAdvertisement`) — a flat
 * `string[]` or any other non-dict shape parses to `null` (treated
 * as "no advertisement" by the caller, since the proxy is presumed
 * not to be speaking this protocol). Per ADR-0002 this is feature
 * detection rather than silent fallback: the legacy path is honest,
 * the capability-aware path is honest, and the choice is
 * observation-driven.
 *
 * Layered on top (the typed-mirror validation): a KNOWN capability
 * whose metadata violates its declared interface is dropped from the
 * parsed dict and recorded on `degraded` — that one capability is
 * degraded, never the connection (the refusal surface stays exactly
 * `requiresDeltaAnalysisRefusal`'s). Unknown capability names pass
 * through untouched provided they keep the dict-of-dicts shape.
 */
export function parseVersionResponse(payload) {
    if (!isRecord(payload)) {
        return { version: null, capabilities: null, degraded: [], raw: null };
    }
    const version = typeof payload.version === 'string' ? payload.version : null;
    let capabilities = null;
    const degraded = [];
    if (isRecord(payload.capabilities)) {
        // Mutable accumulator with the named member spelled out so the
        // validated `adaptive_reevaluate` assignment below type-checks
        // against the mirror interface (a bare
        // `Record<string, CapabilityMetadata>` would erase the narrowing
        // the validator just established).
        const acc = {};
        for (const [name, metadata] of Object.entries(payload.capabilities)) {
            // Each capability value must be a plain object (the
            // dict-not-list shape is contractually load-bearing per the
            // dispatch's Q4 sign-off — empty `{}` is the no-metadata
            // sentinel; populated objects parameterise per capability).
            if (!isRecord(metadata)) {
                // For the known typed capability this is a mirror mismatch:
                // record the degradation so the caller surfaces it. Unknown
                // names keep the original silent-drop — there is no declared
                // schema to name a mismatch against, and the entry was never
                // consumable anyway.
                if (name === 'adaptive_reevaluate') {
                    degraded.push({ capability: name, field: 'metadata', expected: 'object' });
                }
                continue;
            }
            if (name === 'adaptive_reevaluate') {
                const result = validateAdaptiveReevaluateAdvertisement(metadata);
                if (!result.ok) {
                    // Degrade exactly this one capability (level-4/5 surfacing
                    // happens at the effectful caller); every other advertised
                    // capability stands, and the connection-refusal predicate
                    // below is unaffected by construction (it keys on
                    // `delta_analysis` presence only).
                    degraded.push({ capability: name, field: result.field, expected: result.expected });
                    continue;
                }
                acc.adaptive_reevaluate = result.value;
                continue;
            }
            acc[name] = metadata;
        }
        capabilities = acc;
    }
    return { version, capabilities, degraded, raw: payload };
}
/**
 * Parse a `query_models` response. Normalises the SELECTOR shape
 * (`{label: string}` per entry) and the LEAF shape
 * (`{internalName: string, ...}` per entry) into a uniform
 * `EngineModelEntry[]` — preferring `label` when both fields are
 * present (SELECTOR's synthesized response wins over any
 * happens-to-pass-through artifact).
 *
 * `internalName` returned alongside is the LEAF-mode short
 * identifier (`models[0].internalName`); null on SELECTOR-mode
 * responses (which carry `label` not `internalName`). Used by the
 * Toolbar's existing single-line MODEL slot for backwards
 * compatibility with the pre-SELECTOR display shape.
 */
export function parseModelsResponse(payload) {
    if (!isRecord(payload) || !Array.isArray(payload.models)) {
        return { availableModels: [], internalName: null, raw: isRecord(payload) ? payload : null };
    }
    const availableModels = [];
    let internalName = null;
    for (let i = 0; i < payload.models.length; i++) {
        const entry = payload.models[i];
        if (!isRecord(entry))
            continue;
        let label = null;
        if (typeof entry.label === 'string') {
            label = entry.label;
        }
        else if (typeof entry.internalName === 'string') {
            label = entry.internalName;
        }
        if (label !== null) {
            // `healthy` is the proxy v1.0.18+ per-label availability flag
            // (SELECTOR-mode only). Default to `true` when the field is
            // absent or non-boolean — pre-v1.0.18 proxies and LEAF-mode
            // responses don't carry it, and treating "field missing" as
            // unhealthy would grey out every entry in those topologies.
            const healthy = typeof entry.healthy === 'boolean' ? entry.healthy : true;
            availableModels.push({ label, healthy });
        }
        if (i === 0 && typeof entry.internalName === 'string') {
            internalName = entry.internalName;
        }
    }
    return { availableModels, internalName, raw: payload };
}
/**
 * The SPA's universal-requirement check (per the dispatch's
 * *Frontend will not* §1 exception): the proxy advertises
 * capabilities at all but doesn't include `delta_analysis`. Returns
 * `true` when the connection should be refused with a system
 * message naming the unmet requirement.
 *
 * The legacy auto-engage path (capabilities absent altogether)
 * returns `false` here — feature detection, not a refusal trigger.
 * An explicit empty advertisement (`capabilities: {}`) also returns
 * `true` because `delta_analysis` is genuinely unavailable in that
 * configuration.
 */
export function requiresDeltaAnalysisRefusal(capabilities) {
    if (capabilities === null)
        return false;
    return !(REQUIRED_BEHAVIOURAL_CAPABILITY in capabilities);
}
