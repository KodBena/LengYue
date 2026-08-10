/**
 * tests/unit/visits-lerp.test.ts
 *
 * Tier-1 tests for `src/state/visits-lerp.ts` — the session-ephemeral
 * a/b LERP override on a card's specific visit count (wiki
 * wanted-feature 3, ledger rows 503/504). Pure-arithmetic coverage
 * for `lerpVisits`, plus the reactive setter/reset surface and the
 * "resets like a page reload" ephemeral-state guarantee (simulated
 * via `vi.resetModules()` — no browser needed).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  lerpVisits,
  DEFAULT_VISITS_LERP,
  visitsLerpParams,
  visitsLerpAError,
  setVisitsLerpA,
  setVisitsLerpB,
  resetVisitsLerp,
  _resetVisitsLerpForTesting,
} from '../../src/state/visits-lerp';

beforeEach(() => {
  _resetVisitsLerpForTesting();
});

describe('lerpVisits — pure transform', () => {
  it('is the identity at defaults (a=1, b=0) — the regression lock', () => {
    for (const x of [1, 7, 1000, 12345]) {
      expect(lerpVisits(x, DEFAULT_VISITS_LERP)).toBe(x);
    }
  });

  it('applies the affine transform for a non-default multiplier and offset', () => {
    expect(lerpVisits(1000, { a: 2, b: 100 })).toBe(2100);
    expect(lerpVisits(500, { a: 0.5, b: 0 })).toBe(250);
  });

  it('rounds a fractional raw result to the nearest integer', () => {
    // 3 * 1.5 + 0.5 = 5 exactly.
    expect(lerpVisits(3, { a: 1.5, b: 0.5 })).toBe(5);
    // 3 * 1.3 = 3.9 → rounds to 4.
    expect(lerpVisits(3, { a: 1.3, b: 0 })).toBe(4);
    // 3 * 1.1 = 3.3 → rounds to 3.
    expect(lerpVisits(3, { a: 1.1, b: 0 })).toBe(3);
  });

  it('floors a negative-b result to the minimum positive integer visits count (1)', () => {
    // 5 * 1 - 1000 = -995 → must never send a non-positive visits
    // count to the engine.
    expect(lerpVisits(5, { a: 1, b: -1000 })).toBe(1);
    // Exactly zero also floors to 1.
    expect(lerpVisits(100, { a: 0, b: 0 })).toBe(1);
  });

  it('floors a result that rounds to exactly 0 or a negative fraction to 1', () => {
    expect(lerpVisits(10, { a: 1, b: -10 })).toBe(1); // raw = 0
    expect(lerpVisits(10, { a: 1, b: -9.6 })).toBe(1); // raw = 0.4 → rounds to 0 → floored to 1
  });

  // wiki2-card-visit-ranges: "b ∈ (−∞, ∞) ... make sure that the
  // underlying mechanics doesn't fail to parse the signedness of b."
  // The tests above only exercise negative b at the floor-to-1 edge
  // (where a sign-parsing bug and a correct subtraction would look
  // identical — both land on 1). This one keeps the result comfortably
  // above the floor so a genuine subtraction is the only way to reach
  // the expected value; a `b` whose sign silently dropped (e.g. an
  // `Math.abs` or a `parseInt`-without-sign-support regression) would
  // fail this assertion instead of coincidentally passing.
  it('a negative b genuinely subtracts (not just a floor-to-1 coincidence)', () => {
    expect(lerpVisits(100, { a: 1, b: -30 })).toBe(70);
    expect(lerpVisits(1000, { a: 2, b: -500 })).toBe(1500);
  });
});

describe('visitsLerpParams — reactive state', () => {
  it('defaults to a=1, b=0', () => {
    expect(visitsLerpParams.value).toEqual(DEFAULT_VISITS_LERP);
  });

  it('setVisitsLerpA / setVisitsLerpB update independently', () => {
    setVisitsLerpA(2.5);
    expect(visitsLerpParams.value).toEqual({ a: 2.5, b: 0 });
    setVisitsLerpB(-50);
    expect(visitsLerpParams.value).toEqual({ a: 2.5, b: -50 });
  });

  it('refuses non-finite input, leaving the prior value in place', () => {
    setVisitsLerpA(3);
    setVisitsLerpA(NaN);
    setVisitsLerpA(Infinity);
    expect(visitsLerpParams.value.a).toBe(3);
  });

  // wiki2-card-visit-ranges (enforcement amendment, ledger row 1625):
  // a ∈ (0, ∞) is ENFORCED by setVisitsLerpA, not just the UI hint's
  // claim — a non-positive a is refused loudly (structured error via
  // visitsLerpAError, last-known-good a retained), never silently
  // clamped or coerced.
  it('refuses a = 0, leaving the prior value in place and setting a structured error', () => {
    setVisitsLerpA(3);
    setVisitsLerpA(0);
    expect(visitsLerpParams.value.a).toBe(3);
    expect(visitsLerpAError.value).not.toBeNull();
  });

  it('refuses a < 0, leaving the prior value in place and setting a structured error', () => {
    setVisitsLerpA(3);
    setVisitsLerpA(-5);
    expect(visitsLerpParams.value.a).toBe(3);
    expect(visitsLerpAError.value).not.toBeNull();
  });

  it('accepts a small positive a and clears any prior error', () => {
    setVisitsLerpA(-5); // seed an error first
    expect(visitsLerpAError.value).not.toBeNull();
    setVisitsLerpA(0.001);
    expect(visitsLerpParams.value.a).toBe(0.001);
    expect(visitsLerpAError.value).toBeNull();
  });

  it('resetVisitsLerp restores the identity transform', () => {
    setVisitsLerpA(9);
    setVisitsLerpB(9);
    resetVisitsLerp();
    expect(visitsLerpParams.value).toEqual(DEFAULT_VISITS_LERP);
  });
});

describe('session-ephemeral reset (simulated reload)', () => {
  it('a fresh module instance (vi.resetModules) starts at defaults regardless of the prior instance\'s state — no persistence channel carries the value across', async () => {
    setVisitsLerpA(7);
    setVisitsLerpB(7);
    expect(visitsLerpParams.value).toEqual({ a: 7, b: 7 });

    // Simulate "reload": drop the module registry and re-import.
    // If this module wrote to any persisted channel (GlobalStore,
    // localStorage, IndexedDB), the fresh instance would somehow
    // observe the mutated values; a plain module-scope `ref` cannot,
    // which is exactly the "session-ephemeral, not persisted" contract.
    await vi.resetModules();
    const fresh = await import('../../src/state/visits-lerp');
    expect(fresh.visitsLerpParams.value).toEqual(fresh.DEFAULT_VISITS_LERP);
  });
});
