/**
 * tests/unit/services/analysis-bundle-encoder.test.ts
 *
 * Tier-1 (pure-logic) tests for
 * `src/services/analysis-bundle/encoder.ts` — the TS port of the
 * compression hierarchy's lossless leaf.
 *
 * Coverage:
 *   - JSON_PROJECTED_V1 round-trip is identity on every field the
 *     SPA's typed shape declares.
 *   - Unmodelled fields are dropped at encode and absent at decode
 *     (the bundle's `packet` no longer carries them).
 *   - `uncompressedByteSize` reflects the canonical-JSON size, not
 *     the projected size — the user-facing "saved X%" comparison
 *     stays honest.
 *   - The dispatch table exposes the scheme tag and rejects unknown
 *     tags with a clear error.
 *   - Base64 helpers round-trip on small + large payloads.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';

import {
  base64ToUint8Array,
  getEncoderForScheme,
  listKnownSchemes,
  uint8ArrayToBase64,
  _JSON_PROJECTED_V1 as JSON_PROJECTED_V1,
  type BundleEncoder,
} from '../../../src/services/analysis-bundle/encoder';
import {
  OWNERSHIP_CELL_COUNT,
  OWNERSHIP_Q4_MAX_ABS_ANALYTIC,
  OWNERSHIP_Q8_MAX_ABS_ANALYTIC,
  POLICY_CELL_COUNT,
  POLICY_Q8_FACTORED_MAX_ABS_LEGAL_ANALYTIC,
} from '../../../src/services/analysis-bundle/quantization';
import type { AnalysisBundle, AnalysisRecord } from '../../../src/services/analysis-bundle';
import type { NodeId } from '../../../src/types';

function _record(packet: Record<string, unknown>): AnalysisRecord {
  return {
    configHash: 'cfg-1',
    nodeId: 'node-1' as NodeId,
    // Cast through unknown so we can pump runtime-extra fields
    // through the encoder for projection-behaviour tests.
    packet: packet as unknown as AnalysisRecord['packet'],
  };
}

function _bundle(records: AnalysisRecord[]): AnalysisBundle {
  return { schemaVersion: 1, records };
}

const _MIN_PACKET = {
  id: 'q1',
  turnNumber: 5,
  isDuringSearch: false,
  moveInfos: [
    {
      move: 'Q16',
      visits: 500,
      winrate: 0.55,
      scoreLead: 1.5,
      pv: ['Q16'],
      order: 0,
    },
  ],
  rootInfo: {
    winrate: 0.523,
    scoreLead: 2.5,
    visits: 1500,
    currentPlayer: 'B',
  },
};

describe('JSON_PROJECTED_V1 encoder', () => {
  it('round-trips an empty bundle', () => {
    const bundle = _bundle([]);
    const encoded = JSON_PROJECTED_V1.encode(bundle);
    const decoded = JSON_PROJECTED_V1.decode(encoded.bytes);
    expect(decoded).toEqual(bundle);
  });

  it('round-trips every SPA-typed-shape field bit-identically', () => {
    const bundle = _bundle([_record(_MIN_PACKET)]);
    const encoded = JSON_PROJECTED_V1.encode(bundle);
    const decoded = JSON_PROJECTED_V1.decode(encoded.bytes);
    expect(decoded).toEqual(bundle);
  });

  it('drops unmodelled root fields at encode time', () => {
    const packetWithJunk = {
      ..._MIN_PACKET,
      junkRootField: 'should not survive',
      anotherJunk: { nested: 1 },
    };
    const bundle = _bundle([_record(packetWithJunk)]);
    const encoded = JSON_PROJECTED_V1.encode(bundle);
    const decoded = JSON_PROJECTED_V1.decode(encoded.bytes);
    const recovered = decoded.records[0].packet as unknown as Record<string, unknown>;
    expect(recovered).not.toHaveProperty('junkRootField');
    expect(recovered).not.toHaveProperty('anotherJunk');
    // Allowed fields preserved:
    expect(recovered).toHaveProperty('id');
    expect(recovered).toHaveProperty('turnNumber');
    expect(recovered).toHaveProperty('moveInfos');
  });

  it('drops moveInfos[*].scoreStdev and similar unmodelled fields', () => {
    const packet = {
      ..._MIN_PACKET,
      moveInfos: [
        {
          ..._MIN_PACKET.moveInfos[0],
          scoreStdev: 5.0,
          scoreMean: 1.2,
        },
      ],
    };
    const bundle = _bundle([_record(packet)]);
    const encoded = JSON_PROJECTED_V1.encode(bundle);
    const decoded = JSON_PROJECTED_V1.decode(encoded.bytes);
    const mi = decoded.records[0].packet.moveInfos[0] as unknown as Record<string, unknown>;
    expect(mi).not.toHaveProperty('scoreStdev');
    expect(mi).not.toHaveProperty('scoreMean');
  });

  it('reports uncompressedByteSize as the canonical-JSON size, not the projected size', () => {
    // A packet with significant unmodelled-field weight: the
    // canonical-JSON byte count should be measurably larger than
    // the projected byte count.
    const packet = {
      ..._MIN_PACKET,
      junkA: 'a'.repeat(200),
      junkB: 'b'.repeat(200),
    };
    const bundle = _bundle([_record(packet)]);
    const encoded = JSON_PROJECTED_V1.encode(bundle);
    // The canonical-JSON includes the junk fields; the projected
    // bytes do not. So uncompressedByteSize must exceed
    // encoded.bytes.length.
    expect(encoded.uncompressedByteSize).toBeGreaterThan(encoded.bytes.length);
  });

  it('reports recordCount matching the bundle', () => {
    const bundle = _bundle([
      _record(_MIN_PACKET),
      _record(_MIN_PACKET),
      _record(_MIN_PACKET),
    ]);
    expect(JSON_PROJECTED_V1.encode(bundle).recordCount).toBe(3);
  });

  it('throws on decode of malformed JSON', () => {
    const bad = new TextEncoder().encode('not-valid-json{[');
    expect(() => JSON_PROJECTED_V1.decode(bad)).toThrow(/JSON parse failed/);
  });

  it('throws on decode of JSON missing the bundle shape', () => {
    const bad = new TextEncoder().encode('{"hello":"world"}');
    expect(() => JSON_PROJECTED_V1.decode(bad)).toThrow(/AnalysisBundle shape/);
  });

  it('descriptor has the stable scheme tag', () => {
    const encoded = JSON_PROJECTED_V1.encode(_bundle([]));
    expect(encoded.descriptor.scheme).toBe('json-projected-v1');
    expect(encoded.descriptor.version).toBe(1);
  });
});

describe('encoder dispatch', () => {
  it('exposes json-projected-v1 under its scheme tag', () => {
    const found = getEncoderForScheme('json-projected-v1');
    expect(found).toBeDefined();
    expect((found as BundleEncoder).scheme).toBe('json-projected-v1');
  });

  it('returns undefined for an unknown scheme', () => {
    expect(getEncoderForScheme('json-projected-v999')).toBeUndefined();
  });

  it('listKnownSchemes includes the registered scheme', () => {
    expect(listKnownSchemes()).toContain('json-projected-v1');
  });
});

describe('base64 helpers', () => {
  it('round-trips small payloads', () => {
    const data = new Uint8Array([0, 1, 2, 3, 255, 128, 64]);
    const b64 = uint8ArrayToBase64(data);
    const back = base64ToUint8Array(b64);
    expect(Array.from(back)).toEqual(Array.from(data));
  });

  it('round-trips a 64 KB payload (past the 32 KB chunk threshold)', () => {
    const data = new Uint8Array(64 * 1024);
    for (let i = 0; i < data.length; i++) data[i] = i & 0xff;
    const b64 = uint8ArrayToBase64(data);
    const back = base64ToUint8Array(b64);
    expect(back.length).toBe(data.length);
    expect(back[0]).toBe(data[0]);
    expect(back[32 * 1024]).toBe(data[32 * 1024]);
    expect(back[back.length - 1]).toBe(data[data.length - 1]);
  });

  it('produces a base64-shaped string', () => {
    const data = new Uint8Array([1, 2, 3]);
    const b64 = uint8ArrayToBase64(data);
    expect(b64).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('round-trips empty input', () => {
    const empty = new Uint8Array(0);
    expect(uint8ArrayToBase64(empty)).toBe('');
    expect(base64ToUint8Array('').length).toBe(0);
  });
});

// ── OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1 encoder (lossy leader) ──────────────

describe('ownership-q4-policy-q8-factored-v1 encoder', () => {
  function _quantPacket(): Record<string, unknown> {
    // Build a packet with concrete ownership + policy arrays so
    // the lossy encoder has fields to quantise. Otherwise the
    // scheme degenerates to JSON_PROJECTED_V1 behaviour.
    const ownership = new Array(OWNERSHIP_CELL_COUNT).fill(0).map((_, i) =>
      -1 + (2 * i) / (OWNERSHIP_CELL_COUNT - 1),
    );
    const policy = new Array(POLICY_CELL_COUNT).fill(-1.0);
    policy[10] = 0.5;
    policy[100] = 0.1;
    policy[200] = 0.9;
    return { ..._MIN_PACKET, ownership, policy };
  }

  function _bundleWithQuant(): AnalysisBundle {
    return _bundle([_record(_quantPacket())]);
  }

  it('is registered under the expected scheme tag', () => {
    const enc = getEncoderForScheme('ownership-q4-policy-q8-factored-v1');
    expect(enc).toBeDefined();
    expect((enc as BundleEncoder).scheme).toBe('ownership-q4-policy-q8-factored-v1');
  });

  it('listKnownSchemes includes the lossy scheme', () => {
    expect(listKnownSchemes()).toContain('ownership-q4-policy-q8-factored-v1');
  });

  it('round-trip preserves ownership within analytic max-abs', () => {
    const enc = getEncoderForScheme(
      'ownership-q4-policy-q8-factored-v1',
    ) as BundleEncoder;
    const bundle = _bundleWithQuant();
    const encoded = enc.encode(bundle);
    const decoded = enc.decode(encoded.bytes);
    const original = bundle.records[0].packet.ownership!;
    const recovered = decoded.records[0].packet.ownership!;
    expect(recovered.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(Math.abs(recovered[i] - original[i]))
        .toBeLessThanOrEqual(OWNERSHIP_Q4_MAX_ABS_ANALYTIC + 1e-12);
    }
  });

  it('round-trip preserves policy: -1 exact on illegal cells, within max-abs on legals', () => {
    const enc = getEncoderForScheme(
      'ownership-q4-policy-q8-factored-v1',
    ) as BundleEncoder;
    const bundle = _bundleWithQuant();
    const encoded = enc.encode(bundle);
    const decoded = enc.decode(encoded.bytes);
    const original = bundle.records[0].packet.policy!;
    const recovered = decoded.records[0].packet.policy!;
    expect(recovered.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      if (original[i] === -1.0) {
        expect(recovered[i]).toBe(-1.0);
      } else {
        expect(Math.abs(recovered[i] - original[i]))
          .toBeLessThanOrEqual(POLICY_Q8_FACTORED_MAX_ABS_LEGAL_ANALYTIC + 1e-12);
      }
    }
  });

  it('preserves non-quantised fields bit-identically', () => {
    const enc = getEncoderForScheme(
      'ownership-q4-policy-q8-factored-v1',
    ) as BundleEncoder;
    const bundle = _bundleWithQuant();
    const encoded = enc.encode(bundle);
    const decoded = enc.decode(encoded.bytes);
    const origPacket = bundle.records[0].packet;
    const recPacket = decoded.records[0].packet;
    expect(recPacket.id).toBe(origPacket.id);
    expect(recPacket.turnNumber).toBe(origPacket.turnNumber);
    expect(recPacket.rootInfo).toEqual(origPacket.rootInfo);
    expect(recPacket.moveInfos).toEqual(origPacket.moveInfos);
  });

  it('drops unmodelled fields just like the projected variant', () => {
    const enc = getEncoderForScheme(
      'ownership-q4-policy-q8-factored-v1',
    ) as BundleEncoder;
    const packet = { ..._quantPacket(), junkField: 'should be dropped' };
    const bundle = _bundle([_record(packet)]);
    const encoded = enc.encode(bundle);
    const decoded = enc.decode(encoded.bytes);
    const recovered = decoded.records[0].packet as unknown as Record<string, unknown>;
    expect(recovered).not.toHaveProperty('junkField');
  });

  it('produces a payload smaller than the canonical-JSON size', () => {
    const enc = getEncoderForScheme(
      'ownership-q4-policy-q8-factored-v1',
    ) as BundleEncoder;
    const bundle = _bundleWithQuant();
    const encoded = enc.encode(bundle);
    // The quantised payload before brotli is already smaller than
    // the canonical JSON (which carries full float arrays); brotli
    // amplifies the win further on the backend side.
    expect(encoded.bytes.length).toBeLessThan(encoded.uncompressedByteSize);
  });

  it('round-trips a bundle with no ownership/policy (encoder is a no-op on absent fields)', () => {
    const enc = getEncoderForScheme(
      'ownership-q4-policy-q8-factored-v1',
    ) as BundleEncoder;
    // _MIN_PACKET intentionally omits ownership / policy.
    const bundle = _bundle([_record(_MIN_PACKET)]);
    const encoded = enc.encode(bundle);
    const decoded = enc.decode(encoded.bytes);
    expect(decoded).toEqual(bundle);
  });
});

// ── ownership-q8-policy-q8-factored-v1 (hifi variant) ──────────────────────

describe('ownership-q8-policy-q8-factored-v1 encoder (hifi)', () => {
  function _quantPacket(): Record<string, unknown> {
    const ownership = new Array(OWNERSHIP_CELL_COUNT).fill(0).map((_, i) =>
      -1 + (2 * i) / (OWNERSHIP_CELL_COUNT - 1),
    );
    const policy = new Array(POLICY_CELL_COUNT).fill(-1.0);
    policy[10] = 0.5;
    policy[100] = 0.1;
    policy[200] = 0.9;
    return { ..._MIN_PACKET, ownership, policy };
  }

  it('is registered under the expected scheme tag', () => {
    const enc = getEncoderForScheme('ownership-q8-policy-q8-factored-v1');
    expect(enc).toBeDefined();
    expect((enc as BundleEncoder).scheme).toBe('ownership-q8-policy-q8-factored-v1');
  });

  it('listKnownSchemes includes the hifi scheme', () => {
    expect(listKnownSchemes()).toContain('ownership-q8-policy-q8-factored-v1');
  });

  it('preserves ownership within the analytic Q8 max-abs (≤ 1/256)', () => {
    const enc = getEncoderForScheme(
      'ownership-q8-policy-q8-factored-v1',
    ) as BundleEncoder;
    const bundle = _bundle([_record(_quantPacket())]);
    const encoded = enc.encode(bundle);
    const decoded = enc.decode(encoded.bytes);
    const original = bundle.records[0].packet.ownership!;
    const recovered = decoded.records[0].packet.ownership!;
    for (let i = 0; i < original.length; i++) {
      expect(Math.abs(recovered[i] - original[i]))
        .toBeLessThanOrEqual(OWNERSHIP_Q8_MAX_ABS_ANALYTIC + 1e-12);
    }
  });

  it('produces strictly more accurate ownership reconstruction than the Q4 variant', () => {
    const encQ4 = getEncoderForScheme(
      'ownership-q4-policy-q8-factored-v1',
    ) as BundleEncoder;
    const encQ8 = getEncoderForScheme(
      'ownership-q8-policy-q8-factored-v1',
    ) as BundleEncoder;
    const bundle = _bundle([_record(_quantPacket())]);
    const orig = bundle.records[0].packet.ownership!;
    const recQ4 = encQ4.decode(encQ4.encode(bundle).bytes)
      .records[0].packet.ownership!;
    const recQ8 = encQ8.decode(encQ8.encode(bundle).bytes)
      .records[0].packet.ownership!;
    let sseQ4 = 0;
    let sseQ8 = 0;
    for (let i = 0; i < orig.length; i++) {
      sseQ4 += (recQ4[i] - orig[i]) ** 2;
      sseQ8 += (recQ8[i] - orig[i]) ** 2;
    }
    expect(sseQ8).toBeLessThan(sseQ4);
  });

  it('costs more bytes than the Q4 variant for the same packet', () => {
    const encQ4 = getEncoderForScheme(
      'ownership-q4-policy-q8-factored-v1',
    ) as BundleEncoder;
    const encQ8 = getEncoderForScheme(
      'ownership-q8-policy-q8-factored-v1',
    ) as BundleEncoder;
    const bundle = _bundle([_record(_quantPacket())]);
    expect(encQ8.encode(bundle).bytes.length)
      .toBeGreaterThan(encQ4.encode(bundle).bytes.length);
  });

  it('preserves the policy round-trip (illegal cells exact, legals within max-abs)', () => {
    const enc = getEncoderForScheme(
      'ownership-q8-policy-q8-factored-v1',
    ) as BundleEncoder;
    const bundle = _bundle([_record(_quantPacket())]);
    const encoded = enc.encode(bundle);
    const decoded = enc.decode(encoded.bytes);
    const original = bundle.records[0].packet.policy!;
    const recovered = decoded.records[0].packet.policy!;
    for (let i = 0; i < original.length; i++) {
      if (original[i] === -1.0) {
        expect(recovered[i]).toBe(-1.0);
      } else {
        expect(Math.abs(recovered[i] - original[i]))
          .toBeLessThanOrEqual(POLICY_Q8_FACTORED_MAX_ABS_LEGAL_ANALYTIC + 1e-12);
      }
    }
  });
});

// ── ownership-q8-policy-q8-factored-xor-v1 (hifi + byte-XOR) ───────────────

describe('ownership-q8-policy-q8-factored-xor-v1 encoder (hifi-xor)', () => {
  function _quantPacketSeeded(seed: number): Record<string, unknown> {
    // Produce a packet whose ownership cells vary slightly per
    // seed so consecutive packets in a bundle have related-but-
    // not-identical Q8 values. This is the regime byte-XOR
    // exploits. Values clamped strictly to [-1, 1] so the
    // analytic Q8 max-abs (≤ 1/256) is the true bound — without
    // the clamp, the quantiser clips at the range edges and
    // injects errors larger than the in-range analytic bound.
    const ownership = new Array(OWNERSHIP_CELL_COUNT).fill(0).map((_, i) => {
      const raw = -1 + (2 * i) / (OWNERSHIP_CELL_COUNT - 1) + 0.001 * seed;
      return Math.max(-1, Math.min(1, raw));
    });
    const policy = new Array(POLICY_CELL_COUNT).fill(-1.0);
    policy[10] = Math.min(1, 0.5 + 0.01 * seed);
    policy[100] = 0.1;
    policy[200] = 0.9;
    return { ..._MIN_PACKET, ownership, policy };
  }

  function _multiPacketBundle(n: number): AnalysisBundle {
    const records: AnalysisRecord[] = [];
    for (let i = 0; i < n; i++) {
      records.push({
        configHash: `cfg-${i}`,
        nodeId: `node-${i}` as NodeId,
        packet: _quantPacketSeeded(i) as unknown as AnalysisRecord['packet'],
      });
    }
    return { schemaVersion: 1, records };
  }

  it('is registered under the expected scheme tag', () => {
    const enc = getEncoderForScheme('ownership-q8-policy-q8-factored-xor-v1');
    expect(enc).toBeDefined();
    expect((enc as BundleEncoder).scheme).toBe(
      'ownership-q8-policy-q8-factored-xor-v1',
    );
  });

  it('listKnownSchemes includes the hifi-xor scheme', () => {
    expect(listKnownSchemes()).toContain('ownership-q8-policy-q8-factored-xor-v1');
  });

  it('round-trip is byte-identical to plain hifi (XOR is algebraic)', () => {
    const enc = getEncoderForScheme(
      'ownership-q8-policy-q8-factored-xor-v1',
    ) as BundleEncoder;
    const encHifi = getEncoderForScheme(
      'ownership-q8-policy-q8-factored-v1',
    ) as BundleEncoder;
    const bundle = _multiPacketBundle(10);
    const recXor = enc.decode(enc.encode(bundle).bytes);
    const recHifi = encHifi.decode(encHifi.encode(bundle).bytes);
    expect(recXor.records.length).toBe(recHifi.records.length);
    for (let i = 0; i < recXor.records.length; i++) {
      const a = recXor.records[i].packet.ownership!;
      const b = recHifi.records[i].packet.ownership!;
      expect(a.length).toBe(b.length);
      for (let j = 0; j < a.length; j++) {
        expect(a[j]).toBe(b[j]);
      }
    }
  });

  it('encoded byte count is within JSON-marker overhead of plain hifi', () => {
    // XOR is byte-permutation-preserving on the BINARY ownership
    // payload, but the JSON envelope adds `"_xor_delta":true`
    // (~18 bytes) per P-frame wrapper. So the byte count is
    // marginally larger; what brotli sees on the wire is what
    // matters, not this pre-brotli count.
    const enc = getEncoderForScheme(
      'ownership-q8-policy-q8-factored-xor-v1',
    ) as BundleEncoder;
    const encHifi = getEncoderForScheme(
      'ownership-q8-policy-q8-factored-v1',
    ) as BundleEncoder;
    const N = 5;
    const bundle = _multiPacketBundle(N);
    const xorBytes = enc.encode(bundle).bytes.length;
    const hifiBytes = encHifi.encode(bundle).bytes.length;
    const overhead = xorBytes - hifiBytes;
    // Per P-frame: `"_xor_delta":true,` is 18 bytes; bundle has
    // (N - 1) P-frames. Allow 1.5× margin for JSON-stringify
    // ordering / key-position effects.
    const maxOverhead = (N - 1) * 30;
    expect(overhead).toBeGreaterThan(0);
    expect(overhead).toBeLessThanOrEqual(maxOverhead);
  });

  it('preserves L∞ bound across a longer bundle (no drift accumulation)', () => {
    const enc = getEncoderForScheme(
      'ownership-q8-policy-q8-factored-xor-v1',
    ) as BundleEncoder;
    const bundle = _multiPacketBundle(25);
    const decoded = enc.decode(enc.encode(bundle).bytes);
    for (let i = 0; i < bundle.records.length; i++) {
      const original = bundle.records[i].packet.ownership!;
      const recovered = decoded.records[i].packet.ownership!;
      for (let j = 0; j < original.length; j++) {
        expect(Math.abs(recovered[j] - original[j]))
          .toBeLessThanOrEqual(OWNERSHIP_Q8_MAX_ABS_ANALYTIC + 1e-12);
      }
    }
  });

  it('round-trips a single-packet bundle (I-frame only, no P-frames)', () => {
    const enc = getEncoderForScheme(
      'ownership-q8-policy-q8-factored-xor-v1',
    ) as BundleEncoder;
    const bundle = _multiPacketBundle(1);
    const decoded = enc.decode(enc.encode(bundle).bytes);
    expect(decoded.records.length).toBe(1);
    const original = bundle.records[0].packet.ownership!;
    const recovered = decoded.records[0].packet.ownership!;
    for (let j = 0; j < original.length; j++) {
      expect(Math.abs(recovered[j] - original[j]))
        .toBeLessThanOrEqual(OWNERSHIP_Q8_MAX_ABS_ANALYTIC + 1e-12);
    }
  });

  it('round-trips a packet without ownership (encoder is a no-op on absent fields)', () => {
    const enc = getEncoderForScheme(
      'ownership-q8-policy-q8-factored-xor-v1',
    ) as BundleEncoder;
    const bundle = _bundle([_record(_MIN_PACKET)]);
    const encoded = enc.encode(bundle);
    const decoded = enc.decode(encoded.bytes);
    expect(decoded).toEqual(bundle);
  });
});
