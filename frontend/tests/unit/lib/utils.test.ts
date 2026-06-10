/**
 * tests/unit/lib/utils.test.ts
 *
 * Tier-1 (pure-logic) tests for the domain-free helpers in
 * `src/lib/utils.ts`. Currently covers `generateUUID` (moved here
 * from `tests/unit/engine/util.test.ts` when the helper re-homed
 * from `engine/util.ts`, 2026-06-10); `debounce` / `isObject` /
 * `deepMerge` / `updateRegistry` are uncovered at this tier.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { generateUUID } from '../../../src/lib/utils';

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
