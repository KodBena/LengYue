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
    (the Delta* variants below).

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


# ── Delta encoding helpers ──────────────────────────────────────────────────
#
# Both delta variants encode each cell's value as the XOR of its uint64
# bit-reinterpretation with the previous packet's same cell. XOR is chosen
# over arithmetic subtraction because XOR on the uint64 representation is
# bijective and trivially bit-exact lossless — float64 subtraction can
# lose bits to rounding (`v_{t-1} + (v_t - v_{t-1}) != v_t` in IEEE 754
# for many real-world values), which would break the lossless contract.
#
# Compressibility: when two float64 values share sign and exponent (the
# common case for adjacent ownership samples — a settled cell at 0.9996
# stays near 0.9996), their XOR has zero bits in the top ~12 positions
# and only differs in the low-order mantissa bits. The resulting byte
# sequence has runs of zero high-order bytes — exactly the redundancy
# pattern gzip/zstd/brotli compress well.
#
# Sign-flip case: a cell that flips ownership (e.g. -0.99 → +0.99) gets
# its sign bit XORed, producing a value with the top bit set. Rare and
# still bit-exact; just doesn't help the codec as much for that cell.


def _floats_to_u64s(values: list[float]) -> tuple[int, ...]:
    """Bit-reinterpret a list of float64s as a tuple of uint64s. Used
    by the delta encoders to compute exact XOR on the bit pattern.
    `struct.pack` then `unpack` round-trips bit-exactly."""
    n = len(values)
    return struct.unpack(f"<{n}Q", struct.pack(f"<{n}d", *values))


def _u64s_to_floats(ints: tuple[int, ...] | list[int]) -> list[float]:
    """Inverse: bit-reinterpret a sequence of uint64s as a list of
    float64s. Reconstructs the original float values that
    `_floats_to_u64s` packed."""
    n = len(ints)
    return list(struct.unpack(f"<{n}d", struct.pack(f"<{n}Q", *ints)))


class DeltaOwnership(OwnershipCompressor):
    """Packet-major + per-cell XOR-delta against the previous
    packet's same cell. First packet stored as raw float64 bits;
    subsequent packets store `bits(v[t][c]) XOR bits(v[t-1][c])` for
    each cell c, in packet-major byte order.

    Same byte count as `RawOwnership` (N×W×8). The codec sees
    high-order zero bytes scattered through the bundle — the zeros
    are interleaved with non-zeros within each packet, since
    different cells have different delta magnitudes at the same
    turn boundary.

    Blob: [varint N] [varint W] [N×W×8 raw bytes; row 0 is float64s,
    rows 1..N-1 are uint64 XOR-deltas]
    """

    name = "Delta"

    def encode(self, arrays: list[list[float]]) -> bytes:
        n = len(arrays)
        w = _check_uniform_width(arrays)
        out = io.BytesIO()
        _write_uvarint(out, n)
        _write_uvarint(out, w)
        if n and w:
            out.write(struct.pack(f"<{w}d", *arrays[0]))
            prev_u = _floats_to_u64s(arrays[0])
            for t in range(1, n):
                cur_u = _floats_to_u64s(arrays[t])
                deltas = tuple(cur_u[c] ^ prev_u[c] for c in range(w))
                out.write(struct.pack(f"<{w}Q", *deltas))
                prev_u = cur_u
        return out.getvalue()

    def decode(self, blob: bytes) -> list[list[float]]:
        n, pos = _read_uvarint(blob, 0)
        w, pos = _read_uvarint(blob, pos)
        out: list[list[float]] = []
        if n and w:
            row0 = list(struct.unpack_from(f"<{w}d", blob, pos))
            out.append(row0)
            pos += w * 8
            prev_u = list(_floats_to_u64s(row0))
            for _ in range(n - 1):
                deltas = struct.unpack_from(f"<{w}Q", blob, pos)
                pos += w * 8
                cur_u = [prev_u[c] ^ deltas[c] for c in range(w)]
                out.append(_u64s_to_floats(cur_u))
                prev_u = cur_u
        return out


