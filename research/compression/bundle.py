"""
research/compression/bundle.py

BundleCompressor: the per-`list-of-packets` analogue of
`Compressor`. The SPA's actual unit of storage is the per-board
bundle, and several compression schemes only exist at this layer
(cross-packet transforms — transpose, delta-along-turn — and
top-level codecs applied to the whole bundle blob).

Hierarchy
═════════

  BundleCompressor                      abstract; encode(list[dict]) -> bytes
  └── LosslessBundleCompressor          adds roundtrip_check
      ├── PerPacketBundle(inner)        lifts any per-packet LosslessCompressor to bundle level
      └── OwnershipFactoredBundle(rest, own)
                                        strips `ownership` from each packet (encoded via `rest`
                                        per-packet); collected ownership matrix encoded via `own`

Codec wrappers compose:

  GzipBundle(inner_bundle, level=6)     gzip-compress the bundle blob
  ZstdBundle(inner_bundle, level=3)     zstd
  BrotliBundle(inner_bundle, quality=6) brotli

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import gzip
import io
from abc import ABC, abstractmethod
from typing import Any

import brotli
import zstandard

from .compressor import LosslessCompressor
from .ownership import OwnershipCompressor
from .packed import _read_uvarint, _write_uvarint


class BundleCompressor(ABC):
    """Abstract root for bundle-level codecs."""

    name: str

    @abstractmethod
    def encode(self, bundle: list[dict[str, Any]]) -> bytes:
        ...

    @abstractmethod
    def decode(self, blob: bytes) -> list[dict[str, Any]]:
        ...


class LosslessBundleCompressor(BundleCompressor):
    """Round-trip contract: `decode(encode(b)) == b` at the list-of-
    dicts level. Equality is Python's `==`: same length, same
    packet values in same positions (each packet compared with
    dict-`==`)."""

    def roundtrip_check(self, bundle: list[dict[str, Any]]) -> bool:
        try:
            return self.decode(self.encode(bundle)) == bundle
        except Exception:
            return False


# ── Per-packet lift ─────────────────────────────────────────────────────────

class PerPacketBundle(LosslessBundleCompressor):
    """Wraps a per-packet `LosslessCompressor`. Each packet is
    encoded independently; the bundle blob is varint(N) followed by
    N (varint length, blob) pairs. No cross-packet transforms —
    this is the bundle-level baseline matching what the per-packet
    bench measures.

    Bundle name is `Bundle[<inner.name>]`."""

    def __init__(self, inner: LosslessCompressor) -> None:
        self.inner = inner
        self.name = f"Bundle[{inner.name}]"

    def encode(self, bundle: list[dict[str, Any]]) -> bytes:
        out = io.BytesIO()
        _write_uvarint(out, len(bundle))
        # Length-prefixed per-packet blobs. Lengths come INLINE per
        # packet so a streaming decoder can decode packet-by-packet
        # without a separate length-table prefix.
        for p in bundle:
            blob = self.inner.encode(p)
            _write_uvarint(out, len(blob))
            out.write(blob)
        return out.getvalue()

    def decode(self, blob: bytes) -> list[dict[str, Any]]:
        n, pos = _read_uvarint(blob, 0)
        out: list[dict[str, Any]] = []
        for _ in range(n):
            sz, pos = _read_uvarint(blob, pos)
            out.append(self.inner.decode(blob[pos:pos + sz]))
            pos += sz
        return out


# ── Ownership-factored bundle ───────────────────────────────────────────────

class OwnershipFactoredBundle(LosslessBundleCompressor):
    """Splits each packet into (rest, ownership). The rest is encoded
    per-packet via an inner `Compressor`; the collected ownership
    arrays are encoded as a sequence via an `OwnershipCompressor`.

    Forward shape (encoding):
      `bundle[i]['ownership']` (if present) → moved to an array;
      `bundle[i]` with `ownership` removed → encoded by `rest`.

    Reverse shape (decoding):
      Decoded rest packets are augmented with `ownership` from the
      decoded ownership-array sequence, in original order.

    Format:
      [varint N (packet count)]
      [varint length-i for i in 0..N]      — rest-blob lengths
      [rest-blob[0] || ... || rest-blob[N-1]]
      [presence bitmap: ceil(N/8) bytes]   — which packets had ownership
      [varint ownership-blob length]
      [ownership-blob bytes]

    Lossless: the rest path round-trips because the inner Compressor
    is lossless; the ownership path round-trips because the
    OwnershipCompressor is lossless on float64-equal sequences.
    Restoring `ownership` to its packet uses dict-`==` semantics
    (insertion order doesn't matter for the equality check).

    Bundle name is `OFB[<rest.name>,<own.name>]`."""

    def __init__(self, rest: LosslessCompressor, own: OwnershipCompressor) -> None:
        self.rest = rest
        self.own = own
        self.name = f"OFB[{rest.name},{own.name}]"

    def encode(self, bundle: list[dict[str, Any]]) -> bytes:
        n = len(bundle)
        rest_blobs: list[bytes] = []
        present_arrays: list[list[float]] = []
        presence = bytearray((n + 7) // 8)
        for i, p in enumerate(bundle):
            own = p.get("ownership")
            if own is not None:
                presence[i // 8] |= 1 << (i % 8)
                present_arrays.append(own)
                rest_packet = {k: v for k, v in p.items() if k != "ownership"}
            else:
                rest_packet = p
            rest_blobs.append(self.rest.encode(rest_packet))

        out = io.BytesIO()
        _write_uvarint(out, n)
        for b in rest_blobs:
            _write_uvarint(out, len(b))
        for b in rest_blobs:
            out.write(b)
        out.write(bytes(presence))
        own_blob = self.own.encode(present_arrays)
        _write_uvarint(out, len(own_blob))
        out.write(own_blob)
        return out.getvalue()

    def decode(self, blob: bytes) -> list[dict[str, Any]]:
        pos = 0
        n, pos = _read_uvarint(blob, pos)
        sizes: list[int] = []
        for _ in range(n):
            sz, pos = _read_uvarint(blob, pos)
            sizes.append(sz)
        rest_packets: list[dict[str, Any]] = []
        for sz in sizes:
            rest_packets.append(self.rest.decode(blob[pos:pos + sz]))
            pos += sz
        nbm = (n + 7) // 8
        presence = blob[pos:pos + nbm]
        pos += nbm
        own_blob_sz, pos = _read_uvarint(blob, pos)
        present_arrays = self.own.decode(blob[pos:pos + own_blob_sz])
        pos += own_blob_sz

        # Re-attach ownership to packets that had it. Iterate
        # presence bitmap; each set bit consumes one array.
        own_idx = 0
        for i, p in enumerate(rest_packets):
            if presence[i // 8] & (1 << (i % 8)):
                p["ownership"] = present_arrays[own_idx]
                own_idx += 1
        return rest_packets


# ── Codec wrappers (whole-bundle compression) ───────────────────────────────

class _BundleCodecBase(LosslessBundleCompressor):
    """Common shape for codec wrappers: hold an inner bundle
    compressor and apply a codec to its bytes. Each subclass
    overrides `_compress` / `_decompress`."""

    inner: LosslessBundleCompressor
    suffix: str

    def __init__(self, inner: LosslessBundleCompressor) -> None:
        self.inner = inner
        self.name = f"{inner.name}+{self.suffix}"

    def encode(self, bundle: list[dict[str, Any]]) -> bytes:
        return self._compress(self.inner.encode(bundle))

    def decode(self, blob: bytes) -> list[dict[str, Any]]:
        return self.inner.decode(self._decompress(blob))

    def _compress(self, b: bytes) -> bytes:  # pragma: no cover
        raise NotImplementedError

    def _decompress(self, b: bytes) -> bytes:  # pragma: no cover
        raise NotImplementedError


class GzipBundle(_BundleCodecBase):
    suffix = "Gzip"
    LEVEL = 6

    def _compress(self, b: bytes) -> bytes:
        return gzip.compress(b, compresslevel=self.LEVEL)

    def _decompress(self, b: bytes) -> bytes:
        return gzip.decompress(b)


class ZstdBundle(_BundleCodecBase):
    suffix = "Zstd"
    LEVEL = 3

    def _compress(self, b: bytes) -> bytes:
        return zstandard.ZstdCompressor(level=self.LEVEL).compress(b)

    def _decompress(self, b: bytes) -> bytes:
        return zstandard.ZstdDecompressor().decompress(b)


class BrotliBundle(_BundleCodecBase):
    suffix = "Brotli"
    QUALITY = 6

    def _compress(self, b: bytes) -> bytes:
        return brotli.compress(b, quality=self.QUALITY)

    def _decompress(self, b: bytes) -> bytes:
        return brotli.decompress(b)
