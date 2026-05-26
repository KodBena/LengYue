"""
research/compression/framework/methods_baselines.py

The shipped + measured-in-this-arc compression methods, wrapped
as Method instances the framework can run end-to-end. Each
method's encode/decode is symmetric and lossy-or-not as
documented.

Methods:
  identity_float32     — lossless (sanity ceiling)
  uniform_q4           — Q4 ownership packing (the v2-quantized base)
  uniform_q8           — Q8 ownership packing (the v2-quantized-hifi base)
  byte_xor_q4          — Q4 + byte-level XOR delta (2026-05-26 winner)
  byte_xor_q8          — Q8 + byte-level XOR delta (hifi + XOR)

The wire bytes returned by each `encode` are the SPA-side
pre-brotli payload. Brotli is applied by the framework's
`measure_rate` separately. The reconstruction tensor returned
by `decode` is what the SPA's renderer would see.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import numpy as np

from .method import Method


OWNERSHIP_CELLS = 361


# ── Q4 ownership packing ────────────────────────────────────────────────────


def _q4_pack_single(ownership: np.ndarray) -> bytes:
    a = np.clip(ownership.astype(np.float64), -1.0, 1.0)
    idx = np.floor((a + 1.0) * 8.0).astype(np.int64)
    np.minimum(idx, 15, out=idx)
    np.maximum(idx, 0, out=idx)
    out = bytearray((OWNERSHIP_CELLS + 1) // 2)
    for i in range(OWNERSHIP_CELLS):
        if (i & 1) == 0:
            out[i >> 1] |= int(idx[i])
        else:
            out[i >> 1] |= int(idx[i]) << 4
    return bytes(out)


def _q4_unpack_single(packed: bytes) -> np.ndarray:
    out = np.zeros(OWNERSHIP_CELLS, dtype=np.float64)
    for i in range(OWNERSHIP_CELLS):
        b = packed[i >> 1]
        nibble = (b & 0x0f) if (i & 1) == 0 else ((b >> 4) & 0x0f)
        out[i] = -0.9375 + nibble * 0.125
    return out


# ── Q8 ownership packing ────────────────────────────────────────────────────


def _q8_pack_single(ownership: np.ndarray) -> bytes:
    a = np.clip(ownership.astype(np.float64), -1.0, 1.0)
    idx = np.floor((a + 1.0) * 128.0).astype(np.int64)
    np.minimum(idx, 255, out=idx)
    np.maximum(idx, 0, out=idx)
    return bytes(idx.astype(np.uint8))


def _q8_unpack_single(packed: bytes) -> np.ndarray:
    idx = np.frombuffer(packed, dtype=np.uint8)
    return -1.0 + (idx.astype(np.float64) + 0.5) / 128.0


# ── Identity float32 (lossless sanity ceiling) ──────────────────────────────


def _identity_encode(bundle: np.ndarray) -> bytes:
    return bundle.astype(np.float32).tobytes()


def _identity_decode(payload: bytes) -> np.ndarray:
    arr = np.frombuffer(payload, dtype=np.float32).astype(np.float64)
    n = len(arr) // OWNERSHIP_CELLS
    return arr.reshape(n, OWNERSHIP_CELLS)


IDENTITY_FLOAT32 = Method(
    name="identity-float32",
    encode=_identity_encode,
    decode=_identity_decode,
)


# ── Uniform Q4 (full-frame; the v2-quantized base) ──────────────────────────


def _q4_encode(bundle: np.ndarray) -> bytes:
    buf = bytearray()
    # 2-byte header: number of packets
    buf.extend(bundle.shape[0].to_bytes(2, "little"))
    for t in range(bundle.shape[0]):
        buf.extend(_q4_pack_single(bundle[t]))
    return bytes(buf)


def _q4_decode(payload: bytes) -> np.ndarray:
    n = int.from_bytes(payload[0:2], "little")
    pack_size = (OWNERSHIP_CELLS + 1) // 2
    out = np.zeros((n, OWNERSHIP_CELLS), dtype=np.float64)
    offset = 2
    for t in range(n):
        out[t] = _q4_unpack_single(payload[offset:offset + pack_size])
        offset += pack_size
    return out


UNIFORM_Q4 = Method(
    name="uniform-q4",
    encode=_q4_encode,
    decode=_q4_decode,
)


# ── Uniform Q8 (full-frame; the v2-quantized-hifi base) ─────────────────────


def _q8_encode(bundle: np.ndarray) -> bytes:
    buf = bytearray()
    buf.extend(bundle.shape[0].to_bytes(2, "little"))
    for t in range(bundle.shape[0]):
        buf.extend(_q8_pack_single(bundle[t]))
    return bytes(buf)


def _q8_decode(payload: bytes) -> np.ndarray:
    n = int.from_bytes(payload[0:2], "little")
    pack_size = OWNERSHIP_CELLS
    out = np.zeros((n, OWNERSHIP_CELLS), dtype=np.float64)
    offset = 2
    for t in range(n):
        out[t] = _q8_unpack_single(payload[offset:offset + pack_size])
        offset += pack_size
    return out


UNIFORM_Q8 = Method(
    name="uniform-q8",
    encode=_q8_encode,
    decode=_q8_decode,
)


# ── Byte-XOR Q4 (the 2026-05-26 winner) ─────────────────────────────────────


def _byte_xor_q4_encode(bundle: np.ndarray) -> bytes:
    """I-frame: first packet's full Q4. P-frames: prev XOR curr Q4."""
    buf = bytearray()
    buf.extend(bundle.shape[0].to_bytes(2, "little"))
    if bundle.shape[0] == 0:
        return bytes(buf)
    prev = _q4_pack_single(bundle[0])
    buf.extend(prev)
    for t in range(1, bundle.shape[0]):
        curr = _q4_pack_single(bundle[t])
        xor = bytes(a ^ b for a, b in zip(prev, curr))
        buf.extend(xor)
        prev = curr
    return bytes(buf)


