"""
research/compression/lossy_ownership.py

Lossy OwnershipCompressor variants. Each fits its quantisation /
codebook per-bundle (the user's directive: "Quantization would
happen per-game"). Reconstruction error is reported in L2 (RMSE
across all cells in the bundle) and L-infinity (worst per-cell
deviation).

Three families, three ways to spend the bit budget:

  UniformScalarQuantOwnership(bits)
      Fixed uniform bins over [-1, 1]. No training. Max abs error
      bounded by half-bin-width = 1 / 2^bits.

  KMeansScalarQuantOwnership(k)
      sklearn.cluster.KMeans on the bundle's flattened ownership
      values; replaces each cell with its cluster centroid. Better
      for non-uniform value distributions (ownership clusters at
      ±1 and 0 — fixed bins waste capacity on rarely-populated
      regions).

  ProductVQOwnership(m, k)
      Split each 361-cell map into M sub-vectors of W/M cells;
      fit one KMeans per sub-vector position; encode each map as
      M cluster indices. Codebooks are shared across the bundle's
      maps but specific to this bundle. Vector quantization
      captures spatial structure inside each sub-vector (a 19-cell
      "row" looks the same across many turns).

Per-bundle codebooks: encoder writes (codebook + indices); decoder
reads back the same. Generic codecs (Gzip/Zstd/Brotli) layered at
the bundle level still apply — they may compress the index
stream further.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import io
import struct
from typing import Any

import numpy as np
from sklearn.cluster import KMeans

# faiss is the standard library for vector-quantization codecs. We
# use it for ProductResidualQuantizer (PRVQ) since hand-rolling a
# correct residual-stage quantiser would be substantial work — and
# we want the result to be a fair baseline rather than a homegrown
# approximation. `faiss-cpu` is the CPU-only build; GPU not needed
# at our corpus size.
import faiss

from .ownership import OwnershipCompressor, _check_uniform_width
from .packed import _read_uvarint, _write_uvarint


# Deterministic seed for any internal random initialisation. Fixed so
# the bench produces reproducible numbers across runs.
RANDOM_STATE = 42


class LossyOwnershipCompressor(OwnershipCompressor):
    """Marker base class for lossy variants. Bench harness reads
    `is_lossless = False` to switch from roundtrip-bit-equality
    assertion to reconstruction-error measurement."""

    is_lossless = False

    def reconstruction_error(
        self,
        original: list[list[float]],
        decoded: list[list[float]],
    ) -> dict[str, float]:
        """L2 RMSE + L-infinity max-abs over all cells in the
        bundle. Caller may extend with per-bundle / per-cell
        breakdowns if needed."""
        if not original or not original[0]:
            return {"l2_rmse": 0.0, "max_abs": 0.0}
        orig = np.array(original, dtype=np.float64)
        recon = np.array(decoded, dtype=np.float64)
        diff = recon - orig
        return {
            "l2_rmse": float(np.sqrt(np.mean(diff ** 2))),
            "max_abs": float(np.max(np.abs(diff))),
        }


# ── Bit-packing helpers ─────────────────────────────────────────────────────
#
# Quantised values are integers in [0, 2^bits). We need to pack N of them
# into ceil(N * bits / 8) bytes. numpy handles 8-bit and 16-bit directly
# via dtype; the sub-byte cases (1, 2, 4 bits) use bit shifts.


def _pack_indices(indices: np.ndarray, bits: int) -> bytes:
    """Pack an integer array of values in [0, 2^bits) into a tight
    bitstream, little-bit-first within each byte."""
    n = indices.size
    if bits == 16:
        return indices.astype(np.uint16, copy=False).tobytes()
    if bits == 8:
        return indices.astype(np.uint8, copy=False).tobytes()
    if bits == 4:
        # Two values per byte: (high_nibble << 4) | low_nibble.
        # Pad to even length with a 0 in the high nibble.
        arr = indices.astype(np.uint8, copy=False)
        if n % 2:
            arr = np.concatenate([arr, np.zeros(1, dtype=np.uint8)])
        return (arr[0::2] | (arr[1::2] << 4)).tobytes()
    if bits == 2:
        # Four values per byte.
        arr = indices.astype(np.uint8, copy=False)
        pad = (-n) % 4
        if pad:
            arr = np.concatenate([arr, np.zeros(pad, dtype=np.uint8)])
        return (
            arr[0::4]
            | (arr[1::4] << 2)
            | (arr[2::4] << 4)
            | (arr[3::4] << 6)
        ).tobytes()
    if bits == 1:
        # Eight values per byte (little-bit-first via numpy.packbits
        # with bitorder='little').
        return np.packbits(indices.astype(np.uint8, copy=False), bitorder="little").tobytes()
    raise ValueError(f"unsupported bits={bits}; use 1, 2, 4, 8, or 16")


def _unpack_indices(blob: bytes, pos: int, n: int, bits: int) -> tuple[np.ndarray, int]:
    """Inverse of `_pack_indices`. Returns (np.ndarray of length n,
    advanced pos)."""
    if bits == 16:
        out = np.frombuffer(blob, dtype=np.uint16, count=n, offset=pos).copy()
        return out, pos + n * 2
    if bits == 8:
        out = np.frombuffer(blob, dtype=np.uint8, count=n, offset=pos).copy()
        return out, pos + n
    if bits == 4:
        n_bytes = (n + 1) // 2
        raw = np.frombuffer(blob, dtype=np.uint8, count=n_bytes, offset=pos)
        out = np.empty(n_bytes * 2, dtype=np.uint8)
        out[0::2] = raw & 0x0F
        out[1::2] = (raw >> 4) & 0x0F
        return out[:n].copy(), pos + n_bytes
    if bits == 2:
        n_bytes = (n + 3) // 4
        raw = np.frombuffer(blob, dtype=np.uint8, count=n_bytes, offset=pos)
        out = np.empty(n_bytes * 4, dtype=np.uint8)
        out[0::4] = raw & 0x03
        out[1::4] = (raw >> 2) & 0x03
        out[2::4] = (raw >> 4) & 0x03
        out[3::4] = (raw >> 6) & 0x03
        return out[:n].copy(), pos + n_bytes
    if bits == 1:
        n_bytes = (n + 7) // 8
        raw = np.frombuffer(blob, dtype=np.uint8, count=n_bytes, offset=pos)
        out = np.unpackbits(raw, bitorder="little")[:n].copy()
        return out, pos + n_bytes
    raise ValueError(f"unsupported bits={bits}; use 1, 2, 4, 8, or 16")


# ── Uniform scalar quantization ─────────────────────────────────────────────


class DeltaUniformScalarQuantOwnership(LossyOwnershipCompressor):
    """DPCM (differential pulse-code modulation) with uniform scalar
    quantization. Subtraction-type delta encoding — distinct from the
    XOR-delta lossless variants in `ownership.py` which preserved
    bit-exactness; here we're already in the lossy tier, so we use
    real arithmetic subtraction on float values.

    Encoding:
      1. First packet's values are quantised by `UniformScalarQuant`
         over [-1, 1] at `bits` bits per cell.
      2. The encoder reconstructs the first packet from those bin
         indices (the same value the decoder will see).
      3. For each subsequent packet t, the encoder computes
         delta = v[t] - reconstructed[t-1] cell-by-cell, clips to
         [-delta_range, +delta_range], and quantises over that
         narrower window at the same `bits`.
      4. Then it updates `reconstructed[t] = reconstructed[t-1] +
         dequantised(delta_q)` and proceeds.

    The DPCM loop bounds error accumulation: each step's quantisation
    error is `≤ delta_range / 2^bits`; long-run drift is controlled
    because the encoder uses the same approximation the decoder will
    reconstruct. Clip events on a delta exceeding `delta_range`
    contribute a one-time absolute error of `|delta| - delta_range`,
    but the next packet's delta is computed against the clipped
    value, so the error doesn't compound past that step.

    Why this might compress better than plain UniformQ at the same
    bits: deltas concentrate near 0 (most cells barely move turn-to-
    turn), so the index distribution is heavily peaked rather than
    uniform — codecs love that.

    Blob layout:
      [varint N] [varint W] [1 byte bits] [8 bytes delta_range float64]
      [packed indices for all N×W cells, packet-major; packet 0
       indices are over [-1, 1], packets 1..N-1 are over
       [-delta_range, +delta_range]]
    """

    def __init__(self, bits: int, delta_range: float = 0.5) -> None:
        if bits not in (1, 2, 4, 8, 16):
            raise ValueError(f"bits must be 1, 2, 4, 8, or 16; got {bits}")
        if not (0.0 < delta_range <= 2.0):
            raise ValueError(f"delta_range must be in (0, 2]; got {delta_range}")
        self.bits = bits
        self.n_bins = 1 << bits
        self.delta_range = float(delta_range)
        # Name includes both knobs since the cost/quality trade
        # depends on both.
        self.name = f"DeltaUQ{bits}b_dr{int(delta_range * 100):d}"

    def _quantise_range(self, values: np.ndarray, lo: float, hi: float) -> np.ndarray:
        v = np.clip(values, lo, hi)
        span = hi - lo
        idx = ((v - lo) * (self.n_bins / span)).astype(np.int64)
        return np.minimum(idx, self.n_bins - 1).astype(np.uint64)

    def _dequantise_range(self, indices: np.ndarray, lo: float, hi: float) -> np.ndarray:
        # Bin midpoint: lo + (idx + 0.5) * step where step = (hi-lo)/n_bins.
        span = hi - lo
        return lo + (indices.astype(np.float64) + 0.5) * (span / self.n_bins)

    def encode(self, arrays: list[list[float]]) -> bytes:
        n = len(arrays)
        w = _check_uniform_width(arrays)
        out = io.BytesIO()
        _write_uvarint(out, n)
        _write_uvarint(out, w)
        out.write(bytes([self.bits]))
        out.write(struct.pack("<d", self.delta_range))
        if n == 0 or w == 0:
            return out.getvalue()

        all_indices = np.zeros(n * w, dtype=np.uint64)
        first = np.array(arrays[0], dtype=np.float64)
        idx0 = self._quantise_range(first, -1.0, 1.0)
        all_indices[:w] = idx0
        # Reconstruct prev as the encoder simulates the decoder, so
        # subsequent deltas are computed against the same value the
        # decoder will see.
        recon_prev = self._dequantise_range(idx0, -1.0, 1.0)
        for t in range(1, n):
            cur = np.array(arrays[t], dtype=np.float64)
            delta = cur - recon_prev
            idx_t = self._quantise_range(delta, -self.delta_range, self.delta_range)
            all_indices[t * w : (t + 1) * w] = idx_t
            delta_dq = self._dequantise_range(idx_t, -self.delta_range, self.delta_range)
            recon_prev = recon_prev + delta_dq
        out.write(_pack_indices(all_indices, self.bits))
        return out.getvalue()

    def decode(self, blob: bytes) -> list[list[float]]:
        n, pos = _read_uvarint(blob, 0)
        w, pos = _read_uvarint(blob, pos)
        bits = blob[pos]
        pos += 1
        delta_range = struct.unpack_from("<d", blob, pos)[0]
        pos += 8
        if n == 0 or w == 0:
            return []
        idx, pos = _unpack_indices(blob, pos, n * w, bits)
        idx_mat = idx.reshape(n, w)
        out_rows: list[list[float]] = []
        recon = self._dequantise_range(idx_mat[0], -1.0, 1.0)
        out_rows.append(recon.tolist())
        for t in range(1, n):
            delta = self._dequantise_range(idx_mat[t], -delta_range, delta_range)
            recon = recon + delta
            out_rows.append(recon.tolist())
        return out_rows


class UniformScalarQuantOwnership(LossyOwnershipCompressor):
    """Map [-1, 1] to integer bin indices in [0, 2^bits) using
    uniform spacing; reconstruct as the bin midpoint.

    Bin i covers `[-1 + 2*i/2^bits, -1 + 2*(i+1)/2^bits)` with
    midpoint `-1 + (2*i + 1) / 2^bits`. Max absolute reconstruction
    error per cell is `1 / 2^bits` (half-bin-width).

    No codebook is stored — the encoding is fully determined by
    `bits`. Blob layout:
      [varint N] [varint W] [1 byte: bits] [packed index stream]
    """

    def __init__(self, bits: int) -> None:
        if bits not in (1, 2, 4, 8, 16):
            raise ValueError(f"bits must be 1, 2, 4, 8, or 16; got {bits}")
        self.bits = bits
        self.n_bins = 1 << bits
        self.name = f"UniformQ{bits}b"

    def _quantise(self, values: np.ndarray) -> np.ndarray:
        # values in [-1, 1] → bin indices in [0, n_bins - 1]
        v = np.clip(values, -1.0, 1.0)
        idx = ((v + 1.0) * (self.n_bins / 2.0)).astype(np.int64)
        # Edge case: v = +1 maps to n_bins exactly; clamp.
        return np.minimum(idx, self.n_bins - 1).astype(np.uint64)

    def _dequantise(self, indices: np.ndarray) -> np.ndarray:
        # Reconstruct as bin midpoint.
        return -1.0 + (indices.astype(np.float64) * 2.0 + 1.0) / self.n_bins

    def encode(self, arrays: list[list[float]]) -> bytes:
        n = len(arrays)
        w = _check_uniform_width(arrays)
        out = io.BytesIO()
        _write_uvarint(out, n)
        _write_uvarint(out, w)
        out.write(bytes([self.bits]))
        if n and w:
            flat = np.array(arrays, dtype=np.float64).reshape(-1)
            idx = self._quantise(flat)
            out.write(_pack_indices(idx, self.bits))
        return out.getvalue()

    def decode(self, blob: bytes) -> list[list[float]]:
        n, pos = _read_uvarint(blob, 0)
        w, pos = _read_uvarint(blob, pos)
        bits = blob[pos]
        pos += 1
        if bits != self.bits:
            raise ValueError(f"blob bits={bits} mismatches decoder bits={self.bits}")
        if n == 0 or w == 0:
            return []
        idx, pos = _unpack_indices(blob, pos, n * w, self.bits)
        flat = self._dequantise(idx)
        return flat.reshape(n, w).tolist()


# ── K-means scalar quantization ─────────────────────────────────────────────


class KMeansScalarQuantOwnership(LossyOwnershipCompressor):
    """Fit a 1D K-means clustering on the bundle's flattened
    ownership values (`sklearn.cluster.KMeans`); replace each cell
    with its assigned cluster centroid.

    Better than uniform when the value distribution is non-uniform.
    For ownership maps, values cluster at ±1 (settled territory)
    and 0 (dame). K-means allocates more centroids to densely-
    populated regions, lower error at the same bit budget.

    Per-bundle codebook: K float64 centroids stored once; each
    cell stored as a `bits = ceil(log2(K))` index.

    Blob layout:
      [varint N] [varint W] [varint K] [1 byte: bits-per-index]
      [K float64 centroids] [packed index stream]
    """

    def __init__(self, k: int) -> None:
        if k < 2:
            raise ValueError(f"k must be >= 2; got {k}")
        self.k = k
        # Choose the smallest supported bit-width that fits K codes.
        for candidate in (1, 2, 4, 8, 16):
            if (1 << candidate) >= k:
                self.bits = candidate
                break
        else:
            raise ValueError(f"k={k} exceeds 16-bit index width")
        self.name = f"KMeansQ{k}"

    def encode(self, arrays: list[list[float]]) -> bytes:
        n = len(arrays)
        w = _check_uniform_width(arrays)
        out = io.BytesIO()
        _write_uvarint(out, n)
        _write_uvarint(out, w)
        _write_uvarint(out, self.k)
        out.write(bytes([self.bits]))
        if n == 0 or w == 0:
            return out.getvalue()
        flat = np.array(arrays, dtype=np.float64).reshape(-1, 1)
        # Run K-means. `n_init=4` is a modest accuracy/speed trade
        # for the 1D case where many random inits converge anyway.
        km = KMeans(
            n_clusters=self.k,
            random_state=RANDOM_STATE,
            n_init=4,
        ).fit(flat)
        centroids = km.cluster_centers_.flatten()
        labels = km.labels_.astype(np.uint64)
        # Sort centroids for a canonical order — makes blobs across
        # encoder runs more stable even if K-means returns clusters
        # in a different order due to initialisation variance.
        order = np.argsort(centroids)
        inverse = np.argsort(order)
        sorted_centroids = centroids[order]
        relabeled = inverse[labels]
        out.write(struct.pack(f"<{self.k}d", *sorted_centroids))
        out.write(_pack_indices(relabeled, self.bits))
        return out.getvalue()

    def decode(self, blob: bytes) -> list[list[float]]:
        n, pos = _read_uvarint(blob, 0)
        w, pos = _read_uvarint(blob, pos)
        k, pos = _read_uvarint(blob, pos)
        bits = blob[pos]
        pos += 1
        centroids = np.array(struct.unpack_from(f"<{k}d", blob, pos), dtype=np.float64)
        pos += k * 8
        if n == 0 or w == 0:
            return []
        idx, pos = _unpack_indices(blob, pos, n * w, bits)
        flat = centroids[idx]
        return flat.reshape(n, w).tolist()


# ── Product Vector Quantization ─────────────────────────────────────────────


class ProductResidualVQOwnership(LossyOwnershipCompressor):
    """Product-residual vector quantisation via
    `faiss.ProductResidualQuantizer`. Splits each W-dim ownership
    vector into `nsplits` sub-vectors of W/nsplits dims; quantises
    each sub-vector in M_sub residual stages, with 2^nbits codes
    per stage. Total bits per packet = nsplits × M_sub × nbits.

    Why this should win over plain PVQ (no residual): residual
    stages refine the per-sub-vector reconstruction iteratively —
    stage 1 captures the dominant mode, stage 2 quantises the
    leftover residual, etc. Each additional stage halves the
    expected per-cell error (roughly) at the cost of more bits and
    a bigger codebook.

    Cost vs benefit at our corpus size (N=200ish maps per bundle):
    FAISS's clustering subroutine wants ~40×K training points to
    fit K centroids reliably; we have ~N, so for nbits=4 (K=16)
    we're at ~12× — borderline. FAISS warns ("clustering N points
    to K centroids") but proceeds; trained quality is somewhat
    degraded.

    Blob layout:
      [varint N] [varint W] [1 byte nsplits] [1 byte M_sub] [1 byte nbits]
      [1 byte code_size]
      [codebook: M_sub × 2^nbits × W float32s — total floats =
       M_sub × 2^nbits × W]
      [N × code_size bytes of codes]
    """

    def __init__(self, nsplits: int, m_sub: int, nbits: int) -> None:
        if nbits < 1 or nbits > 8:
            raise ValueError(f"nbits must be in [1, 8]; got {nbits}")
        if nsplits < 1 or m_sub < 1:
            raise ValueError(f"nsplits and m_sub must be >= 1")
        self.nsplits = nsplits
        self.m_sub = m_sub
        self.nbits = nbits
        self.name = f"PRVQ_ns{nsplits}_M{m_sub}_b{nbits}"

    def _make_quantiser(self, w: int) -> "faiss.ProductResidualQuantizer":
        if w % self.nsplits != 0:
            raise ValueError(
                f"PRVQ: W={w} not divisible by nsplits={self.nsplits}"
            )
        return faiss.ProductResidualQuantizer(
            w, self.nsplits, self.m_sub, self.nbits,
        )

    def encode(self, arrays: list[list[float]]) -> bytes:
        n = len(arrays)
        w = _check_uniform_width(arrays)
        out = io.BytesIO()
        _write_uvarint(out, n)
        _write_uvarint(out, w)
        if n == 0 or w == 0:
            # Header-only; downstream code can detect by N=0.
            out.write(bytes([self.nsplits, self.m_sub, self.nbits, 0]))
            return out.getvalue()

        X = np.array(arrays, dtype=np.float32)
        prq = self._make_quantiser(w)
        # FAISS prints "WARNING clustering ..." to stderr when the
        # data-per-centroid ratio is below ~40; that's noisy in a
        # bench loop and we accept the trained-quality hit as the
        # cost of doing PRVQ on small bundles. Could suppress via
        # faiss.cvar.distance_compute_min_k_reservoir or similar
        # but not done here.
        prq.train(X)
        codes = prq.compute_codes(X)  # shape (N, code_size)
        codebook = faiss.vector_to_array(prq.codebooks).astype(np.float32, copy=False)

        out.write(bytes([self.nsplits, self.m_sub, self.nbits, prq.code_size]))
        out.write(codebook.tobytes())
        out.write(codes.tobytes())
        return out.getvalue()

    def decode(self, blob: bytes) -> list[list[float]]:
        n, pos = _read_uvarint(blob, 0)
        w, pos = _read_uvarint(blob, pos)
        nsplits = blob[pos]
        m_sub = blob[pos + 1]
        nbits = blob[pos + 2]
        code_size = blob[pos + 3]
        pos += 4
        if n == 0 or w == 0:
            return []
        if (nsplits, m_sub, nbits) != (self.nsplits, self.m_sub, self.nbits):
            raise ValueError(
                f"blob params ({nsplits}, {m_sub}, {nbits}) mismatch decoder "
                f"({self.nsplits}, {self.m_sub}, {self.nbits})"
            )

        prq = self._make_quantiser(w)
        # The codebook count: M_sub × 2^nbits per split × all splits.
        # Total floats = nsplits × M_sub × 2^nbits × (W/nsplits) =
        # M_sub × 2^nbits × W.
        cb_floats = m_sub * (1 << nbits) * w
        codebook = np.frombuffer(blob, dtype=np.float32, count=cb_floats, offset=pos).copy()
        pos += cb_floats * 4
        # Mark trained (we're providing the codebook directly) and
        # restore via copy_array_to_vector.
        prq.is_trained = True
        faiss.copy_array_to_vector(codebook, prq.codebooks)

        codes = np.frombuffer(blob, dtype=np.uint8, count=n * code_size, offset=pos).reshape(n, code_size)
        pos += n * code_size
        # FAISS expects contiguous uint8 codes.
        recon = prq.decode(np.ascontiguousarray(codes))
        return recon.astype(np.float64).tolist()


class ProductVQOwnership(LossyOwnershipCompressor):
    """Split each W-cell ownership map into M sub-vectors of length
    W/M (W must be divisible by M); fit one KMeans per sub-vector
    position over all N maps in the bundle; encode each map as M
    cluster indices.

    For W=361 (19x19 board) the natural splits are M=19 (rows of
    19 cells) and M=1 (whole-map VQ). M=361 degenerates to
    scalar quantization.

    Codebook cost: M codebooks of K × (W/M) float64s = M*K*(W/M)*8
    = K * W * 8 bytes total. Equal to K full ownership maps.
    Index cost: N maps × M indices × ceil(log2 K) bits.

    Blob layout:
      [varint N] [varint W] [varint M] [varint K] [1 byte bits]
      [M codebooks: each K * (W/M) float64s]
      [N * M packed indices]
    """

    def __init__(self, m: int, k: int) -> None:
        if k < 2:
            raise ValueError(f"k must be >= 2; got {k}")
        if m < 1:
            raise ValueError(f"m must be >= 1; got {m}")
        self.m = m
        self.k = k
        for candidate in (1, 2, 4, 8, 16):
            if (1 << candidate) >= k:
                self.bits = candidate
                break
        else:
            raise ValueError(f"k={k} exceeds 16-bit index width")
        self.name = f"PVQ_m{m}_k{k}"

    def encode(self, arrays: list[list[float]]) -> bytes:
        n = len(arrays)
        w = _check_uniform_width(arrays)
        if n and w and w % self.m != 0:
            raise ValueError(
                f"ProductVQ: W={w} not divisible by M={self.m}; pick a divisor"
            )
        sub = w // self.m if w else 0
        out = io.BytesIO()
        _write_uvarint(out, n)
        _write_uvarint(out, w)
        _write_uvarint(out, self.m)
        _write_uvarint(out, self.k)
        out.write(bytes([self.bits]))
        if n == 0 or w == 0:
            return out.getvalue()

        # Reshape arrays to (n, m, sub) so we can index sub-vectors
        # by their position m.
        mat = np.array(arrays, dtype=np.float64).reshape(n, self.m, sub)
        # K-means cluster count must not exceed the number of unique
        # sub-vectors; for short bundles K may be too high. Clamp
        # silently rather than fail loud — the resulting codebook
        # has fewer-than-K effective centroids but encoding /
        # decoding still works at the same bit width.
        effective_k = min(self.k, n)
        all_codebooks = np.zeros((self.m, self.k, sub), dtype=np.float64)
        all_indices = np.zeros((n, self.m), dtype=np.uint64)
        for mi in range(self.m):
            samples = mat[:, mi, :]
            km = KMeans(
                n_clusters=effective_k,
                random_state=RANDOM_STATE,
                n_init=4,
            ).fit(samples)
            cb = km.cluster_centers_
            labels = km.labels_
            # Pad codebook to K rows if effective_k < K. Padded rows
            # are never referenced by any label but we still write
            # them so the blob's codebook count is K (decoder needs
            # to know).
            if cb.shape[0] < self.k:
                pad = np.zeros((self.k - cb.shape[0], sub), dtype=np.float64)
                cb = np.vstack([cb, pad])
            all_codebooks[mi] = cb
            all_indices[:, mi] = labels.astype(np.uint64)

        out.write(all_codebooks.tobytes())
        out.write(_pack_indices(all_indices.reshape(-1), self.bits))
        return out.getvalue()

    def decode(self, blob: bytes) -> list[list[float]]:
        n, pos = _read_uvarint(blob, 0)
        w, pos = _read_uvarint(blob, pos)
        m, pos = _read_uvarint(blob, pos)
        k, pos = _read_uvarint(blob, pos)
        bits = blob[pos]
        pos += 1
        if n == 0 or w == 0:
            return []
        sub = w // m
        codebook_bytes = m * k * sub * 8
        codebooks = np.frombuffer(
            blob, dtype=np.float64, count=m * k * sub, offset=pos
        ).reshape(m, k, sub).copy()
        pos += codebook_bytes
        idx, pos = _unpack_indices(blob, pos, n * m, bits)
        idx = idx.reshape(n, m)
        out_arr = np.zeros((n, m, sub), dtype=np.float64)
        for mi in range(m):
            out_arr[:, mi, :] = codebooks[mi][idx[:, mi]]
        return out_arr.reshape(n, w).tolist()
