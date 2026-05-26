"""
research/compression/probe_pca_ownership.py

Revised: synthetic probe of PCA-style subspace projection for
ownership compression, framed correctly.

Why the previous version was wrong
══════════════════════════════════
- It fit PCA *per-bundle* (one basis per game), counting the
  basis bytes as bundle overhead. That's an operational shape
  (shippable encoder choice), not the right framing for the
  research question "is the subspace structure worth chasing".
- It used float32 coefficients while comparing against Q4
  (0.5 byte / cell) baseline — comparing precisions, not
  techniques.

The user's framing (correct):
  > "PCA can never be worse than the actual data. None of the
  >  basis-change methods can — they are literally projections
  >  onto certain subspaces."

So this revised probe:
  - Fits **one global PCA basis** on all 8 102 ownership maps
    across the corpus. Treats the basis as shared infrastructure
    (shipped once with the SPA bundle, fetched at app boot, or
    embedded in the encoder library).
  - Q8-quantises **both** basis vectors and per-packet
    coefficients. 1 byte / element on both sides matches Q4
    ownership's bit-budget closely (Q4 ownership = 4 bits/cell
    = 0.5 byte/cell; Q8 PCA = 1 byte/coef × K coeffs/packet).
  - Reports per-bundle wire bytes (coefficients only) and a
    one-time basis overhead.
  - Compares against full-frame Q4 (baseline) and byte-XOR Q4
    (current best).

The Q8 quantisation is applied symmetrically:
  - Basis vectors: each element in [-1, 1] (eigenvectors are unit-
    norm so each element has magnitude < 1). Q8 max-abs ≤ 1/256
    per element.
  - Coefficients: range is the eigenvalues' magnitudes — much
    larger than [-1, 1]. We track per-coefficient ranges and
    Q8-quantise within each component's observed range.

Reconstruction error is reported per-cell max-abs across the
corpus.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pickle
import statistics
from collections import defaultdict

import brotli
import numpy as np
import redis


OWNERSHIP_CELLS = 361


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


def fit_global_pca(games: dict[str, list[list[float]]], k_max: int) -> tuple[np.ndarray, np.ndarray, list[tuple[float, float]]]:
    """Fit one PCA basis on the union of all games. Returns:
      - mean: 361 floats
      - basis: k_max × 361 float64 (eigenvectors, unit norm)
      - coeff_ranges: list of (min, max) per component, computed
        across the whole corpus (for Q8 quantisation later)
    """
    X = np.concatenate([np.asarray(games[s], dtype=np.float64) for s in sorted(games)], axis=0)
    print(f"  global X shape: {X.shape}")
    mean = X.mean(axis=0)
    Xc = X - mean
    # Use SVD (numerically stabler than eig on covariance).
    _, S, Vt = np.linalg.svd(Xc, full_matrices=False)
    print(f"  top-{min(k_max,len(S))} singular values: "
          f"{[f'{s:.1f}' for s in S[:min(k_max,len(S))]]}")
    print(f"  variance fraction at K=5: {(S[:5]**2).sum()/(S**2).sum():.4f}")
    print(f"  variance fraction at K=10: {(S[:10]**2).sum()/(S**2).sum():.4f}")
    print(f"  variance fraction at K=20: {(S[:20]**2).sum()/(S**2).sum():.4f}")
    print(f"  variance fraction at K=50: {(S[:50]**2).sum()/(S**2).sum():.4f}")
    basis = Vt[:k_max]  # (k_max, 361)
    # Project all data onto the top-k_max basis to find coefficient ranges.
    coeffs_all = Xc @ basis.T  # (N, k_max)
    coeff_ranges = [(float(coeffs_all[:, j].min()), float(coeffs_all[:, j].max())) for j in range(k_max)]
    return mean, basis, coeff_ranges


def q8_pack_unit_range(x: np.ndarray, lo: float = -1.0, hi: float = 1.0) -> np.ndarray:
    """Pack into [0, 255] using uniform-quant over [lo, hi]."""
    xc = np.clip(x, lo, hi)
    idx = np.floor((xc - lo) / (hi - lo) * 256.0).astype(np.int64)
    np.minimum(idx, 255, out=idx)
    np.maximum(idx, 0, out=idx)
    return idx.astype(np.uint8)


def q8_unpack_unit_range(idx: np.ndarray, lo: float = -1.0, hi: float = 1.0) -> np.ndarray:
    return lo + (idx.astype(np.float64) + 0.5) * ((hi - lo) / 256.0)


def measure_pca(
    games: dict[str, list[list[float]]],
    mean: np.ndarray,
    basis: np.ndarray,
    coeff_ranges: list[tuple[float, float]],
    k: int,
    quant: str,
) -> dict:
    """Encode each game's packets via the K-component PCA, with
    coefficients in either 'float32' or 'q8' precision.

    Returns aggregate stats: per-bundle bytes pre/post-brotli,
    basis bytes (one-time), reconstruction max-abs.
    """
    basis_k = basis[:k]  # (k, 361)
    # Basis byte cost (one-time, amortised across all bundles):
    if quant == "float32":
        basis_bytes = basis_k.astype(np.float32).tobytes() + mean.astype(np.float32).tobytes()
    elif quant == "q8":
        # Basis Q8 over [-1, 1] (eigenvectors are unit-norm so each
        # element has magnitude ≤ 1). Mean Q8 over [-1, 1] (ownership).
        basis_q8 = q8_pack_unit_range(basis_k, -1.0, 1.0)
        mean_q8 = q8_pack_unit_range(mean, -1.0, 1.0)
        basis_bytes = basis_q8.tobytes() + mean_q8.tobytes()
    else:
        raise ValueError(quant)

    per_bundle_pre = 0
    per_bundle_br = 0
    max_abs_per_game: list[float] = []

    for stem in sorted(games):
        X = np.asarray(games[stem], dtype=np.float64)
        N = X.shape[0]
        Xc = X - mean
        coeffs = Xc @ basis_k.T  # (N, k)

        if quant == "float32":
            wire = coeffs.astype(np.float32).tobytes()
            # Reconstruction
            recon = mean + coeffs @ basis_k
        elif quant == "q8":
            # Quantise each component within its observed range.
            coeffs_q8 = np.empty(coeffs.shape, dtype=np.uint8)
            for j in range(k):
                lo, hi = coeff_ranges[j]
                if hi <= lo:
                    coeffs_q8[:, j] = 0
                else:
                    coeffs_q8[:, j] = q8_pack_unit_range(coeffs[:, j], lo, hi)
            wire = coeffs_q8.tobytes()
            # Reconstruction: dequantise → reproject
            coeffs_dq = np.empty(coeffs.shape, dtype=np.float64)
            for j in range(k):
                lo, hi = coeff_ranges[j]
                coeffs_dq[:, j] = q8_unpack_unit_range(coeffs_q8[:, j], lo, hi)
            # Also dequantise the basis at Q8 if that's the precision.
            basis_dq = q8_unpack_unit_range(
                q8_pack_unit_range(basis_k, -1.0, 1.0), -1.0, 1.0,
            )
            mean_dq = q8_unpack_unit_range(
                q8_pack_unit_range(mean, -1.0, 1.0), -1.0, 1.0,
            )
            recon = mean_dq + coeffs_dq @ basis_dq

        per_bundle_pre += len(wire)
        per_bundle_br += len(brotli.compress(wire, quality=6))
        max_abs_per_game.append(float(np.abs(recon - X).max()))

    return {
        "k": k,
        "quant": quant,
        "basis_bytes": len(basis_bytes),
        "basis_br_bytes": len(brotli.compress(basis_bytes, quality=6)),
        "per_bundle_pre": per_bundle_pre,
        "per_bundle_br": per_bundle_br,
        "max_abs_mean": statistics.mean(max_abs_per_game),
        "max_abs_worst": max(max_abs_per_game),
    }


def main() -> int:
    r = redis.Redis(host="127.0.0.1", port=6380, decode_responses=False)
    print("[1/4] loading corpus")
    games = load_games(r)
    n_packets = sum(len(v) for v in games.values())
    print(f"  {len(games)} games; {n_packets} ownership maps")

    print()
    print("[2/4] fitting global PCA")
    mean, basis, coeff_ranges = fit_global_pca(games, k_max=200)

    # Baselines
    print()
    print("[3/4] computing Q4 baselines")
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

    print(f"  full Q4 post-brotli aggregate:    {full_q4_br:>10,} bytes")
    print(f"  byte-XOR Q4 post-brotli aggregate:{xor_q4_br:>10,} bytes")

    print()
    print("[4/4] PCA sweep with global basis")
    print()
    hdr = (f"{'variant':28s} "
           f"{'basis+br':>10s} "
           f"{'coefs+br':>10s} "
           f"{'total+br':>10s} "
           f"{'vs xor':>8s} "
           f"{'max-abs':>9s}")
    print(hdr)
    print("-" * len(hdr))

    print(f"{'full Q4 (baseline)':28s} "
          f"{0:>10,d} {full_q4_br:>10,d} {full_q4_br:>10,d} "
          f"{full_q4_br/xor_q4_br:>7.3f}× {0.0625:>9.4f}")
    print(f"{'byte-XOR Q4 (best so far)':28s} "
          f"{0:>10,d} {xor_q4_br:>10,d} {xor_q4_br:>10,d} "
          f"{1.000:>7.3f}× {0.0625:>9.4f}")
    print("- " * (len(hdr) // 2))

    for k in (5, 10, 20, 50, 100, 200):
        for quant in ("float32", "q8"):
            r = measure_pca(games, mean, basis, coeff_ranges, k, quant)
            total_br = r["basis_br_bytes"] + r["per_bundle_br"]
            label = f"PCA K={k} {quant}"
            print(f"{label:28s} "
                  f"{r['basis_br_bytes']:>10,d} "
                  f"{r['per_bundle_br']:>10,d} "
                  f"{total_br:>10,d} "
                  f"{total_br / xor_q4_br:>7.3f}× "
                  f"{r['max_abs_mean']:>9.4f}  (worst {r['max_abs_worst']:.4f})")

    print()
    print("Reading the table:")
    print("  basis+br  = global basis bytes (one-time, post-brotli)")
    print("  coefs+br  = per-bundle coefficients across all 40 bundles, post-brotli")
    print("  total+br  = basis + coefs (the actual total if the basis ships with the SPA)")
    print("  vs xor    = total / byte-XOR baseline")
    print("  max-abs   = mean per-cell reconstruction error, mean across games")
    print()
    print("Q4 baseline's max-abs is 0.0625; PCA variants with max-abs near or below")
    print("this are comparable on quality.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
