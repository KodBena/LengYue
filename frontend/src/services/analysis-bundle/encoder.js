import { projectPacket } from './projection';
import { dequantiseOwnershipQ4, dequantiseOwnershipQ8, dequantisePolicyQ8Factored, quantiseOwnershipQ4, quantiseOwnershipQ8, quantisePolicyQ8Factored, } from './quantization';
// Read one property off an `unknown` value as `unknown`, for runtime
// shape-probing of just-parsed JSON. This is the ACL/decode frontier
// (Band 2 wire bytes → typed domain shape): the single justified cast
// below replaces the repeated `(parsed as { k?: unknown }).k` spelling at
// every guard site, so the deserialization frontier's unsafety lives at
// ONE named seam. The cast is sound — reading a property off a non-null
// object always yields `unknown`-or-undefined, and every caller checks the
// result before trusting it.
function prop(value, key) {
    if (value === null || typeof value !== 'object')
        return undefined;
    // Band-2 decode frontier: a non-null object indexed by string yields an
    // `unknown` member; callers type-check before use.
    return value[key];
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
const JSON_PROJECTED_V1 = {
    scheme: JSON_PROJECTED_V1_SCHEME,
    encode(bundle) {
        const projected = {
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
    decode(bytes) {
        const text = new TextDecoder('utf-8').decode(bytes);
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch (e) {
            throw new Error(`analysis-bundle/encoder: JSON parse failed for scheme ` +
                `'${JSON_PROJECTED_V1_SCHEME}': ${e instanceof Error ? e.message : String(e)}`);
        }
        if (!parsed ||
            typeof parsed !== 'object' ||
            typeof prop(parsed, 'schemaVersion') !== 'number' ||
            !Array.isArray(prop(parsed, 'records'))) {
            throw new Error(`analysis-bundle/encoder: decoded payload doesn't match the ` +
                `AnalysisBundle shape for scheme '${JSON_PROJECTED_V1_SCHEME}'`);
        }
        // Validated above: schemaVersion is a number and records is an array,
        // the AnalysisBundle shape's load-bearing fields — Band-2 decode brand.
        return parsed;
    },
};
// ── OwnershipQ4 + PolicyQ8-factored: the leader lossy scheme ───────────────
const OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1_SCHEME = 'ownership-q4-policy-q8-factored-v1';
const OWNERSHIP_Q8_POLICY_Q8_FACTORED_V1_SCHEME = 'ownership-q8-policy-q8-factored-v1';
const OWNERSHIP_Q8_POLICY_Q8_FACTORED_XOR_V1_SCHEME = 'ownership-q8-policy-q8-factored-xor-v1';
function encodePacketLossy(packet, ownershipBits, byteXorDelta = false, prevOwnership) {
    // Widen the typed packet to an open record so the ownership/policy slots
    // can hold the quantised-wrapper objects (a JSON-time shape the typed
    // KataAnalysisResponse doesn't model); re-narrowed at return.
    const out = { ...packet };
    let ownershipBytes;
    if (Array.isArray(packet.ownership)) {
        const packed = ownershipBits === 4
            ? quantiseOwnershipQ4(packet.ownership)
            : quantiseOwnershipQ8(packet.ownership);
        ownershipBytes = packed;
        let payloadBytes = packed;
        let isXorDelta = false;
        if (byteXorDelta && prevOwnership && prevOwnership.length === packed.length) {
            // P-frame: XOR against prior packet's literal Q8 bytes.
            payloadBytes = new Uint8Array(packed.length);
            for (let i = 0; i < packed.length; i++) {
                payloadBytes[i] = packed[i] ^ prevOwnership[i];
            }
            isXorDelta = true;
        }
        const wrap = {
            _q_bits: ownershipBits,
            _b64: uint8ArrayToBase64(payloadBytes),
            ...(isXorDelta ? { _xor_delta: true } : {}),
        };
        out.ownership = wrap;
    }
    if (Array.isArray(packet.policy)) {
        const p = quantisePolicyQ8Factored(packet.policy);
        const wrap = {
            _q8_factored: {
                bitmap_b64: uint8ArrayToBase64(p.bitmap),
                legal_count: p.legalCount,
                values_b64: uint8ArrayToBase64(p.values),
            },
        };
        out.policy = wrap;
    }
    return {
        // Double-cast through the open record: `out` carries the quantised
        // wrappers in the ownership/policy slots, structurally divergent from
        // KataAnalysisResponse's number[] — the decoder inverts it. Band-2
        // wire-shape brand-strip-and-remint; the intervening `unknown` is the
        // sanctioned escape for the structurally-incompatible widen.
        packet: out,
        ownershipBytes,
    };
}
function decodePacketLossy(packet, prevOwnership) {
    // Packets that round-trip through a lossy encoder carry the
    // typed-shape `ownership` / `policy` slots filled with a
    // quantised-wrapper object instead of a `number[]`. Detect and
    // un-pack to the typed-shape `number[]`. The ownership
    // wrapper's `_q_bits` discriminator picks the dequantiser, so
    // a single decode() handles both 'v2-quantized' (Q4) and
    // 'v2-quantized-hifi' (Q8) outputs without scheme-name lookup.
    //
    // The optional `_xor_delta: true` field signals a P-frame: the
    // `_b64` payload is XOR'd against the prior packet's literal
    // ownership bytes. The caller threads `prevOwnership` through
    // packets in bundle order; the decoder XOR-undoes and recovers
    // the current's literal bytes.
    // Widen to an open record so the quantised-wrapper slots are readable;
    // re-narrowed at return after un-packing back to number[]s.
    const out = { ...packet };
    let ownershipBytes;
    const own = out.ownership;
    if (own && typeof own === 'object' && !Array.isArray(own) &&
        typeof prop(own, '_b64') === 'string' &&
        typeof prop(own, '_q_bits') === 'number') {
        // Probed above: `own` carries _b64 (string) + _q_bits (number), the
        // QuantisedOwnership discriminator — Band-2 wrapper brand.
        const wrap = own;
        let packed = base64ToUint8Array(wrap._b64);
        if (wrap._xor_delta === true) {
            if (!prevOwnership || prevOwnership.length !== packed.length) {
                throw new Error(`analysis-bundle/encoder: _xor_delta packet without a valid ` +
                    `prior ownership reference; the bundle's records are out of order ` +
                    `or the first packet is mis-marked`);
            }
            const undone = new Uint8Array(packed.length);
            for (let i = 0; i < packed.length; i++) {
                undone[i] = packed[i] ^ prevOwnership[i];
            }
            packed = undone;
        }
        ownershipBytes = packed;
        if (wrap._q_bits === 4) {
            out.ownership = dequantiseOwnershipQ4(packed);
        }
        else if (wrap._q_bits === 8) {
            out.ownership = dequantiseOwnershipQ8(packed);
        }
        else {
            throw new Error(`analysis-bundle/encoder: unsupported _q_bits=${wrap._q_bits} on ` +
                `ownership wrapper; this client supports 4 and 8`);
        }
    }
    const pol = out.policy;
    if (pol && typeof pol === 'object' && !Array.isArray(pol) &&
        prop(pol, '_q8_factored') &&
        typeof prop(pol, '_q8_factored') === 'object') {
        // Probed above: `pol` carries a _q8_factored object, the
        // QuantisedPolicy discriminator — Band-2 wrapper brand.
        const wrap = pol._q8_factored;
        const packed = {
            bitmap: base64ToUint8Array(wrap.bitmap_b64),
            legalCount: wrap.legal_count,
            values: base64ToUint8Array(wrap.values_b64),
        };
        out.policy = dequantisePolicyQ8Factored(packed);
    }
    return {
        // Re-narrow: the ownership/policy slots are now number[]s again (the
        // un-packing above un-did the quantised wrappers), so `out` matches the
        // typed shape. Band-2 wire-shape remint through the open record.
        packet: out,
        ownershipBytes,
    };
}
/**
 * Factory: build a `BundleEncoder` that applies projection +
 * ownership quantisation (at the given bit depth) + Q8-factored
 * policy quantisation. The encode/decode pair is symmetric on
 * the JSON envelope. Two knobs:
 *
 *   - ownershipBits: 4 or 8 (max-abs ≤ 0.0625 vs ≤ 1/256 ≈ 0.0039)
 *   - byteXorDelta: when true, every non-first packet's Q8 (or
 *     Q4) ownership bytes are XOR'd against the prior packet's
 *     literal bytes. The 2026-05-26 framework probe measured
 *     ~23% additional post-brotli savings for the Q8 case. The
 *     encoder threads the prior-packet state through the records
 *     in order; the decoder mirrors via `prevOwnership`.
 */
function makeLossyEncoder(scheme, ownershipBits, byteXorDelta = false) {
    return {
        scheme,
        encode(bundle) {
            const records = [];
            let prevOwnership = undefined;
            for (const r of bundle.records) {
                const { packet, ownershipBytes } = encodePacketLossy(projectPacket(r.packet), ownershipBits, byteXorDelta, prevOwnership);
                records.push({
                    configHash: r.configHash,
                    nodeId: r.nodeId,
                    packet,
                });
                prevOwnership = ownershipBytes;
            }
            const projected = {
                schemaVersion: bundle.schemaVersion,
                records,
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
        decode(bytes) {
            const text = new TextDecoder('utf-8').decode(bytes);
            let parsed;
            try {
                parsed = JSON.parse(text);
            }
            catch (e) {
                throw new Error(`analysis-bundle/encoder: JSON parse failed for scheme ` +
                    `'${scheme}': ${e instanceof Error ? e.message : String(e)}`);
            }
            if (!parsed ||
                typeof parsed !== 'object' ||
                typeof prop(parsed, 'schemaVersion') !== 'number' ||
                !Array.isArray(prop(parsed, 'records'))) {
                throw new Error(`analysis-bundle/encoder: decoded payload doesn't match the ` +
                    `AnalysisBundle shape for scheme '${scheme}'`);
            }
            // Validated above: schemaVersion is a number and records is an array
            // — Band-2 decode brand on the just-parsed payload.
            const bundle = parsed;
            const records = [];
            let prevOwnership = undefined;
            for (const r of bundle.records) {
                const { packet, ownershipBytes } = decodePacketLossy(r.packet, prevOwnership);
                records.push({
                    configHash: r.configHash,
                    nodeId: r.nodeId,
                    packet,
                });
                prevOwnership = ownershipBytes;
            }
            return {
                schemaVersion: bundle.schemaVersion,
                records,
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
const OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1 = makeLossyEncoder(OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1_SCHEME, 4);
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
const OWNERSHIP_Q8_POLICY_Q8_FACTORED_V1 = makeLossyEncoder(OWNERSHIP_Q8_POLICY_Q8_FACTORED_V1_SCHEME, 8);
/**
 * Hi-fi + byte-XOR delta: same Q8 ownership + Q8-factored policy
 * as the plain hifi variant, but with byte-level XOR delta
 * across consecutive packets. The 2026-05-26 compression-
 * evaluation-framework probe measured ~23% additional
 * post-brotli savings vs literal Q8 on the 40-game corpus.
 * Reconstruction is byte-identical to the plain hifi variant
 * — XOR is algebraic — so L∞ and L₂ are unchanged at
 * ≤ 1/256 ≈ 0.0039 / ≤ 1/512 ≈ 0.0020.
 *
 * Why the framework's headline ~23%: at 8 bits per cell, two
 * consecutive packets with the same Q8 bin value give an
 * identical byte; XOR produces a zero, and brotli's
 * literal-zero detection compresses long runs aggressively.
 * The same trick on Q4 only yields ~4% because byte-level
 * identity requires BOTH nibble-paired cells to match.
 *
 * Tradeoff vs plain hifi: stateful decode (each packet's
 * reconstruction needs the prior packet's literal bytes), no
 * material complexity increase on the encoder side. Stored
 * rows decode regardless of the current registry setting; the
 * scheme tag in `format_descriptor.scheme` is the read-time
 * discriminator.
 */
const OWNERSHIP_Q8_POLICY_Q8_FACTORED_XOR_V1 = makeLossyEncoder(OWNERSHIP_Q8_POLICY_Q8_FACTORED_XOR_V1_SCHEME, 8, true);
// ── Dispatch ───────────────────────────────────────────────────────────────
const ENCODERS_BY_SCHEME = {
    [JSON_PROJECTED_V1.scheme]: JSON_PROJECTED_V1,
    [OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1.scheme]: OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1,
    [OWNERSHIP_Q8_POLICY_Q8_FACTORED_V1.scheme]: OWNERSHIP_Q8_POLICY_Q8_FACTORED_V1,
    [OWNERSHIP_Q8_POLICY_Q8_FACTORED_XOR_V1.scheme]: OWNERSHIP_Q8_POLICY_Q8_FACTORED_XOR_V1,
};
/**
 * Look up an encoder by its scheme tag, or return `undefined` if
 * the tag is unknown. The persistence service uses this both at
 * write time (with the user-selected scheme) and at read time
 * (with `format_descriptor.scheme` from a stored row). An unknown
 * scheme on the read path is operator-side data corruption and
 * gets a loud throw in the caller.
 */
export function getEncoderForScheme(scheme) {
    return ENCODERS_BY_SCHEME[scheme];
}
/**
 * The set of scheme tags this client knows about. Used by the
 * registry-knob's runtime validation and by the auto-save
 * composable's capability gate.
 */
export function listKnownSchemes() {
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
export function uint8ArrayToBase64(arr) {
    let acc = '';
    const chunk = 0x8000;
    for (let i = 0; i < arr.length; i += chunk) {
        acc += String.fromCharCode.apply(null, Array.from(arr.subarray(i, i + chunk)));
    }
    return btoa(acc);
}
/**
 * Decode a base64 string back to a `Uint8Array`. Throws on invalid
 * base64 — let the persistence-service caller catch and surface
 * the malformed-payload case.
 */
export function base64ToUint8Array(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}
