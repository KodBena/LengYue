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


# ── Schema-projected JSON family ────────────────────────────────────────────
#
# JSON-serialise only the fields the SPA's typed shape declares. Drops
# everything KataGo emits beyond what the SPA models — ~13 unmodelled
# fields per moveInfo (`scoreStdev`, `scoreSelfplay`, `playSelectionValue`,
# `edgeVisits`, `edgeWeight`, `prior`, `lcb`, `utility`, `utilityLcb`,
# `scoreMean`, `weight`, `pvVisits`, `pvEdgeVisits`, `isSymmetryOf`),
# ~14 per rootInfo (the `raw*` fields, `symHash`, `thisHash`, etc.), plus
# top-level `userMoveInfo` (always None in this corpus). The remaining
# fields round-trip exactly through JSON.
#
# Round-trip contract: `decode(encode(p)) == project(p)`, not `== p`.
# This is "lossless on the projected schema" — fields the SPA can read
# come back exactly; fields it can't read are gone. For bench purposes
# the variant declares `is_lossless = False` since strict bundle
# equality fails. The reconstruction-error metrics (L2-RMSE / max-abs)
# don't apply — projection is field-drop, not value approximation.

# Allow-lists derived from frontend/src/engine/katago/types.ts
# (`KataAnalysisResponse`, `KataMoveInfo`, `KataRootInfo`, `KataExtra`,
# `KataPlayerExtra`). Updating either side without the other would
# silently break this projection; the comment in types.ts that exports
# these as `readonly` is the contract anchor.
ALLOWED_ROOT_KEYS = frozenset({
    "id", "isDuringSearch", "turnNumber",
    "moveInfos", "rootInfo", "ownership", "policy", "extra",
})
ALLOWED_MOVEINFO_KEYS = frozenset({
    "move", "visits", "winrate", "scoreLead", "pv", "order", "clusterId",
})
ALLOWED_ROOTINFO_KEYS = frozenset({
    "winrate", "scoreLead", "visits", "currentPlayer",
})
ALLOWED_EXTRA_KEYS = frozenset({"state", "black", "white"})


def _project_packet(packet: dict[str, Any]) -> dict[str, Any]:
    """Project a KataGo response dict through the SPA's typed-shape
    allow-list. Pure function; idempotent (project(project(p)) ==
    project(p))."""
    out: dict[str, Any] = {}
    for k, v in packet.items():
        if k not in ALLOWED_ROOT_KEYS:
            continue
        if k == "rootInfo" and isinstance(v, dict):
            out[k] = {kk: v[kk] for kk in v if kk in ALLOWED_ROOTINFO_KEYS}
        elif k == "moveInfos" and isinstance(v, list):
            out[k] = [
                {kk: mi[kk] for kk in mi if kk in ALLOWED_MOVEINFO_KEYS}
                for mi in v
            ]
        elif k == "extra" and isinstance(v, dict):
            # extra.{black,white,state} sub-shapes are not further
            # projected here — they're either dynamic-keyed
            # (extra.state) or always-empty in this corpus
            # (KataPlayerExtra). If a future arc populates them with
            # extractor-specific bloat, extend this projection.
            out[k] = {kk: v[kk] for kk in v if kk in ALLOWED_EXTRA_KEYS}
        else:
            out[k] = v
    return out


class JsonProjectedLossless(LosslessCompressor):
    """JSON serialisation through the SPA's typed-shape allow-list.
    Drops fields the SPA doesn't model before encoding. The decoded
    dict matches `project(original)`, NOT the original — so this is
    not strictly lossless. `is_lossless = False` reflects that for
    the bench.

    Useful as a `rest` compressor in `OwnershipFactoredBundle`: the
    SPA reconstructing a bundle gets back exactly what its consumers
    can read; the bytes saved by dropping unmodelled fields go to
    the user's quota."""

    name = "JsonProjected"
    is_lossless = False

    def _serialise(self, packet: dict[str, Any]) -> bytes:
        return json.dumps(_project_packet(packet), separators=(",", ":")).encode("utf-8")

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


class JsonProjectedGzipLossless(JsonProjectedLossless):
    name = "JsonProjGzip"
    LEVEL = 6

    def _codec_compress(self, b: bytes) -> bytes:
        return gzip.compress(b, compresslevel=self.LEVEL)

    def _codec_decompress(self, b: bytes) -> bytes:
        return gzip.decompress(b)


class JsonProjectedZstdLossless(JsonProjectedLossless):
    name = "JsonProjZstd"
    LEVEL = 3

    def _codec_compress(self, b: bytes) -> bytes:
        return zstandard.ZstdCompressor(level=self.LEVEL).compress(b)

    def _codec_decompress(self, b: bytes) -> bytes:
        return zstandard.ZstdDecompressor().decompress(b)


class JsonProjectedBrotliLossless(JsonProjectedLossless):
    name = "JsonProjBrotli"
    QUALITY = 6

    def _codec_compress(self, b: bytes) -> bytes:
        return brotli.compress(b, quality=self.QUALITY)

    def _codec_decompress(self, b: bytes) -> bytes:
        return brotli.decompress(b)
