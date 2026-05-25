"""
research/compression/identity.py

JSON-serialised family. `IdentityLossless` is the no-codec baseline
— it emits the dict as JSON bytes and decodes by parsing JSON back.
Every subclass shares this serialisation and layers a generic
compressor on the resulting bytes.

Template-method pattern: the base class composes
`encode = _codec_compress ∘ _serialise` and
`decode = _deserialise ∘ _codec_decompress`. The base's
`_codec_*` methods are the identity transform; subclasses override
only those two to introduce a codec.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import gzip
import json
from typing import Any

import brotli
import zstandard

from .compressor import LosslessCompressor


class IdentityLossless(LosslessCompressor):
    """The reference baseline: JSON serialisation, no codec.

    The byte count this compressor reports is the count the wire
    would carry today if `storedScheme = 'json'` (no gzip). Every
    other compressor's ratio is computed relative to this one in
    the bench's aggregate table.

    JSON encoding uses the compact separator set `(",", ":")` —
    no whitespace, matching the wire's actual byte budget. The
    decoded dict is what `json.loads` returns, so int/float types
    round-trip as JSON parses them (integers stay int, decimals
    become float)."""

    name = "Identity"

    def _serialise(self, packet: dict[str, Any]) -> bytes:
        return json.dumps(packet, separators=(",", ":")).encode("utf-8")

    def _deserialise(self, blob: bytes) -> dict[str, Any]:
        return json.loads(blob.decode("utf-8"))

    def _codec_compress(self, b: bytes) -> bytes:
        return b

    def _codec_decompress(self, b: bytes) -> bytes:
        return b

    def encode(self, packet: dict[str, Any]) -> bytes:
        return self._codec_compress(self._serialise(packet))

    def decode(self, blob: bytes) -> dict[str, Any]:
        return self._deserialise(self._codec_decompress(blob))


class JsonGzipLossless(IdentityLossless):
    """JSON serialisation, gzip codec layered on top. Matches the
    production at-rest path when `storedScheme = 'json+gzip'`.

    gzip level 6 is the production default (Python's `gzip.compress`
    uses level 9 by default, but the backend's path uses Python's
    `gzip` module which uses level 9 — verify against `backend/`
    when calibrating. Sticking with 6 here as a Pareto-reasonable
    midpoint; the bench can sweep levels later if needed)."""

    name = "JsonGzip"
    LEVEL = 6

    def _codec_compress(self, b: bytes) -> bytes:
        return gzip.compress(b, compresslevel=self.LEVEL)

    def _codec_decompress(self, b: bytes) -> bytes:
        return gzip.decompress(b)


class JsonZstdLossless(IdentityLossless):
    """JSON + zstd. Level 3 is zstd's default — typically the best
    CPU/ratio Pareto for general data. Higher levels give a few
    percent more ratio at multiplicative CPU cost."""

    name = "JsonZstd"
    LEVEL = 3

    def _codec_compress(self, b: bytes) -> bytes:
        return zstandard.ZstdCompressor(level=self.LEVEL).compress(b)

    def _codec_decompress(self, b: bytes) -> bytes:
        return zstandard.ZstdDecompressor().decompress(b)


class JsonBrotliLossless(IdentityLossless):
    """JSON + brotli. Quality 6 is roughly comparable to gzip-6 in
    CPU cost while giving brotli's typically-better ratio on
    text-heavy inputs. Brotli's built-in dictionary is biased
    toward web content (HTML, CSS, JS keywords) — it may or may
    not help on KataGo JSON; the bench measures."""

    name = "JsonBrotli"
    QUALITY = 6

    def _codec_compress(self, b: bytes) -> bytes:
        return brotli.compress(b, quality=self.QUALITY)

    def _codec_decompress(self, b: bytes) -> bytes:
        return brotli.decompress(b)
