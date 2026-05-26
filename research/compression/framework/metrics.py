"""
research/compression/framework/metrics.py

Distortion-vector + structure-capture + rate + operational-cost
measurement for the compression-evaluation framework.

Implements §3.3.2–3.3.4 + §3.4 of the linear-projection
investigation note. Each function is pure (no I/O, no module-
scope state) so the runner can compose them however needed.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import time
from typing import Optional

import brotli
import numpy as np

from .method import Method


# ── Rate ────────────────────────────────────────────────────────────────────


def measure_rate(
    corpus: dict[str, np.ndarray],
    method: Method,
    state: Optional[object] = None,
    brotli_quality: int = 6,
) -> dict[str, float]:
    """Measure per-bundle bytes pre- and post-brotli.

    Returns:
      mean_bytes: per-bundle mean of raw encode() output length
      mean_brotli_bytes: per-bundle mean of brotli-q6 wrapped
        output length
      total_bytes: sum across the corpus
      total_brotli_bytes: sum brotli-wrapped (this is the wire
        cost the SPA would see)
      codebook_bytes: globally-amortised codebook (one-time)
      codebook_brotli_bytes: brotli of the codebook
    """
    raw_sizes: list[int] = []
    brotli_sizes: list[int] = []
    for stem in sorted(corpus):
        bundle = corpus[stem]
        if state is None:
            raw = method.encode(bundle)
        else:
            raw = method.encode(state, bundle)  # type: ignore[arg-type]
        compressed = brotli.compress(raw, quality=brotli_quality)
        raw_sizes.append(len(raw))
        brotli_sizes.append(len(compressed))

    codebook = method.codebook_bytes
    codebook_brotli = 0
    # Approximation: methods that have non-trivial codebook can
    # expose its bytes; we don't have access to the raw codebook
    # payload here. The codebook_bytes field tells us the size.
    return {
        "mean_bytes": float(np.mean(raw_sizes)),
        "mean_brotli_bytes": float(np.mean(brotli_sizes)),
        "total_bytes": int(sum(raw_sizes)),
        "total_brotli_bytes": int(sum(brotli_sizes)),
        "codebook_bytes": codebook,
        "codebook_brotli_bytes": codebook_brotli,
    }


# ── Distortion vector ───────────────────────────────────────────────────────


def _jsd_on_softmaxed(p: np.ndarray, q: np.ndarray) -> float:
    """Normalised Jensen-Shannon divergence between two non-
    negative distributions, log base 2. Inputs are renormalised
    to sum-to-1 before the divergence is computed. Returns 0 if
    either distribution has zero mass."""
    p = np.maximum(p, 0)
    q = np.maximum(q, 0)
    ps = p.sum()
    qs = q.sum()
    if ps <= 0 or qs <= 0:
        return 0.0
    p = p / ps
    q = q / qs
    m = 0.5 * (p + q)
    mask = (p > 0) & (q > 0) & (m > 0)
    if not mask.any():
        return 0.0
    kl_pm = float(np.sum(p[mask] * np.log2(p[mask] / m[mask])))
    kl_qm = float(np.sum(q[mask] * np.log2(q[mask] / m[mask])))
    return 0.5 * (kl_pm + kl_qm)


def compute_distortion(
    corpus: dict[str, np.ndarray],
    method: Method,
    state: Optional[object] = None,
) -> dict[str, float]:
    """Measure the distortion vector for `method` against
    `corpus`. Decodes each encoded bundle and compares against
    the original.

    Returns:
      l_inf:        max over (b, t, s) of |v - v̂| across the corpus
      l_inf_p95:    95th percentile of per-bundle max |v - v̂|
      l_inf_p99:    99th percentile of per-bundle max |v - v̂|
      l2_rms:       RMS over all (b, t, s)
      l2_per_bundle_mean: per-bundle RMS, averaged across bundles
      jsd:          mean Jensen-Shannon divergence (cell-level
                    softmax-renormalised; ownership is a soft
                    probability surrogate so this is approximate)
    """
    all_abs_errors: list[float] = []  # max per (bundle)
    all_l2_per_bundle: list[float] = []
    all_jsds: list[float] = []
    global_max_abs = 0.0
    sum_sq = 0.0
    n_obs = 0
    for stem in sorted(corpus):
        orig = corpus[stem]
        if state is None:
            payload = method.encode(orig)
            recon = method.decode(payload)
        else:
            payload = method.encode(state, orig)  # type: ignore[arg-type]
            recon = method.decode(state, payload)  # type: ignore[arg-type]
        if recon.shape != orig.shape:
            raise ValueError(
                f"method '{method.name}' returned reconstruction "
                f"of shape {recon.shape}, expected {orig.shape}"
            )
        err = np.abs(recon - orig)
        bundle_max_abs = float(err.max())
        all_abs_errors.append(bundle_max_abs)
        if bundle_max_abs > global_max_abs:
            global_max_abs = bundle_max_abs
        sq = ((recon - orig) ** 2).sum()
        sum_sq += float(sq)
        n_obs += orig.size
        all_l2_per_bundle.append(float(np.sqrt(sq / orig.size)))
        # JSD per packet, averaged
        # Ownership is in [-1, 1]; map to [0, 1] for soft-prob view
        # (shift + clip; uses signed semantics directly is also valid
        # but the JSD math wants non-negative).
        for t in range(orig.shape[0]):
            p = orig[t] + 1.0  # [-1,1] -> [0,2]; just need non-neg
            q = recon[t] + 1.0
            all_jsds.append(_jsd_on_softmaxed(p, q))

    return {
        "l_inf": global_max_abs,
        "l_inf_p95": float(np.percentile(all_abs_errors, 95)),
        "l_inf_p99": float(np.percentile(all_abs_errors, 99)),
        "l2_rms": float(np.sqrt(sum_sq / n_obs)),
        "l2_per_bundle_mean": float(np.mean(all_l2_per_bundle)),
        "jsd_mean": float(np.mean(all_jsds)),
        "jsd_p95": float(np.percentile(all_jsds, 95)),
    }


# ── Structure-capture profile ───────────────────────────────────────────────


def compute_capture_profile(
    corpus: dict[str, np.ndarray],
    method: Method,
    decomp: dict[str, float],
    state: Optional[object] = None,
) -> dict[str, float]:
    """Measure how much of each variance-component the method
    preserves in reconstruction.

    For an error tensor e(b, t, s) = v - v̂, decompose e into the
    same ANOVA components as v, then compute per-component
    capture fractions:

        C_x(M) = 1 - SS_e_x / SS_v_x

    where SS_e_x is the x-component of the error's SS and SS_v_x
    is the same component of the original's SS. C_x ∈ (-∞, 1];
    1.0 means "this component is preserved exactly"; close to 0
    means "this component is mostly lost"; negative means the
    method actively WORSENED this component (diagnostic).

    Returns one capture-fraction per component (B, T_B, S, BS, R).
    """
    # Build the error corpus by running the method.
    errors: dict[str, np.ndarray] = {}
    for stem in sorted(corpus):
        orig = corpus[stem]
        if state is None:
            payload = method.encode(orig)
            recon = method.decode(payload)
        else:
            payload = method.encode(state, orig)  # type: ignore[arg-type]
            recon = method.decode(state, payload)  # type: ignore[arg-type]
        errors[stem] = orig - recon

    # Decompose the error tensor with the same ANOVA structure
    from .decomposition import variance_decomposition
    err_decomp = variance_decomposition(errors)

    out = {}
    for key in ("B", "T_B", "S", "BS", "R"):
        ss_v = decomp[f"ss_{key}"]
        ss_e = err_decomp[f"ss_{key}"]
        if ss_v > 0:
            out[f"capture_{key}"] = 1.0 - ss_e / ss_v
        else:
            out[f"capture_{key}"] = float("nan")
    out["error_ss_total"] = err_decomp["ss_total"]
    out["error_fraction_total"] = err_decomp["ss_total"] / decomp["ss_total"]
    return out


# ── Operational cost ────────────────────────────────────────────────────────


def measure_operational_cost(
    corpus: dict[str, np.ndarray],
    method: Method,
    state: Optional[object] = None,
    samples_per_method: int = 3,
) -> dict[str, float]:
    """Time the encode/decode paths on representative bundles.

    Returns:
      encode_ms_per_bundle: mean ms to encode one bundle
      decode_ms_per_bundle: mean ms to decode one bundle
      encode_ms_per_packet: ms-per-packet (rough)
      decode_ms_per_packet: ms-per-packet (rough)
    """
    stems = sorted(corpus)
    # Sample a few bundles for timing (don't measure all 40 —
    # framework overhead).
    sample_stems = stems[: min(samples_per_method, len(stems))]
    encode_times = []
    decode_times = []
    packet_counts = []
    for stem in sample_stems:
        bundle = corpus[stem]
        packet_counts.append(bundle.shape[0])
        # Encode
        t0 = time.perf_counter()
        if state is None:
            payload = method.encode(bundle)
        else:
            payload = method.encode(state, bundle)  # type: ignore[arg-type]
        encode_times.append((time.perf_counter() - t0) * 1000.0)
        # Decode
        t0 = time.perf_counter()
        if state is None:
            method.decode(payload)
        else:
            method.decode(state, payload)  # type: ignore[arg-type]
        decode_times.append((time.perf_counter() - t0) * 1000.0)

    total_packets = sum(packet_counts)
    return {
        "encode_ms_per_bundle": float(np.mean(encode_times)),
        "decode_ms_per_bundle": float(np.mean(decode_times)),
        "encode_ms_per_packet": float(sum(encode_times) / total_packets) if total_packets else 0.0,
        "decode_ms_per_packet": float(sum(decode_times) / total_packets) if total_packets else 0.0,
    }
