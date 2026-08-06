/**
 * tests/unit/engine/rulesets.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/engine/rulesets.ts` — the
 * commissioner-ruled four-name ruleset normalization (ledger row 110,
 * `.claude/dispatch-reports/design-engine-features.md` §RULESETS).
 *
 * Covers: totality (every input, including undefined/empty/garbage,
 * returns a `RulesetResolution`), case-insensitivity across all four
 * names (plus hyphen/space tolerance for Tromp-Taylor), the explicit
 * `'unknown'` fail-loud arm (no silent coercion, ADR-0002), and the
 * wire-spelling projection.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  RULESET_NAMES,
  normalizeRuleset,
  rulesetToWireName,
  type RulesetName,
} from '../../../src/engine/rulesets';

describe('normalizeRuleset — totality', () => {
  it('returns a resolution for every string input, never throwing', () => {
    const inputs = ['AGA', 'garbage', '', '   ', 'New Zealand', '日本', '-----'];
    for (const raw of inputs) {
      expect(() => normalizeRuleset(raw)).not.toThrow();
      const res = normalizeRuleset(raw);
      expect(['resolved', 'unknown']).toContain(res.kind);
    }
  });

  it('returns a resolution for undefined input (missing RU property)', () => {
    const res = normalizeRuleset(undefined);
    expect(res.kind).toBe('unknown');
  });
});

describe('normalizeRuleset — case-insensitive resolution of all four names', () => {
  const casesByName: Record<RulesetName, string[]> = {
    AGA: ['AGA', 'aga', 'Aga', 'aGa'],
    Chinese: ['Chinese', 'chinese', 'CHINESE', 'ChInEsE'],
    Japanese: ['Japanese', 'japanese', 'JAPANESE', 'jApAnEsE'],
    'Tromp-Taylor': [
      'Tromp-Taylor',
      'tromp-taylor',
      'TROMP-TAYLOR',
      'tromp taylor',
      'Tromp Taylor',
      'TrompTaylor',
      'tromptaylor',
    ],
  };

  for (const name of RULESET_NAMES) {
    for (const spelling of casesByName[name]) {
      it(`resolves "${spelling}" to ${name}`, () => {
        const res = normalizeRuleset(spelling);
        expect(res).toEqual({ kind: 'resolved', name });
      });
    }
  }

  it('tolerates surrounding whitespace', () => {
    expect(normalizeRuleset('  chinese  ')).toEqual({ kind: 'resolved', name: 'Chinese' });
  });
});

describe('normalizeRuleset — explicit unknown arm (fail-loud, no silent coercion)', () => {
  it('does not resolve an unrecognized ruleset name', () => {
    const res = normalizeRuleset('New Zealand');
    expect(res).toEqual({ kind: 'unknown', raw: 'New Zealand' });
  });

  it('does not resolve an empty string', () => {
    expect(normalizeRuleset('')).toEqual({ kind: 'unknown', raw: '' });
  });

  it('does not resolve undefined (raw normalizes to empty string)', () => {
    expect(normalizeRuleset(undefined)).toEqual({ kind: 'unknown', raw: '' });
  });

  it('does not resolve a near-miss/garbage string', () => {
    expect(normalizeRuleset('chinese rules v2')).toEqual({
      kind: 'unknown',
      raw: 'chinese rules v2',
    });
  });

  it('never widens an unrecognized input into one of the four names', () => {
    // Note: normalizeRuleset's fold strips ALL whitespace/hyphens
    // before matching, so a spelling that only differs from a
    // recognized alias by word-split position (e.g. "tromp taylorx"
    // vs "tromptaylorx") is judged on the folded string, not the
    // original tokenization — these four fold to genuinely distinct,
    // unrecognized keys.
    for (const raw of ['aga2', 'chinese-ish', 'japan', 'tromptaylorx']) {
      const res = normalizeRuleset(raw);
      expect(res.kind).toBe('unknown');
    }
  });
});

describe('rulesetToWireName', () => {
  it('projects each canonical name to its lowercase wire spelling', () => {
    expect(rulesetToWireName('AGA')).toBe('aga');
    expect(rulesetToWireName('Chinese')).toBe('chinese');
    expect(rulesetToWireName('Japanese')).toBe('japanese');
    // The pre-existing hardcoded literal this module replaces —
    // preserved verbatim as the working wire spelling.
    expect(rulesetToWireName('Tromp-Taylor')).toBe('tromp-taylor');
  });

  it('round-trips every RULESET_NAMES entry through normalizeRuleset(wireName)', () => {
    for (const name of RULESET_NAMES) {
      const wire = rulesetToWireName(name);
      expect(normalizeRuleset(wire)).toEqual({ kind: 'resolved', name });
    }
  });
});
