"""
research/compression/probe_r_component_structure.py

Framework-driven probe: does the R (joint residual) component of
the ownership tensor have non-Gaussian / sparsely-supported
structure that ICA or Sparse PCA could exploit?

Why this probe
══════════════
The framework's variance decomposition assigned R = 30% of the
corpus's total variance (the genuinely 3-way joint structure, what's
left after marginals: B + T(B) + S + BS account for 70%). For
methods like ICA to be useful, the R signal must have non-Gaussian
structure (heavy tails, multimodality, sparsity) — otherwise ICA
just recovers PCA up to a rotation, with no compression advantage.
Similarly, Sparse PCA only earns its keep if R's L₂-significant
directions have *spatially localised* support.

This probe answers the prerequisite question — "is there
non-Gaussian structure in R?" — before any method-specific probe
is built. Cheap diagnostic; tells us whether the conditional
probes from §4 of the linear-projection investigation are worth
running.

Diagnostics computed
════════════════════
1. Per-cell residual distribution: mean (should be ~0 by
   construction), std, **kurtosis** (Gaussian = 0; > 0 means
   heavy-tailed; < 0 means flatter than Gaussian), **skewness**
   (Gaussian = 0).
2. Across-corpus aggregate kurtosis/skewness.
3. PCA spectrum of R: eigenvalues; how much variance is
   captured by top-K?
4. ICA on R: per-component kurtosis. If ICA components are
   substantially more non-Gaussian than PCA's, ICA is
   exploiting non-Gaussian structure.
5. Sparse PCA on R: examine basis vector sparsity. If top
   components have most of their mass on a small subset of
   cells, R has localised structure.

Verdict mapping:
  - Kurtosis ≈ 0 everywhere → R is Gaussian-ish. ICA = PCA up
    to rotation. File ICA as null.
  - High positive kurtosis (heavy tails) → ICA may find
    independent non-Gaussian sources. Worth a method probe.
  - Sparse PCA components highly localised → localised
    structure exists. Worth a method probe.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import numpy as np
from scipy import stats

from research.compression.framework import load_corpus
from research.compression.framework.decomposition import variance_decomposition


def compute_r_residuals(corpus: dict) -> tuple[np.ndarray, dict]:
    """Compute the R (joint residual) tensor for the corpus.

    Returns:
      R_matrix: (N_total_packets, 361) — all bundles' R residuals
                stacked. Each row is one packet's R values across
                cells.
      decomp:   the variance-decomposition output (for sanity).
    """
    decomp = variance_decomposition(corpus)
    mu = decomp["mu"]
    mu_s = decomp["mu_s"]

    all_R = []
    for stem in sorted(corpus):
        b = corpus[stem]
        mu_b = b.mean()
        mu_bt = b.mean(axis=1)  # (T_b,)
        mu_bs = b.mean(axis=0)  # (361,)
        # R = v + μ_b - μ_bt - μ_bs (the derived residual; see
        # framework/decomposition.py)
        r = b + mu_b - mu_bt[:, None] - mu_bs[None, :]
        all_R.append(r)
    return np.concatenate(all_R, axis=0), decomp


def per_cell_stats(R: np.ndarray) -> dict:
    """Per-cell mean / std / kurtosis / skewness. R has shape
    (N, 361)."""
    return {
        "mean": R.mean(axis=0),       # (361,) — should be ≈ 0
        "std": R.std(axis=0),          # (361,)
        "kurtosis": stats.kurtosis(R, axis=0),  # (361,) — excess kurtosis
        "skewness": stats.skew(R, axis=0),      # (361,)
    }


def main() -> int:
    print("[1/5] loading corpus + computing R residuals")
    corpus = load_corpus()
    n_packets = sum(b.shape[0] for b in corpus.values())
    print(f"  {len(corpus)} games, {n_packets} ownership maps")

    R, decomp = compute_r_residuals(corpus)
    print(f"  R matrix shape: {R.shape}")
    print(f"  R total energy (SS_R): {decomp['ss_R']:.3f}")
    print(f"  R / total: {decomp['fraction_R']:.4f}")

    print()
    print("[2/5] per-cell distribution diagnostics")
    cs = per_cell_stats(R)
    print(f"  mean of per-cell means:      {cs['mean'].mean():>8.6f} "
          f"(should be ≈ 0 by construction)")
    print(f"  std of per-cell means:       {cs['mean'].std():>8.6f}")
    print(f"  mean of per-cell stds:       {cs['std'].mean():>8.6f}")
    print(f"  cell-std distribution:       min={cs['std'].min():.4f} "
          f"p25={np.percentile(cs['std'], 25):.4f} "
          f"p50={np.percentile(cs['std'], 50):.4f} "
          f"p75={np.percentile(cs['std'], 75):.4f} "
          f"max={cs['std'].max():.4f}")
    print()
    print(f"  Excess kurtosis (Gaussian = 0):")
    print(f"    mean across cells:         {cs['kurtosis'].mean():>8.4f}")
    print(f"    p25 / p50 / p75:           {np.percentile(cs['kurtosis'], 25):.3f} "
          f"/ {np.percentile(cs['kurtosis'], 50):.3f} / "
          f"{np.percentile(cs['kurtosis'], 75):.3f}")
    print(f"    p95 / p99 / max:           {np.percentile(cs['kurtosis'], 95):.3f} "
          f"/ {np.percentile(cs['kurtosis'], 99):.3f} / "
          f"{cs['kurtosis'].max():.3f}")
    print()
    print(f"  Skewness (Gaussian = 0):")
    print(f"    mean abs across cells:     {np.abs(cs['skewness']).mean():>8.4f}")
    print(f"    p50 / p95 of abs skewness: "
          f"{np.percentile(np.abs(cs['skewness']), 50):.3f} / "
          f"{np.percentile(np.abs(cs['skewness']), 95):.3f}")

    print()
    print("[3/5] PCA spectrum of R")
    Rc = R - R.mean(axis=0)
    _, S, Vt = np.linalg.svd(Rc, full_matrices=False)
    eigenvalues_sq = S ** 2 / (R.shape[0] - 1)
    total_var = eigenvalues_sq.sum()
    cumsum_var = np.cumsum(eigenvalues_sq) / total_var
    print(f"  variance captured by top K (R's own L₂):")
    for k in (5, 10, 20, 50, 100, 200):
        if k < len(cumsum_var):
            print(f"    K={k:>3d}: {cumsum_var[k-1]:.4f}")
    print(f"  effective rank (1 / sum_i (λ_i/Σλ)²) = "
          f"{1.0 / ((eigenvalues_sq / total_var) ** 2).sum():.1f} "
          f"(out of {len(eigenvalues_sq)})")

    print()
    print("[4/5] ICA on R — kurtosis of components")
    from sklearn.decomposition import FastICA
    K_ica = 20  # arbitrary; just for the diagnostic
    print(f"  fitting FastICA with K={K_ica} on the R matrix...")
    # FastICA assumes whitened data. It maximises non-Gaussianity
    # of the sources.
    ica = FastICA(n_components=K_ica, random_state=42, max_iter=500,
                  whiten="unit-variance")
    sources = ica.fit_transform(R)  # (N, K_ica)
    # Per-component kurtosis
    ica_kurt = stats.kurtosis(sources, axis=0)
    print(f"  ICA component kurtoses (sorted, descending):")
    for k in sorted(ica_kurt, reverse=True)[:10]:
        print(f"    {k:>8.3f}")
    print(f"  mean component kurtosis: {ica_kurt.mean():.3f}")
    print(f"  max component kurtosis:  {ica_kurt.max():.3f}")
    print()

    # Compare: project R onto the top K_ica PCA components, look
    # at THEIR kurtoses. If ICA's kurtoses are much higher than
    # PCA's, ICA is finding non-Gaussian structure.
    pca_components = Vt[:K_ica]  # (K_ica, 361)
    pca_sources = Rc @ pca_components.T  # (N, K_ica)
    pca_kurt = stats.kurtosis(pca_sources, axis=0)
    print(f"  PCA top-{K_ica} kurtoses (sorted, descending):")
    for k in sorted(pca_kurt, reverse=True)[:10]:
        print(f"    {k:>8.3f}")
    print(f"  mean PCA kurtosis:       {pca_kurt.mean():.3f}")
    print(f"  max PCA kurtosis:        {pca_kurt.max():.3f}")

    print()
    print("[5/5] Sparse PCA on R — basis localisation")
    from sklearn.decomposition import SparsePCA
    K_sparse = 10
    print(f"  fitting SparsePCA with K={K_sparse} (alpha=0.5)...")
    sparse_pca = SparsePCA(n_components=K_sparse, alpha=0.5, random_state=42,
                            max_iter=100)
    # SparsePCA is slow; sample to speed up the probe
    sample_N = min(2000, R.shape[0])
    rng = np.random.default_rng(0)
    sample_idx = rng.choice(R.shape[0], sample_N, replace=False)
    sparse_pca.fit(R[sample_idx])
    components = sparse_pca.components_  # (K_sparse, 361)
    sparsity = (components == 0).mean(axis=1)  # fraction of zero entries
    nonzero_per_component = (components != 0).sum(axis=1)
    print(f"  basis sparsity (fraction of zero entries per component):")
    for i, (s, nz) in enumerate(zip(sparsity, nonzero_per_component)):
        print(f"    component {i}: {s:.3f} zero  ({nz} non-zero cells out of 361)")
    print()
    print(f"  mean fraction-zero across components: {sparsity.mean():.3f}")
    print(f"  if components are spatially localised, mean non-zero is small")

    print()
    print("─" * 60)
    print("Interpretation")
    print("─" * 60)
    mean_kurt = cs["kurtosis"].mean()
    if abs(mean_kurt) < 0.5:
        print(f"  Per-cell kurtosis is near 0 (mean={mean_kurt:.3f}):")
        print("  R is approximately Gaussian per cell. ICA's advantage")
        print("  over PCA depends on cross-cell non-Gaussianity, which")
        print("  the component-level kurtosis numbers above answer.")
    else:
        print(f"  Per-cell kurtosis mean={mean_kurt:.3f}: R has non-Gaussian")
        print("  tails. ICA may find structure PCA misses.")
    ica_advantage = ica_kurt.mean() - pca_kurt.mean()
    if ica_advantage > 1.0:
        print(f"  ICA components have higher kurtosis (+{ica_advantage:.2f}):")
        print("  ICA is finding non-Gaussian structure PCA misses. WORTH")
        print("  building a compression method based on ICA components.")
    else:
        print(f"  ICA components only marginally more non-Gaussian than PCA")
        print(f"  (Δ kurtosis = {ica_advantage:.2f}). ICA = PCA in practice;")
        print("  no compression advantage. File ICA as null.")
    print(f"  Sparse PCA: mean component sparsity = {sparsity.mean():.3f}")
    if sparsity.mean() > 0.5:
        print("  Components are quite sparse — structure has localised support.")
        print("  Sparse-PCA-based compression may be worth probing.")
    else:
        print("  Components are dense; structure is distributed across many")
        print("  cells. Sparse PCA isn't finding localised sources.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
