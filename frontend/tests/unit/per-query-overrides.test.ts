/**
 * tests/unit/per-query-overrides.test.ts
 *
 * Tier-1 tests for `src/state/per-query-overrides.ts` — the
 * session-ephemeral blanket JSON override merged into every outgoing
 * analysis query's `overrideSettings` (wiki wanted-feature 2, ledger
 * rows 510/511; PDA / `playoutDoublingAdvantage` is the motivating
 * example). Covers the parse/validate function, the merge function,
 * and the reactive text/applied/error surface, including the
 * ADR-0002 "invalid JSON never half-applies" contract and the
 * ephemeral (module-reset) reload semantics.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parsePerQueryOverrides,
  mergeQueryOverrides,
  EMPTY_PER_QUERY_OVERRIDES,
  activePerQueryOverrides,
  perQueryOverridesText,
  perQueryOverridesError,
  setPerQueryOverridesText,
  resetPerQueryOverrides,
  _resetPerQueryOverridesForTesting,
} from '../../src/state/per-query-overrides';

beforeEach(() => {
  _resetPerQueryOverridesForTesting();
});

describe('parsePerQueryOverrides — validation', () => {
  it('treats empty / whitespace-only text as the identity (empty overrides)', () => {
    expect(parsePerQueryOverrides('')).toEqual({ kind: 'ok', value: EMPTY_PER_QUERY_OVERRIDES });
    expect(parsePerQueryOverrides('   \n\t ')).toEqual({ kind: 'ok', value: EMPTY_PER_QUERY_OVERRIDES });
  });

  it('parses a valid JSON object', () => {
    const result = parsePerQueryOverrides('{"playoutDoublingAdvantage": 1.5}');
    expect(result).toEqual({ kind: 'ok', value: { playoutDoublingAdvantage: 1.5 } });
  });

  it('refuses malformed JSON with a loud error, kind "error"', () => {
    const result = parsePerQueryOverrides('{not valid json');
    expect(result.kind).toBe('error');
    expect(result.kind === 'error' && result.message.length).toBeGreaterThan(0);
  });

  it('refuses valid-JSON-but-not-an-object payloads (array, string, number, null)', () => {
    for (const text of ['[1,2,3]', '"a string"', '42', 'null', 'true']) {
      const result = parsePerQueryOverrides(text);
      expect(result.kind).toBe('error');
    }
  });
});

describe('mergeQueryOverrides — merge semantics', () => {
  it('is a true no-op (same object reference) when overrides is empty — the identity/regression lock', () => {
    const query = { id: 'q1', overrideSettings: { reportAnalysisWinratesAs: 'WHITE' } };
    const merged = mergeQueryOverrides(query, EMPTY_PER_QUERY_OVERRIDES);
    expect(merged).toBe(query);
  });

  it('shallow-merges into overrideSettings, with the override winning on key collision', () => {
    const query = { id: 'q1', overrideSettings: { reportAnalysisWinratesAs: 'WHITE', wideRootNoise: 0.05 } };
    const merged = mergeQueryOverrides(query, { wideRootNoise: 0.5, playoutDoublingAdvantage: 1.5 });
    expect(merged.overrideSettings).toEqual({
      reportAnalysisWinratesAs: 'WHITE', // untouched — the JSON didn't name it
      wideRootNoise: 0.5,                // JSON wins over the app's 0.05
      playoutDoublingAdvantage: 1.5,     // new key from the JSON (PDA)
    });
  });

  it('creates overrideSettings when the query had none', () => {
    const query = { id: 'q1' };
    const merged = mergeQueryOverrides(query, { playoutDoublingAdvantage: 2 });
    expect(merged.overrideSettings).toEqual({ playoutDoublingAdvantage: 2 });
  });

  it('leaves every other query field untouched (root fields are never merge targets)', () => {
    const query = { id: 'q1', moves: [['B', 'Q16']], maxVisits: 100, overrideSettings: {} };
    const merged = mergeQueryOverrides(query, { playoutDoublingAdvantage: 1 });
    expect(merged.id).toBe('q1');
    expect(merged.moves).toEqual([['B', 'Q16']]);
    expect(merged.maxVisits).toBe(100);
  });
});

describe('setPerQueryOverridesText — reactive validation surface', () => {
  it('starts empty: applied = EMPTY_PER_QUERY_OVERRIDES, no error', () => {
    expect(perQueryOverridesText.value).toBe('');
    expect(activePerQueryOverrides.value).toEqual(EMPTY_PER_QUERY_OVERRIDES);
    expect(perQueryOverridesError.value).toBeNull();
  });

  it('a valid JSON object updates applied and clears any error', () => {
    setPerQueryOverridesText('{"playoutDoublingAdvantage": 1.5}');
    expect(activePerQueryOverrides.value).toEqual({ playoutDoublingAdvantage: 1.5 });
    expect(perQueryOverridesError.value).toBeNull();
  });

  it('invalid JSON is NOT applied — applied stays at its last-known-good value, error is set (ADR-0002: never silently half-apply)', () => {
    setPerQueryOverridesText('{"playoutDoublingAdvantage": 1.5}');
    setPerQueryOverridesText('{not valid');
    // text reflects the user's in-progress (invalid) edit...
    expect(perQueryOverridesText.value).toBe('{not valid');
    // ...but the applied overrides did NOT change to garbage or clear —
    // the last valid value stays in effect.
    expect(activePerQueryOverrides.value).toEqual({ playoutDoublingAdvantage: 1.5 });
    expect(perQueryOverridesError.value).not.toBeNull();
  });

  it('invalid JSON from a never-valid start leaves applied at the empty identity', () => {
    setPerQueryOverridesText('{broken');
    expect(activePerQueryOverrides.value).toEqual(EMPTY_PER_QUERY_OVERRIDES);
    expect(perQueryOverridesError.value).not.toBeNull();
  });

  it('resetPerQueryOverrides clears text, applied, and error', () => {
    setPerQueryOverridesText('{"playoutDoublingAdvantage": 1.5}');
    resetPerQueryOverrides();
    expect(perQueryOverridesText.value).toBe('');
    expect(activePerQueryOverrides.value).toEqual(EMPTY_PER_QUERY_OVERRIDES);
    expect(perQueryOverridesError.value).toBeNull();
  });
});

describe('session-ephemeral reset (simulated reload)', () => {
  it('a fresh module instance (vi.resetModules) starts empty regardless of the prior instance\'s state', async () => {
    setPerQueryOverridesText('{"playoutDoublingAdvantage": 1.5}');
    expect(activePerQueryOverrides.value).toEqual({ playoutDoublingAdvantage: 1.5 });

    await vi.resetModules();
    const fresh = await import('../../src/state/per-query-overrides');
    expect(fresh.activePerQueryOverrides.value).toEqual(fresh.EMPTY_PER_QUERY_OVERRIDES);
    expect(fresh.perQueryOverridesText.value).toBe('');
  });
});