def _byte_xor_q4_decode(payload: bytes) -> np.ndarray:
    n = int.from_bytes(payload[0:2], "little")
    pack_size = (OWNERSHIP_CELLS + 1) // 2
    out = np.zeros((n, OWNERSHIP_CELLS), dtype=np.float64)
    if n == 0:
        return out
    offset = 2
    # I-frame: literal Q4 bytes
    prev = bytes(payload[offset:offset + pack_size])
    offset += pack_size
    out[0] = _q4_unpack_single(prev)
    for t in range(1, n):
        xor = bytes(payload[offset:offset + pack_size])
        offset += pack_size
        curr = bytes(a ^ b for a, b in zip(prev, xor))
        out[t] = _q4_unpack_single(curr)
        prev = curr
    return out


BYTE_XOR_Q4 = Method(
    name="byte-xor-q4",
    encode=_byte_xor_q4_encode,
    decode=_byte_xor_q4_decode,
)


# ── Byte-XOR Q8 (the hifi + XOR variant) ────────────────────────────────────


def _byte_xor_q8_encode(bundle: np.ndarray) -> bytes:
    buf = bytearray()
    buf.extend(bundle.shape[0].to_bytes(2, "little"))
    if bundle.shape[0] == 0:
        return bytes(buf)
    prev = _q8_pack_single(bundle[0])
    buf.extend(prev)
    for t in range(1, bundle.shape[0]):
        curr = _q8_pack_single(bundle[t])
        xor = bytes(a ^ b for a, b in zip(prev, curr))
        buf.extend(xor)
        prev = curr
    return bytes(buf)


def _byte_xor_q8_decode(payload: bytes) -> np.ndarray:
    n = int.from_bytes(payload[0:2], "little")
    pack_size = OWNERSHIP_CELLS
    out = np.zeros((n, OWNERSHIP_CELLS), dtype=np.float64)
    if n == 0:
        return out
    offset = 2
    prev = bytes(payload[offset:offset + pack_size])
    offset += pack_size
    out[0] = _q8_unpack_single(prev)
    for t in range(1, n):
        xor = bytes(payload[offset:offset + pack_size])
        offset += pack_size
        curr = bytes(a ^ b for a, b in zip(prev, xor))
        out[t] = _q8_unpack_single(curr)
        prev = curr
    return out


BYTE_XOR_Q8 = Method(
    name="byte-xor-q8",
    encode=_byte_xor_q8_encode,
    decode=_byte_xor_q8_decode,
)


