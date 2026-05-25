/**
 * src/services/analysis-bundle/encoder.ts
 *
 * TypeScript port of the analysis-bundle compression hierarchy from
 * the 2026-05-25 research arc. Encoders own the bytes ↔ bundle
 * round-trip; the registry-knob dispatcher (in
 * `analysis-persistence-service.ts`) picks one at write time and
 * the v2-wire `format_descriptor` carries the scheme tag so the
 * decoder dispatch is also data-driven.
 *
 * Design rationale at `docs/notes/analysis-bundle-compression-plan.md`.
 * Architectural firewall amendment (Option A — frontend owns
 * compression) in the same note's first amendment section.
 *
 * Inheritance shape (this file ships the *base* + the *lossless*
 * leaf; lossy leaves land in a follow-up arc):
 *
 *     BundleEncoder (interface)
 *       └── JSON_PROJECTED_V1   — projection + JSON + UTF-8
 *
 * Each encoder is a `{scheme, encode, decode}` triple. `encode`
 * returns an `EncodedBundle` carrying the bytes, the descriptor the
 * wire layer needs, the SPA-asserted record count, and the
 * uncompressed-equivalent byte size (for the user-facing "saved
 * X%" display). `decode` inverts.
 *
 * The dispatch table (`ENCODERS_BY_SCHEME`) is keyed on the
 * scheme-tag string the descriptor carries. Adding a new variant:
 *   1. Implement another `BundleEncoder` with a unique scheme tag.
 *   2. Add it to `ENCODERS_BY_SCHEME` below.
 *   3. The persistence service picks it up via
 *      `getEncoderForScheme` at read time, and the registry-knob's
 *      union extends to cover it for write-side dispatch.
 *
 * License: Public Domain (The Unlicense)
 */
import type { AnalysisBundle } from '../analysis-bundle';
import type { KataAnalysisResponse } from '../../engine/katago/types';
import { projectPacket } from './projection';
import {
  dequantiseOwnershipQ4,
  dequantiseOwnershipQ8,
  dequantisePolicyQ8Factored,
  quantiseOwnershipQ4,
  quantiseOwnershipQ8,
  quantisePolicyQ8Factored,
  type PolicyQ8FactoredPacked,
} from './quantization';

// ── Descriptor / encoded-bundle types ──────────────────────────────────────

/**
 * Wire-side encoding metadata. Carried on every v2 row as the
 * `format_descriptor` JSONB column; the SPA's decoder reads it to
 * undo what the encoder did. `version` lets a single scheme tag
 * grow non-breaking sub-variants over time without minting a new
 * top-level scheme.
 */
export type FormatDescriptor = {
  readonly scheme: string;
  readonly version: number;
};

/**
 * One encode() output. The persistence service wraps these fields
 * into the v2 wire shape: `bytes` → base64 → `data_b64`,
 * `descriptor` → `format_descriptor`, plus `recordCount` and
 * `uncompressedByteSize` as the SPA's wire assertions.
 */
export type EncodedBundle = {
  readonly bytes: Uint8Array;
  readonly descriptor: FormatDescriptor;
  readonly recordCount: number;
  readonly uncompressedByteSize: number;
};

// ── Encoder contract ───────────────────────────────────────────────────────

export interface BundleEncoder {
  /**
   * Stable scheme-tag string. Once any row carries it on the wire,
   * this tag is frozen forever — changing it would orphan every
   * stored row at the decoder dispatch.
   */
  readonly scheme: string;

  encode(bundle: AnalysisBundle): EncodedBundle;

  /**
   * Reverse of `encode`. Takes the raw bytes (already un-base64ed
   * and brotli-unwrapped by the time they reach this function) and
   * returns the bundle. Throws on malformed input — fail-loud per
   * ADR-0002.
   */
  decode(bytes: Uint8Array): AnalysisBundle;
}

// ── JsonProjectedLossless: the leader scheme's projection step ─────────────

const JSON_PROJECTED_V1_SCHEME = 'json-projected-v1';

