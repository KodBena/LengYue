"""
research/compression/framework/methods_ica.py

ICA-based compression methods, registered as Method instances
for the evaluation framework.

Motivation
══════════
The 2026-05-26 R-component-structure probe (`probe_r_component_structure.py`)
showed that the R (joint residual) component of the ownership
tensor has strongly non-Gaussian structure — ICA components have
kurtosis 8-15× higher than PCA's. ICA finds heavy-tailed
independent sources PCA misses.

The natural encoder shape:

  1. Per-bundle: compute the per-cell mean μ_bs(b,s) over packets.
     This captures the 66% BS component.
  2. Subtract μ_bs from each packet to get the R-like residual.
  3. Project residual onto top-K global ICA components (fit offline
     on the corpus).
  4. Q8-quantise the coefficients within their observed range per
     component.
  5. Wire: bundle-mean + per-packet coefficients.

The ICA basis is a global codebook fit once, amortised across
bundles. Per the framework's accounting, codebook bytes are
reported separately from per-bundle bytes.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .method import Method
from .methods_baselines import (
    OWNERSHIP_CELLS,
    _q8_pack_single,
    _q8_unpack_single,
)


@dataclass
class IcaState:
    """The global state ICA-on-R needs: the fitted ICA basis +
    coefficient-range table for Q8 quantisation."""
    mixing: np.ndarray            # (K, 361) — basis vectors (sources → cells)
    unmixing: np.ndarray          # (361, K) — inverse (cells → sources)
    mean: np.ndarray              # (361,) — ICA's own mean (subtracted before transform)
    coeff_min: np.ndarray         # (K,) — Q8 quantisation range lower bound per source
    coeff_max: np.ndarray         # (K,) — upper bound
    k: int


def _fit_ica_on_R(corpus: dict[str, np.ndarray], k: int, random_state: int = 42) -> IcaState:
    """Compute R residuals for every bundle, fit FastICA with K
    components, capture per-component coefficient ranges for Q8.

    R is computed via the same recipe as
    `framework/decomposition.py`:
      r(b,t,s) = v(b,t,s) + μ_b(b) - μ_bt(b,t) - μ_bs(b,s)
    """
    from sklearn.decomposition import FastICA

    # Stack all R packets
    all_R = []
    for stem in sorted(corpus):
        b = corpus[stem]
        mu_b = b.mean()
        mu_bt = b.mean(axis=1)  # (T_b,)
        mu_bs = b.mean(axis=0)  # (361,)
        r = b + mu_b - mu_bt[:, None] - mu_bs[None, :]
        all_R.append(r)
    R = np.concatenate(all_R, axis=0)  # (N_total, 361)

    ica = FastICA(
        n_components=k,
        random_state=random_state,
        max_iter=500,
        whiten="unit-variance",
    )
    sources = ica.fit_transform(R)  # (N_total, K)

    # Per-component coefficient range — Q8 quantises within this
    coeff_min = sources.min(axis=0)  # (K,)
    coeff_max = sources.max(axis=0)  # (K,)

    return IcaState(
        mixing=ica.mixing_.T,      # (K, 361) — components_ in skl 1.8 has this shape via .T
        unmixing=ica.components_.T,  # (361, K)
        mean=ica.mean_,             # (361,)
        coeff_min=coeff_min,
        coeff_max=coeff_max,
        k=k,
    )


# ── Q8 encode/decode for ICA coefficients ───────────────────────────────────


def _q8_pack_coeffs(coeffs: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> np.ndarray:
    """Q8-quantise per-source coefficients within per-source ranges.
    Returns uint8 array same shape as `coeffs`."""
    span = np.where(hi > lo, hi - lo, 1.0)
    a = np.clip(coeffs.astype(np.float64), lo, hi)
    idx = np.floor((a - lo) / span * 256.0).astype(np.int64)
    np.minimum(idx, 255, out=idx)
    np.maximum(idx, 0, out=idx)
    return idx.astype(np.uint8)


def _q8_unpack_coeffs(packed: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> np.ndarray:
    span = hi - lo
    return lo + (packed.astype(np.float64) + 0.5) * (span / 256.0)


# ── Encoder / decoder using ICA state ──────────────────────────────────────


def _ica_encode(state: IcaState, bundle: np.ndarray) -> bytes:
    """Encode bundle as: bundle-mean μ_bs (Q8) + per-packet
    aggregate μ_bt (Q8 over [-1, 1] each) + per-packet ICA
    coefficients (Q8 per component) on the doubly-residual.

    Both marginals must be subtracted to align with the residual
    the ICA basis was trained on.

    Reconstruction error sources:
      - Q8 on μ_bs: ≤ 1/256 per cell
      - Q8 on μ_bt: ≤ 1/256 per packet
      - ICA truncation (361-K dropped components → L∞ explosion
        on cells with concentrated residual energy)
      - Q8 on coefficients: per-component, scales with range
    """
    T = bundle.shape[0]
    mu_bs = bundle.mean(axis=0)             # (361,) — per-cell, per-bundle
    mu_bt = bundle.mean(axis=1)             # (T,)   — per-packet, per-bundle
    mu_b = bundle.mean()                    # scalar — per-bundle grand mean
    # The R-aligned residual: v - μ_bs - μ_bt + μ_b (subtract both
    # marginals, add back μ_b to compensate for double-subtraction
    # of the grand mean).
    residual = bundle - mu_bs[None, :] - mu_bt[:, None] + mu_b  # (T, 361)
    # ICA transforms expect data minus the ICA's training-set mean
    residual_centred = residual - state.mean
    coeffs = residual_centred @ state.unmixing  # (T, K) — sources
    # Q8 quantise coefficients
    packed = np.empty(coeffs.shape, dtype=np.uint8)
    for j in range(state.k):
        packed[:, j] = _q8_pack_coeffs(
            coeffs[:, j],
            np.full(T, state.coeff_min[j]),
            np.full(T, state.coeff_max[j]),
        )
    mu_bt_q8 = np.clip(
        np.floor((mu_bt + 1.0) * 128.0), 0, 255,
    ).astype(np.uint8)

    buf = bytearray()
    buf.extend(T.to_bytes(2, "little"))
    buf.extend(_q8_pack_single(mu_bs))      # 361 bytes
    buf.extend(np.float32(mu_b).tobytes())   # 4 bytes
    buf.extend(mu_bt_q8.tobytes())            # T bytes
    buf.extend(packed.tobytes())              # T × K bytes
    return bytes(buf)


def _ica_decode(state: IcaState, payload: bytes) -> np.ndarray:
    T = int.from_bytes(payload[0:2], "little")
    offset = 2
    mu_bs = _q8_unpack_single(payload[offset:offset + OWNERSHIP_CELLS])
    offset += OWNERSHIP_CELLS
    mu_b = float(np.frombuffer(payload[offset:offset + 4], dtype=np.float32)[0])
    offset += 4
    mu_bt_q8 = np.frombuffer(payload[offset:offset + T], dtype=np.uint8)
    offset += T
    mu_bt = -1.0 + (mu_bt_q8.astype(np.float64) + 0.5) / 128.0
    packed = np.frombuffer(
        payload[offset:offset + T * state.k], dtype=np.uint8,
    ).reshape(T, state.k)

    # Dequantise coefficients
    coeffs = np.empty(packed.shape, dtype=np.float64)
    for j in range(state.k):
        coeffs[:, j] = _q8_unpack_coeffs(
            packed[:, j],
            np.full(T, state.coeff_min[j]),
            np.full(T, state.coeff_max[j]),
        )
    # Inverse ICA: reconstruct R-aligned residual
    residual_centred = coeffs @ state.mixing  # (T, 361)
    residual = residual_centred + state.mean
    # Reconstruct: v ≈ μ_bs + μ_bt - μ_b + residual
    return mu_bs[None, :] + mu_bt[:, None] - mu_b + residual


def _make_ica_method(k: int) -> Method:
    """Construct a Method for the bundle-mean + ICA-K encoder."""
    return Method(
        name=f"bundle-mean+ica-K{k}",
        encode=_ica_encode,
        decode=_ica_decode,
        init=lambda corpus, k=k: _fit_ica_on_R(corpus, k=k),
        # Codebook bytes: ICA's mixing matrix (K × 361 float32) +
        # unmixing (same size) + mean (361 float32) + coeff ranges
        # (2*K float32). Stored once globally.
        codebook_bytes=(2 * k * OWNERSHIP_CELLS + OWNERSHIP_CELLS + 2 * k) * 4,
    )


ICA_K10 = _make_ica_method(10)
ICA_K20 = _make_ica_method(20)
ICA_K50 = _make_ica_method(50)
ICA_K100 = _make_ica_method(100)

ICA_METHODS = [ICA_K10, ICA_K20, ICA_K50, ICA_K100]