class TransposedDeltaOwnership(OwnershipCompressor):
    """Coord-major + delta-along-time. Same XOR-delta computation as
    `DeltaOwnership`, with the byte layout reordered so all deltas
    for one cell are contiguous (each cell contributes one raw
    float64 followed by N-1 uint64 XOR-deltas).

    For a settled cell whose value barely changes across the game,
    the contiguous run of low-magnitude XOR-deltas is mostly-zero
    bytes — a long run pattern any codec captures cleanly. This is
    the variant the bundle-level transpose was building toward.

    Blob: [varint N] [varint W] [W×N×8 raw bytes; for each coord c,
    series[0] is raw float64, series[1..N-1] are uint64 XOR-deltas
    against the previous turn]
    """

    name = "TransposedDelta"

    def encode(self, arrays: list[list[float]]) -> bytes:
        n = len(arrays)
        w = _check_uniform_width(arrays)
        out = io.BytesIO()
        _write_uvarint(out, n)
        _write_uvarint(out, w)
        if n and w:
            for c in range(w):
                series_f = [arrays[t][c] for t in range(n)]
                series_u = _floats_to_u64s(series_f)
                # First value: raw float64; subsequent: XOR-delta
                # against the previous. We emit as N uint64s where
                # the first equals series_u[0] (the float64's bit
                # pattern); decoder reinterprets it back as float.
                deltas: list[int] = [series_u[0]]
                for t in range(1, n):
                    deltas.append(series_u[t] ^ series_u[t - 1])
                out.write(struct.pack(f"<{n}Q", *deltas))
        return out.getvalue()

    def decode(self, blob: bytes) -> list[list[float]]:
        n, pos = _read_uvarint(blob, 0)
        w, pos = _read_uvarint(blob, pos)
        # Reconstruct W series of N floats, then untranspose.
        series_floats: list[list[float]] = []
        for _ in range(w):
            if n == 0:
                series_floats.append([])
                continue
            ints = struct.unpack_from(f"<{n}Q", blob, pos)
            pos += n * 8
            recon_u: list[int] = [ints[0]]
            for t in range(1, n):
                recon_u.append(recon_u[-1] ^ ints[t])
            series_floats.append(_u64s_to_floats(recon_u))
        out: list[list[float]] = []
        for t in range(n):
            out.append([series_floats[c][t] for c in range(w)])
        return out


# ── Sorted-delta encoding ───────────────────────────────────────────────────
#
# The Delta* variants above XOR each value against the *previous*
# value in a fixed traversal order (time, in TransposedDelta). When
# values aren't temporally adjacent in magnitude — which happens
# whenever a cell's ownership flips or drifts non-monotonically —
# the XOR has full mantissa entropy and the codec extracts little
# from it.
#
# The Sorted* variants instead sort values into monotonic order
# before XOR-encoding. Adjacent values in the sorted sequence are
# value-adjacent by definition; their XORs concentrate entropy in
# the low-order bits, where mantissa-level differences live. The
# cost is the sort permutation, which must be stored so the
# original order can be reconstructed.
#
# Index width: per-packet sort uses uint16 (361 cells fits in
# 2 bytes). Flat-bundle sort needs uint32 because N×361 exceeds
# 65 535 for any bundle larger than ~181 packets — the corpus's
# 250-packet game falls here. Chunking longer bundles into uint16-
# safe slabs is an alternative but not implemented.


class SortedDeltaOwnership(OwnershipCompressor):
    """Per-packet sort + XOR-delta + uint16 permutation.

    For each packet's 361-value ownership map: compute permutation P
    such that values[P[0]] <= values[P[1]] <= ... <= values[P[W-1]];
    emit P (361 × uint16) followed by the sorted sequence as raw
    first-value + uint64 XOR-deltas. Decoder reads P + reconstructs
    the sorted values, then un-permutes to recover the original
    cell ordering.

    Overhead vs Raw: 2 bytes per cell per packet (25% on top of the
    8 bytes per value). The hypothesis being measured is whether
    the sorted-delta payload compresses enough under a downstream
    codec to make up the permutation cost.

    Blob: [varint N] [varint W]
          [per packet: W uint16 indices LE | W float64-bit-pattern
           uint64s, with index[0] storing the raw first sorted
           value's bit pattern and index[1..W-1] storing XOR-deltas]
    """

    name = "SortedDelta"

    def encode(self, arrays: list[list[float]]) -> bytes:
        n = len(arrays)
        w = _check_uniform_width(arrays)
        out = io.BytesIO()
        _write_uvarint(out, n)
        _write_uvarint(out, w)
        if n == 0 or w == 0:
            return out.getvalue()
        if w > 65535:
            # 2-byte index would overflow. Per-packet sort tops out
            # at 65 535 cells; raise loudly rather than truncate.
            raise ValueError(f"SortedDelta: W={w} exceeds uint16 capacity")
        for t in range(n):
            vals = arrays[t]
            # Permutation P: P[i] is the original index of the
            # i-th sorted value. Sort the index list by the
            # corresponding value (stable on ties; Python's sort
            # is stable, so equal-valued cells preserve their
            # original-order relative ordering).
            perm = sorted(range(w), key=vals.__getitem__)
            out.write(struct.pack(f"<{w}H", *perm))
            sorted_u = _floats_to_u64s([vals[i] for i in perm])
            # First value raw (its uint64 bit pattern reinterpreted
            # by the decoder back into float64); subsequent values
            # XOR-delta against the previous sorted value.
            deltas: list[int] = [sorted_u[0]]
            for i in range(1, w):
                deltas.append(sorted_u[i] ^ sorted_u[i - 1])
            out.write(struct.pack(f"<{w}Q", *deltas))
        return out.getvalue()

    def decode(self, blob: bytes) -> list[list[float]]:
        n, pos = _read_uvarint(blob, 0)
        w, pos = _read_uvarint(blob, pos)
        out: list[list[float]] = []
        for _ in range(n):
            perm = struct.unpack_from(f"<{w}H", blob, pos)
            pos += w * 2
            deltas = struct.unpack_from(f"<{w}Q", blob, pos)
            pos += w * 8
            sorted_u = [deltas[0]]
            for i in range(1, w):
                sorted_u.append(sorted_u[-1] ^ deltas[i])
            sorted_vals = _u64s_to_floats(sorted_u)
            # Un-permute: result[perm[i]] = sorted_vals[i].
            result = [0.0] * w
            for i in range(w):
                result[perm[i]] = sorted_vals[i]
            out.append(result)
        return out


