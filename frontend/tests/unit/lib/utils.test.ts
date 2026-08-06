/**
 * tests/unit/lib/utils.test.ts
 *
 * Tier-1 (pure-logic) tests for the domain-free helpers in
 * `src/lib/utils.ts`. Currently covers `generateUUID` (moved here
 * from `tests/unit/engine/util.test.ts` when the helper re-homed
 * from `engine/util.ts`, 2026-06-10) and `isRegistryGroupDefaultCollapsed`
 * (the Advanced Registry disclosure default-collapse predicate,
 * 2026-08-06); `debounce` / `isObject` / `deepMerge` / `updateRegistry`
 * are uncovered at this tier.
 *
 * `isRegistryGroupDefaultCollapsed` is tested here rather than by
 * mounting `RegistryEditor.vue` because component/template tests are
 * out of scope per `tests/CLAUDE.md`'s tier structure (Tier 3 is
 * narrowly reserved for render-count regression guards) — this is
 * the pure collapse-state derivation the component's `<details :open>`
 * binding reads; the actual disclosure rendering is UNEXERCISED by
 * this suite.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { generateUUID, isRegistryGroupDefaultCollapsed } from '../../../src/lib/utils';

describe('generateUUID', () => {
  it('produces a string in RFC4122 v4 shape', () => {
    const u = generateUUID();
    expect(u).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('produces distinct values across calls', () => {
    const a = generateUUID();
    const b = generateUUID();
    expect(a).not.toBe(b);
  });
});

describe('isRegistryGroupDefaultCollapsed', () => {
  it('collapses the knobs branch by default', () => {
    expect(isRegistryGroupDefaultCollapsed('knobs')).toBe(true);
  });

  it('collapses the analysis_env branch by default', () => {
    expect(isRegistryGroupDefaultCollapsed('analysis_env')).toBe(true);
  });

  it('leaves every other branch key expanded by default', () => {
    for (const key of ['engine', 'appearance', 'persistence', 'minting', 'navigation', 'katago', 'overrideSettings']) {
      expect(isRegistryGroupDefaultCollapsed(key)).toBe(false);
    }
  });

  it('is not fooled by a substring or case match', () => {
    expect(isRegistryGroupDefaultCollapsed('Knobs')).toBe(false);
    expect(isRegistryGroupDefaultCollapsed('analysisEnv')).toBe(false);
    expect(isRegistryGroupDefaultCollapsed('analysis_env_extra')).toBe(false);
  });
});
