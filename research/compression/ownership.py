"""
research/compression/ownership.py

OwnershipCompressor: the bundle-cross-cutting abstraction for the
sequence of ownership maps that a `BundleCompressor` extracts via
`OwnershipFactoredBundle`. Subclasses choose the byte layout (raw
vs transposed vs delta-encoded) without committing to a codec; the
bundle-level codec wrappers (`GzipBundle` etc.) layer on top of
whichever ownership scheme the factored bundle was built with.

Input/output contract
═════════════════════
`encode(arrays: list[list[float]]) -> bytes`
  `arrays` is a list of N ownership maps; each map is a list of W
  floats. For 19x19 boards W=361. Empty list is permitted (encodes
  to the bare N=0 header). All non-empty maps must have the same W
  — encoder fails loud on width drift (ADR-0002).

`decode(blob: bytes) -> list[list[float]]`
  Returns a list of N maps with the same shape that went in.
  Round-trip equality is dict-`==` at the bundle level (preserves
  float64 precision exactly since storage is raw IEEE).

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import io
import struct
from abc import ABC, abstractmethod

from .packed import _read_uvarint, _write_uvarint


class OwnershipCompressor(ABC):
    """Abstract base for ownership-sequence codecs."""

    name: str

    @abstractmethod
    def encode(self, arrays: list[list[float]]) -> bytes:
        ...

    @abstractmethod
    def decode(self, blob: bytes) -> list[list[float]]:
        ...


def _check_uniform_width(arrays: list[list[float]]) -> int:
    """Verify all arrays have the same width; return W (or 0 if
    empty input). Fails loud on width drift per ADR-0002 — silent
    truncation or padding would corrupt the round-trip contract."""
    if not arrays:
        return 0
    w = len(arrays[0])
    for i, a in enumerate(arrays):
        if len(a) != w:
            raise ValueError(
                f"ownership width drift at index {i}: expected {w}, got {len(a)}"
            )
    return w


class RawOwnership(OwnershipCompressor):
    """Packet-major raw float64 layout: byte sequence is
    map[0][0], map[0][1], ..., map[0][W-1], map[1][0], ..., map[N-1][W-1].
    Each value is 8 bytes IEEE little-endian. No transform; this is
    the byte order an in-place JSON-array-of-arrays would produce
    (plus the JSON quoting/commas it strips).

    Blob: [varint N] [varint W] [N×W×8 raw bytes]
    """

    name = "Raw"

    def encode(self, arrays: list[list[float]]) -> bytes:
        n = len(arrays)
        w = _check_uniform_width(arrays)
        out = io.BytesIO()
        _write_uvarint(out, n)
        _write_uvarint(out, w)
        if n and w:
            for a in arrays:
                out.write(struct.pack(f"<{w}d", *a))
        return out.getvalue()

    def decode(self, blob: bytes) -> list[list[float]]:
        n, pos = _read_uvarint(blob, 0)
        w, pos = _read_uvarint(blob, pos)
        out: list[list[float]] = []
        for _ in range(n):
            out.append(list(struct.unpack_from(f"<{w}d", blob, pos)))
            pos += w * 8
        return out


class TransposedOwnership(OwnershipCompressor):
    """Coord-major raw float64 layout: byte sequence is
    coord[0].t0, coord[0].t1, ..., coord[0].t(N-1), coord[1].t0, ..., coord[W-1].t(N-1).
    Same byte count as `RawOwnership`; the values are reordered so
    that one cell's values across all turns are contiguous.

    Motivation: ownership at a settled cell barely changes turn-to-
    turn (an established territory is +1 or -1 for many turns).
    Contiguous per-cell series exposes that correlation to any
    downstream byte-oriented codec — runs of near-identical bytes
    are exactly the redundancy pattern gzip/zstd/brotli capture
    best. Also the natural substrate for time-axis delta encoding
    (a follow-on scheme).

    Blob: [varint N] [varint W] [W×N×8 raw bytes]
    """

    name = "Transposed"

    def encode(self, arrays: list[list[float]]) -> bytes:
        n = len(arrays)
        w = _check_uniform_width(arrays)
        out = io.BytesIO()
        _write_uvarint(out, n)
        _write_uvarint(out, w)
        if n and w:
            # Emit W series, each of N floats. The transpose is
            # done up front into a flat output array to amortise the
            # per-element overhead; an alternative is to iterate
            # arrays[t][c] for c outer / t inner directly, with
            # similar performance.
            for c in range(w):
                series = [arrays[t][c] for t in range(n)]
                out.write(struct.pack(f"<{n}d", *series))
        return out.getvalue()

    def decode(self, blob: bytes) -> list[list[float]]:
        n, pos = _read_uvarint(blob, 0)
        w, pos = _read_uvarint(blob, pos)
        # Read W series of N values each into a temporary, then
        # untranspose into N maps of W values.
        series: list[list[float]] = []
        for _ in range(w):
            series.append(list(struct.unpack_from(f"<{n}d", blob, pos)))
            pos += n * 8
        out: list[list[float]] = []
        for t in range(n):
            out.append([series[c][t] for c in range(w)])
        return out