# ── Bundle-mean + Q4-residual (the Q4+residual hybrid from §4.4) ────────────
#
# Motivated by the variance-decomposition finding: BS accounts for
# 66% of corpus variance. The per-cell bundle mean μ_bs(b,s) is
# nearly stable across packets within a bundle. Encoding it once
# per bundle (at Q8 precision) and per-packet residuals r = v - μ_bs
# directly targets the BS structure.
#
# Why L∞ improves: residuals are bounded by the bundle's observed
# residual range [r_min, r_max], typically [-0.5, 0.5]-ish (within
# a bundle, ownership rarely flips by more than 1). Q4 over a
# smaller range gives tighter bins; max-abs scales linearly with
# the range. If the residual range is [-0.5, 0.5], Q4 max-abs is
# (1/16) × 1 = 0.0625 → 0.5/16 = 0.03125, exactly half of uniform
# Q4 over [-1, 1].
#
# Wire shape per bundle:
#   2 bytes: N_packets (uint16)
#   361 bytes: bundle mean μ_bs at Q8 (one byte per cell, over [-1, 1])
#   4 bytes: r_min (float32)
#   4 bytes: r_max (float32)
#   per packet: 181 bytes (Q4 residual packing over [r_min, r_max])
#
# Per-bundle overhead: 371 bytes (one-time). Per-packet bytes:
# 181 (same as uniform Q4). For typical 200-packet bundles, the
# overhead is ~1% — small compared to the L∞ improvement.