class FlatSortedDeltaOwnership(OwnershipCompressor):
    """Flatten the N×W ownership matrix into one length-N*W vector,
    sort globally, XOR-delta the sorted sequence, store the full
    permutation as uint32.

    The hypothesis: sorting across the whole bundle produces tighter
    value clustering than sorting within a single packet (the
    bundle has many cells with nearly identical settled-territory
    values; flat sort puts them all adjacent). XOR-deltas of those
    near-identical values have very long zero runs.

    Cost: N×W × 4 bytes for the permutation (uint32 because the
    flat index can exceed 65 535 for N > 181 on a 19x19 board).
    Total overhead vs Raw: 4 bytes per cell on top of 8, i.e. 50%
    before the codec. The codec has to compress the permutation
    well enough to make this worth it; permutations are essentially
    random sequences over the index range, so codec compression
    on them is limited.

    Blob: [varint N] [varint W]
          [N*W uint32 indices LE | N*W float64-bit-pattern uint64s,
           with index[0] storing the raw first sorted value's bit
           pattern and index[1..NW-1] storing XOR-deltas]
    """

    name = "FlatSortedDelta"

    def encode(self, arrays: list[list[float]]) -> bytes:
        n = len(arrays)
        w = _check_uniform_width(arrays)
        out = io.BytesIO()
        _write_uvarint(out, n)
        _write_uvarint(out, w)
        if n == 0 or w == 0:
            return out.getvalue()
        # Flatten in row-major (packet-major) order: flat[t*w + c] =
        # arrays[t][c]. Sort the flat indices by value.
        flat = [arrays[t][c] for t in range(n) for c in range(w)]
        total = n * w
        if total > 0xFFFFFFFF:
            # uint32 cap is 4.29B — well beyond any plausible bundle
            # size we'd see. Raise rather than truncate.
            raise ValueError(f"FlatSortedDelta: N*W={total} exceeds uint32 capacity")
        perm = sorted(range(total), key=flat.__getitem__)
        out.write(struct.pack(f"<{total}I", *perm))
        sorted_u = _floats_to_u64s([flat[i] for i in perm])
        deltas: list[int] = [sorted_u[0]]
        for i in range(1, total):
            deltas.append(sorted_u[i] ^ sorted_u[i - 1])
        out.write(struct.pack(f"<{total}Q", *deltas))
        return out.getvalue()

    def decode(self, blob: bytes) -> list[list[float]]:
        n, pos = _read_uvarint(blob, 0)
        w, pos = _read_uvarint(blob, pos)
        if n == 0 or w == 0:
            return []
        total = n * w
        perm = struct.unpack_from(f"<{total}I", blob, pos)
        pos += total * 4
        deltas = struct.unpack_from(f"<{total}Q", blob, pos)
        pos += total * 8
        sorted_u = [deltas[0]]
        for i in range(1, total):
            sorted_u.append(sorted_u[-1] ^ deltas[i])
        sorted_vals = _u64s_to_floats(sorted_u)
        # Un-permute back into row-major then unflatten.
        flat_out = [0.0] * total
        for i in range(total):
            flat_out[perm[i]] = sorted_vals[i]
        return [flat_out[t * w : (t + 1) * w] for t in range(n)]
