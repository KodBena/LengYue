/**
 * tests/unit/engine/katago/version-probe.test.ts
 *
 * Tier-1 (pure-logic) tests for the engine-identity probe parsers
 * in `src/engine/katago/version-probe.ts`. The class of bug these
 * guard against is silent shape-coercion at a wire boundary the
 * proxy v1.0.14+ contract has just expanded — the SELECTOR vs LEAF
 * `query_models` divergence and the optional `capabilities`
 * advertisement are the new invariants the probe must read honestly.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  parseVersionResponse,
  parseModelsResponse,
  requiresDeltaAnalysisRefusal,
  REQUIRED_BEHAVIOURAL_CAPABILITY,
} from '../../../../src/engine/katago/version-probe';

describe('parseVersionResponse', () => {
  it('returns nulls for non-object payloads', () => {
    const empty = { version: null, capabilities: null, degraded: [], raw: null };
    expect(parseVersionResponse(null)).toEqual(empty);
    expect(parseVersionResponse(undefined)).toEqual(empty);
    expect(parseVersionResponse('1.13.0')).toEqual(empty);
    expect(parseVersionResponse([1, 2, 3])).toEqual(empty);
  });

  it('extracts version when present and string-typed', () => {
    const r = parseVersionResponse({ id: 'x', version: '1.13.0' });
    expect(r.version).toBe('1.13.0');
    expect(r.capabilities).toBeNull();
  });

  it('returns null version when field is absent or non-string', () => {
    expect(parseVersionResponse({ id: 'x' }).version).toBeNull();
    expect(parseVersionResponse({ id: 'x', version: 1.13 }).version).toBeNull();
    expect(parseVersionResponse({ id: 'x', version: null }).version).toBeNull();
  });

  it('treats absent capabilities as null (legacy auto-engage path)', () => {
    expect(parseVersionResponse({ id: 'x', version: '1.13.0' }).capabilities).toBeNull();
  });

  it('treats wrongly-shaped capabilities (string[], scalar, etc.) as null', () => {
    expect(parseVersionResponse({ capabilities: ['delta_analysis'] }).capabilities).toBeNull();
    expect(parseVersionResponse({ capabilities: 'delta_analysis' }).capabilities).toBeNull();
    expect(parseVersionResponse({ capabilities: 42 }).capabilities).toBeNull();
  });

  it('parses an empty capabilities dict as a non-null empty object (explicit "no capabilities")', () => {
    const r = parseVersionResponse({ capabilities: {} });
    expect(r.capabilities).not.toBeNull();
    expect(r.capabilities).toEqual({});
  });

  it('preserves dict-shaped per-capability metadata; drops non-object entries silently', () => {
    const r = parseVersionResponse({
      capabilities: {
        delta_analysis: {},
        transposition: {},
        adaptive_reevaluate: { worst_quantile: 0.25, extra_visits: 800 },
        // Wrong-shape entries the parser must drop (the wire contract
        // is dict-of-dicts; a string entry is a contract violation,
        // not a presence signal):
        bogus_string: 'oops',
        bogus_array: [1, 2, 3],
        bogus_null: null,
      },
    });
    expect(r.capabilities).toEqual({
      delta_analysis: {},
      transposition: {},
      adaptive_reevaluate: { worst_quantile: 0.25, extra_visits: 800 },
    });
  });

  it('returns the raw payload alongside the parsed fields for tooltip surfacing', () => {
    const payload = { id: 'x', version: '1.13.0', extra: 'tooltip-data' };
    expect(parseVersionResponse(payload).raw).toBe(payload);
  });
});

// ── Typed-mirror validation (the per-capability metadata layer) ──────────────
//
// `parseVersionResponse` validates KNOWN capabilities' metadata
// against the mirror interfaces in `engine/katago/types.ts`
// (`AdaptiveReevaluateAdvertisedMetadata` is the only one with
// declared fields today). The calibration under test:
//   - a mismatched KNOWN capability degrades that ONE capability
//     (dropped from the dict + recorded on `degraded` for level-4/5
//     surfacing by the effectful caller);
//   - the connection-refusal surface NEVER grows from a metadata
//     mismatch (refusal is reserved for missing `delta_analysis`);
//   - unknown capability NAMES keep passing through untouched.
describe('parseVersionResponse — typed-mirror validation', () => {
  it('passes a well-formed adaptive_reevaluate advertisement through typed', () => {
    const r = parseVersionResponse({
      capabilities: {
        delta_analysis: {},
        adaptive_reevaluate: {
          worst_quantile: 0.25,
          extra_visits: 800,
          available_value_bindings: ['learned_v1', 'learned_v2'],
        },
      },
    });
    expect(r.degraded).toEqual([]);
    expect(r.capabilities?.adaptive_reevaluate?.available_value_bindings)
      .toEqual(['learned_v1', 'learned_v2']);
    expect(r.capabilities?.adaptive_reevaluate?.worst_quantile).toBe(0.25);
    expect(r.capabilities?.adaptive_reevaluate?.extra_visits).toBe(800);
  });

  it('degrades adaptive_reevaluate when available_value_bindings is not an array', () => {
    // The proxy-side field-rename / reshaping scenario the audit
    // names: a string where the SPA expects string[] must not
    // silently hide the learned-VF dropdown — the capability is
    // dropped AND the mismatch is reported for surfacing.
    const r = parseVersionResponse({
      capabilities: {
        delta_analysis: {},
        adaptive_reevaluate: { available_value_bindings: 'learned_v1' },
      },
    });
    expect(r.capabilities).not.toBeNull();
    expect(r.capabilities).not.toHaveProperty('adaptive_reevaluate');
    expect(r.degraded).toEqual([
      { capability: 'adaptive_reevaluate', field: 'available_value_bindings', expected: 'string[]' },
    ]);
  });

  it('degrades adaptive_reevaluate when available_value_bindings has non-string elements', () => {
    const r = parseVersionResponse({
      capabilities: {
        delta_analysis: {},
        adaptive_reevaluate: { available_value_bindings: ['learned_v1', 42] },
      },
    });
    expect(r.capabilities).not.toHaveProperty('adaptive_reevaluate');
    expect(r.degraded).toHaveLength(1);
    expect(r.degraded[0].field).toBe('available_value_bindings');
  });

  it('degrades adaptive_reevaluate on non-number extra_visits / worst_quantile', () => {
    const badVisits = parseVersionResponse({
      capabilities: { adaptive_reevaluate: { extra_visits: '800' } },
    });
    expect(badVisits.capabilities).not.toHaveProperty('adaptive_reevaluate');
    expect(badVisits.degraded).toEqual([
      { capability: 'adaptive_reevaluate', field: 'extra_visits', expected: 'number' },
    ]);

    const badQuantile = parseVersionResponse({
      capabilities: { adaptive_reevaluate: { worst_quantile: '0.25' } },
    });
    expect(badQuantile.capabilities).not.toHaveProperty('adaptive_reevaluate');
    expect(badQuantile.degraded).toEqual([
      { capability: 'adaptive_reevaluate', field: 'worst_quantile', expected: 'number' },
    ]);
  });

  it('degrades adaptive_reevaluate loudly (not silently) when its metadata is not a dict', () => {
    // Unknown names with non-dict metadata stay silently dropped
    // (pinned above); the KNOWN typed capability gets a degradation
    // record instead, because there is a declared schema to name
    // the mismatch against.
    const r = parseVersionResponse({
      capabilities: { delta_analysis: {}, adaptive_reevaluate: 'oops' },
    });
    expect(r.capabilities).not.toHaveProperty('adaptive_reevaluate');
    expect(r.degraded).toEqual([
      { capability: 'adaptive_reevaluate', field: 'metadata', expected: 'object' },
    ]);
  });

  it('degrades ONLY the mismatched capability — siblings pass through', () => {
    const r = parseVersionResponse({
      capabilities: {
        delta_analysis: {},
        transposition: {},
        selector: {},
        adaptive_reevaluate: { available_value_bindings: { not: 'an array' } },
        some_future_capability: { anything: ['goes', 1, null] },
      },
    });
    expect(r.capabilities).toEqual({
      delta_analysis: {},
      transposition: {},
      selector: {},
      some_future_capability: { anything: ['goes', 1, null] },
    });
    expect(r.degraded).toHaveLength(1);
  });

  it('never extends the connection-refusal surface: a degraded adaptive_reevaluate does not refuse', () => {
    // Refusal is reserved for missing `delta_analysis` (the
    // dispatch's *Frontend will not* clause). A malformed optional
    // capability degrades itself, never the connection.
    const r = parseVersionResponse({
      capabilities: {
        delta_analysis: {},
        adaptive_reevaluate: { available_value_bindings: 'learned_v1' },
      },
    });
    expect(requiresDeltaAnalysisRefusal(r.capabilities)).toBe(false);
  });

  it('keeps unknown capability names passing through, mirror-unvalidated', () => {
    // Unknown names have no declared metadata interface; any
    // dict-shaped metadata passes through untouched — including
    // fields that would mismatch adaptive's schema if they appeared
    // there. Forward compatibility is the point.
    const r = parseVersionResponse({
      capabilities: {
        delta_analysis: {},
        brand_new_capability: { available_value_bindings: 'not-validated-here' },
      },
    });
    expect(r.degraded).toEqual([]);
    expect(r.capabilities).toHaveProperty('brand_new_capability', {
      available_value_bindings: 'not-validated-here',
    });
  });

  it('preserves undeclared metadata fields on a validated adaptive_reevaluate', () => {
    // The mirror is open by design (`[key: string]: unknown`): a
    // proxy that adds a metadata field must not lose it to the
    // validation pass.
    const r = parseVersionResponse({
      capabilities: {
        adaptive_reevaluate: {
          available_value_bindings: ['learned_v1'],
          future_field: 42,
        },
      },
    });
    expect(r.degraded).toEqual([]);
    expect(r.capabilities?.adaptive_reevaluate?.future_field).toBe(42);
  });
});

describe('parseModelsResponse', () => {
  it('returns empty + null for non-object payloads', () => {
    expect(parseModelsResponse(null)).toEqual({ availableModels: [], internalName: null, raw: null });
    expect(parseModelsResponse('models')).toEqual({ availableModels: [], internalName: null, raw: null });
  });

  it('returns empty + null when the models array is absent', () => {
    const r = parseModelsResponse({ id: 'x' });
    expect(r.availableModels).toEqual([]);
    expect(r.internalName).toBeNull();
  });

  it('parses LEAF-mode response (internalName-bearing entries)', () => {
    const r = parseModelsResponse({
      id: 'x',
      models: [
        { internalName: 'kata1-b18c384nbt', name: '/path/to/model.bin' },
      ],
    });
    // LEAF-mode responses don't carry `healthy`; parser defaults to
    // `true` so the dropdown (which only renders in SELECTOR mode
    // anyway) doesn't grey out a LEAF-derived entry.
    expect(r.availableModels).toEqual([
      { label: 'kata1-b18c384nbt', healthy: true },
    ]);
    expect(r.internalName).toBe('kata1-b18c384nbt');
  });

  it('parses SELECTOR-mode response (label-bearing entries)', () => {
    const r = parseModelsResponse({
      id: 'x',
      models: [
        { label: 'strong', healthy: true },
        { label: 'weak', healthy: true },
      ],
    });
    expect(r.availableModels).toEqual([
      { label: 'strong', healthy: true },
      { label: 'weak', healthy: true },
    ]);
    // SELECTOR's synthesised entries don't carry internalName.
    expect(r.internalName).toBeNull();
  });

  it('parses SELECTOR-mode `healthy: false` for an unavailable label', () => {
    // Proxy v1.0.18+ surfaces per-label availability so the dropdown
    // can grey out advertised-but-disconnected labels.
    const r = parseModelsResponse({
      models: [
        { label: 'strong', healthy: true },
        { label: 'weak', healthy: false },
      ],
    });
    expect(r.availableModels).toEqual([
      { label: 'strong', healthy: true },
      { label: 'weak', healthy: false },
    ]);
  });

  it('defaults `healthy: true` when the field is absent (pre-v1.0.18 proxy)', () => {
    // Backward compatibility: a pre-v1.0.18 SELECTOR ships entries
    // without `healthy`; treating absent-as-unhealthy would grey out
    // every entry against an older proxy. Default true.
    const r = parseModelsResponse({
      models: [{ label: 'strong' }, { label: 'weak' }],
    });
    expect(r.availableModels).toEqual([
      { label: 'strong', healthy: true },
      { label: 'weak', healthy: true },
    ]);
  });

  it('defaults `healthy: true` when the field has a non-boolean value', () => {
    // Defensive: a malformed payload with `healthy: "yes"` or
    // `healthy: 1` parses to `true` rather than coercing into a
    // truthy boolean. Per ADR-0002 the parser fails legibly
    // (non-boolean → ignored) rather than guessing.
    const r = parseModelsResponse({
      models: [
        { label: 'strong', healthy: 'yes' },
        { label: 'weak', healthy: 1 },
      ],
    });
    expect(r.availableModels).toEqual([
      { label: 'strong', healthy: true },
      { label: 'weak', healthy: true },
    ]);
  });

  it('prefers `label` over `internalName` when both are present', () => {
    // A theoretical RELAY response could contain both; per the
    // SELECTOR routing contract the label wins.
    const r = parseModelsResponse({
      models: [{ label: 'strong', internalName: 'kata1-b18c384nbt' }],
    });
    expect(r.availableModels).toEqual([{ label: 'strong', healthy: true }]);
  });

  it('skips entries with neither label nor internalName', () => {
    const r = parseModelsResponse({
      models: [
        { label: 'strong' },
        { someUnrelatedField: 'oops' },
        { label: 'weak' },
      ],
    });
    expect(r.availableModels).toEqual([
      { label: 'strong', healthy: true },
      { label: 'weak', healthy: true },
    ]);
  });

  it('returns the raw payload for tooltip surfacing', () => {
    const payload = { models: [{ label: 'strong' }] };
    expect(parseModelsResponse(payload).raw).toBe(payload);
  });
});

describe('requiresDeltaAnalysisRefusal', () => {
  it('returns false on legacy auto-engage path (advertised null)', () => {
    expect(requiresDeltaAnalysisRefusal(null)).toBe(false);
  });

  it('returns true when advertised but delta_analysis missing (the dispatch §4 case)', () => {
    expect(requiresDeltaAnalysisRefusal({})).toBe(true);
    expect(requiresDeltaAnalysisRefusal({ transposition: {}, adaptive_reevaluate: {} })).toBe(true);
  });

  it('returns false when delta_analysis is in the advertised dict', () => {
    expect(requiresDeltaAnalysisRefusal({ delta_analysis: {} })).toBe(false);
    expect(requiresDeltaAnalysisRefusal({
      delta_analysis: {},
      transposition: {},
      selector: {},
    })).toBe(false);
  });

  it('uses the documented constant key name (delta_analysis, not analysis_enricher)', () => {
    // Wire-key naming is load-bearing; per the project memory the
    // proxy ships `delta_analysis` and the rename to
    // `analysis_enricher` is deferred. This test pins the constant
    // so a refactor that "tidies up" the name to match the
    // proxy-side artifact name doesn't silently land — that
    // rename is a coordinated proxy + frontend arc.
    expect(REQUIRED_BEHAVIOURAL_CAPABILITY).toBe('delta_analysis');
  });
});
