"""
research/compression/framework/decomposition.py

SS-based 5-way nested ANOVA decomposition of the bundle × packet
× cell ownership tensor.

The decomposition writes:

    v(b, t, s) = μ + B(b) + T(b,t) + S(s) + BS(b,s) + R(b,t,s)

where T is nested in B (packets are bundle-specific; there's no
across-bundle "packet 5" alignment), S is crossed with B, and
R is the residual containing genuinely 3-way joint structure.

Each effect is mean-zero by construction with respect to its
outer factors. The sums of squares satisfy

    SS_total = SS_B + SS_T(B) + SS_S + SS_BS + SS_R

(modulo finite-precision noise). The fractions SS_x / SS_total
are the "structure profile" of the corpus — how much of the
total variance lives in each axis's marginal vs. in the
irreducible joint residual.

See `docs/archive/notes/linear-projection-compression-investigation-2026-05-26.md`
§3.3.1 for the framing.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import numpy as np


def variance_decomposition(
    corpus: dict[str, np.ndarray],
) -> dict[str, float]:
    """Compute the SS-based variance decomposition.

    Inputs:
      corpus: {stem: (T_b, 361) float ownership array}

    Returns a dict with keys:
      ss_total: total SS = Σ (v − μ)²
      ss_B:     bundle main effect = Σ T_b · S · (μ_b − μ)²
      ss_T_B:   packet-within-bundle = Σ S · (μ_bt − μ_b)²
      ss_S:     cell main effect = (N_total / S) · Σ (μ_s − μ)²
      ss_BS:    bundle × cell interaction = Σ T_b · (μ_bs − μ_b − μ_s + μ)²
      ss_R:     joint residual = Σ (v + μ_b − μ_bt − μ_bs)²
      fraction_B / _T_B / _S / _BS / _R: SS_x / SS_total
      sum_check: (SS_B + SS_T_B + SS_S + SS_BS + SS_R) / SS_total
                 (should be ≈ 1.0)

    All means are computed against the **observation-weighted**
    grand mean — every (b, t, s) cell contributes equally —
    which is the standard ANOVA convention for unbalanced
    nested designs.
    """
    bundles = list(corpus.values())
    if not bundles:
        raise ValueError("empty corpus")
    S = bundles[0].shape[1]
    for b in bundles:
        if b.shape[1] != S:
            raise ValueError(
                f"inconsistent cell count: {b.shape[1]} vs {S}"
            )

    T_b = np.array([b.shape[0] for b in bundles])
    N_total = T_b.sum() * S  # total observations
    n_packets_total = T_b.sum()

    # Grand mean μ — weighted by per-bundle observations
    sum_total = sum(b.sum() for b in bundles)
    mu = float(sum_total / N_total)

    # Cell marginals μ_s(s) = E_{b,t}[v(b,t,s)]
    # (sum over all packets across all bundles, divided by total packets)
    sum_per_cell = np.zeros(S, dtype=np.float64)
    for b in bundles:
        sum_per_cell += b.sum(axis=0)
    mu_s = sum_per_cell / n_packets_total  # (S,)

    # Bundle marginals μ_b(b) = E_{t,s}[v(b,t,s)]
    mu_b = np.array([b.mean() for b in bundles])  # (n_bundles,)

    # ss_total: Σ (v - μ)²
    ss_total = sum(((b - mu) ** 2).sum() for b in bundles)

    # ss_S: cell main effect.
    # Each cell s is observed once per packet across all bundles;
    # n_packets_total observations per cell.
    ss_S = n_packets_total * ((mu_s - mu) ** 2).sum()

    # ss_B: bundle main effect.
    # Each bundle b has T_b · S observations.
    ss_B = (T_b * S * (mu_b - mu) ** 2).sum()

    # ss_T_B: packet-within-bundle main effect.
    # T(b,t) = μ_bt(b,t) - μ_b(b). Each (b,t) contributes S
    # observations.
    ss_T_B = 0.0
    for i, b in enumerate(bundles):
        mu_bt = b.mean(axis=1)  # (T_b_i,)
        ss_T_B += float(S * ((mu_bt - mu_b[i]) ** 2).sum())

    # ss_BS: bundle × cell interaction.
    # BS(b,s) = μ_bs(b,s) - μ_b(b) - μ_s(s) + μ
    # Each (b,s) contributes T_b observations.
    ss_BS = 0.0
    for i, b in enumerate(bundles):
        mu_bs = b.mean(axis=0)  # (S,)
        bs_effect = mu_bs - mu_b[i] - mu_s + mu  # (S,)
        ss_BS += float(T_b[i] * (bs_effect ** 2).sum())

    # ss_R: joint residual.
    # r(b,t,s) = v + μ_b - μ_bt - μ_bs (derived; see investigation note)
    ss_R = 0.0
    for i, b in enumerate(bundles):
        mu_bt = b.mean(axis=1)  # (T_b_i,)
        mu_bs = b.mean(axis=0)  # (S,)
        # v + μ_b - μ_bt[:, None] - μ_bs[None, :]
        residual = b + mu_b[i] - mu_bt[:, None] - mu_bs[None, :]
        ss_R += float((residual ** 2).sum())

    fractions = {
        "B": ss_B / ss_total if ss_total > 0 else 0.0,
        "T_B": ss_T_B / ss_total if ss_total > 0 else 0.0,
        "S": ss_S / ss_total if ss_total > 0 else 0.0,
        "BS": ss_BS / ss_total if ss_total > 0 else 0.0,
        "R": ss_R / ss_total if ss_total > 0 else 0.0,
    }
    sum_check = sum(fractions.values())

    return {
        "ss_total": ss_total,
        "ss_B": ss_B,
        "ss_T_B": ss_T_B,
        "ss_S": ss_S,
        "ss_BS": ss_BS,
        "ss_R": ss_R,
        "fraction_B": fractions["B"],
        "fraction_T_B": fractions["T_B"],
        "fraction_S": fractions["S"],
        "fraction_BS": fractions["BS"],
        "fraction_R": fractions["R"],
        "sum_check": sum_check,
        # Means kept for downstream capture-profile computation
        "mu": mu,
        "mu_s": mu_s,
        "mu_b": mu_b,
        "T_b": T_b,
        "S": S,
    }