def _q4_pack_residual(residual: np.ndarray, r_min: float, r_max: float) -> bytes:
    """Q4-quantise `residual` (361 floats) over [r_min, r_max].
    Returns 181 bytes, two cells per byte (low nibble first)."""
    if r_max <= r_min:
        # Degenerate range; pack as all zeros.
        return bytes((OWNERSHIP_CELLS + 1) // 2)
    span = r_max - r_min
    a = np.clip(residual.astype(np.float64), r_min, r_max)
    idx = np.floor((a - r_min) / span * 16.0).astype(np.int64)
    np.minimum(idx, 15, out=idx)
    np.maximum(idx, 0, out=idx)
    out = bytearray((OWNERSHIP_CELLS + 1) // 2)
    for i in range(OWNERSHIP_CELLS):
        if (i & 1) == 0:
            out[i >> 1] |= int(idx[i])
        else:
            out[i >> 1] |= int(idx[i]) << 4
    return bytes(out)


def _q4_unpack_residual(packed: bytes, r_min: float, r_max: float) -> np.ndarray:
    if r_max <= r_min:
        return np.zeros(OWNERSHIP_CELLS, dtype=np.float64)
    span = r_max - r_min
    bin_width = span / 16.0
    out = np.zeros(OWNERSHIP_CELLS, dtype=np.float64)
    for i in range(OWNERSHIP_CELLS):
        b = packed[i >> 1]
        nibble = (b & 0x0f) if (i & 1) == 0 else ((b >> 4) & 0x0f)
        out[i] = r_min + (nibble + 0.5) * bin_width
    return out


def _mean_q4_residual_encode(bundle: np.ndarray) -> bytes:
    T = bundle.shape[0]
    mu_bs = bundle.mean(axis=0)  # (361,) per-cell bundle mean
    residual = bundle - mu_bs    # (T, 361)
    r_min = float(residual.min())
    r_max = float(residual.max())
    buf = bytearray()
    buf.extend(T.to_bytes(2, "little"))
    buf.extend(_q8_pack_single(mu_bs))  # 361 bytes
    buf.extend(np.float32(r_min).tobytes())  # 4 bytes
    buf.extend(np.float32(r_max).tobytes())  # 4 bytes
    for t in range(T):
        buf.extend(_q4_pack_residual(residual[t], r_min, r_max))
    return bytes(buf)


def _mean_q4_residual_decode(payload: bytes) -> np.ndarray:
    T = int.from_bytes(payload[0:2], "little")
    offset = 2
    mu_bs = _q8_unpack_single(payload[offset:offset + OWNERSHIP_CELLS])
    offset += OWNERSHIP_CELLS
    r_min = float(np.frombuffer(payload[offset:offset + 4], dtype=np.float32)[0])
    offset += 4
    r_max = float(np.frombuffer(payload[offset:offset + 4], dtype=np.float32)[0])
    offset += 4
    pack_size = (OWNERSHIP_CELLS + 1) // 2
    out = np.zeros((T, OWNERSHIP_CELLS), dtype=np.float64)
    for t in range(T):
        r_t = _q4_unpack_residual(payload[offset:offset + pack_size], r_min, r_max)
        out[t] = mu_bs + r_t
        offset += pack_size
    return out


MEAN_PLUS_Q4_RESIDUAL = Method(
    name="bundle-mean+q4-residual",
    encode=_mean_q4_residual_encode,
    decode=_mean_q4_residual_decode,
)


# ── Bundle-mean + Q4-residual + PER-CELL range tracking ────────────────────
#
# The previous variant uses a global per-bundle residual range
# [r_min, r_max]. The framework run revealed this regresses L∞
# because the WIDEST per-cell residual range determines bin width
# for ALL cells.
#
# Per-cell range tracking: each cell has its own (r_min[s], r_max[s]).
# Cells with stable values get tight bins; volatile cells get the
# Q4 binning they'd have under uniform Q4. Net: every cell's
# reconstruction is at LEAST as good as uniform Q4 in L∞ terms.
#
# Overhead: 361 cells × 2 Q8 values (r_min, r_max stored as Q8
# over [-2, 2] since residuals can span [-2, 2]) = 722 bytes per
# bundle. Compared to uniform-Q4's 36KB per bundle, this is ~2%
# overhead — modest.


def _q8_pack_range_2(x: np.ndarray) -> np.ndarray:
    """Q8 over [-2, 2] — residuals can theoretically span [-2, 2]
    when a cell flips and the bundle mean is at the opposite
    extreme. Bin width 4/256 = 0.015625."""
    a = np.clip(x.astype(np.float64), -2.0, 2.0)
    idx = np.floor((a + 2.0) * 64.0).astype(np.int64)
    np.minimum(idx, 255, out=idx)
    np.maximum(idx, 0, out=idx)
    return idx.astype(np.uint8)


def _q8_unpack_range_2(idx: np.ndarray) -> np.ndarray:
    return -2.0 + (idx.astype(np.float64) + 0.5) / 64.0


def _q4_pack_residual_per_cell(
    residual: np.ndarray,
    r_min: np.ndarray,
    r_max: np.ndarray,
) -> bytes:
    """Q4-quantise each cell's residual over its own per-cell range."""
    span = np.where(r_max > r_min, r_max - r_min, 1.0)
    a = np.clip(residual.astype(np.float64), r_min, r_max)
    idx = np.floor((a - r_min) / span * 16.0).astype(np.int64)
    np.minimum(idx, 15, out=idx)
    np.maximum(idx, 0, out=idx)
    out = bytearray((OWNERSHIP_CELLS + 1) // 2)
    for i in range(OWNERSHIP_CELLS):
        if (i & 1) == 0:
            out[i >> 1] |= int(idx[i])
        else:
            out[i >> 1] |= int(idx[i]) << 4
    return bytes(out)


def _q4_unpack_residual_per_cell(
    packed: bytes,
    r_min: np.ndarray,
    r_max: np.ndarray,
) -> np.ndarray:
    out = np.zeros(OWNERSHIP_CELLS, dtype=np.float64)
    span = r_max - r_min
    for i in range(OWNERSHIP_CELLS):
        b = packed[i >> 1]
        nibble = (b & 0x0f) if (i & 1) == 0 else ((b >> 4) & 0x0f)
        if span[i] > 0:
            out[i] = r_min[i] + (nibble + 0.5) * span[i] / 16.0
        else:
            out[i] = r_min[i]  # degenerate: cell never moved
    return out


def _mean_q4_residual_per_cell_encode(bundle: np.ndarray) -> bytes:
    T = bundle.shape[0]
    mu_bs = bundle.mean(axis=0)  # (361,)
    residual = bundle - mu_bs    # (T, 361)
    # Per-cell residual range
    r_min = residual.min(axis=0)  # (361,)
    r_max = residual.max(axis=0)  # (361,)
    buf = bytearray()
    buf.extend(T.to_bytes(2, "little"))
    buf.extend(_q8_pack_single(mu_bs))        # 361 bytes
    buf.extend(_q8_pack_range_2(r_min).tobytes())  # 361 bytes
    buf.extend(_q8_pack_range_2(r_max).tobytes())  # 361 bytes
    for t in range(T):
        buf.extend(_q4_pack_residual_per_cell(residual[t], r_min, r_max))
    return bytes(buf)


def _mean_q4_residual_per_cell_decode(payload: bytes) -> np.ndarray:
    T = int.from_bytes(payload[0:2], "little")
    offset = 2
    mu_bs = _q8_unpack_single(payload[offset:offset + OWNERSHIP_CELLS])
    offset += OWNERSHIP_CELLS
    r_min_q8 = np.frombuffer(
        payload[offset:offset + OWNERSHIP_CELLS], dtype=np.uint8,
    )
    offset += OWNERSHIP_CELLS
    r_max_q8 = np.frombuffer(
        payload[offset:offset + OWNERSHIP_CELLS], dtype=np.uint8,
    )
    offset += OWNERSHIP_CELLS
    r_min = _q8_unpack_range_2(r_min_q8)
    r_max = _q8_unpack_range_2(r_max_q8)
    pack_size = (OWNERSHIP_CELLS + 1) // 2
    out = np.zeros((T, OWNERSHIP_CELLS), dtype=np.float64)
    for t in range(T):
        r_t = _q4_unpack_residual_per_cell(
            payload[offset:offset + pack_size], r_min, r_max,
        )
        out[t] = mu_bs + r_t
        offset += pack_size
    return out


MEAN_PLUS_Q4_RESIDUAL_PER_CELL = Method(
    name="bundle-mean+q4-residual-percell",
    encode=_mean_q4_residual_per_cell_encode,
    decode=_mean_q4_residual_per_cell_decode,
)


# ── bundle-mean + Q4-residual + byte-XOR on the residual stream ─────────────
#
# Layer the byte-XOR temporal-coding trick on top of the
# bundle-mean+Q4-residual encoder. The bundle-mean subtracts the
# BS structure (66% of variance); the Q4-residual encodes the
# remaining R-like signal; byte-XOR exploits byte-level temporal
# correlation in the residual stream.
#
# Hypothesis: residual values cluster around 0 (most cells stable
# within a bundle), so byte-XOR on the Q4-packed residuals should
# produce LOTS of literal zeros (consecutive packets' residual
# nibbles match for stable cells). Brotli eats these efficiently.
#
# Compared to bundle-mean+q4-residual: same L∞ (0.099 for global
# range, 0.070 for per-cell), potentially fewer post-brotli bytes.


def _mean_q4_residual_xor_encode(bundle: np.ndarray) -> bytes:
    """Global-range Q4 residual + byte-XOR across packets."""
    T = bundle.shape[0]
    mu_bs = bundle.mean(axis=0)
    residual = bundle - mu_bs
    r_min = float(residual.min())
    r_max = float(residual.max())
    buf = bytearray()
    buf.extend(T.to_bytes(2, "little"))
    buf.extend(_q8_pack_single(mu_bs))
    buf.extend(np.float32(r_min).tobytes())
    buf.extend(np.float32(r_max).tobytes())
    if T == 0:
        return bytes(buf)
    # I-frame: first packet literally
    prev = _q4_pack_residual(residual[0], r_min, r_max)
    buf.extend(prev)
    for t in range(1, T):
        curr = _q4_pack_residual(residual[t], r_min, r_max)
        xor = bytes(a ^ b for a, b in zip(prev, curr))
        buf.extend(xor)
        prev = curr
    return bytes(buf)


def _mean_q4_residual_xor_decode(payload: bytes) -> np.ndarray:
    T = int.from_bytes(payload[0:2], "little")
    offset = 2
    mu_bs = _q8_unpack_single(payload[offset:offset + OWNERSHIP_CELLS])
    offset += OWNERSHIP_CELLS
    r_min = float(np.frombuffer(payload[offset:offset + 4], dtype=np.float32)[0])
    offset += 4
    r_max = float(np.frombuffer(payload[offset:offset + 4], dtype=np.float32)[0])
    offset += 4
    pack_size = (OWNERSHIP_CELLS + 1) // 2
    out = np.zeros((T, OWNERSHIP_CELLS), dtype=np.float64)
    if T == 0:
        return out
    # I-frame
    prev = bytes(payload[offset:offset + pack_size])
    offset += pack_size
    out[0] = mu_bs + _q4_unpack_residual(prev, r_min, r_max)
    for t in range(1, T):
        xor = bytes(payload[offset:offset + pack_size])
        offset += pack_size
        curr = bytes(a ^ b for a, b in zip(prev, xor))
        out[t] = mu_bs + _q4_unpack_residual(curr, r_min, r_max)
        prev = curr
    return out


MEAN_PLUS_Q4_RESIDUAL_XOR = Method(
    name="bundle-mean+q4-residual+xor",
    encode=_mean_q4_residual_xor_encode,
    decode=_mean_q4_residual_xor_decode,
)


def _mean_q4_residual_percell_xor_encode(bundle: np.ndarray) -> bytes:
    """Per-cell range Q4 residual + byte-XOR across packets."""
    T = bundle.shape[0]
    mu_bs = bundle.mean(axis=0)
    residual = bundle - mu_bs
    r_min = residual.min(axis=0)
    r_max = residual.max(axis=0)
    buf = bytearray()
    buf.extend(T.to_bytes(2, "little"))
    buf.extend(_q8_pack_single(mu_bs))
    buf.extend(_q8_pack_range_2(r_min).tobytes())
    buf.extend(_q8_pack_range_2(r_max).tobytes())
    if T == 0:
        return bytes(buf)
    prev = _q4_pack_residual_per_cell(residual[0], r_min, r_max)
    buf.extend(prev)
    for t in range(1, T):
        curr = _q4_pack_residual_per_cell(residual[t], r_min, r_max)
        xor = bytes(a ^ b for a, b in zip(prev, curr))
        buf.extend(xor)
        prev = curr
    return bytes(buf)


def _mean_q4_residual_percell_xor_decode(payload: bytes) -> np.ndarray:
    T = int.from_bytes(payload[0:2], "little")
    offset = 2
    mu_bs = _q8_unpack_single(payload[offset:offset + OWNERSHIP_CELLS])
    offset += OWNERSHIP_CELLS
    r_min_q8 = np.frombuffer(
        payload[offset:offset + OWNERSHIP_CELLS], dtype=np.uint8,
    )
    offset += OWNERSHIP_CELLS
    r_max_q8 = np.frombuffer(
        payload[offset:offset + OWNERSHIP_CELLS], dtype=np.uint8,
    )
    offset += OWNERSHIP_CELLS
    r_min = _q8_unpack_range_2(r_min_q8)
    r_max = _q8_unpack_range_2(r_max_q8)
    pack_size = (OWNERSHIP_CELLS + 1) // 2
    out = np.zeros((T, OWNERSHIP_CELLS), dtype=np.float64)
    if T == 0:
        return out
    prev = bytes(payload[offset:offset + pack_size])
    offset += pack_size
    out[0] = mu_bs + _q4_unpack_residual_per_cell(prev, r_min, r_max)
    for t in range(1, T):
        xor = bytes(payload[offset:offset + pack_size])
        offset += pack_size
        curr = bytes(a ^ b for a, b in zip(prev, xor))
        out[t] = mu_bs + _q4_unpack_residual_per_cell(curr, r_min, r_max)
        prev = curr
    return out


MEAN_PLUS_Q4_RESIDUAL_PER_CELL_XOR = Method(
    name="bundle-mean+q4-residual-percell+xor",
    encode=_mean_q4_residual_percell_xor_encode,
    decode=_mean_q4_residual_percell_xor_decode,
)


# ── The full baseline suite ─────────────────────────────────────────────────


BASELINES = [
    IDENTITY_FLOAT32,
    UNIFORM_Q4,
    UNIFORM_Q8,
    BYTE_XOR_Q4,
    BYTE_XOR_Q8,
    MEAN_PLUS_Q4_RESIDUAL,
    MEAN_PLUS_Q4_RESIDUAL_XOR,
    MEAN_PLUS_Q4_RESIDUAL_PER_CELL,
    MEAN_PLUS_Q4_RESIDUAL_PER_CELL_XOR,
]
