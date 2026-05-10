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

import type { EngineModelEntry } from '../../types';

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

export interface VersionProbeResult {
  readonly version: string | null;
  readonly capabilities: Record<string, Record<string, unknown>> | null;
  readonly raw: Record<string, unknown> | null;
}

export interface ModelsProbeResult {
  readonly availableModels: readonly EngineModelEntry[];
  readonly internalName: string | null;
  readonly raw: Record<string, unknown> | null;
}

/**
 * Type-guard for plain objects (not arrays, not null). The wire
 * payloads are typed as `unknown` at the boundary; this keeps the
 * subsequent property reads in pure-TS territory without any `as`
 * coercion.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parse a `query_version` response. `null` for `version` /
 * `capabilities` means "field absent or wrong shape" — the caller
 * decides what to do (legacy auto-engage if `capabilities` is null;
 * connection refusal if `capabilities` is non-null but missing
 * `delta_analysis`; etc.).
 *
 * The `capabilities` field, when present, is shape-validated to
 * `Record<string, Record<string, unknown>>` — a flat `string[]` or
 * any other shape parses to `null` (treated as "no advertisement"
 * by the caller, since the proxy is presumed not to be speaking
 * this protocol). Per ADR-0002 this is feature detection rather
 * than silent fallback: the legacy path is honest, the
 * capability-aware path is honest, and the choice is observation-
 * driven.
 */
export function parseVersionResponse(payload: unknown): VersionProbeResult {
  if (!isRecord(payload)) {
    return { version: null, capabilities: null, raw: null };
  }
  const version = typeof payload.version === 'string' ? payload.version : null;

  let capabilities: Record<string, Record<string, unknown>> | null = null;
  if (isRecord(payload.capabilities)) {
    const acc: Record<string, Record<string, unknown>> = {};
    for (const [name, metadata] of Object.entries(payload.capabilities)) {
      // Each capability value must be a plain object (the
      // dict-not-list shape is contractually load-bearing per the
      // dispatch's Q4 sign-off — empty `{}` is the no-metadata
      // sentinel; populated objects parameterise per capability).
      if (isRecord(metadata)) {
        acc[name] = metadata;
      }
    }
    capabilities = acc;
  }

  return { version, capabilities, raw: payload };
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
export function parseModelsResponse(payload: unknown): ModelsProbeResult {
  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    return { availableModels: [], internalName: null, raw: isRecord(payload) ? payload : null };
  }

  const availableModels: EngineModelEntry[] = [];
  let internalName: string | null = null;
  for (let i = 0; i < payload.models.length; i++) {
    const entry = payload.models[i];
    if (!isRecord(entry)) continue;
    let label: string | null = null;
    if (typeof entry.label === 'string') {
      label = entry.label;
    } else if (typeof entry.internalName === 'string') {
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
export function requiresDeltaAnalysisRefusal(
  capabilities: Record<string, Record<string, unknown>> | null,
): boolean {
  if (capabilities === null) return false;
  return !(REQUIRED_BEHAVIOURAL_CAPABILITY in capabilities);
}
