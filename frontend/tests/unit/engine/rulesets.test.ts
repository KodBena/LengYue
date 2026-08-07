/**
 * tests/unit/engine/rulesets.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/engine/rulesets.ts` — the
 * commissioner-ruled four-name ruleset normalization (ledger row 110,
 * `.claude/dispatch-reports/design-engine-features.md` §RULESETS),
 * as superseded by the live-testing adjudication
 * (`.claude/dispatch-reports/ruleset-default-wedge-fix.md`): a
 * missing/unrecognized `RU` now DEFAULTS to Tromp-Taylor
 * (`source: 'defaulted'`) instead of refusing to resolve.
 *
 * Covers: totality (every input, including undefined/empty/garbage,
 * returns a `RulesetResolution` with a defined `RulesetName`),
 * case-insensitivity across all four names (plus hyphen/space
 * tolerance for Tromp-Taylor), the defaulted arm (source
 * provenance, not a refusal — RED against the old blocking
 * 'unknown' behaviour), and the wire-spelling projection.
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
  it('returns a resolution with a defined RulesetName for every string input, never throwing', () => {
    const inputs = ['AGA', 'garbage', '', '   ', 'New Zealand', '日本', '-----'];
    for (const raw of inputs) {
      expect(() => normalizeRuleset(raw)).not.toThrow();
      const res = normalizeRuleset(raw);
      expect(RULESET_NAMES).toContain(res.name);
      expect(['ru', 'defaulted']).toContain(res.source);
    }
  });

  it('returns a resolution for undefined input (missing RU property)', () => {
    const res = normalizeRuleset(undefined);
    expect(res.source).toBe('defaulted');
    expect(res.name).toBe('Tromp-Taylor');
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
      it(`resolves "${spelling}" to ${name} with source 'ru'`, () => {
        const res = normalizeRuleset(spelling);
        expect(res).toEqual({ name, source: 'ru' });
      });
    }
  }

  it('tolerates surrounding whitespace', () => {
    expect(normalizeRuleset('  chinese  ')).toEqual({ name: 'Chinese', source: 'ru' });
  });
});

describe('normalizeRuleset — unrecognized input defaults to Tromp-Taylor (live-testing adjudication)', () => {
  // RED against the vetoed shipped behaviour: the original fail-loud
  // shape returned `{ kind: 'unknown', raw }` here and every
  // downstream query builder refused to construct a query at all.
  // The adjudication supersedes that — these cases now resolve to an
  // effective, usable ruleset, distinguished only by `source`.

  it('defaults an unrecognized ruleset name to Tromp-Taylor', () => {
    const res = normalizeRuleset('New Zealand');
    expect(res).toEqual({ name: 'Tromp-Taylor', source: 'defaulted' });
  });

  it('defaults an empty string to Tromp-Taylor', () => {
    expect(normalizeRuleset('')).toEqual({ name: 'Tromp-Taylor', source: 'defaulted' });
  });

  it('defaults undefined (RU absent) to Tromp-Taylor', () => {
    expect(normalizeRuleset(undefined)).toEqual({ name: 'Tromp-Taylor', source: 'defaulted' });
  });

  it('defaults a near-miss/garbage string to Tromp-Taylor', () => {
    expect(normalizeRuleset('chinese rules v2')).toEqual({
      name: 'Tromp-Taylor',
      source: 'defaulted',
    });
  });

  it('never widens an unrecognized input into a DIFFERENT one of the four names — it defaults to Tromp-Taylor specifically, not a fuzzy nearest match', () => {
    // Note: normalizeRuleset's fold strips ALL whitespace/hyphens
    // before matching, so a spelling that only differs from a
    // recognized alias by word-split position (e.g. "tromp taylorx"
    // vs "tromptaylorx") is judged on the folded string, not the
    // original tokenization — these four fold to genuinely distinct,
    // unrecognized keys, and all four default to Tromp-Taylor (not to
    // whichever name they most resemble).
    for (const raw of ['aga2', 'chinese-ish', 'japan', 'tromptaylorx']) {
      const res = normalizeRuleset(raw);
      expect(res).toEqual({ name: 'Tromp-Taylor', source: 'defaulted' });
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
      expect(normalizeRuleset(wire)).toEqual({ name, source: 'ru' });
    }
  });
});
