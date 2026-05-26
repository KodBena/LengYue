"""
research/compression/probe_wavelet_per_cell.py

Revised: 1D wavelet compression on a per-cell time-axis basis,
using pywt and matched-precision comparison against Q4 baselines.

Why the previous version was wrong (same correction as PCA probe)
═════════════════════════════════════════════════════════════════
- Previous version stored coefficients at float32 with a 2-byte
  cell-index sidecar per kept coefficient. The per-coefficient
  overhead made the wire so big that even lossless wavelet was
  25× larger than Q4 — an apples-to-oranges precision mismatch.
- Wavelets, like PCA, are basis-change projections; they cannot
  enlarge the data at full precision + no truncation. The
  apparent enlargement was the float-vs-Q4 mismatch.

This revised probe:
  - Uses pywt's `wavedec` / `waverec` (Daubechies-4 = 'db4')
    for the wavelet decomposition. Multi-level pyramid.
  - Quantises kept coefficients at Q8 within per-level ranges
    (energy is concentrated at coarse levels; per-level
    quantisation tracks that).
  - Threshold cuts: sweeps a few cuts that retain a target
    fraction of total signal energy.
  - For each cell, stores: per-level kept-coefficient counts +
    Q8-packed values. No per-coefficient sidecar — coefficient
    indices within a level are implicit by retention order
    (top-magnitude wins). Indices ARE stored within each level
    since which coefficients are kept varies.
  - Reports per-bundle bytes (no global anything; each game's
    wavelet decomposition is bundle-local) and reconstruction
    max-abs.

Even with this corrected framing, my expectation matches the
PCA finding: per-cell L1/L2-thresholded wavelet truncation
optimises total energy, not per-cell L∞ error. Q4 uniform
quantisation has tighter L∞ guarantees per cell. Different
geometric criteria.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pickle
import statistics
from collections import defaultdict

import brotli
import numpy as np
import pywt
import redis


OWNERSHIP_CELLS = 361
WAVELET = "db4"


def q4_pack(ownership: list[float]) -> bytes:
    a = np.clip(np.asarray(ownership, dtype=np.float64), -1.0, 1.0)
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


def load_games(r: redis.Redis) -> dict[str, list[list[float]]]:
    keys = sorted(k.decode() for k in r.keys("traj:*:r0"))
    by_stem_turn: dict[tuple[str, int], list[float]] = {}
    for k in keys:
        parts = k.split(":")
        stem = parts[1]
        turn = int(parts[2][1:])
        entries = r.xrange(k, "-", "+")
        if not entries:
            continue
        _, fields = entries[0]
        packet = pickle.loads(fields[b"msg"])
        if packet.get("isDuringSearch"):
            continue
        own = packet.get("ownership")
        if own is None or len(own) != OWNERSHIP_CELLS:
            continue
        by_stem_turn[(stem, turn)] = own
    games: dict[str, list[list[float]]] = defaultdict(list)
    for (stem, _turn), own in sorted(by_stem_turn.items()):
        games[stem].append(own)
    return games


def q8_pack_range(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    if hi <= lo:
        return np.zeros(len(x), dtype=np.uint8)
    xc = np.clip(x, lo, hi)
    idx = np.floor((xc - lo) / (hi - lo) * 256.0).astype(np.int64)
    np.minimum(idx, 255, out=idx)
    np.maximum(idx, 0, out=idx)
    return idx.astype(np.uint8)


def q8_unpack_range(idx: np.ndarray, lo: float, hi: float) -> np.ndarray:
    if hi <= lo:
        return np.zeros(len(idx), dtype=np.float64)
    return lo + (idx.astype(np.float64) + 0.5) * ((hi - lo) / 256.0)


def threshold_by_energy(coeffs: np.ndarray, fraction: float) -> np.ndarray:
    """Return mask: True for coefficients to keep, chosen to retain
    `fraction` of squared energy."""
    if fraction >= 1.0:
        return np.ones_like(coeffs, dtype=bool)
    abs_sq = coeffs ** 2
    total = abs_sq.sum()
    if total <= 0:
        return np.zeros_like(coeffs, dtype=bool)
    order = np.argsort(-abs_sq)
    cum = np.cumsum(abs_sq[order])
    cutoff = int(np.searchsorted(cum, fraction * total))
    mask = np.zeros_like(coeffs, dtype=bool)
    mask[order[:min(cutoff + 1, len(coeffs))]] = True
    return mask


def wavelet_compress_bundle(
    ownerships: list[list[float]],
    energy_fraction: float,
    quantise_q8: bool,
) -> tuple[bytes, np.ndarray, float]:
    """Per-cell DB4 wavelet + per-cell energy threshold +
    optional Q8 quantisation of kept coefficients.

    Wire shape per cell:
      - 2-byte uint16: total coefficient count (N_coef)
      - 2-byte uint16: kept count
      - If quantise_q8:
        - 4 bytes float32: lo bound of kept values
        - 4 bytes float32: hi bound of kept values
        - 2 bytes per kept: uint16 index
        - 1 byte per kept: Q8 value
      - else (float32):
        - 2 bytes per kept: uint16 index
        - 4 bytes per kept: float32 value

    Returns (wire_bytes, recon_matrix, max_abs_error).
    """
    X = np.asarray(ownerships, dtype=np.float64)  # (N, 361)
    N = X.shape[0]
    buf = bytearray()
    buf.extend(N.to_bytes(2, "little"))
    recon_matrix = np.zeros_like(X)
    max_abs = 0.0
    for cell in range(OWNERSHIP_CELLS):
        ts = X[:, cell]
        # DB4 wavelet decomposition. Returns list of arrays:
        # [cA_n, cD_n, cD_{n-1}, ..., cD_1] where cA is coarsest
        # approximation and cD's are details from coarse to fine.
        coeffs_list = pywt.wavedec(ts, WAVELET, mode="periodization")
        flat = np.concatenate(coeffs_list)
        n_coef = len(flat)
        mask = threshold_by_energy(flat, energy_fraction)
        kept_idx = np.where(mask)[0].astype(np.uint16)
        kept_vals = flat[mask]
        # Apply threshold to coefficients, reconstruct.
        thresholded_flat = np.where(mask, flat, 0.0)
        # Re-split into per-level lists for waverec.
        sizes = [len(c) for c in coeffs_list]
        offset = 0
        thresholded_split = []
        for size in sizes:
            thresholded_split.append(thresholded_flat[offset:offset + size])
            offset += size
        if quantise_q8 and len(kept_vals) > 0:
            lo, hi = float(kept_vals.min()), float(kept_vals.max())
            q8 = q8_pack_range(kept_vals, lo, hi)
            recovered_vals = q8_unpack_range(q8, lo, hi)
            # Reconstruct with quantised values
            quantised_flat = thresholded_flat.copy()
            quantised_flat[mask] = recovered_vals
            offset = 0
            quantised_split = []
            for size in sizes:
                quantised_split.append(quantised_flat[offset:offset + size])
                offset += size
            recon = pywt.waverec(quantised_split, WAVELET, mode="periodization")
            buf.extend(n_coef.to_bytes(2, "little"))
            buf.extend(len(kept_vals).to_bytes(2, "little"))
            buf.extend(np.float32(lo).tobytes())
            buf.extend(np.float32(hi).tobytes())
            buf.extend(kept_idx.tobytes())
            buf.extend(q8.tobytes())
        else:
            recon = pywt.waverec(thresholded_split, WAVELET, mode="periodization")
            buf.extend(n_coef.to_bytes(2, "little"))
            buf.extend(len(kept_vals).to_bytes(2, "little"))
            if not quantise_q8:
                buf.extend(kept_idx.tobytes())
                buf.extend(kept_vals.astype(np.float32).tobytes())
        # pywt may return one extra sample due to mode; trim to N.
        recon = recon[:N]
        recon_matrix[:, cell] = recon
        cell_err = float(np.abs(recon - ts).max())
        if cell_err > max_abs:
            max_abs = cell_err
    return bytes(buf), recon_matrix, max_abs


def main() -> int:
    r = redis.Redis(host="127.0.0.1", port=6380, decode_responses=False)
    print("[1/3] loading corpus")
    games = load_games(r)
    n_packets = sum(len(v) for v in games.values())
    print(f"  {len(games)} games; {n_packets} ownership maps")

    # Baselines
    print()
    print("[2/3] baselines")
    full_q4_br = 0
    xor_q4_br = 0
    for stem in sorted(games):
        packed_list = [q4_pack(o) for o in games[stem]]
        full = b"".join(packed_list)
        xor = bytearray(packed_list[0])
        for i in range(1, len(packed_list)):
            xor.extend(bytes(a ^ b for a, b in zip(packed_list[i-1], packed_list[i])))
        full_q4_br += len(brotli.compress(full, quality=6))
        xor_q4_br += len(brotli.compress(bytes(xor), quality=6))
    print(f"  full Q4    post-brotli: {full_q4_br:>10,} bytes")
    print(f"  byte-XOR Q4 post-brotli:{xor_q4_br:>10,} bytes")

    print()
    print(f"[3/3] wavelet sweep ({WAVELET}, per-cell time-axis, periodization)")
    print()
    hdr = (f"{'variant':28s} {'pre-brotli':>11s} {'post-brotli':>12s} "
           f"{'vs xor':>8s} {'max-abs':>9s}")
    print(hdr)
    print("-" * len(hdr))

    print(f"{'full Q4 (baseline)':28s} "
          f"{1_466_462:>11,d} {full_q4_br:>12,d} "
          f"{full_q4_br/xor_q4_br:>7.3f}× {0.0625:>9.4f}")
    print(f"{'byte-XOR Q4 (current best)':28s} "
          f"{1_466_462:>11,d} {xor_q4_br:>12,d} "
          f"{1.000:>7.3f}× {0.0625:>9.4f}")
    print("- " * (len(hdr) // 2))

    for energy in (0.99, 0.999, 0.9999, 1.0):
        for q in (False, True):
            pre_total = 0
            br_total = 0
            max_abs_per_game = []
            for stem in sorted(games):
                wire, _, max_abs = wavelet_compress_bundle(
                    games[stem], energy, quantise_q8=q,
                )
                pre_total += len(wire)
                br_total += len(brotli.compress(wire, quality=6))
                max_abs_per_game.append(max_abs)
            label = f"db4 energy={energy:.4f} " + ("Q8" if q else "f32")
            print(f"{label:28s} "
                  f"{pre_total:>11,d} {br_total:>12,d} "
                  f"{br_total/xor_q4_br:>7.3f}× "
                  f"{statistics.mean(max_abs_per_game):>9.4f}  "
                  f"(worst {max(max_abs_per_game):.4f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
