/**
 * src/services/analysis-bundle/quantization.ts
 *
 * Per-field uniform quantisation primitives for the lossy variants
 * of the analysis-bundle compression hierarchy. The TS port of the
 * leader scheme from the 2026-05-25 research arc:
 *
 *   - Ownership: 361 floats in [-1, 1] → Q4 uniform (16 bins).
 *     Max-abs reconstruction error ≤ 0.0625 (analytic).
 *   - Policy:    362 floats with KataGo's -1.0 sentinel marking
 *     illegal cells. Factor sentinels into a presence bitmap,
 *     then Q8-uniform on the [0, 1]-bound legal values. Max-abs
 *     reconstruction error ≤ 1/512 ≈ 0.00195 on legal cells;
 *     illegal cells round-trip exactly as -1.0.
 *
 * Why the bitmap factor for policy:
 *   - ~50% of policy cells carry the -1.0 sentinel; spending
 *     bit-budget representing them through the same uniform-quant
 *     codomain wastes ~half the codebook.
 *   - Policy is naturally a probability distribution over legal
 *     moves — the sentinel positions are NOT part of the
 *     distribution's support.
 *   - The legal mask grows ~monotonically each turn (one move
 *     placed → one fewer empty cell, modulo captures); brotli on
 *     the bitmap stream picks up substantial cross-packet
 *     redundancy at the bundle level.
 *
 * Loss profile pinned by the research arc's 40-game corpus
 * (8 102 authoritative packets) — see
 * `docs/notes/analysis-bundle-compression-plan.md`'s
 * empirical-gate amendment for the quantile tables. The hard gate
 * (max-abs ≤ 0.10 ownership / ≤ 0.005 policy-on-legals) is
 * satisfied analytically by these quantisers — no runtime check
 * is required for uniform quant; the framework just declines a
 * defensive verification cycle.
 *
 * All functions in this module are pure: same input, same output;
 * no I/O, no global state, no module-scope mutation.
 *
 * License: Public Domain (The Unlicense)
 */

// ── Ownership Q4 ───────────────────────────────────────────────────────────

/**
 * Number of cells in an ownership map. 19×19 board exactly; the
 * type system can't pin this further without making the
 * `KataAnalysisResponse.ownership` field load-bearing, so the
 * encoder validates at runtime when it sees a foreign length.
 */
export const OWNERSHIP_CELL_COUNT = 361;

/**
 * Analytic max-abs reconstruction error for Q4 ownership over
 * [-1, 1] — half the bin width. Pinned here so the hard-gate
 * threshold tables can reference the same constant the encoder
 * uses.
 */
export const OWNERSHIP_Q4_MAX_ABS_ANALYTIC = 0.0625;

/**
 * Quantise a 361-element ownership map at 4 bits per cell. The
 * 16 bins span [-1, 1] uniformly; reconstruction puts each cell
 * back at its bin midpoint, so the max-abs per-cell error is
 * half the bin width = 0.0625.
 *
 * Returns 181 bytes — `ceil(361 / 2)`, two cells per byte with
 * the even-index cell in the low nibble. The last byte's high
 * nibble is unused (zeroed).
 */
export function quantiseOwnershipQ4(ownership: readonly number[]): Uint8Array {
  if (ownership.length !== OWNERSHIP_CELL_COUNT) {
    throw new Error(
      `quantiseOwnershipQ4: expected ${OWNERSHIP_CELL_COUNT}-cell ownership, ` +
      `got ${ownership.length}`,
    );
  }
  const packed = new Uint8Array(Math.ceil(OWNERSHIP_CELL_COUNT / 2));
  for (let i = 0; i < OWNERSHIP_CELL_COUNT; i++) {
    const v = Math.max(-1, Math.min(1, ownership[i]));
    // Bin width = 0.125; index = floor((v + 1) * 8) clamped to [0, 15].
    let idx = Math.floor((v + 1) * 8);
    if (idx > 15) idx = 15;
    if (idx < 0) idx = 0;
    const byteIdx = i >>> 1;
    if ((i & 1) === 0) packed[byteIdx] |= idx & 0x0f;
    else packed[byteIdx] |= (idx & 0x0f) << 4;
  }
  return packed;
}

/**
 * Inverse of `quantiseOwnershipQ4`: 181 packed bytes → 361 floats
 * in [-0.9375, 0.9375] (bin midpoints). The reconstruction error
 * vs. the original is bounded above by 0.0625 per cell.
 */
export function dequantiseOwnershipQ4(packed: Uint8Array): number[] {
  const out = new Array<number>(OWNERSHIP_CELL_COUNT);
  for (let i = 0; i < OWNERSHIP_CELL_COUNT; i++) {
    const byteIdx = i >>> 1;
    const nibble = (i & 1) === 0 ? packed[byteIdx] & 0x0f : (packed[byteIdx] >> 4) & 0x0f;
    // Midpoint: -1 + (idx + 0.5) * 0.125 = -0.9375 + idx * 0.125.
    out[i] = -0.9375 + nibble * 0.125;
  }
  return out;
}