/**
 * Lossless-on-SPA-observable-schema encoder.
 *
 * Encode pipeline:
 *   1. Project each record's `packet` through
 *      `projectPacket` — drops every field the SPA's typed shape
 *      doesn't declare.
 *   2. JSON-stringify the projected bundle (compact separators).
 *   3. UTF-8 encode to bytes.
 *
 * Brotli is NOT applied here — that lives on the backend, applied
 * unconditionally to every stored payload. Decompose of concerns
 * per the design note: SPA owns the SPA-shape choice; backend owns
 * the universal storage codec.
 *
 * Reconstruction is bit-identical for every field the SPA reads;
 * fields the SPA never reads were dropped at encode time and don't
 * exist in the decoded bundle. The wire shape's `uncompressed_byte_size`
 * is computed from the *full canonical-JSON* size so the user-facing
 * "saved X%" comparison is honest (post-projection bytes vs.
 * what-v1-would-have-sent bytes).
 */
const JSON_PROJECTED_V1: BundleEncoder = {
  scheme: JSON_PROJECTED_V1_SCHEME,

  encode(bundle: AnalysisBundle): EncodedBundle {
    const projected: AnalysisBundle = {
      schemaVersion: bundle.schemaVersion,
      records: bundle.records.map((r) => ({
        configHash: r.configHash,
        nodeId: r.nodeId,
        packet: projectPacket(r.packet),
      })),
    };

    const projectedJson = JSON.stringify(projected);
    const canonicalJson = JSON.stringify(bundle);
    const encoder = new TextEncoder();

    return {
      bytes: encoder.encode(projectedJson),
      descriptor: { scheme: JSON_PROJECTED_V1_SCHEME, version: 1 },
      recordCount: bundle.records.length,
      uncompressedByteSize: encoder.encode(canonicalJson).length,
    };
  },

  decode(bytes: Uint8Array): AnalysisBundle {
    const text = new TextDecoder('utf-8').decode(bytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error(
        `analysis-bundle/encoder: JSON parse failed for scheme ` +
        `'${JSON_PROJECTED_V1_SCHEME}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as { schemaVersion?: unknown }).schemaVersion !== 'number' ||
      !Array.isArray((parsed as { records?: unknown }).records)
    ) {
      throw new Error(
        `analysis-bundle/encoder: decoded payload doesn't match the ` +
        `AnalysisBundle shape for scheme '${JSON_PROJECTED_V1_SCHEME}'`,
      );
    }
    return parsed as AnalysisBundle;
  },
};

// ── OwnershipQ4 + PolicyQ8-factored: the leader lossy scheme ───────────────

const OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1_SCHEME =
  'ownership-q4-policy-q8-factored-v1';
const OWNERSHIP_Q8_POLICY_Q8_FACTORED_V1_SCHEME =
  'ownership-q8-policy-q8-factored-v1';

/**
 * Internal wire shape carried inside the encoded packet's JSON
 * body in place of `ownership` and `policy`. The ownership
 * wrapper carries a `_q_bits` discriminator (4 or 8) plus the
 * base64-encoded packed bytes; the policy wrapper carries the
 * factored Q8 envelope. Both shapes occupy the typed-shape's
 * `ownership` / `policy` slot at JSON time and get un-packed back
 * to `number[]`s by the decoder.
 */
type QuantisedOwnership = {
  readonly _q_bits: 4 | 8;
  readonly _b64: string;
};

type QuantisedPolicy = {
  readonly _q8_factored: {
    readonly bitmap_b64: string;
    readonly legal_count: number;
    readonly values_b64: string;
  };
};

function encodePacketLossy(
  packet: KataAnalysisResponse,
  ownershipBits: 4 | 8,
): KataAnalysisResponse {
  const out = { ...packet } as Record<string, unknown>;
  if (Array.isArray(packet.ownership)) {
    const packed = ownershipBits === 4
      ? quantiseOwnershipQ4(packet.ownership)
      : quantiseOwnershipQ8(packet.ownership);
    const wrap: QuantisedOwnership = {
      _q_bits: ownershipBits,
      _b64: uint8ArrayToBase64(packed),
    };
    out.ownership = wrap;
  }
  if (Array.isArray(packet.policy)) {
    const p = quantisePolicyQ8Factored(packet.policy);
    const wrap: QuantisedPolicy = {
      _q8_factored: {
        bitmap_b64: uint8ArrayToBase64(p.bitmap),
        legal_count: p.legalCount,
        values_b64: uint8ArrayToBase64(p.values),
      },
    };
    out.policy = wrap;
  }
  return out as unknown as KataAnalysisResponse;
}

