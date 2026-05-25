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
import { projectPacket } from './projection';

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

// ── Dispatch ───────────────────────────────────────────────────────────────

const ENCODERS_BY_SCHEME: Readonly<Record<string, BundleEncoder>> = {
  [JSON_PROJECTED_V1.scheme]: JSON_PROJECTED_V1,
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
