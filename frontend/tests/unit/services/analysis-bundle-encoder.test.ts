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