function decodePacketLossy(packet: KataAnalysisResponse): KataAnalysisResponse {
  // Packets that round-trip through a lossy encoder carry the
  // typed-shape `ownership` / `policy` slots filled with a
  // quantised-wrapper object instead of a `number[]`. Detect and
  // un-pack to the typed-shape `number[]`. The ownership
  // wrapper's `_q_bits` discriminator picks the dequantiser, so
  // a single decode() handles both 'v2-quantized' (Q4) and
  // 'v2-quantized-hifi' (Q8) outputs without scheme-name lookup.
  const out = { ...packet } as Record<string, unknown>;
  const own = out.ownership as unknown;
  if (
    own && typeof own === 'object' && !Array.isArray(own) &&
    typeof (own as { _b64?: unknown })._b64 === 'string' &&
    typeof (own as { _q_bits?: unknown })._q_bits === 'number'
  ) {
    const wrap = own as QuantisedOwnership;
    const packed = base64ToUint8Array(wrap._b64);
    if (wrap._q_bits === 4) {
      out.ownership = dequantiseOwnershipQ4(packed);
    } else if (wrap._q_bits === 8) {
      out.ownership = dequantiseOwnershipQ8(packed);
    } else {
      throw new Error(
        `analysis-bundle/encoder: unsupported _q_bits=${wrap._q_bits} on ` +
        `ownership wrapper; this client supports 4 and 8`,
      );
    }
  }
  const pol = out.policy as unknown;
  if (
    pol && typeof pol === 'object' && !Array.isArray(pol) &&
    (pol as { _q8_factored?: unknown })._q8_factored &&
    typeof (pol as { _q8_factored?: unknown })._q8_factored === 'object'
  ) {
    const wrap = (pol as QuantisedPolicy)._q8_factored;
    const packed: PolicyQ8FactoredPacked = {
      bitmap: base64ToUint8Array(wrap.bitmap_b64),
      legalCount: wrap.legal_count,
      values: base64ToUint8Array(wrap.values_b64),
    };
    out.policy = dequantisePolicyQ8Factored(packed);
  }
  return out as unknown as KataAnalysisResponse;
}

/**
 * Factory: build a `BundleEncoder` that applies projection +
 * ownership quantisation (at the given bit depth) + Q8-factored
 * policy quantisation. The encode/decode pair is symmetric on
 * the JSON envelope; the only knob is the ownership bit depth.
 */
function makeLossyEncoder(
  scheme: string,
  ownershipBits: 4 | 8,
): BundleEncoder {
  return {
    scheme,
    encode(bundle: AnalysisBundle): EncodedBundle {
      const projected: AnalysisBundle = {
        schemaVersion: bundle.schemaVersion,
        records: bundle.records.map((r) => ({
          configHash: r.configHash,
          nodeId: r.nodeId,
          packet: encodePacketLossy(projectPacket(r.packet), ownershipBits),
        })),
      };
      const projectedJson = JSON.stringify(projected);
      const canonicalJson = JSON.stringify(bundle);
      const encoder = new TextEncoder();
      return {
        bytes: encoder.encode(projectedJson),
        descriptor: { scheme, version: 1 },
        recordCount: bundle.records.length,
        uncompressedByteSize: encoder.encode(canonicalJson).length,
      };
    },
    decode(bytes: Uint8Array): AnalysisBundle {
      const text = new TextDecoder('utf-8').decode(bytes);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error(
          `analysis-bundle/encoder: JSON parse failed for scheme ` +
          `'${scheme}': ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as { schemaVersion?: unknown }).schemaVersion !== 'number' ||
        !Array.isArray((parsed as { records?: unknown }).records)
      ) {
        throw new Error(
          `analysis-bundle/encoder: decoded payload doesn't match the ` +
          `AnalysisBundle shape for scheme '${scheme}'`,
        );
      }
      const bundle = parsed as AnalysisBundle;
      return {
        schemaVersion: bundle.schemaVersion,
        records: bundle.records.map((r) => ({
          configHash: r.configHash,
          nodeId: r.nodeId,
          packet: decodePacketLossy(r.packet),
        })),
      };
    },
  };
}

