/**
 * tests/unit/engine/katago/cache-inference.test.ts
 *
 * Tier-1 (pure-logic) test for `describeInferredCacheState`
 * (`src/engine/katago/cache-inference.ts`) — the version-tooltip
 * line rendering the SPA's own `engine.katago.cache` /
 * `.lookup_cache` flags, cache-wiki ask #2. Exercises the pure
 * function directly (no component mount) against all four
 * cache × lookup_cache combinations, and pins the "SPA-inferred, not
 * proxy-advertised" wording so a future edit can't silently blur
 * that distinction into a fabricated capability entry.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { describeInferredCacheState } from '../../../../src/engine/katago/cache-inference';
import type { Translate } from '../../../../src/engine/katago/cache-inference';

// Minimal fixture translator: resolves the exact keys the module
// calls with, interpolating `{state}` the same way vue-i18n would.
// Deliberately independent of the real catalogs — this pins the
// module's KEY usage and interpolation, not catalog prose.
const fixtureCatalog: Record<string, string> = {
  'toolbar.engineVersionTooltip.cacheHeader': 'SPA-inferred (not proxy-advertised):',
  'toolbar.engineVersionTooltip.cacheWriteLine': 'cache write: {state}',
  'toolbar.engineVersionTooltip.cacheLookupLine': 'cache lookup: {state}',
  'toolbar.engineVersionTooltip.stateOn': 'on',
  'toolbar.engineVersionTooltip.stateOff': 'off',
};
const t: Translate = (key, params) => {
  const template = fixtureCatalog[key];
  if (template === undefined) throw new Error(`fixture missing key: ${key}`);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name]));
};

describe('describeInferredCacheState', () => {
  it('renders the SPA-inferred header on every branch (never a bare capability entry)', () => {
    for (const cache of [false, true]) {
      for (const lookupCache of [false, true]) {
        expect(describeInferredCacheState(cache, lookupCache, t))
          .toContain('SPA-inferred (not proxy-advertised):');
      }
    }
  });

  it('both flags off: two lines, both "off"', () => {
    expect(describeInferredCacheState(false, false, t)).toBe(
      'SPA-inferred (not proxy-advertised):\ncache write: off\ncache lookup: off',
    );
  });

  it('cache on, lookup_cache off: independently reflected per line', () => {
    expect(describeInferredCacheState(true, false, t)).toBe(
      'SPA-inferred (not proxy-advertised):\ncache write: on\ncache lookup: off',
    );
  });

  it('cache off, lookup_cache on: independently reflected per line', () => {
    expect(describeInferredCacheState(false, true, t)).toBe(
      'SPA-inferred (not proxy-advertised):\ncache write: off\ncache lookup: on',
    );
  });

  it('both flags on: two lines, both "on"', () => {
    expect(describeInferredCacheState(true, true, t)).toBe(
      'SPA-inferred (not proxy-advertised):\ncache write: on\ncache lookup: on',
    );
  });
});
