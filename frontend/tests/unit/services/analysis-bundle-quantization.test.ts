/**
 * tests/unit/services/analysis-bundle-quantization.test.ts
 *
 * Tier-1 (pure-logic) tests for the quantisation primitives
 * underlying the 'v2-quantized' leader scheme:
 *
 *   - Q4 uniform on ownership over [-1, 1]
 *   - Q8 uniform-with-bitmap-factor on policy over [0, 1] with
 *     -1.0 sentinel preserved exactly for illegal cells
 *
 * The hard-gate compliance is analytic: max-abs reconstruction
 * error is bounded by the bin width / 2 by construction.
 * Tests pin those analytic bounds + packing/unpacking integrity.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';

import {
  OWNERSHIP_CELL_COUNT,
  OWNERSHIP_Q4_MAX_ABS_ANALYTIC,
  OWNERSHIP_Q8_MAX_ABS_ANALYTIC,
  POLICY_CELL_COUNT,
  POLICY_Q8_FACTORED_MAX_ABS_LEGAL_ANALYTIC,
  dequantiseOwnershipQ4,
  dequantiseOwnershipQ8,
  dequantisePolicyQ8Factored,
  quantiseOwnershipQ4,
  quantiseOwnershipQ8,
  quantisePolicyQ8Factored,
} from '../../../src/services/analysis-bundle/quantization';

// ── Ownership Q4 ───────────────────────────────────────────────────────────

describe('Q4 ownership', () => {
  it('OWNERSHIP_CELL_COUNT is 361 (19×19 board)', () => {
    expect(OWNERSHIP_CELL_COUNT).toBe(361);
  });

  it('analytic max-abs is 0.0625 (half of bin width 0.125)', () => {
    expect(OWNERSHIP_Q4_MAX_ABS_ANALYTIC).toBe(0.0625);
  });

  it('rejects ownership arrays of unexpected length', () => {
    expect(() => quantiseOwnershipQ4([0, 1, 2])).toThrow();
    expect(() => quantiseOwnershipQ4(new Array(360).fill(0))).toThrow();
  });

  it('packs 361 cells into ceil(361/2) = 181 bytes', () => {
    const ownership = new Array(OWNERSHIP_CELL_COUNT).fill(0);
    const packed = quantiseOwnershipQ4(ownership);
    expect(packed.length).toBe(181);
  });

  it('round-trips zeros to the nearest bin midpoint', () => {
    const ownership = new Array(OWNERSHIP_CELL_COUNT).fill(0);
    const packed = quantiseOwnershipQ4(ownership);
    const decoded = dequantiseOwnershipQ4(packed);
    // 0 lands in bin 8 (since (0+1)*8 = 8.0 → idx=8); midpoint
    // = -0.9375 + 8*0.125 = 0.0625.
    expect(decoded).toHaveLength(OWNERSHIP_CELL_COUNT);
    for (const v of decoded) {
      expect(Math.abs(v - 0.0625)).toBeLessThan(1e-12);
    }
  });

  it('round-trips +1 to the top bin midpoint (0.9375)', () => {
    const ownership = new Array(OWNERSHIP_CELL_COUNT).fill(1.0);
    const decoded = dequantiseOwnershipQ4(quantiseOwnershipQ4(ownership));
    for (const v of decoded) {
      expect(Math.abs(v - 0.9375)).toBeLessThan(1e-12);
    }
  });

  it('round-trips -1 to the bottom bin midpoint (-0.9375)', () => {
    const ownership = new Array(OWNERSHIP_CELL_COUNT).fill(-1.0);
    const decoded = dequantiseOwnershipQ4(quantiseOwnershipQ4(ownership));
    for (const v of decoded) {
      expect(Math.abs(v - -0.9375)).toBeLessThan(1e-12);
    }
  });

  it('per-cell max-abs error never exceeds 0.0625 across [-1, 1] sweep', () => {
    // Build an ownership map covering the full range at fine
    // granularity; verify every cell decodes within the analytic
    // bound.
    const ownership: number[] = [];
    for (let i = 0; i < OWNERSHIP_CELL_COUNT; i++) {
      ownership.push(-1 + (2 * i) / (OWNERSHIP_CELL_COUNT - 1));
    }
    const decoded = dequantiseOwnershipQ4(quantiseOwnershipQ4(ownership));
    for (let i = 0; i < OWNERSHIP_CELL_COUNT; i++) {
      const err = Math.abs(decoded[i] - ownership[i]);
      expect(err).toBeLessThanOrEqual(OWNERSHIP_Q4_MAX_ABS_ANALYTIC + 1e-12);
    }
  });

  it('clamps out-of-range inputs without throwing', () => {
    const ownership = new Array(OWNERSHIP_CELL_COUNT).fill(0);
    ownership[0] = 1.5;   // beyond +1
    ownership[1] = -1.5;  // beyond -1
    const decoded = dequantiseOwnershipQ4(quantiseOwnershipQ4(ownership));
    expect(decoded[0]).toBeCloseTo(0.9375, 10);
    expect(decoded[1]).toBeCloseTo(-0.9375, 10);
  });
});

// ── Policy Q8 factored ─────────────────────────────────────────────────────

describe('Q8-factored policy', () => {
  it('POLICY_CELL_COUNT is 362 (19×19 + pass)', () => {
    expect(POLICY_CELL_COUNT).toBe(362);
  });

  it('analytic max-abs on legals is 1/512 ≈ 0.00195', () => {
    expect(POLICY_Q8_FACTORED_MAX_ABS_LEGAL_ANALYTIC).toBe(1 / 512);
  });

  it('rejects policy arrays of unexpected length', () => {
    expect(() => quantisePolicyQ8Factored([0])).toThrow();
    expect(() => quantisePolicyQ8Factored(new Array(361).fill(0))).toThrow();
  });

  it('round-trips an all-legal policy with values in [0, 1]', () => {
    const policy = new Array(POLICY_CELL_COUNT).fill(0).map((_, i) =>
      i / (POLICY_CELL_COUNT - 1),
    );
    const packed = quantisePolicyQ8Factored(policy);
    expect(packed.legalCount).toBe(POLICY_CELL_COUNT);
    expect(packed.values.length).toBe(POLICY_CELL_COUNT);
    expect(packed.bitmap.length).toBe(Math.ceil(POLICY_CELL_COUNT / 8));
    const decoded = dequantisePolicyQ8Factored(packed);
    for (let i = 0; i < POLICY_CELL_COUNT; i++) {
      expect(Math.abs(decoded[i] - policy[i]))
        .toBeLessThanOrEqual(POLICY_Q8_FACTORED_MAX_ABS_LEGAL_ANALYTIC + 1e-12);
    }
  });

  it('preserves the -1.0 sentinel for illegal cells exactly', () => {
    const policy = new Array(POLICY_CELL_COUNT).fill(-1.0);
    // Make a few cells legal with concrete probabilities.
    policy[10] = 0.5;
    policy[100] = 0.1;
    policy[200] = 0.9;
    const decoded = dequantisePolicyQ8Factored(quantisePolicyQ8Factored(policy));
    for (let i = 0; i < POLICY_CELL_COUNT; i++) {
      if (i === 10 || i === 100 || i === 200) {
        // Legal cell — bounded reconstruction error.
        expect(Math.abs(decoded[i] - policy[i]))
          .toBeLessThanOrEqual(POLICY_Q8_FACTORED_MAX_ABS_LEGAL_ANALYTIC + 1e-12);
      } else {
        // Illegal cell — sentinel exact.
        expect(decoded[i]).toBe(-1.0);
      }
    }
  });

  it('reports legalCount matching the bitmap popcount', () => {
    const policy: number[] = [];
    for (let i = 0; i < POLICY_CELL_COUNT; i++) {
      policy.push(i % 3 === 0 ? -1.0 : 0.5); // ~2/3 legal
    }
    const packed = quantisePolicyQ8Factored(policy);
    let popcount = 0;
    for (let i = 0; i < POLICY_CELL_COUNT; i++) {
      if ((packed.bitmap[i >>> 3] >> (i & 7)) & 1) popcount++;
    }
    expect(packed.legalCount).toBe(popcount);
    expect(packed.values.length).toBe(packed.legalCount);
  });

  it('dequantise rejects bitmap/legalCount disagreement', () => {
    const policy = new Array(POLICY_CELL_COUNT).fill(0.5);
    const packed = quantisePolicyQ8Factored(policy);
    // Tamper: shorten the values array while leaving the bitmap full.
    const bad = {
      bitmap: packed.bitmap,
      legalCount: packed.legalCount,
      values: packed.values.slice(0, packed.legalCount - 1),
    };
    expect(() => dequantisePolicyQ8Factored(bad)).toThrow();
  });

  it('handles all-illegal policy (legalCount = 0)', () => {
    const policy = new Array(POLICY_CELL_COUNT).fill(-1.0);
    const packed = quantisePolicyQ8Factored(policy);
    expect(packed.legalCount).toBe(0);
    expect(packed.values.length).toBe(0);
    const decoded = dequantisePolicyQ8Factored(packed);
    for (const v of decoded) {
      expect(v).toBe(-1.0);
    }
  });

  it('clamps legal values outside [0, 1]', () => {
    const policy = new Array(POLICY_CELL_COUNT).fill(-1.0);
    policy[0] = 1.5;   // over
    policy[1] = -0.4;  // under (but > -0.5, so still legal per the > -0.5 gate)
    policy[2] = 2.0;   // way over
    const decoded = dequantisePolicyQ8Factored(quantisePolicyQ8Factored(policy));
    expect(decoded[0]).toBeGreaterThan(0.99);
    expect(decoded[0]).toBeLessThan(1.01);
    expect(decoded[1]).toBeLessThan(0.01);
    expect(decoded[2]).toBeGreaterThan(0.99);
  });
});

// ── Ownership Q8 (hifi variant) ────────────────────────────────────────────

describe('Q8 ownership', () => {
  it('analytic max-abs is 1/256 ≈ 0.00391', () => {
    expect(OWNERSHIP_Q8_MAX_ABS_ANALYTIC).toBe(1 / 256);
  });

  it('rejects ownership arrays of unexpected length', () => {
    expect(() => quantiseOwnershipQ8([0, 1, 2])).toThrow();
    expect(() => quantiseOwnershipQ8(new Array(360).fill(0))).toThrow();
  });

  it('rejects dequantise input of unexpected length', () => {
    expect(() => dequantiseOwnershipQ8(new Uint8Array(360))).toThrow();
  });

  it('packs 361 cells into 361 bytes (one per cell)', () => {
    const ownership = new Array(OWNERSHIP_CELL_COUNT).fill(0);
    const packed = quantiseOwnershipQ8(ownership);
    expect(packed.length).toBe(361);
  });

  it('per-cell max-abs error never exceeds 1/256 across [-1, 1] sweep', () => {
    const ownership: number[] = [];
    for (let i = 0; i < OWNERSHIP_CELL_COUNT; i++) {
      ownership.push(-1 + (2 * i) / (OWNERSHIP_CELL_COUNT - 1));
    }
    const decoded = dequantiseOwnershipQ8(quantiseOwnershipQ8(ownership));
    for (let i = 0; i < OWNERSHIP_CELL_COUNT; i++) {
      const err = Math.abs(decoded[i] - ownership[i]);
      expect(err).toBeLessThanOrEqual(OWNERSHIP_Q8_MAX_ABS_ANALYTIC + 1e-12);
    }
  });

  it('round-trips +1 / -1 / 0 to nearest bin midpoint', () => {
    const ownership = new Array(OWNERSHIP_CELL_COUNT).fill(0);
    ownership[0] = 1.0;
    ownership[1] = -1.0;
    ownership[2] = 0.0;
    const decoded = dequantiseOwnershipQ8(quantiseOwnershipQ8(ownership));
    expect(Math.abs(decoded[0] - 1.0)).toBeLessThan(OWNERSHIP_Q8_MAX_ABS_ANALYTIC + 1e-12);
    expect(Math.abs(decoded[1] - -1.0)).toBeLessThan(OWNERSHIP_Q8_MAX_ABS_ANALYTIC + 1e-12);
    expect(Math.abs(decoded[2] - 0.0)).toBeLessThan(OWNERSHIP_Q8_MAX_ABS_ANALYTIC + 1e-12);
  });

  it('clamps out-of-range inputs without throwing', () => {
    const ownership = new Array(OWNERSHIP_CELL_COUNT).fill(0);
    ownership[0] = 2.0;   // way over +1
    ownership[1] = -2.0;  // way under -1
    const decoded = dequantiseOwnershipQ8(quantiseOwnershipQ8(ownership));
    expect(decoded[0]).toBeGreaterThan(0.99);
    expect(decoded[1]).toBeLessThan(-0.99);
  });

  it('produces strictly more precise reconstruction than Q4', () => {
    const ownership: number[] = [];
    for (let i = 0; i < OWNERSHIP_CELL_COUNT; i++) {
      ownership.push(-1 + (2 * i) / (OWNERSHIP_CELL_COUNT - 1));
    }
    const q4Decoded = dequantiseOwnershipQ4(quantiseOwnershipQ4(ownership));
    const q8Decoded = dequantiseOwnershipQ8(quantiseOwnershipQ8(ownership));
    let q4SumSq = 0;
    let q8SumSq = 0;
    for (let i = 0; i < OWNERSHIP_CELL_COUNT; i++) {
      q4SumSq += (q4Decoded[i] - ownership[i]) ** 2;
      q8SumSq += (q8Decoded[i] - ownership[i]) ** 2;
    }
    // Q8 should be measurably better. The exact ratio depends on
    // the input distribution; for the linear sweep we use here Q8
    // is roughly 16× smaller squared-error than Q4.
    expect(q8SumSq).toBeLessThan(q4SumSq);
  });
});