/**
 * Byte-leader lossy encoder from the 2026-05-25 research arc:
 * projection + Q4 uniform on ownership + Q8 uniform-with-bitmap-
 * factor on policy.
 *
 * Max-abs reconstruction error analytically bounded by the
 * quantisers:
 *   - ownership cell: ≤ 0.0625 (half of Q4 bin width on [-1, 1])
 *   - policy legal cell: ≤ 1/512 ≈ 0.00195 (half of Q8 bin width
 *     on [0, 1])
 *   - policy illegal cell: exact (bitmap preserves sentinels)
 *
 * Hard gate passes by construction — the analytic bounds are
 * comfortably under the design note's thresholds (≤ 0.10 ownership
 * max-abs / ≤ 0.005 policy max-abs).
 */
const OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1: BundleEncoder = makeLossyEncoder(
  OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1_SCHEME,
  4,
);

/**
 * High-fidelity lossy variant: projection + Q8 ownership + Q8
 * factored policy. The 2026-05-26 user report after #270 merged
 * noted that Q4 ownership is visibly clamped on slowly-drifting
 * cells (bin width 0.125 is enough to perceive); Q8 reduces the
 * max-abs to 1/256 ≈ 0.0039, well below typical display
 * sensitivity. Costs ~180 extra bytes per packet (361 vs 181
 * before brotli) — call it ~6% size increase on a typical
 * bundle, less after brotli. Trade the byte leader for the
 * perceptual leader; user picks per board via the registry.
 *
 * Max-abs reconstruction:
 *   - ownership cell: ≤ 1/256 ≈ 0.00391
 *   - policy legal cell: ≤ 1/512 ≈ 0.00195
 *   - policy illegal cell: exact
 */
const OWNERSHIP_Q8_POLICY_Q8_FACTORED_V1: BundleEncoder = makeLossyEncoder(
  OWNERSHIP_Q8_POLICY_Q8_FACTORED_V1_SCHEME,
  8,
);

// ── Dispatch ───────────────────────────────────────────────────────────────

const ENCODERS_BY_SCHEME: Readonly<Record<string, BundleEncoder>> = {
  [JSON_PROJECTED_V1.scheme]: JSON_PROJECTED_V1,
  [OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1.scheme]: OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1,
  [OWNERSHIP_Q8_POLICY_Q8_FACTORED_V1.scheme]: OWNERSHIP_Q8_POLICY_Q8_FACTORED_V1,
};

/**
 * Look up an encoder by its scheme tag, or return `undefined` if
 * the tag is unknown. The persistence service uses this both at
 * write time (with the user-selected scheme) and at read time
 * (with `format_descriptor.scheme` from a stored row). An unknown
 * scheme on the read path is operator-side data corruption and
 * gets a loud throw in the caller.
 */
export function getEncoderForScheme(scheme: string): BundleEncoder | undefined {
  return ENCODERS_BY_SCHEME[scheme];
}

/**
 * The set of scheme tags this client knows about. Used by the
 * registry-knob's runtime validation and by the auto-save
 * composable's capability gate.
 */
export function listKnownSchemes(): readonly string[] {
  return Object.keys(ENCODERS_BY_SCHEME);
}

// Exported for test introspection only — production code should
// go through `getEncoderForScheme`.
export const _JSON_PROJECTED_V1 = JSON_PROJECTED_V1;

// ── Base64 helpers ─────────────────────────────────────────────────────────

/**
 * Encode a `Uint8Array` to base64 in a way that survives large
 * payloads (>~100 KB) without the `Maximum call stack` overflow
 * naive `String.fromCharCode.apply(null, arr)` hits. The 32 KB
 * chunk size is the standard workaround.
 */
export function uint8ArrayToBase64(arr: Uint8Array): string {
  let acc = '';
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    acc += String.fromCharCode.apply(
      null,
      Array.from(arr.subarray(i, i + chunk)),
    );
  }
  return btoa(acc);
}

/**
 * Decode a base64 string back to a `Uint8Array`. Throws on invalid
 * base64 — let the persistence-service caller catch and surface
 * the malformed-payload case.
 */
export function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}