// ── Policy Q8 with factored legal-mask ─────────────────────────────────────

/**
 * Number of cells in the policy field: 19×19 + 1 pass slot.
 */
export const POLICY_CELL_COUNT = 362;

/**
 * Analytic max-abs reconstruction error on legal cells for Q8
 * over [0, 1] — half the bin width = 1/512 ≈ 0.001953125.
 * Illegal cells round-trip exactly as -1.0 (the bitmap preserves
 * the sentinel position; the dequantiser writes -1 verbatim).
 */
export const POLICY_Q8_FACTORED_MAX_ABS_LEGAL_ANALYTIC = 1 / 512;

/**
 * The wire shape `quantisePolicyQ8Factored` produces. All three
 * fields ride together to make `dequantisePolicyQ8Factored`
 * faithful:
 *
 *   - `bitmap`: ceil(362 / 8) = 46 bytes, little-bit-first
 *     ordering (cell i lives at bit `i & 7` of byte `i >>> 3`).
 *     A set bit marks a legal cell; an unset bit marks the
 *     -1.0 sentinel.
 *   - `legalCount`: explicit so the dequantiser knows how many
 *     `values` bytes to consume without re-counting the bitmap.
 *   - `values`: `legalCount` bytes, each the Q8 index of the
 *     legal cell's [0, 1] value. Order matches the bitmap's set-
 *     bit traversal in ascending cell index.
 */
export type PolicyQ8FactoredPacked = {
  readonly bitmap: Uint8Array;
  readonly legalCount: number;
  readonly values: Uint8Array;
};

/**
 * Quantise a 362-element policy field. Legal cells (value > -0.5)
 * are Q8-quantised over [0, 1]; illegal cells (value = -1.0
 * sentinel) are factored into the bitmap.
 *
 * Returns the three-tuple `{bitmap, legalCount, values}`; the
 * encoder is responsible for wrapping these into whatever
 * envelope ships on the wire.
 */
export function quantisePolicyQ8Factored(
  policy: readonly number[],
): PolicyQ8FactoredPacked {
  if (policy.length !== POLICY_CELL_COUNT) {
    throw new Error(
      `quantisePolicyQ8Factored: expected ${POLICY_CELL_COUNT}-cell policy, ` +
      `got ${policy.length}`,
    );
  }
  const bitmap = new Uint8Array(Math.ceil(POLICY_CELL_COUNT / 8));
  const values: number[] = [];
  for (let i = 0; i < POLICY_CELL_COUNT; i++) {
    const v = policy[i];
    if (v > -0.5) {
      // Legal cell — set bitmap bit, append Q8 index.
      bitmap[i >>> 3] |= 1 << (i & 7);
      const clamped = Math.max(0, Math.min(1, v));
      let idx = Math.floor(clamped * 256);
      if (idx > 255) idx = 255;
      if (idx < 0) idx = 0;
      values.push(idx);
    }
    // Illegal cell: bitmap bit stays 0; no value emitted.
  }
  return {
    bitmap,
    legalCount: values.length,
    values: new Uint8Array(values),
  };
}

/**
 * Inverse of `quantisePolicyQ8Factored`. Reconstructs a 362-cell
 * policy where illegal positions carry -1.0 (exact) and legal
 * cells carry their Q8 bin midpoint in [0, 1].
 *
 * The reconstruction is non-renormalised: the dequantised legal
 * values may not sum to 1 exactly because each cell's
 * quantisation error is independent. Renormalising at decode
 * time would change the relative probabilities by tiny amounts;
 * leaving them un-renormalised is the honest "this is the bin
 * midpoint" answer and matches the JSD measurement methodology
 * the design note pinned its softhard-gate threshold against.
 */
export function dequantisePolicyQ8Factored(
  packed: PolicyQ8FactoredPacked,
): number[] {
  const { bitmap, legalCount, values } = packed;
  if (values.length !== legalCount) {
    throw new Error(
      `dequantisePolicyQ8Factored: legalCount=${legalCount} mismatches ` +
      `values.length=${values.length}`,
    );
  }
  const out = new Array<number>(POLICY_CELL_COUNT);
  let vi = 0;
  for (let i = 0; i < POLICY_CELL_COUNT; i++) {
    const bit = (bitmap[i >>> 3] >> (i & 7)) & 1;
    if (bit === 1) {
      // Legal: bin midpoint = (idx + 0.5) / 256.
      const idx = values[vi++];
      out[i] = (idx + 0.5) / 256;
    } else {
      // Illegal: KataGo's sentinel.
      out[i] = -1.0;
    }
  }
  if (vi !== legalCount) {
    throw new Error(
      `dequantisePolicyQ8Factored: walked ${vi} legal bits but ` +
      `legalCount=${legalCount}; bitmap and legalCount disagree`,
    );
  }
  return out;
}
